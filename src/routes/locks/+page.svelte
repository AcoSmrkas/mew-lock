<script lang="ts">
	import { onMount } from 'svelte';
	import { nFormatter } from '$lib/utils/utils.js';
	import { fade, fly } from 'svelte/transition';
	import { ErgoAddress } from '@fleet-sdk/core';
	import { getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import TokenSummaryCard from '$lib/components/common/TokenSummaryCard.svelte';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import { priceService } from '$lib/services/priceService';

	// MewLock variables
	let mewLockBoxes = [];
	let loading = true;
	let currentHeight = 0;

	// Stats
	let totalValueLocked = 0;
	let totalUsers = 0;
	let totalLocks = 0;
	let leaderboard = [];

	// View filters
	let sortBy = 'height'; // 'height', 'amount', 'tokens'
	let sortOrder = 'asc'; // 'asc', 'desc'
	
	// Leaderboard sorting
	let leaderboardSortBy = 'totalValueLocked'; // 'totalValueLocked', 'usdValue', 'locks', 'duration'
	let leaderboardSortOrder = 'desc'; // 'asc', 'desc'

	// Price data
	let totalUsdValue = 0;

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS =
		'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

	onMount(async () => {
		await getCurrentBlockHeight();
		await loadMewLockBoxes();
		await calculateUsdValues();
	});

	async function calculateUsdValues() {
		try {
			let total = 0;
			
			for (const box of mewLockBoxes) {
				// Calculate ERG value
				const ergAmount = box.value / 1e9;
				const ergUsdValue = priceService.calculateUsdValue(ergAmount);
				total += ergUsdValue;
				
				// Calculate token values
				if (box.assets) {
					for (const asset of box.assets) {
						const tokenPrice = await priceService.getTokenPrice(asset.tokenId);
						if (tokenPrice) {
							const decimals = asset.decimals || 0;
							const tokenAmount = asset.amount / Math.pow(10, decimals);
							const tokenUsdValue = tokenAmount * tokenPrice.usdPrice;
							total += tokenUsdValue;
						}
					}
				}
			}
			
			totalUsdValue = total;
		} catch (error) {
			console.error('Error calculating USD values:', error);
		}
	}

	async function calculateBoxUsdValue(box) {
		let usdValue = 0;
		
		// Add ERG value
		const ergAmount = box.value / 1e9;
		usdValue += priceService.calculateUsdValue(ergAmount);
		
		// Add token values
		if (box.assets) {
			for (const asset of box.assets) {
				const tokenPrice = await priceService.getTokenPrice(asset.tokenId);
				if (tokenPrice) {
					const decimals = asset.decimals || 0;
					const tokenAmount = asset.amount / Math.pow(10, decimals);
					usdValue += tokenAmount * tokenPrice.usdPrice;
				}
			}
		}
		
		return usdValue;
	}

	async function calculateUserUsdValue(user) {
		// Find all boxes for this user
		const userBoxes = mewLockBoxes.filter(box => box.depositorAddress === user.address);
		let totalUsdValue = 0;
		
		for (const box of userBoxes) {
			// Add ERG value
			const ergAmount = box.value / 1e9;
			totalUsdValue += priceService.calculateUsdValue(ergAmount);
			
			// Add token values
			if (box.assets) {
				for (const asset of box.assets) {
					const tokenPrice = await priceService.getTokenPrice(asset.tokenId);
					if (tokenPrice) {
						const decimals = asset.decimals || 0;
						const tokenAmount = asset.amount / Math.pow(10, decimals);
						totalUsdValue += tokenAmount * tokenPrice.usdPrice;
					}
				}
			}
		}
		
		return totalUsdValue;
	}

	// Convert public key to address using ErgoAddress
	function convertPkToAddress(pkRegister) {
		try {
			if (!pkRegister || !pkRegister.renderedValue) {
				return 'Unknown Address';
			}

			// Use the same method as BuyWidget.svelte line 482
			const address = ErgoAddress.fromPublicKey(pkRegister.renderedValue, 0);
			return address.encode();
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
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}?limit=500`
			);
			const data = await response.json();

			mewLockBoxes = data.items.map((box) => {
				const unlockHeight = parseInt(box.additionalRegisters.R5.renderedValue);
				const canWithdraw = currentHeight >= unlockHeight;
				const depositorAddress = convertPkToAddress(box.additionalRegisters.R4);

				return {
					boxId: box.boxId,
					value: parseInt(box.value),
					assets: box.assets || [],
					unlockHeight,
					currentHeight,
					canWithdraw,
					depositorAddress,
					ergoTree: box.ergoTree,
					additionalRegisters: box.additionalRegisters,
					blocksRemaining: Math.max(0, unlockHeight - currentHeight)
				};
			});
			// NOTE: No filtering by personal address - show ALL locks

			// Calculate stats for all locks
			totalValueLocked = mewLockBoxes.reduce((sum, box) => sum + box.value / 1e9, 0);
			totalUsers = new Set(mewLockBoxes.map((box) => box.depositorAddress)).size;
			totalLocks = mewLockBoxes.length;

			// Calculate leaderboard
			calculateLeaderboard();
		} catch (error) {
			console.error('Error loading MewLock boxes:', error);
		}
		loading = false;
	}

	function calculateLeaderboard() {
		const userStats = {};

		mewLockBoxes.forEach((box) => {
			const address = box.depositorAddress;
			if (!userStats[address]) {
				userStats[address] = {
					address,
					totalValueLocked: 0,
					totalLocks: 0,
					ergOnlyLocks: 0,
					tokenLocks: 0,
					uniqueTokenTypes: new Set(),
					averageLockDuration: 0,
					totalLockDuration: 0
				};
			}

			userStats[address].totalValueLocked += box.value / 1e9;
			userStats[address].totalLocks += 1;
			userStats[address].totalLockDuration += box.blocksRemaining;

			// Count ERG-only vs token locks
			if (!box.assets || box.assets.length === 0) {
				userStats[address].ergOnlyLocks += 1;
			} else {
				userStats[address].tokenLocks += 1;
				box.assets.forEach((asset) => {
					userStats[address].uniqueTokenTypes.add(asset.tokenId);
				});
			}
		});

		// Convert to array and calculate averages, sort by total value locked
		leaderboard = Object.values(userStats)
			.map((user) => ({
				...user,
				uniqueTokenTypes: user.uniqueTokenTypes.size,
				averageLockDuration: user.totalLocks > 0 ? user.totalLockDuration / user.totalLocks : 0
			}))
			.sort((a, b) => b.totalValueLocked - a.totalValueLocked);
	}

	function toggleSort(newSortBy: string) {
		if (sortBy === newSortBy) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = newSortBy;
			sortOrder = 'desc';
		}
	}

	function toggleLeaderboardSort(newSortBy: string) {
		if (leaderboardSortBy === newSortBy) {
			leaderboardSortOrder = leaderboardSortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			leaderboardSortBy = newSortBy;
			leaderboardSortOrder = 'desc';
		}
		sortLeaderboard();
	}

	async function sortLeaderboard() {
		const sortedLeaderboard = [...leaderboard];
		
		// For USD sorting, we need to calculate USD values
		if (leaderboardSortBy === 'usdValue') {
			const leaderboardWithUsd = await Promise.all(
				sortedLeaderboard.map(async (user) => ({
					...user,
					usdValue: await calculateUserUsdValue(user)
				}))
			);
			
			leaderboardWithUsd.sort((a, b) => {
				const result = a.usdValue - b.usdValue;
				return leaderboardSortOrder === 'asc' ? result : -result;
			});
			
			leaderboard = leaderboardWithUsd;
		} else {
			sortedLeaderboard.sort((a, b) => {
				let aValue, bValue;
				
				switch (leaderboardSortBy) {
					case 'totalValueLocked':
						aValue = a.totalValueLocked;
						bValue = b.totalValueLocked;
						break;
					case 'locks':
						aValue = a.totalLocks;
						bValue = b.totalLocks;
						break;
					case 'duration':
						aValue = a.averageLockDuration;
						bValue = b.averageLockDuration;
						break;
					default:
						return 0;
				}
				
				const result = aValue - bValue;
				return leaderboardSortOrder === 'asc' ? result : -result;
			});
			
			leaderboard = sortedLeaderboard;
		}
	}

	// Calculate global token summaries for all locks
	$: globalTokenSummaries = mewLockBoxes.reduce((summaries, box) => {
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

	$: globalTokenList = Object.values(globalTokenSummaries).filter(
		(summary) => summary.totalAmount > 0
	);

	// Separate ERG-only and ERG+token locks
	$: ergOnlyLocks = mewLockBoxes.filter((box) => !box.assets || box.assets.length === 0);
	$: ergTokenLocks = mewLockBoxes.filter((box) => box.assets && box.assets.length > 0);

	// Sorting function for both sections
	function sortLocks(locks) {
		return [...locks].sort((a, b) => {
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
	}

	$: sortedErgOnlyLocks = sortLocks(ergOnlyLocks);
	$: sortedErgTokenLocks = sortLocks(ergTokenLocks);
	
	// Force reactivity when sort parameters change
	$: if (sortBy || sortOrder) {
		sortedErgOnlyLocks = sortLocks(ergOnlyLocks);
		sortedErgTokenLocks = sortLocks(ergTokenLocks);
	}
</script>

<svelte:head>
	<title>All Locks - Mew Lock Explorer</title>
</svelte:head>

<!-- Navigation -->
<Navigation />

<div class="locks-container">
	<main class="locks-main">
		{#if loading}
			<div class="loading-state">
				<div class="spinner" />
				<p>Loading all locked assets...</p>
			</div>
		{:else}
			<!-- Global Stats -->
			<section class="global-stats">
				<h1>All Locked Assets</h1>
				<p class="section-description">Explore all assets currently locked in the Mew Lock protocol</p>
				
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
							<div class="stat-value">{nFormatter(totalValueLocked)}</div>
							<div class="stat-label">Total ERG Locked</div>
							{#if totalUsdValue > 0}
								<div class="stat-usd">{priceService.formatUsd(totalUsdValue)}</div>
							{/if}
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
									d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"
									fill="currentColor"
								/>
							</svg>
						</div>
						<div class="stat-content">
							<div class="stat-value">{nFormatter(totalUsers)}</div>
							<div class="stat-label">Unique Users</div>
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
							<div class="stat-value">{nFormatter(totalLocks)}</div>
							<div class="stat-label">Total Locks</div>
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
							<div class="stat-value">{globalTokenList.length}</div>
							<div class="stat-label">Token Types</div>
						</div>
					</div>
				</div>
			</section>

			<!-- Leaderboard -->
			{#if leaderboard.length > 0}
				<section class="leaderboard-section">
					<h2>Top Users Leaderboard</h2>
					<div class="leaderboard-table">
						<div class="table-header">
							<div class="header-cell rank">Rank</div>
							<div class="header-cell address">Address</div>
							<div class="header-cell value sortable" on:click={() => toggleLeaderboardSort('totalValueLocked')}>
								Total ERG Locked
								{#if leaderboardSortBy === 'totalValueLocked'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if leaderboardSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</div>
							<div class="header-cell usd-value sortable" on:click={() => toggleLeaderboardSort('usdValue')}>
								USD Value
								{#if leaderboardSortBy === 'usdValue'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if leaderboardSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</div>
							<div class="header-cell locks sortable" on:click={() => toggleLeaderboardSort('locks')}>
								Total Locks
								{#if leaderboardSortBy === 'locks'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if leaderboardSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</div>
							<div class="header-cell erg-locks">ERG Only</div>
							<div class="header-cell token-locks">ERG+Token</div>
							<div class="header-cell duration sortable" on:click={() => toggleLeaderboardSort('duration')}>
								Avg Duration
								{#if leaderboardSortBy === 'duration'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if leaderboardSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</div>
						</div>
						{#each leaderboard.slice(0, 20) as user, index}
							<div class="table-row">
								<div class="table-cell rank">
									<div class="rank-badge" class:top3={index < 3}>
										{#if index === 0}👑{:else if index === 1}🥈{:else if index === 2}🥉{:else}{index + 1}{/if}
									</div>
								</div>
								<div class="table-cell address">
									<span class="address-text">
										{user.address.slice(0, 8)}...{user.address.slice(-6)}
									</span>
								</div>
								<div class="table-cell value">{nFormatter(user.totalValueLocked)} ERG</div>
								<div class="table-cell usd-value">
									{#await calculateUserUsdValue(user) then usdValue}
										{priceService.formatUsd(usdValue)}
									{/await}
								</div>
								<div class="table-cell locks">{user.totalLocks}</div>
								<div class="table-cell erg-locks">{user.ergOnlyLocks}</div>
								<div class="table-cell token-locks">{user.tokenLocks}</div>
								<div class="table-cell duration">{Math.round(user.averageLockDuration)} blocks</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- Global Token Summary -->
			{#if globalTokenList.length > 0}
				<section class="global-tokens">
					<h2>All Locked Tokens</h2>
					<div class="tokens-grid">
						{#each globalTokenList as token (token.tokenId || 'ERG')}
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

			<!-- Sort Controls -->
			<section class="controls-section">
				<div class="section-header">
					<h2>Browse All Locks</h2>
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
			</section>

			<!-- ERG Only Locks Section -->
			{#if sortedErgOnlyLocks.length > 0}
				<section class="locks-section">
					<h2 class="section-title">
						<span class="section-icon">💰</span>
						ERG Only Locks ({ergOnlyLocks.length})
					</h2>
					<div class="locks-grid">
						{#each sortedErgOnlyLocks as lockBox (lockBox.boxId)}
							<div
								class="lock-card"
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
									</div>
									<div class="lock-height">
										Block {nFormatter(lockBox.unlockHeight, false, true)}
									</div>
								</div>

								<div class="lock-content">
									<div class="lock-amount">
										<div class="amount-value">{nFormatter(lockBox.value / 1e9)} ERG</div>
										{#await calculateBoxUsdValue(lockBox) then usdValue}
											{#if usdValue > 0}
												<div class="usd-value">{priceService.formatUsd(usdValue)}</div>
											{/if}
										{/await}
									</div>

									<div class="lock-timing">
										{#if lockBox.canWithdraw}
											<span class="timing-text ready">Unlocked & Ready</span>
										{:else}
											<span class="timing-text">
												{nFormatter(lockBox.blocksRemaining)} blocks remaining
											</span>
										{/if}
									</div>

									<div class="depositor-info">
										<span class="depositor-label">Depositor:</span>
										<span class="depositor-address">
											{lockBox.depositorAddress.slice(0, 12)}...{lockBox.depositorAddress.slice(-8)}
										</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<!-- ERG + Token Locks Section -->
			{#if sortedErgTokenLocks.length > 0}
				<section class="locks-section">
					<h2 class="section-title">
						<span class="section-icon">🎯</span>
						ERG + Token Locks ({ergTokenLocks.length})
					</h2>
					<div class="locks-grid">
						{#each sortedErgTokenLocks as lockBox (lockBox.boxId)}
							<div
								class="lock-card"
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
									</div>
									<div class="lock-height">
										Block {nFormatter(lockBox.unlockHeight, false, true)}
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
										{#await calculateBoxUsdValue(lockBox) then usdValue}
											{#if usdValue > 0}
												<div class="usd-value">{priceService.formatUsd(usdValue)}</div>
											{/if}
										{/await}
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

									<div class="depositor-info">
										<span class="depositor-label">Depositor:</span>
										<span class="depositor-address">
											{lockBox.depositorAddress.slice(0, 12)}...{lockBox.depositorAddress.slice(-8)}
										</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if mewLockBoxes.length === 0}
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
					<h3>No Locks Found</h3>
					<p>There are currently no assets locked in the protocol.</p>
				</div>
			{/if}
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

	/* Main Content */
	.locks-main {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
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

	/* Global Stats */
	.global-stats {
		margin-bottom: 3rem;
	}

	.global-stats h1 {
		font-size: 3rem;
		font-weight: 800;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0 0 0.5rem 0;
		line-height: 1;
	}

	.section-description {
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.1rem;
		margin: 0 0 2rem 0;
		max-width: 600px;
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
		overflow-x: auto;
		overflow-y: hidden;
	}

	.table-header {
		display: grid;
		grid-template-columns: 60px 1fr 120px 100px 80px 80px 100px 120px;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: rgba(255, 255, 255, 0.1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		min-width: 700px;
	}

	.header-cell {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.header-cell.sortable {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		transition: color 0.2s;
	}

	.header-cell.sortable:hover {
		color: white;
	}

	.header-cell.sortable svg {
		opacity: 0.6;
	}

	.table-row {
		display: grid;
		grid-template-columns: 60px 1fr 120px 100px 80px 80px 100px 120px;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		transition: all 0.2s;
		min-width: 700px;
	}

	.table-row:hover {
		background: rgba(255, 255, 255, 0.05);
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

	/* Global Tokens */
	.global-tokens {
		margin-bottom: 3rem;
	}

	.global-tokens h2 {
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

	/* Controls Section */
	.controls-section {
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

	.sort-controls {
		display: flex;
		gap: 0.25rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 0.25rem;
	}

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

	.sort-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.sort-btn.active {
		background: rgba(102, 126, 234, 0.2);
		color: #667eea;
	}

	/* Locks Sections */
	.locks-section {
		margin-bottom: 3rem;
	}

	.section-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
		margin: 0 0 2rem 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.section-icon {
		font-size: 1.5rem;
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

	.usd-value {
		font-size: 1rem;
		font-weight: 500;
		color: #4fd1c5;
		margin-top: 0.25rem;
	}

	.stat-usd {
		font-size: 0.875rem;
		color: #4fd1c5;
		font-weight: 500;
		margin-top: 0.25rem;
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
		margin-bottom: 1rem;
	}

	.timing-text {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.timing-text.ready {
		color: #22c55e;
		font-weight: 600;
	}

	.depositor-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.depositor-label {
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	.depositor-address {
		color: rgba(255, 255, 255, 0.8);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
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

	/* Responsive */
	@media (max-width: 768px) {
		.locks-main {
			padding: 1rem;
		}

		.global-stats h1 {
			font-size: 2rem;
		}

		.section-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.sort-controls {
			width: 100%;
		}

		.stats-grid,
		.locks-grid {
			grid-template-columns: 1fr;
		}

		.tokens-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}

		.table-header,
		.table-row {
			font-size: 0.75rem;
		}
	}
</style>