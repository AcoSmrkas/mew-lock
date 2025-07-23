<script lang="ts">
	import { onMount } from 'svelte';
	import { connected_wallet_address, selected_wallet_ergo, fetchUtxos } from '$lib/store/store';
	import { nFormatter, showCustomToast } from '$lib/utils/utils.js';
	import { ErgoAddress } from '@fleet-sdk/core';
	import { fetchBoxes, getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import TokenSummaryCard from '$lib/components/common/TokenSummaryCard.svelte';
	import MewLockCards from '$lib/components/common/MewLockCards.svelte';
	import { createMewLockWithdrawalTx } from '$lib/contract/mewLockTx.ts';
	import { get } from 'svelte/store';
	import Navigation from '$lib/components/common/Navigation.svelte';

	// MewLock variables
	let mewLockBoxes = [];
	let loading = true;
	let currentHeight = 0;
	
	// Stats
	let totalValueLocked = 0;
	let totalUsers = 0;
	let totalLocks = 0;
	let unlockableBoxes = [];

	// Advanced stats
	let avgLockDuration = 0;
	let totalTokensLocked = 0;
	let uniqueTokenTypes = 0;
	let avgLockValue = 0;
	let longestLockDuration = 0;
	let shortestLockDuration = 0;

	// Sorting and view controls
	let sortBy = 'height';
	let sortOrder = 'desc';
	let viewMode = 'all'; // 'all' for platform stats

	// Leaderboard data
	let leaderboard = [];

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS = "5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU";

	onMount(async () => {
		await getCurrentBlockHeight();
		await loadMewLockBoxes();
	});

	// Convert public key to address using ErgoAddress
	function convertPkToAddress(pkRegister) {
		try {
			const publicKeyHex = pkRegister.renderedValue || pkRegister.serializedValue || pkRegister;
			const publicKey = publicKeyHex.startsWith('07') 
				? publicKeyHex.substring(2) 
				: publicKeyHex;
			return ErgoAddress.fromPublicKey(publicKey).toString();
		} catch (error) {
			console.error('Address conversion error:', error, pkRegister);
			return 'Invalid Address';
		}
	}

	async function getCurrentBlockHeight() {
		try {
			const response = await fetch('https://api.ergoplatform.com/api/v1/info');
			const data = await response.json();
			currentHeight = data.fullHeight || 0;
		} catch (error) {
			console.error('Error fetching current height:', error);
			currentHeight = 0;
		}
	}

	async function loadMewLockBoxes() {
		loading = true;
		try {
			const response = await fetch(`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}`);
			const data = await response.json();
			
			mewLockBoxes = data.items.map(box => {
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

			// Calculate basic stats
			totalValueLocked = mewLockBoxes.reduce((sum, box) => sum + (box.value / 1e9), 0);
			totalUsers = new Set(mewLockBoxes.map(box => box.depositorAddress).filter(addr => addr !== 'Unknown')).size;
			totalLocks = mewLockBoxes.length;
			unlockableBoxes = mewLockBoxes.filter(box => box.canWithdraw);

			// Calculate advanced stats
			calculateAdvancedStats();
		} catch (error) {
			console.error('Error loading MewLock boxes:', error);
			// Set default values on error
			mewLockBoxes = [];
			totalValueLocked = 0;
			totalUsers = 0;
			totalLocks = 0;
			unlockableBoxes = [];
		}
		loading = false;
	}

	function calculateAdvancedStats() {
		if (mewLockBoxes.length === 0) return;

		// Average lock duration
		const durations = mewLockBoxes.map(box => box.blocksRemaining + (currentHeight - box.currentHeight));
		avgLockDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

		// Longest and shortest lock duration
		longestLockDuration = Math.max(...durations);
		shortestLockDuration = Math.min(...durations);

		// Total tokens locked
		totalTokensLocked = mewLockBoxes.reduce((sum, box) => sum + (box.assets?.length || 0), 0);

		// Unique token types
		const uniqueTokenIds = new Set();
		mewLockBoxes.forEach(box => {
			box.assets?.forEach(asset => uniqueTokenIds.add(asset.tokenId));
		});
		uniqueTokenTypes = uniqueTokenIds.size;

		// Average lock value
		avgLockValue = totalValueLocked / totalLocks;

		// Calculate leaderboard
		calculateLeaderboard();
	}

	function calculateLeaderboard() {
		const userStats = {};
		
		mewLockBoxes.forEach(box => {
			const address = box.depositorAddress;
			if (!userStats[address]) {
				userStats[address] = {
					address,
					totalValueLocked: 0,
					totalLocks: 0,
					uniqueTokenTypes: new Set(),
					averageDuration: 0,
					totalDuration: 0
				};
			}
			
			userStats[address].totalValueLocked += box.value / 1e9;
			userStats[address].totalLocks += 1;
			userStats[address].totalDuration += box.blocksRemaining + (currentHeight - box.currentHeight);
			
			box.assets?.forEach(asset => {
				userStats[address].uniqueTokenTypes.add(asset.tokenId);
			});
		});

		// Convert to array and calculate averages
		leaderboard = Object.values(userStats).map(user => ({
			...user,
			uniqueTokenTypes: user.uniqueTokenTypes.size,
			averageDuration: user.totalDuration / user.totalLocks
		})).sort((a, b) => b.totalValueLocked - a.totalValueLocked);
	}

	// Sorting functions
	function toggleSort(newSortBy: string) {
		if (sortBy === newSortBy) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = newSortBy;
			sortOrder = 'desc';
		}
	}


	// Withdraw function
	async function handleWithdraw(event) {
		const { boxId, box } = event.detail;
		
		try {
			let myAddress, height, utxos;

			if (get(selected_wallet_ergo) !== 'ergopay') {
				myAddress = await ergo.get_change_address();
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await ergo.get_current_height();
			} else {
				myAddress = get(connected_wallet_address);
				utxos = await fetchBoxes(get(connected_wallet_address));
				height = await getCurrentBlockHeight();
			}

			const withdrawTx = await createMewLockWithdrawalTx(
				myAddress,
				utxos,
				height,
				box
			);

			if (get(selected_wallet_ergo) !== 'ergopay') {
				const signed = await ergo.sign_tx(withdrawTx);
				const transactionId = await ergo.submit_tx(signed);
				showCustomToast(`Withdrawal successful! TX: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`, 10000, 'success');
				
				// Refresh data after successful withdrawal
				setTimeout(() => {
					loadMewLockBoxes();
				}, 2000);
			}
		} catch (error) {
			console.error('Withdrawal error:', error);
			showCustomToast(`Withdrawal failed: ${error.message}`, 5000, 'danger');
		}
	}

	// Calculate token summaries for detailed stats
	$: tokenSummaries = mewLockBoxes.reduce((summaries, box) => {
		// Add ERG amount
		if (!summaries.ERG) {
			summaries.ERG = { totalAmount: 0, tokenName: 'ERG', decimals: 9, tokenId: null };
		}
		summaries.ERG.totalAmount += box.value;

		// Add token amounts
		if (box.assets && box.assets.length > 0) {
			box.assets.forEach(asset => {
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

	$: tokenSummaryList = Object.values(tokenSummaries).filter(summary => summary.totalAmount > 0);
	$: ergOnlyLocks = mewLockBoxes.filter(box => !box.assets || box.assets.length === 0);
	$: tokenLocks = mewLockBoxes.filter(box => box.assets && box.assets.length > 0);

	// Sorting logic
	$: sortedMewLockBoxes = [...mewLockBoxes].sort((a, b) => {
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

	// Platform-wide view (no personal filtering)
	$: filteredSortedBoxes = sortedMewLockBoxes;
</script>

<svelte:head>
	<title>MewLock Statistics - Detailed Platform Analytics</title>
</svelte:head>

<!-- Navigation -->
<Navigation />

<div class="stats-container">
	<main class="stats-main">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading platform statistics...</p>
			</div>
		{:else}
			<!-- Key Metrics -->
			<section class="key-metrics">
				<h2>Key Platform Metrics</h2>
				<div class="metrics-grid">
					<div class="metric-card primary">
						<div class="metric-icon">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
							</svg>
						</div>
						<div class="metric-content">
							<div class="metric-value">{nFormatter(totalValueLocked)}</div>
							<div class="metric-label">Total ERG Locked</div>
							<div class="metric-change">Platform's total locked value</div>
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M12 4A4 4 0 0 1 16 8A4 4 0 0 1 12 12A4 4 0 0 1 8 8A4 4 0 0 1 12 4M12 6A2 2 0 0 0 10 8A2 2 0 0 0 12 10A2 2 0 0 0 14 8A2 2 0 0 0 12 6M12 13C14.67 13 20 14.33 20 17V20H4V17C4 14.33 9.33 13 12 13M12 14.9C9.03 14.9 5.9 16.36 5.9 17V18.1H18.1V17C18.1 16.36 14.97 14.9 12 14.9Z" fill="currentColor"/>
							</svg>
						</div>
						<div class="metric-content">
							<div class="metric-value">{totalUsers}</div>
							<div class="metric-label">Active Users</div>
							<div class="metric-change">Unique addresses using MewLock</div>
						</div>
					</div>

					<div class="metric-card">
						<div class="metric-icon">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16M12,2A1,1 0 0,1 13,3V5.08C16.39,5.57 19,8.47 19,12C19,15.53 16.39,18.43 13,18.92V21A1,1 0 0,1 12,22A1,1 0 0,1 11,21V18.92C7.61,18.43 5,15.53 5,12C5,8.47 7.61,5.57 11,5.08V3A1,1 0 0,1 12,2Z" fill="currentColor"/>
							</svg>
						</div>
						<div class="metric-content">
							<div class="metric-value">{totalLocks}</div>
							<div class="metric-label">Total Locks</div>
							<div class="metric-change">Active lock contracts</div>
						</div>
					</div>

					<div class="metric-card success">
						<div class="metric-icon">
							<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" fill="currentColor"/>
							</svg>
						</div>
						<div class="metric-content">
							<div class="metric-value">{unlockableBoxes.length}</div>
							<div class="metric-label">Ready to Unlock</div>
							<div class="metric-change">Available for withdrawal</div>
						</div>
					</div>
				</div>
			</section>

			<!-- Advanced Analytics -->
			<section class="advanced-stats">
				<h2>Advanced Analytics</h2>
				<div class="advanced-grid">
					<div class="advanced-card">
						<h3>Lock Duration Analysis</h3>
						<div class="stat-row">
							<span class="stat-label">Average Duration:</span>
							<span class="stat-value">{Math.round(avgLockDuration)} blocks</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">Longest Lock:</span>
							<span class="stat-value">{nFormatter(longestLockDuration)} blocks</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">Shortest Lock:</span>
							<span class="stat-value">{nFormatter(shortestLockDuration)} blocks</span>
						</div>
					</div>

					<div class="advanced-card">
						<h3>Token Analysis</h3>
						<div class="stat-row">
							<span class="stat-label">Total Tokens Locked:</span>
							<span class="stat-value">{totalTokensLocked}</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">Unique Token Types:</span>
							<span class="stat-value">{uniqueTokenTypes}</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">ERG-Only Locks:</span>
							<span class="stat-value">{ergOnlyLocks.length} ({Math.round(ergOnlyLocks.length / totalLocks * 100)}%)</span>
						</div>
					</div>

					<div class="advanced-card">
						<h3>Value Analysis</h3>
						<div class="stat-row">
							<span class="stat-label">Average Lock Value:</span>
							<span class="stat-value">{nFormatter(avgLockValue)} ERG</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">Token Locks:</span>
							<span class="stat-value">{tokenLocks.length} ({Math.round(tokenLocks.length / totalLocks * 100)}%)</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">Current Block:</span>
							<span class="stat-value">{nFormatter(currentHeight)}</span>
						</div>
					</div>
				</div>
			</section>

			<!-- Token Distribution -->
			{#if tokenSummaryList.length > 0}
				<section class="token-distribution">
					<h2>Locked Token Distribution</h2>
					<div class="token-summary-grid">
						{#each tokenSummaryList as token (token.tokenId || 'ERG')}
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

			<!-- Leaderboard -->
			{#if leaderboard.length > 0}
				<section class="leaderboard-section">
					<h2>Top Users Leaderboard</h2>
					<div class="leaderboard-table">
						<div class="table-header">
							<div class="header-cell rank">Rank</div>
							<div class="header-cell address">Address</div>
							<div class="header-cell value">Total Locked</div>
							<div class="header-cell locks">Locks</div>
							<div class="header-cell tokens">Token Types</div>
							<div class="header-cell duration">Avg Duration</div>
						</div>
						{#each leaderboard.slice(0, 10) as user, index}
							<div class="table-row" class:own={user.address === $connected_wallet_address}>
								<div class="table-cell rank">
									<div class="rank-badge" class:top3={index < 3}>
										{#if index === 0}👑{:else if index === 1}🥈{:else if index === 2}🥉{:else}{index + 1}{/if}
									</div>
								</div>
								<div class="table-cell address">
									<span class="address-text">{user.address.slice(0, 6)}...{user.address.slice(-6)}</span>
									{#if user.address === $connected_wallet_address}
										<span class="you-badge">YOU</span>
									{/if}
								</div>
								<div class="table-cell value">{nFormatter(user.totalValueLocked)} ERG</div>
								<div class="table-cell locks">{user.totalLocks}</div>
								<div class="table-cell tokens">{user.uniqueTokenTypes}</div>
								<div class="table-cell duration">{Math.round(user.averageDuration)} blocks</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Locked Assets Section -->
			<section class="locked-assets-section">
				<div class="section-header">
					<h2>All Locked Assets</h2>
					<div class="header-controls">
						<!-- Sorting Controls -->
						<div class="sort-controls">
							<button 
								class="sort-btn" 
								class:active={sortBy === 'height'}
								on:click={() => toggleSort('height')}
							>
								Height
								{#if sortBy === 'height'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if sortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor"/>
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
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
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if sortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor"/>
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
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
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if sortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor"/>
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor"/>
										{/if}
									</svg>
								{/if}
							</button>
						</div>

						<!-- Platform Note -->
						<div class="platform-note">
							<span>Platform-wide Analytics</span>
							<a href="/my-locks" class="manage-link">
								Manage Your Locks →
							</a>
						</div>
					</div>
				</div>

				{#if filteredSortedBoxes.length > 0}
					<MewLockCards 
						mewLockBoxes={filteredSortedBoxes}
						{currentHeight}
						on:withdraw={handleWithdraw}
					/>
				{:else}
					<div class="empty-state">
						<div class="empty-icon">
							<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
							</svg>
						</div>
						<h3>No Locked Assets Found</h3>
						<p>No assets match the current filter criteria.</p>
					</div>
				{/if}
			</section>
		{/if}
	</main>
</div>

<style>
	.stats-container {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
	}

	.stats-header {
		padding: 2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.02);
	}

	.header-content {
		max-width: 1400px;
		margin: 0 auto;
	}


	.stats-header h1 {
		font-size: 3rem;
		font-weight: 800;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0 0 1rem 0;
		line-height: 1;
	}

	.stats-description {
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.1rem;
		margin: 0;
		max-width: 600px;
	}

	.stats-main {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
	}

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
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Key Metrics */
	.key-metrics {
		margin-bottom: 3rem;
	}

	.key-metrics h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1.5rem;
	}

	.metric-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
		display: flex;
		align-items: flex-start;
		gap: 1.5rem;
		transition: all 0.3s ease;
	}

	.metric-card:hover {
		transform: translateY(-4px);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
		border-color: rgba(102, 126, 234, 0.3);
	}

	.metric-card.primary {
		border-color: rgba(102, 126, 234, 0.5);
		background: rgba(102, 126, 234, 0.05);
	}

	.metric-card.success {
		border-color: rgba(34, 197, 94, 0.5);
		background: rgba(34, 197, 94, 0.05);
	}

	.metric-icon {
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 12px;
		padding: 1rem;
		color: #667eea;
		flex-shrink: 0;
	}

	.metric-card.success .metric-icon {
		background: rgba(34, 197, 94, 0.1);
		border-color: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	.metric-content {
		flex: 1;
	}

	.metric-value {
		font-size: 2.5rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.5rem;
		line-height: 1;
	}

	.metric-label {
		font-size: 1rem;
		color: white;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.metric-change {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.6);
	}

	/* Advanced Stats */
	.advanced-stats {
		margin-bottom: 3rem;
	}

	.advanced-stats h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
	}

	.advanced-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.advanced-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		transition: all 0.3s ease;
	}

	.advanced-card:hover {
		border-color: rgba(102, 126, 234, 0.3);
		background: rgba(102, 126, 234, 0.05);
	}

	.advanced-card h3 {
		color: white;
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 1.5rem 0;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.stat-row:last-child {
		margin-bottom: 0;
	}

	.stat-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
	}

	.stat-value {
		color: #667eea;
		font-weight: 600;
		font-size: 0.875rem;
	}

	/* Token Distribution */
	.token-distribution {
		margin-bottom: 3rem;
	}

	.token-distribution h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
	}

	.token-summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	/* Leaderboard */
	.leaderboard-section {
		margin-bottom: 3rem;
	}

	.leaderboard-section h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
	}

	.leaderboard-table {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		overflow: hidden;
	}

	.table-header {
		display: grid;
		grid-template-columns: 80px 1fr 120px 80px 100px 120px;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: rgba(255, 255, 255, 0.1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.header-cell {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.table-row {
		display: grid;
		grid-template-columns: 80px 1fr 120px 80px 100px 120px;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: all 0.2s;
	}

	.table-row:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.table-row.own {
		background: rgba(102, 126, 234, 0.1);
		border-color: rgba(102, 126, 234, 0.2);
	}

	.table-row:last-child {
		border-bottom: none;
	}

	.table-cell {
		display: flex;
		align-items: center;
		color: white;
		font-size: 0.875rem;
	}

	.rank-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		font-weight: 600;
		font-size: 0.875rem;
	}

	.rank-badge.top3 {
		background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
		color: #1a1a2e;
		font-size: 1rem;
	}

	.address-text {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.8rem;
	}

	.you-badge {
		background: #667eea;
		color: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.625rem;
		font-weight: 600;
		margin-left: 0.5rem;
	}

	/* Locked Assets Section */
	.locked-assets-section {
		margin-bottom: 3rem;
	}

	.locked-assets-section h2 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
	}

	.header-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sort-controls {
		display: flex;
		gap: 0.5rem;
	}

	.platform-note {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 8px;
	}

	.platform-note span {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.manage-link {
		color: #667eea;
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.manage-link:hover {
		color: white;
	}

	.sort-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.sort-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.sort-btn.active {
		background: rgba(102, 126, 234, 0.2);
		border-color: rgba(102, 126, 234, 0.4);
		color: #667eea;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
	}

	.empty-icon {
		color: rgba(255, 255, 255, 0.3);
		margin-bottom: 1rem;
	}

	.empty-state h3 {
		color: white;
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		color: rgba(255, 255, 255, 0.6);
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.stats-header,
		.stats-main {
			padding: 1rem;
		}

		.stats-header h1 {
			font-size: 2rem;
		}

		.metrics-grid,
		.advanced-grid {
			grid-template-columns: 1fr;
		}

		.metric-card {
			padding: 1.5rem;
		}

		.metric-value {
			font-size: 2rem;
		}

		.token-summary-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}

		.header-controls {
			flex-direction: column;
			gap: 0.5rem;
		}

		.table-header,
		.table-row {
			grid-template-columns: 60px 1fr 100px 60px;
			font-size: 0.75rem;
		}

		.header-cell.tokens,
		.header-cell.duration,
		.table-cell.tokens,
		.table-cell.duration {
			display: none;
		}

		.section-header {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}
	}
</style>