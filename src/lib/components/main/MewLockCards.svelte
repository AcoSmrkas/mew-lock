<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address } from '$lib/store/store';
	import { nFormatter, showCustomToast } from '$lib/utils/utils.js';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import SellWidget from '$lib/components/common/SellWidget.svelte';
	import { fade, fly } from 'svelte/transition';
	import { ErgoAddress } from '@fleet-sdk/core';
	import ErgopayModal from '../common/ErgopayModal.svelte';

	let mewLockBoxes = [];
	let loading = true;
	let showSellWidget = false;
	let selectedLockBox = null;
	let withdrawing = false;
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS =
		'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

	onMount(async () => {
		await loadMewLockBoxes();
	});

	// Convert public key to address using ErgoAddress
	function convertPkToAddress(pkRegister) {
		try {
			const serializedValue = pkRegister.serializedValue || pkRegister;
			// Remove '07' prefix if present (common in serialized public keys)
			const publicKey = serializedValue.startsWith('07')
				? serializedValue.substring(2)
				: serializedValue;
			// Convert to Ergo address
			return ErgoAddress.fromPublicKey(publicKey).toString();
		} catch (error) {
			console.error('Address conversion error:', error, pkRegister);
			return 'Invalid Address';
		}
	}

	async function loadMewLockBoxes() {
		loading = true;
		try {
			// Get current block height
			const currentHeight = await getCurrentHeight();

			// Search for boxes at the MewLock contract address
			const response = await fetch(
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}`
			);
			const data = await response.json();

			mewLockBoxes = data.items.map((box) => {
				const unlockHeight = parseInt(box.additionalRegisters.R5.renderedValue);
				const canWithdraw = currentHeight >= unlockHeight;
				const depositorPubKey = box.additionalRegisters.R4.renderedValue;
				const depositorAddress = convertPkToAddress(box.additionalRegisters.R4);
				const isOwnBox = depositorAddress === $connected_wallet_address;

				return {
					boxId: box.boxId,
					value: parseInt(box.value),
					assets: box.assets || [],
					unlockHeight,
					currentHeight,
					canWithdraw,
					depositorPubKey,
					depositorAddress,
					isOwnBox,
					ergoTree: box.ergoTree,
					additionalRegisters: box.additionalRegisters,
					blocksRemaining: Math.max(0, unlockHeight - currentHeight)
				};
			});

			// Sort by unlock height (earliest first)
			mewLockBoxes.sort((a, b) => a.unlockHeight - b.unlockHeight);
		} catch (error) {
			console.error('Error loading MewLock boxes:', error);
		}
		loading = false;
	}

	async function getCurrentHeight() {
		try {
			const response = await fetch('https://ergo-node.zoomout.io/info');
			const data = await response.json();
			return data.fullHeight;
		} catch (error) {
			console.error('Error fetching current height:', error);
			// Fallback to explorer API
			try {
				const fallbackResponse = await fetch('https://api.ergoplatform.com/api/v1/info');
				const fallbackData = await fallbackResponse.json();
				return fallbackData.height; // Explorer API uses 'height' instead of 'fullHeight'
			} catch (fallbackError) {
				console.error('Fallback failed too:', fallbackError);
				return 0;
			}
		}
	}

	function openLockModal() {
		showSellWidget = true;
	}

	async function handleWithdrawal(lockBox) {
		if (!lockBox.canWithdraw) {
			showCustomToast('This token is not ready for withdrawal yet.', 3000, 'warning');
			return;
		}

		if (!lockBox.isOwnBox) {
			showCustomToast('You can only withdraw your own locked tokens.', 3000, 'warning');
			return;
		}

		if (withdrawing) {
			return; // Prevent multiple simultaneous withdrawals
		}

		withdrawing = true;

		try {
			// Import wallet store and utility functions
			const { connected_wallet_address, selected_wallet_ergo } = await import('$lib/store/store');
			const { fetchBoxes } = await import('$lib/api-explorer/explorer.ts');
			const { getBlockHeight } = await import('$lib/api-explorer/explorer.ts');
			const { createMewLockWithdrawalTx } = await import('$lib/contract/mewLockTx.ts');
			const { get } = await import('svelte/store');

			let myAddress, height, utxos;

			// Get wallet information
			if (get(selected_wallet_ergo) !== 'ergopay') {
				myAddress = await ergo.get_change_address();
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await ergo.get_current_height();
			} else {
				myAddress = get(connected_wallet_address);
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await getBlockHeight();
			}
			// Create the withdrawal transaction
			const withdrawalTx = await createMewLockWithdrawalTx(myAddress, utxos, height, lockBox);

			// Sign and submit the transaction
			if (get(selected_wallet_ergo) !== 'ergopay') {
				const signed = await ergo.sign_tx(withdrawalTx);
				const transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Tokens withdrawn successfully!<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Refresh the MewLock boxes
				await loadMewLockBoxes();
			} else {
				unsignedTx = withdrawalTx;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (error) {
			console.error('Error during withdrawal:', error);
			showCustomToast(`Error during withdrawal: ${error.message}`, 5000, 'danger');
		} finally {
			withdrawing = false;
		}
	}

	function closeSellWidget() {
		showSellWidget = false;
		selectedLockBox = null;
	}
</script>

<div class="mewlock-container">
	<div class="header-section">
		<div class="header-content">
			<h2 class="section-title">Mew Lock - Time-Locked Storage</h2>
			<p class="section-subtitle">Secure your tokens with time-based smart contracts</p>
		</div>
		<div class="header-actions">
			<button class="btn btn-primary" on:click={openLockModal}>
				<i class="fa-solid fa-lock" /> Lock Tokens
			</button>
		</div>
	</div>

	{#if loading}
		<div class="loading-container">
			<div class="loading-spinner" />
			<p>Loading locked tokens...</p>
		</div>
	{:else if mewLockBoxes.length > 0}
		<div class="offers-grid">
			{#each mewLockBoxes as lockBox, index}
				<div
					class="mewlock-card {lockBox.canWithdraw ? 'unlocked' : 'locked'}"
					class:own-box={lockBox.isOwnBox}
					in:fly={{ y: 20, duration: 300, delay: index * 100 }}
					out:fade={{ duration: 200 }}
				>
					<div class="card-header">
						<div class="amount-display">
							<span class="amount">{nFormatter(lockBox.value / 1e9)}</span>
							<span class="currency">ERG</span>
							{#if lockBox.assets && lockBox.assets.length > 0}
								<span class="token-count"
									>+ {lockBox.assets.length} token{lockBox.assets.length > 1 ? 's' : ''}</span
								>
							{/if}
						</div>
						<div class="status-badge {lockBox.canWithdraw ? 'unlocked' : 'locked'}">
							<i class="fa-solid fa-{lockBox.canWithdraw ? 'unlock' : 'lock'}" />
							{lockBox.canWithdraw ? 'Unlocked' : 'Locked'}
						</div>
					</div>

					<div class="card-body">
						<div class="info-row">
							<span class="label">Unlock Height:</span>
							<span class="value">{lockBox.unlockHeight}</span>
						</div>
						<div class="info-row">
							<span class="label">Current Height:</span>
							<span class="value">{lockBox.currentHeight}</span>
						</div>
						<div class="info-row">
							<span class="label">Depositor:</span>
							<a
								href="https://ergexplorer.com/addresses/{lockBox.depositorAddress}"
								target="_blank"
								class="value text-primary"
							>
								{lockBox.depositorAddress.substring(0, 8)}...
							</a>
							{#if lockBox.isOwnBox}
								<span class="text-xs text-primary ml-2">(Your Lock)</span>
							{/if}
						</div>
						{#if !lockBox.canWithdraw}
							<div class="info-row">
								<span class="label">Blocks Remaining:</span>
								<span class="value">{lockBox.blocksRemaining}</span>
							</div>
						{/if}
						{#if lockBox.assets && lockBox.assets.length > 0}
							<div class="info-row">
								<span class="label">Tokens:</span>
								<span class="value">
									{#each lockBox.assets as asset, i}
										{asset.name || asset.tokenId.substring(0, 8)}
										{#if i < lockBox.assets.length - 1}, {/if}
									{/each}
								</span>
							</div>
						{/if}
					</div>

					<div class="card-footer">
						{#if lockBox.isOwnBox && lockBox.canWithdraw}
							<button
								class="btn btn-success btn-full"
								disabled={withdrawing}
								on:click={() => handleWithdrawal(lockBox)}
							>
								{#if withdrawing}
									<i class="fa-solid fa-spinner fa-spin" /> Processing...
								{:else}
									<i class="fa-solid fa-unlock" /> Withdraw {nFormatter(lockBox.value / 1e9)} ERG
									{#if lockBox.assets && lockBox.assets.length > 0}
										+ {lockBox.assets.length} token{lockBox.assets.length > 1 ? 's' : ''}
									{/if}
								{/if}
							</button>
						{:else if !lockBox.canWithdraw}
							<button class="btn btn-secondary btn-full" disabled>
								<i class="fa-solid fa-clock" /> Locked for {lockBox.blocksRemaining} blocks
							</button>
						{:else if !lockBox.isOwnBox}
							<button class="btn btn-secondary btn-full opacity-50" disabled>
								<i class="fa-solid fa-user-slash" /> Not Your Lock
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-state">
			<i class="fa-solid fa-lock empty-icon" />
			<h3>No Locked Tokens Found</h3>
			<p>No tokens are currently locked in MewLock contracts</p>
		</div>
	{/if}
</div>

{#if showSellWidget}
	<div class="modal-overlay" on:click={closeSellWidget}>
		<div class="modal-content" on:click|stopPropagation>
			<SellWidget on:close={closeSellWidget} />
		</div>
	</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:showErgopayModal bind:isAuth bind:unsignedTx>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	.mewlock-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header-section {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.header-content {
		flex: 1;
	}

	.section-title {
		font-size: 1.8rem;
		font-weight: 600;
		color: var(--secondary-color);
		margin: 0 0 0.5rem 0;
		font-family: 'Manrope', sans-serif;
	}

	.section-subtitle {
		color: var(--text-light);
		margin: 0;
		font-size: 1rem;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
	}

	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
	}

	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--background);
		border-top: 4px solid var(--main-color);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.offers-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.mewlock-card {
		background: var(--footer);
		border-radius: 12px;
		padding: 1.5rem;
		border: 1px solid var(--borders);
		transition: all 0.3s ease;
	}

	.mewlock-card:hover {
		transform: translateY(-5px);
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.amount-display {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.amount {
		font-size: 1.8rem;
		font-weight: 700;
		color: var(--main-color);
	}

	.currency {
		font-size: 1rem;
		color: var(--text-light);
	}

	.token-count {
		font-size: 0.8rem;
		color: var(--primary-color);
		margin-left: 0.5rem;
	}

	.status-badge {
		padding: 0.3rem 0.8rem;
		border-radius: 20px;
		font-size: 0.8rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.status-badge.unlocked {
		background: #22c55e;
		color: white;
	}

	.status-badge.locked {
		background: #ef4444;
		color: white;
	}

	.mewlock-card.unlocked {
		border: 2px solid #22c55e;
	}

	.mewlock-card.locked {
		border: 2px solid #ef4444;
	}

	.mewlock-card.own-box {
		position: relative;
		border: 2px solid var(--main-color);
		box-shadow: 0 0 20px rgba(249, 215, 45, 0.2);
	}

	.mewlock-card.own-box::before {
		content: '👤 Your Lock';
		position: absolute;
		top: -10px;
		right: 10px;
		background: var(--main-color);
		color: var(--background);
		padding: 2px 8px;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: bold;
		z-index: 1;
	}

	.card-body {
		margin-bottom: 1.5rem;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.label {
		color: var(--text-light);
		font-size: 0.9rem;
	}

	.value {
		color: var(--text-color);
		font-weight: 500;
		font-size: 0.9rem;
	}

	.card-footer {
		border-top: 1px solid var(--borders);
		padding-top: 1rem;
	}

	.btn-full {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: var(--text-light);
	}

	.empty-icon {
		font-size: 3rem;
		color: var(--borders);
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		color: var(--text-color);
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		margin: 0;
	}

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
		background: var(--forms-bg);
		border-radius: 12px;
		max-width: 90vw;
		max-height: 90vh;
		overflow-y: auto;
		border: 2px solid var(--info-color);
	}

	@media (max-width: 768px) {
		.mewlock-container {
			padding: 1rem;
		}

		.header-section {
			flex-direction: column;
			align-items: stretch;
		}

		.offers-grid {
			grid-template-columns: 1fr;
		}

		.modal-content {
			max-width: 95vw;
			max-height: 95vh;
		}
	}
</style>
