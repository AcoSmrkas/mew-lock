<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address, selected_wallet_ergo } from '$lib/store/store';
	import { nFormatter, showCustomToast } from '$lib/utils/utils.js';
	import { fade, fly } from 'svelte/transition';
	import { ErgoAddress } from '@fleet-sdk/core';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import { get } from 'svelte/store';
	import TokenSummaryCard from '$lib/components/common/TokenSummaryCard.svelte';
	import Navigation from '$lib/components/common/Navigation.svelte';

	// MewLock variables
	let mewLockBoxes = [];
	let loading = true;
	let withdrawing = false;
	let currentHeight = 0;

	// Stats
	let totalValueLocked = 0;
	let totalUsers = 0;
	let totalLocks = 0;

	// View filters
	let viewFilter = 'mine'; // 'mine', 'ready', 'all'
	let sortBy = 'height'; // 'height', 'amount', 'tokens'
	let sortOrder = 'asc'; // 'asc', 'desc'

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS =
		'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

	onMount(async () => {
		await getCurrentBlockHeight();
		await loadMewLockBoxes();
	});

	// Convert public key to address using ErgoAddress
	function convertPkToAddress(pkRegister) {
		try {
			// Use renderedValue first, fallback to serializedValue
			const publicKeyHex = pkRegister.renderedValue || pkRegister.serializedValue || pkRegister;

			// Remove '07' prefix if present
			const publicKey = publicKeyHex.startsWith('07') ? publicKeyHex.substring(2) : publicKeyHex;

			return ErgoAddress.fromPublicKey(publicKey).toString();
		} catch (error) {
			console.error('Address conversion error:', error, pkRegister);
			return 'Invalid Address';
		}
	}

	async function getCurrentBlockHeight() {
		try {
			const response = await getBlockHeight();
			currentHeight = response;
		} catch (error) {
			console.error('Error fetching current height:', error);
		}
	}

	async function loadMewLockBoxes() {
		loading = true;
		try {
			const response = await fetch(
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}`
			);
			const data = await response.json();

			mewLockBoxes = data.items.map((box) => {
				const unlockHeight = parseInt(box.additionalRegisters.R5.renderedValue);
				const canWithdraw = currentHeight >= unlockHeight;
				const depositorAddress = convertPkToAddress(box.additionalRegisters.R4);
				const isOwnBox = depositorAddress === $connected_wallet_address;

				return {
					boxId: box.boxId,
					value: parseInt(box.value),
					assets: box.assets || [],
					unlockHeight,
					currentHeight,
					canWithdraw,
					depositorAddress,
					isOwnBox,
					ergoTree: box.ergoTree,
					additionalRegisters: box.additionalRegisters,
					blocksRemaining: Math.max(0, unlockHeight - currentHeight)
				};
			});

			// Calculate stats
			totalValueLocked = mewLockBoxes.reduce((sum, box) => sum + box.value / 1e9, 0);
			totalUsers = new Set(mewLockBoxes.map((box) => box.depositorAddress)).size;
			totalLocks = mewLockBoxes.length;
		} catch (error) {
			console.error('Error loading MewLock boxes:', error);
		}
		loading = false;
	}

	async function handleWithdrawal(lockBox) {
		if (!lockBox.canWithdraw || !lockBox.isOwnBox || withdrawing) return;

		withdrawing = true;
		try {
			const { connected_wallet_address, selected_wallet_ergo } = await import('$lib/store/store');
			const { fetchBoxes } = await import('$lib/api-explorer/explorer.ts');
			const { getBlockHeight } = await import('$lib/api-explorer/explorer.ts');
			const { createMewLockWithdrawalTx } = await import('$lib/contract/mewLockTx.ts');
			const { get } = await import('svelte/store');

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

			const withdrawalTx = await createMewLockWithdrawalTx(myAddress, utxos, height, lockBox);

			if (get(selected_wallet_ergo) !== 'ergopay') {
				const signed = await ergo.sign_tx(withdrawalTx);
				const transactionId = await ergo.submit_tx(signed);
				showCustomToast(
					`Withdrawn! TX: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);
				await loadMewLockBoxes();
			}
		} catch (error) {
			console.error('Withdrawal error:', error);
			showCustomToast(`Withdrawal failed: ${error.message}`, 5000, 'danger');
		} finally {
			withdrawing = false;
		}
	}

	function toggleSort(newSortBy: string) {
		if (sortBy === newSortBy) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = newSortBy;
			sortOrder = 'desc';
		}
	}

	function setViewFilter(filter: string) {
		viewFilter = filter;
	}

	// Reactive statements for filtering and sorting
	$: ownLocks = mewLockBoxes.filter((box) => box.isOwnBox);
	$: unlockableBoxes = ownLocks.filter((box) => box.canWithdraw);
	$: personalERGLocked = ownLocks.reduce((sum, box) => sum + box.value / 1e9, 0);
	$: personalLockCount = ownLocks.length;

	// Calculate personal token summaries
	$: personalTokenSummaries = ownLocks.reduce((summaries, box) => {
		// Add ERG amount
		if (!summaries.ERG) {
			summaries.ERG = { totalAmount: 0, tokenName: 'ERG', decimals: 9, tokenId: null };
		}
		summaries.ERG.totalAmount += box.value;

		// Add token amounts
		if (box.assets && box.assets.length > 0) {
			box.assets.forEach((asset) => {
				if (!summaries[asset.tokenId]) {
					summaries[asset.tokenId] = {
						totalAmount: 0,
						tokenName: asset.name || 'Unknown Token',
						decimals: asset.decimals || 0,
						tokenId: asset.tokenId,
						asset: asset
					};
				}
				summaries[asset.tokenId].totalAmount += asset.amount;
			});
		}

		return summaries;
	}, {});

	$: personalTokenList = Object.values(personalTokenSummaries).filter(
		(summary) => summary.totalAmount > 0
	);

	// Filtering based on view mode
	$: filteredBoxes = (() => {
		switch (viewFilter) {
			case 'mine':
				return ownLocks;
			case 'ready':
				return unlockableBoxes;
			case 'all':
			default:
				return mewLockBoxes;
		}
	})();

	// Sorting
	$: sortedFilteredBoxes = [...filteredBoxes].sort((a, b) => {
		let aValue, bValue;

		switch (sortBy) {
			case 'height':
				aValue = a.unlockHeight;
				bValue = b.unlockHeight;
				break;
			case 'amount':
				aValue = a.value;
				bValue = b.value;
				break;
			case 'tokens':
				aValue = a.assets?.length || 0;
				bValue = b.assets?.length || 0;
				break;
			default:
				return 0;
		}

		const result = aValue - bValue;
		return sortOrder === 'asc' ? result : -result;
	});
