<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { createEventDispatcher } from 'svelte';
	import {
		connected_wallet_address,
		selected_wallet_ergo,
		connected_wallet_balance,
		fetchUtxos
	} from '$lib/store/store.ts';
	import { showCustomToast } from '$lib/utils/utils.js';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import {
		createBulkMewLockTx,
		parseBulkLockCSV,
		generateCSVTemplate,
		type BulkLockRecipient
	} from '$lib/contract/bulkMewLock.ts';
	import { get } from 'svelte/store';
	import ErgopayModal from './ErgopayModal.svelte';

	const dispatch = createEventDispatcher();

	let csvText = '';
	let recipients: BulkLockRecipient[] = [];
	let currentHeight = 0;
	let processing = false;
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;
	let parseError = '';

	onMount(async () => {
		await getCurrentHeight();
		// Load template by default
		csvText = generateCSVTemplate();
	});

	async function getCurrentHeight() {
		try {
			const response = await getBlockHeight();
			currentHeight = response;
		} catch (error) {
			console.error('Error fetching current height:', error);
		}
	}

	function parseCSV() {
		parseError = '';
		try {
			recipients = parseBulkLockCSV(csvText, currentHeight);
			if (recipients.length === 0) {
				parseError = 'No valid recipients found in CSV';
			}
		} catch (error) {
			parseError = error.message;
			recipients = [];
		}
	}

	$: totalERG = recipients.reduce((sum, r) => sum + r.ergAmount, 0);
	$: canSubmit = recipients.length > 0 && !processing;

	async function handleBulkLock() {
		if (!canSubmit) return;

		processing = true;
		try {
			let myAddress, height, utxos;

			if (get(selected_wallet_ergo) !== 'ergopay') {
				myAddress = await ergo.get_change_address();
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await ergo.get_current_height();
			} else {
				myAddress = get(connected_wallet_address);
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await getBlockHeight();
			}

			const bulkLockTx = createBulkMewLockTx(myAddress, utxos, height, recipients);

			if (get(selected_wallet_ergo) !== 'ergopay') {
				const signed = await ergo.sign_tx(bulkLockTx);
				const transactionId = await ergo.submit_tx(signed);
				showCustomToast(
					`Bulk lock successful! TX: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);
				closeModal();
			} else {
				unsignedTx = bulkLockTx;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (error) {
			console.error('Bulk lock error:', error);
			showCustomToast(`Bulk lock failed: ${error.message}`, 5000, 'danger');
		} finally {
			processing = false;
		}
	}

	function downloadTemplate() {
		const blob = new Blob([generateCSVTemplate()], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'mewlock-bulk-template.csv';
		a.click();
		URL.revokeObjectURL(url);
	}

	function closeModal() {
		dispatch('close');
	}
</script>

<div class="modal-overlay" in:fade={{ duration: 200 }} out:fade={{ duration: 150 }} on:click={closeModal}>
	<div class="modal-content" in:fly={{ y: 20, duration: 200 }} out:fade={{ duration: 150 }} on:click|stopPropagation>
		<div class="modal-header">
			<h2>Bulk MewLock - Vesting/Airdrop</h2>
			<button class="close-btn" on:click={closeModal}>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path
						d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
						fill="currentColor"
					/>
				</svg>
			</button>
		</div>

		<div class="modal-body">
			<div class="info-box">
				<strong>Bulk Lock</strong> - Lock assets for multiple recipients in a single transaction. Perfect for team vesting or airdrops!
				<br /><br />
				<strong>CSV Format:</strong> address, ergAmount, unlockDuration, lockName, lockDescription
				<br />
				<button class="template-btn" on:click={downloadTemplate}>📥 Download CSV Template</button>
			</div>

			<div class="input-group">
				<label>CSV Data</label>
				<textarea
					bind:value={csvText}
					placeholder="Paste your CSV here..."
					rows="10"
					class="csv-input"
					on:blur={parseCSV}
				></textarea>
				<small>Current blockchain height: {currentHeight.toLocaleString()}</small>
			</div>

			<button class="parse-btn" on:click={parseCSV} disabled={!csvText}>
				Parse CSV ({recipients.length} recipients found)
			</button>

			{#if parseError}
				<div class="error-box">{parseError}</div>
			{/if}

			{#if recipients.length > 0}
				<div class="recipients-preview">
					<h3>Recipients Preview</h3>
					<div class="summary">
						<div class="summary-item">
							<strong>{recipients.length}</strong>
							<span>Recipients</span>
						</div>
						<div class="summary-item">
							<strong>{totalERG.toFixed(4)} ERG</strong>
							<span>Total Locked</span>
						</div>
					</div>

					<div class="recipients-list">
						{#each recipients.slice(0, 5) as recipient, i}
							<div class="recipient-row">
								<div class="recipient-address">
									{recipient.address.substring(0, 10)}...{recipient.address.substring(recipient.address.length - 6)}
								</div>
								<div class="recipient-amount">{recipient.ergAmount} ERG</div>
								<div class="recipient-unlock">
									{recipient.unlockHeight - currentHeight} blocks
								</div>
								{#if recipient.lockName}
									<div class="recipient-name">{recipient.lockName}</div>
								{/if}
							</div>
						{/each}
						{#if recipients.length > 5}
							<div class="more-recipients">... and {recipients.length - 5} more</div>
						{/if}
					</div>
				</div>
			{/if}

			<button
				class="submit-btn"
				class:disabled={!canSubmit}
				disabled={!canSubmit}
				on:click={handleBulkLock}
			>
				{#if processing}
					Processing...
				{:else}
					Create Bulk Lock ({recipients.length} recipients)
				{/if}
			</button>
		</div>
	</div>
</div>

{#if showErgopayModal}
	<ErgopayModal bind:showErgopayModal bind:isAuth bind:unsignedTx>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: rgba(15, 15, 35, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		max-width: 800px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		backdrop-filter: blur(20px);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		color: white;
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 8px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.info-box {
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 8px;
		padding: 1rem;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.template-btn {
		background: #667eea;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		margin-top: 0.5rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.template-btn:hover {
		background: #5a67d8;
		transform: translateY(-1px);
	}

	.input-group {
		margin-bottom: 1.5rem;
	}

	.input-group label {
		display: block;
		color: white;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.csv-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 0.75rem;
		color: white;
		font-size: 0.9rem;
		font-family: monospace;
		resize: vertical;
		transition: all 0.2s;
	}

	.csv-input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
	}

	.input-group small {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}

	.parse-btn {
		width: 100%;
		background: rgba(102, 126, 234, 0.2);
		border: 1px solid #667eea;
		color: #667eea;
		padding: 0.75rem;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		margin-bottom: 1rem;
		transition: all 0.2s;
	}

	.parse-btn:hover:not(:disabled) {
		background: rgba(102, 126, 234, 0.3);
	}

	.parse-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-box {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #ef4444;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.recipients-preview {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.recipients-preview h3 {
		color: white;
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
	}

	.summary {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.summary-item {
		background: rgba(102, 126, 234, 0.1);
		padding: 1rem;
		border-radius: 8px;
		text-align: center;
	}

	.summary-item strong {
		display: block;
		color: #667eea;
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}

	.summary-item span {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
	}

	.recipients-list {
		max-height: 200px;
		overflow-y: auto;
	}

	.recipient-row {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 0.5rem;
		padding: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		font-size: 0.875rem;
	}

	.recipient-address {
		color: rgba(255, 255, 255, 0.8);
		font-family: monospace;
	}

	.recipient-amount {
		color: #667eea;
		font-weight: 600;
	}

	.recipient-unlock {
		color: rgba(255, 255, 255, 0.6);
	}

	.recipient-name {
		grid-column: 1 / -1;
		color: rgba(255, 255, 255, 0.5);
		font-style: italic;
		font-size: 0.8rem;
	}

	.more-recipients {
		padding: 1rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-style: italic;
	}

	.submit-btn {
		width: 100%;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 12px;
		padding: 1rem 2rem;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		font-size: 1rem;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}
</style>
