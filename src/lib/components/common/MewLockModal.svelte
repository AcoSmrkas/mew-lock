<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { createEventDispatcher } from 'svelte';
	import {
		connected_wallet_address,
		selected_wallet_ergo,
		utxosAssets,
		utxosTokenInfos,
		connected_wallet_balance,
		fetchUtxos,
		utxosLoading
	} from '$lib/store/store.ts';
	import {
		nFormatter,
		showCustomToast,
		getImageUrl,
		setPlaceholderImage
	} from '$lib/utils/utils.js';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import { createMewLockDepositTx } from '$lib/contract/mewLockTx.ts';
	import { get } from 'svelte/store';
	import JSONbig from 'json-bigint-native';
	import ErgopayModal from './ErgopayModal.svelte';

	const dispatch = createEventDispatcher();

	// Modal state
	let step = 1; // 1: Choose type, 2: Configure lock
	let lockType = ''; // 'erg' or 'tokens'
	let processing = false;

	// Lock configuration
	let lockAmount = '';
	let lockDuration = 720; // Default 720 blocks (~12 hours)
	let lockDurationSelect = 720;
	let selectedTokensToLock = [];
	let currentHeight = 0;
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;

	// Available tokens
	let availableTokens = [];
	let search = '';
	$: filteredTokens = availableTokens.filter(
		(token) =>
			token.name?.toLowerCase().includes(search.toLowerCase()) ||
			token.tokenId.toLowerCase().includes(search.toLowerCase())
	);

	let unlockCalculation = '';
	$: unlockCalculation = calculateApprox(lockDuration);

	onMount(async () => {
		await getCurrentHeight();
		// Ensure we have fresh UTXO data
		if ($connected_wallet_address) {
			await fetchUtxos($connected_wallet_address);
		}
		loadAvailableTokens();
	});

	// Reactive statement to reload tokens when store updates
	$: if ($utxosTokenInfos && $utxosAssets && !$utxosLoading) {
		loadAvailableTokens();
	}

	function calculateApprox(lockDuration) {
		// Constants
		const BLOCKS_PER_DAY = 720;
		const BLOCKS_PER_HOUR = BLOCKS_PER_DAY / 24; // 30 blocks per hour
		const BLOCKS_PER_MONTH = BLOCKS_PER_DAY * 30; // Approximate month
		const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365; // Approximate year

		// Handle edge cases
		if (lockDuration <= 0) {
			return 'Already unlocked';
		}

		// Calculate time units
		const years = Math.floor(lockDuration / BLOCKS_PER_YEAR);
		const months = Math.floor((lockDuration % BLOCKS_PER_YEAR) / BLOCKS_PER_MONTH);
		const days = Math.floor((lockDuration % BLOCKS_PER_MONTH) / BLOCKS_PER_DAY);
		const hours = Math.floor((lockDuration % BLOCKS_PER_DAY) / BLOCKS_PER_HOUR);

		// Build result string
		let result = 'Unlocks in approximately ';

		if (years > 0) {
			if (years === 1) {
				result += '1 year';
			} else {
				result += `${years} years`;
			}

			if (months > 0) {
				result += ` and ${months} month${months === 1 ? '' : 's'}`;
			}
		} else if (months > 0) {
			if (months === 1) {
				result += '1 month';
			} else {
				result += `${months} months`;
			}

			if (days > 0 && months < 3) {
				// Only show days if less than 3 months
				result += ` and ${days} day${days === 1 ? '' : 's'}`;
			}
		} else if (days > 0) {
			if (days === 1) {
				result += '1 day';
			} else {
				result += `${days} days`;
			}

			if (hours > 0 && days <= 7) {
				// Only show hours if less than a week
				result += ` and ${hours} hour${hours === 1 ? '' : 's'}`;
			}
		} else if (hours > 0) {
			if (hours === 1) {
				result += '1 hour';
			} else {
				result += `${hours} hours`;
			}
		} else {
			// Less than an hour
			const minutes = Math.round((lockDuration / BLOCKS_PER_HOUR) * 60);
			if (minutes <= 1) {
				result += 'less than 1 minute';
			} else {
				result += `${minutes} minutes`;
			}
		}

		return result;
	}

	async function getCurrentHeight() {
		try {
			const response = await getBlockHeight();
			currentHeight = response;
		} catch (error) {
			console.error('Error fetching current height:', error);
		}
	}

	async function loadAvailableTokens() {
		console.log('Loading available tokens...');

		// Wait for UTXOS to be ready (matching SellWidget pattern)
		let utxosReady = !get(utxosLoading);
		if (!utxosReady) {
			do {
				await new Promise((resolve) => setTimeout(resolve, 100));
				utxosReady = !get(utxosLoading);
			} while (!utxosReady);
		}

		if ($selected_wallet_ergo) {
			// Use SellWidget's proven pattern
			let assets = JSONbig.parse(JSONbig.stringify(get(utxosAssets)));
			const tokenInfos = get(utxosTokenInfos);

			for (const asset of assets) {
				const tokenInfo = tokenInfos.find((info) => info.id === asset.tokenId);
				if (tokenInfo) {
					asset.name = tokenInfo.name;
					asset.decimals = tokenInfo.decimals;
					asset.displayAmount = Number(asset.amount) / Math.pow(10, asset.decimals);
				}
			}

			// Filter tokens with positive balance
			availableTokens = assets.filter((token) => token.amount > 0);
			console.log('Available tokens loaded:', availableTokens);
		} else {
			availableTokens = [];
		}
	}

	function selectLockType(type: string) {
		lockType = type;
		// Set default ERG amount for tokens mode (0.1 ERG for fees)
		if (type === 'tokens') {
			lockAmount = '0.1';
		}
		step = 2;
	}

	function goBack() {
		step = 1;
		lockType = '';
		selectedTokensToLock = [];
		lockAmount = '';
	}

	function toggleTokenSelection(token) {
		const index = selectedTokensToLock.findIndex((t) => t.tokenId === token.tokenId);
		if (index > -1) {
			selectedTokensToLock = selectedTokensToLock.filter((t) => t.tokenId !== token.tokenId);
		} else {
			selectedTokensToLock = [
				...selectedTokensToLock,
				{
					...token,
					amountToLock: '',
					// Ensure we have the correct balance info
					balance: token.amount,
					displayAmount: token.displayAmount || token.amount / Math.pow(10, token.decimals || 0)
				}
			];
		}
	}

	function updateTokenAmount(tokenId: string, amount: string) {
		selectedTokensToLock = selectedTokensToLock.map((token) =>
			token.tokenId === tokenId ? { ...token, amountToLock: amount } : token
		);
	}

	$: unlockHeight = currentHeight + parseInt(lockDuration);
	$: canSubmit =
		lockType === 'erg'
			? lockAmount && parseFloat(lockAmount) > 0
			: selectedTokensToLock.length > 0 &&
			  selectedTokensToLock.every(
					(token) => token.amountToLock && parseFloat(token.amountToLock) > 0
			  ); // ERG amount auto-set for tokens

	async function handleLockSubmit() {
		if (!canSubmit || processing) return;

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

			// Prepare tokens for locking
			const tokensToLock =
				lockType === 'tokens'
					? selectedTokensToLock.map((token) => ({
							tokenId: token.tokenId,
							amount: Math.round(parseFloat(token.amountToLock) * Math.pow(10, token.decimals))
					  }))
					: [];

			const lockTx = createMewLockDepositTx(
				myAddress,
				utxos,
				height,
				BigInt(Math.round(parseFloat(lockAmount) * 1e9)), // ERG amount in nanoERG as bigint
				tokensToLock,
				unlockHeight
			);

			if (get(selected_wallet_ergo) !== 'ergopay') {
				const signed = await ergo.sign_tx(lockTx);
				const transactionId = await ergo.submit_tx(signed);
				showCustomToast(
					`Tokens locked! TX: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);
				closeModal();
			} else {
				unsignedTx = lockTx;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (error) {
			console.error('Lock error:', error);
			showCustomToast(`Lock failed: ${error.message}`, 5000, 'danger');
		} finally {
			processing = false;
		}
	}

	function closeModal() {
		dispatch('close');
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="modal-overlay"
	in:fade={{ duration: 200 }}
	out:fade={{ duration: 150 }}
	on:click={closeModal}
>
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="modal-content"
		in:fly={{ y: 20, duration: 200 }}
		out:fade={{ duration: 150 }}
		on:click|stopPropagation
	>
		{#if step === 1}
			<!-- Step 1: Choose Lock Type -->
			<div class="modal-header">
				<h2>Lock Your Assets</h2>
				<button class="close-btn" on:click={closeModal}>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
							fill="currentColor"
						/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<p class="step-description">
					Choose what you want to lock with MewLock time-based storage:
				</p>

				<div class="lock-type-grid">
					<button class="lock-type-card" on:click={() => selectLockType('erg')}>
						<div class="lock-type-icon">
							<svg
								width="48"
								height="48"
								viewBox="0 0 24 24"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
									fill="currentColor"
								/>
							</svg>
						</div>
						<h3>ERG Only</h3>
						<p>Lock ERG tokens for a specific duration</p>
						<div class="balance-info">
							Balance: {nFormatter($connected_wallet_balance / 1e9)} ERG
						</div>
					</button>

					<button class="lock-type-card" on:click={() => selectLockType('tokens')}>
						<div class="lock-type-icon">
							<svg
								width="48"
								height="48"
								viewBox="0 0 24 24"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									d="M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16M12,2A1,1 0 0,1 13,3V5.08C16.39,5.57 19,8.47 19,12C19,15.53 16.39,18.43 13,18.92V21A1,1 0 0,1 12,22A1,1 0 0,1 11,21V18.92C7.61,18.43 5,15.53 5,12C5,8.47 7.61,5.57 11,5.08V3A1,1 0 0,1 12,2Z"
									fill="currentColor"
								/>
							</svg>
						</div>
						<h3>ERG + Tokens</h3>
						<p>Lock ERG along with selected tokens</p>
						<div class="balance-info">
							{availableTokens?.length || 0} tokens available
						</div>
					</button>
				</div>
			</div>
		{:else}
			<!-- Step 2: Configure Lock -->
			<div class="modal-header">
				<div class="header-nav">
					<button class="back-btn" on:click={goBack}>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M20 11H7.83L13.42 5.41L12 4L4 12L12 20L13.41 18.59L7.83 13H20V11Z"
								fill="currentColor"
							/>
						</svg>
					</button>
					<h2>Configure Lock</h2>
				</div>
				<button class="close-btn" on:click={closeModal}>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
							fill="currentColor"
						/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				<!-- ERG Amount -->
				{#if lockType === 'erg'}
					<!-- svelte-ignore a11y-label-has-associated-control -->
					<div class="input-group">
						<!-- svelte-ignore a11y-label-has-associated-control -->
						<label>ERG Amount to Lock</label>
						<input
							type="number"
							bind:value={lockAmount}
							placeholder="Enter ERG amount"
							step="0.001"
							min="0.001"
							class="mewlock-input"
						/>
						<small>Available: {nFormatter($connected_wallet_balance / 1e9)} ERG</small>
					</div>
				{/if}

				<!-- Lock Duration -->
				<!-- svelte-ignore a11y-label-has-associated-control -->
				<div class="input-group">
					<!-- svelte-ignore a11y-label-has-associated-control -->
					<label>Lock Duration</label>
					<select
						bind:value={lockDurationSelect}
						on:change={() =>
							(lockDuration =
								lockDurationSelect > 0 ? (lockDuration = lockDurationSelect) : lockDuration)}
						class="mewlock-select"
					>
						<option value={360}>12 hours (360 blocks)</option>
						<option value={720}>1 day (720 blocks)</option>
						<option value={5040}>1 week (5,040 blocks)</option>
						<option value={21600}>1 month (21,600 blocks)</option>
						<option value={129600}>6 months (129,600 blocks)</option>
						<option value={262800}>1 year (262,800 blocks)</option>
						<option value={-1}>Custom</option>
					</select>
					{#if lockDurationSelect === -1}
						<input
							placeholder="Enter custom duration"
							type="number"
							bind:value={lockDuration}
							min="1"
							class="mewlock-input"
						/>
					{/if}
					<small class="block w-100"
						>Unlock at height: {unlockHeight} (Current: {currentHeight})</small
					>
					{#if lockDurationSelect === -1}
						<small class="block">{unlockCalculation}</small>
					{/if}
				</div>

				{#if lockType === 'tokens'}
					<!-- Token Selection -->
					<!-- svelte-ignore a11y-label-has-associated-control -->
					<!-- svelte-ignore a11y-label-has-associated-control -->
					<div class="input-group">
						<label>Select Tokens to Lock</label>
						<div class="erg-notice">
							<small>ERG amount locked: 0.1 ERG (minimum for transaction fees)</small>
						</div>

						{#if !availableTokens || availableTokens.length === 0}
							<div class="no-tokens-message">
								{#if !$utxosTokenInfos || !$utxosAssets}
									<p>Loading your tokens...</p>
									<div class="mini-spinner" />
								{:else}
									<p>No tokens found in your wallet.</p>
									<small>Make sure your wallet is connected and has tokens.</small>
								{/if}
							</div>
						{:else}
							<!-- Selected tokens section (for amount input) -->
							{#if selectedTokensToLock.length > 0}
								<div class="selected-tokens-section">
									<h4>Selected Tokens</h4>
									<div class="selected-tokens-grid">
										{#each selectedTokensToLock as selectedToken (selectedToken.tokenId)}
											<div class="selected-token-card">
												<div class="token-image">
													{#if getImageUrl(selectedToken, false)}
														<img
															src={getImageUrl(selectedToken, false)}
															alt={selectedToken.name || 'Token'}
															onerror={(event) => setPlaceholderImage(event, selectedToken)}
															loading="lazy"
														/>
													{:else}
														<div class="token-placeholder">
															<svg
																width="24"
																height="24"
																viewBox="0 0 24 24"
																fill="none"
																xmlns="http://www.w3.org/2000/svg"
															>
																<path
																	d="M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16M12,2A1,1 0 0,1 13,3V5.08C16.39,5.57 19,8.47 19,12C19,15.53 16.39,18.43 13,18.92V21A1,1 0 0,1 12,22A1,1 0 0,1 11,21V18.92C7.61,18.43 5,15.53 5,12C5,8.47 7.61,5.57 11,5.08V3A1,1 0 0,1 12,2Z"
																	fill="currentColor"
																/>
															</svg>
														</div>
													{/if}
												</div>
												<div class="token-info">
													<div class="token-name">{selectedToken.name || 'Unknown Token'}</div>
													<div class="token-balance">
														{nFormatter(
															selectedToken.displayAmount ||
																selectedToken.amount / Math.pow(10, selectedToken.decimals || 0)
														)}
													</div>
												</div>
												<button
													class="remove-token"
													on:click={() => toggleTokenSelection(selectedToken)}
												>
													<svg
														width="12"
														height="12"
														viewBox="0 0 24 24"
														fill="none"
														xmlns="http://www.w3.org/2000/svg"
													>
														<path
															d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
															fill="currentColor"
														/>
													</svg>
												</button>
												<div class="token-amount-input">
													<input
														type="number"
														placeholder="Amount"
														step="0.001"
														min="0"
														max={selectedToken.displayAmount ||
															selectedToken.amount / Math.pow(10, selectedToken.decimals || 0)}
														value={selectedToken.amountToLock || ''}
														on:input={(e) =>
															updateTokenAmount(selectedToken.tokenId, e.target.value)}
														class="amount-input"
													/>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Available tokens list -->
							<div class="available-tokens-section">
								<h4>Available Tokens</h4>

								{#if availableTokens.filter((token) => !selectedTokensToLock.some((st) => st.tokenId === token.tokenId)).length > 5}
									<input
										type="text"
										bind:value={search}
										placeholder="Search tokens..."
										class="search-input"
									/>
								{/if}

								<div class="tokens-list">
									{#each filteredTokens.filter((token) => !selectedTokensToLock.some((st) => st.tokenId === token.tokenId)) as token (token.tokenId)}
										<button class="token-list-item" on:click={() => toggleTokenSelection(token)}>
											<div class="token-image">
												{#if getImageUrl(token, false)}
													<img
														src={getImageUrl(token, false)}
														alt={token.name || 'Token'}
														onerror={(event) => setPlaceholderImage(event, token)}
														loading="lazy"
													/>
												{:else}
													<div class="token-placeholder">
														<svg
															width="20"
															height="20"
															viewBox="0 0 24 24"
															fill="none"
															xmlns="http://www.w3.org/2000/svg"
														>
															<path
																d="M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16M12,2A1,1 0 0,1 13,3V5.08C16.39,5.57 19,8.47 19,12C19,15.53 16.39,18.43 13,18.92V21A1,1 0 0,1 12,22A1,1 0 0,1 11,21V18.92C7.61,18.43 5,15.53 5,12C5,8.47 7.61,5.57 11,5.08V3A1,1 0 0,1 12,2Z"
																fill="currentColor"
															/>
														</svg>
													</div>
												{/if}
											</div>
											<div class="token-details">
												<div class="token-name">{token.name || 'Unknown Token'}</div>
												<div class="token-balance">
													{nFormatter(
														token.displayAmount || token.amount / Math.pow(10, token.decimals || 0)
													)}
												</div>
											</div>
											<div class="add-indicator">
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													xmlns="http://www.w3.org/2000/svg"
												>
													<path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor" />
												</svg>
											</div>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Submit Button -->
				<button
					class="mewlock-btn submit-btn"
					class:disabled={!canSubmit || processing}
					disabled={!canSubmit || processing}
					on:click={handleLockSubmit}
				>
					{#if processing}
						Processing...
					{:else}
						Lock {lockType === 'erg' ? 'ERG' : 'Assets'}
					{/if}
				</button>
			</div>
		{/if}
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
		max-width: 600px;
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

	.header-nav {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-btn {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 0.5rem;
		color: white;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.15);
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

	.step-description {
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 2rem;
		text-align: center;
		font-size: 1.1rem;
	}

	.lock-type-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
		margin-bottom: 2rem;
	}

	.lock-type-card {
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.lock-type-card:hover {
		border-color: rgba(102, 126, 234, 0.5);
		background: rgba(102, 126, 234, 0.05);
		transform: translateY(-2px);
	}

	.lock-type-icon {
		color: #667eea;
		margin-bottom: 1rem;
		display: flex;
		justify-content: center;
	}

	.lock-type-card h3 {
		color: white;
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.lock-type-card p {
		color: rgba(255, 255, 255, 0.7);
		margin: 0 0 1rem 0;
	}

	.balance-info {
		color: #667eea;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.erg-notice {
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.erg-notice small {
		color: #667eea;
		font-weight: 500;
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

	.input-group small {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
		margin-top: 0.25rem;
		display: block;
	}

	.mewlock-input,
	.mewlock-select,
	.search-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 0.75rem;
		color: white;
		font-size: 1rem;
		transition: all 0.2s;
	}

	.mewlock-input:focus,
	.mewlock-select:focus,
	.search-input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
	}

	/* Token sections */
	.selected-tokens-section,
	.available-tokens-section {
		margin-bottom: 1.5rem;
		width: 100%;
	}

	.selected-tokens-section h4,
	.available-tokens-section h4 {
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.selected-tokens-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 0.75rem;
		width: 100%;
	}

	.tokens-list {
		max-height: 300px;
		overflow-y: auto;
		padding-right: 0.5rem;
		width: 100%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.02);
	}

	.token-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: center;
	}

	.token-card:hover {
		border-color: rgba(102, 126, 234, 0.5);
		background: rgba(102, 126, 234, 0.05);
		transform: translateY(-2px);
	}

	.selected-token-card {
		background: rgba(102, 126, 234, 0.05);
		border: 1px solid rgba(102, 126, 234, 0.3);
		border-radius: 8px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		position: relative;
		text-align: center;
		transition: all 0.2s;
	}

	.selected-token-card:hover {
		border-color: rgba(102, 126, 234, 0.5);
		background: rgba(102, 126, 234, 0.08);
		transform: translateY(-2px);
	}

	.remove-token {
		position: absolute;
		top: 0.25rem;
		right: 0.25rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 4px;
		padding: 0.125rem;
		color: #ef4444;
		cursor: pointer;
		transition: all 0.2s;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-token:hover {
		background: rgba(239, 68, 68, 0.2);
	}

	.token-list-item {
		width: 100%;
		background: none;
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		padding: 0.75rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		transition: all 0.2s;
		color: white;
		text-align: left;
	}

	.token-list-item:last-child {
		border-bottom: none;
	}

	.token-list-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.token-list-item:hover .add-indicator {
		color: #667eea;
	}

	.token-details {
		flex: 1;
		min-width: 0;
	}

	.token-list-item .token-name {
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.token-list-item .token-balance {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.add-indicator {
		color: rgba(255, 255, 255, 0.4);
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.token-image {
		width: 32px;
		height: 32px;
		border-radius: 6px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.selected-token-card .token-image {
		width: 40px;
		height: 40px;
		border-radius: 8px;
	}

	.token-list-item .token-image {
		width: 36px;
		height: 36px;
		border-radius: 8px;
	}

	.token-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.token-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(102, 126, 234, 0.1);
		color: #667eea;
		border-radius: inherit;
	}

	.token-info {
		flex: 1;
		min-width: 0;
	}

	.token-card .token-info {
		flex: none;
		width: 100%;
	}

	.token-name {
		font-weight: 600;
		margin-bottom: 0.25rem;
		font-size: 0.75rem;
		line-height: 1.2;
	}

	.selected-token-card .token-name {
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.token-balance {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.625rem;
		line-height: 1.2;
	}

	.selected-token-card .token-balance {
		font-size: 0.75rem;
	}

	.token-amount-input {
		width: 100%;
		margin-top: 0.5rem;
	}

	.amount-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		padding: 0.5rem;
		color: white;
		font-size: 0.75rem;
		text-align: center;
		transition: all 0.2s;
	}

	.amount-input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
	}

	.amount-input::placeholder {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.75rem;
	}

	.no-tokens-message {
		text-align: center;
		padding: 2rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.no-tokens-message p {
		color: rgba(255, 255, 255, 0.8);
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
	}

	.no-tokens-message small {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
	}

	.mini-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top: 2px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 1rem auto 0;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.mewlock-btn {
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

	.submit-btn {
		width: 100%;
		margin-top: 1rem;
	}

	.mewlock-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
	}

	.mewlock-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.modal-content {
			margin: 0.5rem;
			max-height: 95vh;
		}

		.lock-type-grid {
			grid-template-columns: 1fr;
		}

		.modal-header,
		.modal-body {
			padding: 1rem;
		}
	}
</style>