</script>

<svelte:head>
	<title>Mew Lock - Your Locked Assets</title>
</svelte:head>

<!-- Navigation -->
<Navigation />

<div class="locks-container">
	<main class="locks-main">
		{#if !$connected_wallet_address}
			<div class="connect-wallet-prompt">
				<div class="connect-icon">
					<svg
						width="64"
						height="64"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4M20 18H4V8H20V18M17 12C17 11.4 16.6 11 16 11S15 11.4 15 12S15.4 13 16 13S17 12.6 17 12Z"
							fill="currentColor"
						/>
					</svg>
				</div>
				<h3>Connect Your Wallet</h3>
				<p>
					Connect your wallet using the navigation menu above to view and manage your locked assets.
				</p>
			</div>
		{:else if loading}
			<div class="loading-state">
				<div class="spinner" />
				<p>Loading your locked assets...</p>
			</div>
		{:else}
			<!-- Personal Stats -->
			<section class="personal-stats">
				<h2>Your Lock Summary</h2>
				<div class="stats-grid">
					<div class="stat-card primary">
						<div class="stat-icon">
							<svg
								width="24"
								height="24"
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
						<div class="stat-content">
							<div class="stat-value">{nFormatter(personalERGLocked)}</div>
							<div class="stat-label">ERG Locked</div>
						</div>
					</div>

					<div class="stat-card">
						<div class="stat-icon">
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
						<div class="stat-content">
							<div class="stat-value">{personalLockCount}</div>
							<div class="stat-label">Active Locks</div>
						</div>
					</div>

					<div class="stat-card success">
						<div class="stat-icon">
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"
									fill="currentColor"
								/>
							</svg>
						</div>
						<div class="stat-content">
							<div class="stat-value">{unlockableBoxes.length}</div>
							<div class="stat-label">Ready to Unlock</div>
						</div>
					</div>

					<div class="stat-card">
						<div class="stat-icon">
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path
									d="M5,6H23V18H5V6M14,9A3,3 0 0,1 17,12A3,3 0 0,1 14,15A3,3 0 0,1 11,12A3,3 0 0,1 14,9M9,8A2,2 0 0,1 7,10V14A2,2 0 0,1 9,16H19A2,2 0 0,1 21,14V10A2,2 0 0,1 19,8H9Z"
									fill="currentColor"
								/>
							</svg>
						</div>
						<div class="stat-content">
							<div class="stat-value">{personalTokenList.length}</div>
							<div class="stat-label">Token Types</div>
						</div>
					</div>
				</div>
			</section>

			<!-- Your Tokens Section -->
			{#if personalTokenList.length > 0}
				<section class="personal-tokens">
					<h2>Your Locked Tokens</h2>
					<div class="tokens-grid">
						{#each personalTokenList as token (token.tokenId || 'ERG')}
							<TokenSummaryCard
								tokenId={token.tokenId}
								tokenName={token.tokenName}
								totalAmount={token.totalAmount}
								decimals={token.decimals}
								asset={token.asset}
								isStatCard={false}
							/>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Locks Management Section -->
			<section class="locks-management">
				<div class="section-header">
					<h2>Manage Your Locks</h2>
					<div class="controls">
						<!-- View Filter -->
						<div class="view-controls">
							<button
								class="filter-btn"
								class:active={viewFilter === 'mine'}
								on:click={() => setViewFilter('mine')}
							>
								Mine ({ownLocks.length})
							</button>
							<button
								class="filter-btn"
								class:active={viewFilter === 'ready'}
								on:click={() => setViewFilter('ready')}
							>
								Ready ({unlockableBoxes.length})
							</button>
							<button
								class="filter-btn"
								class:active={viewFilter === 'all'}
								on:click={() => setViewFilter('all')}
							>
								All ({mewLockBoxes.length})
							</button>
						</div>

						<!-- Sort Controls -->
						<div class="sort-controls">
							<button
								class="sort-btn"
								class:active={sortBy === 'height'}
								on:click={() => toggleSort('height')}
							>
								Height
								{#if sortBy === 'height'}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										{#if sortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</button>
							<button
								class="sort-btn"
								class:active={sortBy === 'amount'}
								on:click={() => toggleSort('amount')}
							>
								Amount
								{#if sortBy === 'amount'}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										{#if sortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</button>
							<button
								class="sort-btn"
								class:active={sortBy === 'tokens'}
								on:click={() => toggleSort('tokens')}
							>
								Tokens
								{#if sortBy === 'tokens'}
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										{#if sortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</button>
						</div>
					</div>
				</div>

				<!-- Locks Grid -->
				{#if sortedFilteredBoxes.length > 0}
					<div class="locks-grid">
						{#each sortedFilteredBoxes as lockBox (lockBox.boxId)}
							<div
								class="lock-card"
								class:own={lockBox.isOwnBox}
								class:ready={lockBox.canWithdraw}
								transition:fly={{ y: 20, duration: 300 }}
							>
								<div class="lock-header">
									<div class="lock-status">
										{#if lockBox.canWithdraw}
											<span class="status-badge ready">Ready to Unlock</span>
										{:else}
											<span class="status-badge locked">Locked</span>
										{/if}
										{#if lockBox.isOwnBox}
											<span class="ownership-badge">Yours</span>
										{/if}
									</div>
									<div class="lock-height">
										Block {nFormatter(lockBox.unlockHeight)}
									</div>
								</div>

								<div class="lock-content">
									<div class="lock-amount">
										<div class="amount-value">{nFormatter(lockBox.value / 1e9)} ERG</div>
										{#if lockBox.assets && lockBox.assets.length > 0}
											<div class="token-count">
												+ {lockBox.assets.length} token{lockBox.assets.length === 1 ? '' : 's'}
											</div>
										{/if}
									</div>

									{#if lockBox.assets && lockBox.assets.length > 0}
										<div class="token-list">
											{#each lockBox.assets.slice(0, 3) as asset}
												<div class="token-item">
													{nFormatter(asset.amount / 10 ** (asset.decimals || 0))}
													{asset.name || 'Token'}
												</div>
											{/each}
											{#if lockBox.assets.length > 3}
												<div class="token-item more">+{lockBox.assets.length - 3} more</div>
											{/if}
										</div>
									{/if}

									<div class="lock-timing">
										{#if lockBox.canWithdraw}
											<span class="timing-text ready">Unlocked & Ready</span>
										{:else}
											<span class="timing-text">
												{nFormatter(lockBox.blocksRemaining)} blocks remaining
											</span>
										{/if}
									</div>
								</div>

								{#if lockBox.isOwnBox && lockBox.canWithdraw}
									<div class="lock-actions">
										<button
											class="withdraw-btn"
											disabled={withdrawing}
											on:click={() => handleWithdrawal(lockBox)}
										>
											{#if withdrawing}
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													xmlns="http://www.w3.org/2000/svg"
												>
													<path
														d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"
														fill="currentColor"
													/>
												</svg>
												Withdrawing...
											{:else}
												<svg
													width="16"
													height="16"
													viewBox="0 0 24 24"
													fill="none"
													xmlns="http://www.w3.org/2000/svg"
												>
													<path
														d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"
														fill="currentColor"
													/>
												</svg>
												Withdraw
											{/if}
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty-state">
						<div class="empty-icon">
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
						<h3>No Assets Found</h3>
						<p>
							{#if viewFilter === 'mine'}
								You don't have any locked assets yet.
							{:else if viewFilter === 'ready'}
								No assets are ready to unlock at the moment.
							{:else}
								No locked assets match the current filter.
							{/if}
						</p>
					</div>
				{/if}
			</section>
		{/if}
	</main>
</div>

<style>
	/* Base Styles */
	.locks-container {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
	}

	/* Header */
	.locks-header {
		padding: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.02);
	}

	.header-content {
		max-width: 1400px;
		margin: 0 auto;
	}

	.header-title-area h1 {
		font-size: 3rem;
		font-weight: 800;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0 0 0.5rem 0;
		line-height: 1;
	}

	.header-description {
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.1rem;
		margin: 0;
		max-width: 600px;
	}

	/* Main Content */
	.locks-main {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	/* Connect Wallet Prompt */
	.connect-wallet-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		margin-top: 2rem;
	}

	.connect-icon {
		color: rgba(255, 255, 255, 0.3);
		margin-bottom: 1.5rem;
	}

	.connect-wallet-prompt h3 {
		color: white;
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
	}

	.connect-wallet-prompt p {
		color: rgba(255, 255, 255, 0.7);
		margin: 0 0 2rem 0;
	}

	/* Loading State */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem;
		text-align: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top: 3px solid #667eea;
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

	/* Personal Stats */
	.personal-stats {
		margin-bottom: 3rem;
	}

	.personal-stats h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
	}

	.stat-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		transition: all 0.3s ease;
	}

	.stat-card:hover {
		transform: translateY(-2px);
		border-color: rgba(102, 126, 234, 0.3);
		background: rgba(102, 126, 234, 0.05);
	}

	.stat-card.primary {
		border-color: rgba(102, 126, 234, 0.5);
		background: rgba(102, 126, 234, 0.05);
	}

	.stat-card.success {
		border-color: rgba(34, 197, 94, 0.5);
		background: rgba(34, 197, 94, 0.05);
	}

	.stat-icon {
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 8px;
		padding: 0.75rem;
		color: #667eea;
		flex-shrink: 0;
	}

	.stat-card.success .stat-icon {
		background: rgba(34, 197, 94, 0.1);
		border-color: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.stat-content {
		flex: 1;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.25rem;
		line-height: 1;
	}

	.stat-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		font-weight: 500;
	}

	/* Personal Tokens */
	.personal-tokens {
		margin-bottom: 3rem;
	}

	.personal-tokens h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
	}

	.tokens-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	/* Locks Management */
	.locks-management {
		margin-bottom: 3rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.section-header h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0;
	}

	.controls {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.view-controls,
	.sort-controls {
		display: flex;
		gap: 0.25rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 0.25rem;
	}

	.filter-btn,
	.sort-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.filter-btn:hover,
	.sort-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.filter-btn.active,
	.sort-btn.active {
		background: rgba(102, 126, 234, 0.2);
		color: #667eea;
	}

	/* Locks Grid */
	.locks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.lock-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		transition: all 0.3s ease;
		position: relative;
	}

	.lock-card:hover {
		transform: translateY(-2px);
		border-color: rgba(102, 126, 234, 0.3);
		background: rgba(102, 126, 234, 0.05);
	}

	.lock-card.own {
		border-color: rgba(102, 126, 234, 0.3);
		background: rgba(102, 126, 234, 0.03);
	}

	.lock-card.ready {
		border-color: rgba(34, 197, 94, 0.3);
		background: rgba(34, 197, 94, 0.03);
	}

	.lock-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
	}

	.lock-status {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.status-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.status-badge.ready {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.status-badge.locked {
		background: rgba(255, 193, 7, 0.2);
		color: #ffc107;
		border: 1px solid rgba(255, 193, 7, 0.3);
	}

	.ownership-badge {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(102, 126, 234, 0.2);
		color: #667eea;
		border: 1px solid rgba(102, 126, 234, 0.3);
	}

	.lock-height {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.lock-content {
		margin-bottom: 1rem;
	}

	.lock-amount {
		margin-bottom: 1rem;
	}

	.amount-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.25rem;
	}

	.token-count {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
	}

	.token-list {
		margin-bottom: 1rem;
	}

	.token-item {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.8);
	}

	.token-item.more {
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
	}

	.lock-timing {
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.timing-text {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.timing-text.ready {
		color: #22c55e;
		font-weight: 600;
	}

	.lock-actions {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.withdraw-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.withdraw-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
	}

	.withdraw-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.withdraw-btn svg {
		animation: spin 1s linear infinite;
	}

	.withdraw-btn:not(:disabled) svg {
		animation: none;
	}

	/* Empty State */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
	}

	.empty-icon {
		color: rgba(255, 255, 255, 0.3);
		margin-bottom: 1.5rem;
	}

	.empty-state h3 {
		color: white;
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
	}

	.empty-state p {
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 2rem 0;
		max-width: 400px;
	}

	.empty-action-btn {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.empty-action-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.locks-header,
		.locks-main {
			padding: 1rem;
		}

		.header-title-area h1 {
			font-size: 2rem;
		}

		.section-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.controls {
			width: 100%;
			justify-content: space-between;
		}

		.stats-grid,
		.locks-grid {
			grid-template-columns: 1fr;
		}

		.tokens-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}

		.view-controls,
		.sort-controls {
			flex: 1;
		}
	}
</style>
