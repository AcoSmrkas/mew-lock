<script lang="ts">
	import { onMount } from 'svelte';
	import { nFormatter } from '$lib/utils/utils.js';
	import { fade, fly } from 'svelte/transition';
	import { ErgoAddress } from '@fleet-sdk/core';
	import { getBlockHeight } from '$lib/api-explorer/explorer.ts';
	import TokenSummaryCard from '$lib/components/common/TokenSummaryCard.svelte';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import { priceService } from '$lib/services/priceService';
	import { pricePerformanceService } from '$lib/services/pricePerformanceService.js';
	import { getImageUrl, setPlaceholderImage } from '$lib/utils/utils.js';

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
	
	// Search functionality
	let searchQuery = '';
	let filteredMewLockBoxes = [];
	
	// Leaderboard sorting
	let leaderboardSortBy = 'totalValueLocked'; // 'totalValueLocked', 'usdValue', 'locks', 'duration'
	let leaderboardSortOrder = 'desc'; // 'asc', 'desc'
	
	// Leaderboard pagination
	let leaderboardLimit = 15;
	let showAllLeaderboard = false;
	
	// Global tokens sorting
	let globalTokensSortBy = 'totalAmount'; // 'totalAmount', 'usdValue', 'name'
	let globalTokensSortOrder = 'desc'; // 'asc', 'desc'

	// Price data
	let totalUsdValue = 0;

import { MEWLOCK_CONTRACT_ADDRESS } from '$lib/contract/mewLockTx';

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

	async function calculateTokenUsdValue(token) {
		if (token.tokenId === null) {
			// ERG token
			const ergAmount = token.totalAmount / 1e9;
			return priceService.calculateUsdValue(ergAmount);
		} else {
			// Other tokens
			const tokenPrice = await priceService.getTokenPrice(token.tokenId);
			if (tokenPrice) {
				const decimals = token.decimals || 0;
				const tokenAmount = token.totalAmount / Math.pow(10, decimals);
				return tokenAmount * tokenPrice.usdPrice;
			}
		}
		return 0;
	}

	async function calculateLockPerformance(lockBox) {
		try {
			console.log('🔍 Calculating performance for lock:', lockBox.boxId);
			console.log('📦 Lock box data:', lockBox);
			console.log('📅 R6 register (timestamp):', lockBox.additionalRegisters?.R6);
			
			const currentErgPrice = await priceService.getErgPrice();
			const allPrices = await priceService.getAllPrices();
			
			console.log('💰 Current ERG price:', currentErgPrice);
			
			// Prepare current prices in the format expected by the service
			const currentPrices = {
				ergUsd: currentErgPrice,
				tokens: {}
			};
			
			// Add current token prices
			allPrices.tokens.forEach((tokenPrice, tokenId) => {
				currentPrices.tokens[tokenId] = tokenPrice;
			});
			
			const result = await pricePerformanceService.calculateLockPerformance(lockBox, currentPrices);
			console.log('📊 Performance result:', result);
			
			return result;
		} catch (error) {
			console.error('❌ Error calculating lock performance:', error);
			return { error: 'Performance data unavailable' };
		}
	}

	// Get token image URL using the same logic as other components
	function getTokenImageUrl(asset) {
		return getImageUrl(asset);
	}

	// Get ERG image (default Ergo logo)
	function getErgImageUrl() {
		return 'https://spectrum.fi/logos/ergo/0000000000000000000000000000000000000000000000000000000000000000.svg';
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

	// Helper function to decode string from register byte array
	function decodeStringFromRegister(register) {
		if (!register || !register.serializedValue) return null;
		try {
			// Remove the first 4 characters (type prefix) and decode hex to string
			const hexString = register.serializedValue.substring(4);
			const bytes = [];
			for (let i = 0; i < hexString.length; i += 2) {
				bytes.push(parseInt(hexString.substr(i, 2), 16));
			}
			return new TextDecoder().decode(new Uint8Array(bytes));
		} catch (error) {
			console.warn('Failed to decode register:', error);
			return null;
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
				
				// Extract lock name and description from R7 and R8 (NEW)
				const lockName = decodeStringFromRegister(box.additionalRegisters.R7);
				const lockDescription = decodeStringFromRegister(box.additionalRegisters.R8);

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
					blocksRemaining: Math.max(0, unlockHeight - currentHeight),
					lockName, // NEW: Custom lock name
					lockDescription, // NEW: Custom lock description
					creationHeight: box.creationHeight // NEW: For price performance tracking
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

	function toggleGlobalTokensSort(newSortBy: string) {
		if (globalTokensSortBy === newSortBy) {
			globalTokensSortOrder = globalTokensSortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			globalTokensSortBy = newSortBy;
			globalTokensSortOrder = 'desc';
		}
		
		// If USD sorting is selected, recalculate the sorted list
		if (newSortBy === 'usdValue') {
			sortGlobalTokensByUsd();
		}
	}

	let usdSortedGlobalTokenList = [];

	async function sortGlobalTokensByUsd() {
		const tokensWithUsd = await Promise.all(
			globalTokenList.map(async (token) => ({
				...token,
				usdValue: await calculateTokenUsdValue(token)
			}))
		);
		
		tokensWithUsd.sort((a, b) => {
			const result = a.usdValue - b.usdValue;
			return globalTokensSortOrder === 'asc' ? result : -result;
		});
		
		usdSortedGlobalTokenList = tokensWithUsd;
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

	function loadMoreLeaderboard() {
		if (leaderboardLimit < leaderboard.length) {
			leaderboardLimit = Math.min(leaderboardLimit + 15, leaderboard.length);
		}
		if (leaderboardLimit >= leaderboard.length) {
			showAllLeaderboard = true;
		}
	}

	function showTopLeaderboard() {
		leaderboardLimit = 15;
		showAllLeaderboard = false;
	}

	$: displayedLeaderboard = leaderboard.slice(0, leaderboardLimit);

	// Filter locks based on search query
	$: filteredMewLockBoxes = searchQuery.trim() 
		? mewLockBoxes.filter(box => 
			(box.lockName && box.lockName.toLowerCase().includes(searchQuery.toLowerCase())) ||
			(box.lockDescription && box.lockDescription.toLowerCase().includes(searchQuery.toLowerCase())) ||
			box.depositorAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
			box.boxId.toLowerCase().includes(searchQuery.toLowerCase())
		)
		: mewLockBoxes;

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

	// Sorted global token list
	$: sortedGlobalTokenList = [...globalTokenList].sort((a, b) => {
		let aValue, bValue;
		
		switch (globalTokensSortBy) {
			case 'totalAmount':
				// Normalize amounts for comparison (convert to base units)
				aValue = a.tokenId === null ? a.totalAmount / 1e9 : a.totalAmount / Math.pow(10, a.decimals);
				bValue = b.tokenId === null ? b.totalAmount / 1e9 : b.totalAmount / Math.pow(10, b.decimals);
				break;
			case 'name':
				aValue = a.tokenName.toLowerCase();
				bValue = b.tokenName.toLowerCase();
				break;
			case 'usdValue':
				// This will be handled separately due to async nature
				aValue = 0;
				bValue = 0;
				break;
			default:
				return 0;
		}
		
		if (globalTokensSortBy === 'name') {
			const result = aValue.localeCompare(bValue);
			return globalTokensSortOrder === 'asc' ? result : -result;
		} else {
			const result = aValue - bValue;
			return globalTokensSortOrder === 'asc' ? result : -result;
		}
	});

	// Separate ERG-only and ERG+token locks (using filtered data)
	$: ergOnlyLocks = filteredMewLockBoxes.filter((box) => !box.assets || box.assets.length === 0);
	$: ergTokenLocks = filteredMewLockBoxes.filter((box) => box.assets && box.assets.length > 0);

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
					<div class="section-header">
						<h2>Top Users Leaderboard</h2>
						<p class="section-subtitle">Showing top {displayedLeaderboard.length} of {leaderboard.length} users</p>
					</div>
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
						{#each displayedLeaderboard as user, index}
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
					
					<!-- Load More Controls -->
					{#if leaderboard.length > 15}
						<div class="leaderboard-controls">
							{#if !showAllLeaderboard}
								<button class="load-more-btn" on:click={loadMoreLeaderboard}>
									Load More ({leaderboard.length - leaderboardLimit} remaining)
								</button>
							{:else}
								<button class="load-more-btn secondary" on:click={showTopLeaderboard}>
									Show Top 15 Only
								</button>
							{/if}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Global Token Summary -->
			{#if globalTokenList.length > 0}
				<section class="global-tokens">
					<div class="section-header">
						<h2>All Locked Tokens</h2>
						<div class="sort-controls">
							<button
								class="sort-btn"
								class:active={globalTokensSortBy === 'totalAmount'}
								on:click={() => toggleGlobalTokensSort('totalAmount')}
							>
								Amount
								{#if globalTokensSortBy === 'totalAmount'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if globalTokensSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</button>
							<button
								class="sort-btn"
								class:active={globalTokensSortBy === 'usdValue'}
								on:click={() => toggleGlobalTokensSort('usdValue')}
							>
								USD Value
								{#if globalTokensSortBy === 'usdValue'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if globalTokensSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</button>
							<button
								class="sort-btn"
								class:active={globalTokensSortBy === 'name'}
								on:click={() => toggleGlobalTokensSort('name')}
							>
								Name
								{#if globalTokensSortBy === 'name'}
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										{#if globalTokensSortOrder === 'asc'}
											<path d="M7 14L12 9L17 14H7Z" fill="currentColor" />
										{:else}
											<path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
										{/if}
									</svg>
								{/if}
							</button>
						</div>
					</div>
					<div class="tokens-grid">
						{#each globalTokensSortBy === 'usdValue' ? usdSortedGlobalTokenList : sortedGlobalTokenList as token (token.tokenId || 'ERG')}
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
					<div class="search-and-sort">
						<!-- Search Box -->
						<div class="search-box">
							<input
								type="text"
								placeholder="Search by name, description, address, or box ID..."
								bind:value={searchQuery}
								class="search-input"
							/>
							{#if searchQuery}
								<button class="clear-search" on:click={() => searchQuery = ''}>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</button>
							{/if}
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
								class="compact-lock-card"
								class:ready={lockBox.canWithdraw}
								transition:fly={{ y: 20, duration: 300 }}
							>
								<!-- Card Header with Status -->
								<div class="card-header">
									<div class="left-section">
										<div class="status-indicator" class:ready={lockBox.canWithdraw}></div>
										{#if lockBox.lockName}
											<div class="lock-title-improved">
												<div class="lock-name-text">{lockBox.lockName}</div>
												{#if lockBox.lockDescription}
													<div class="lock-description-improved">{lockBox.lockDescription}</div>
												{/if}
											</div>
										{/if}
									</div>
									<div class="unlock-height">#{nFormatter(lockBox.unlockHeight, false, true)}</div>
								</div>

								<!-- Main Content with Token Image -->
								<div class="card-content">
									<div class="token-section">
										<div class="token-image-container">
											<img
												src={getErgImageUrl()}
												alt="ERG"
												class="token-image"
												loading="lazy"
											/>
										</div>
										<div class="token-info">
											<div class="token-amount-with-perf">
												<span class="amount-text">{nFormatter(lockBox.value / 1e9)} ERG</span>
												{#await calculateLockPerformance(lockBox) then performance}
													{#if performance && !performance.error && performance.overallPerformance}
														<div class="inline-performance">
															{#if performance.overallPerformance.priceChangePercent >= 0}
																<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="arrow-up">
																	<path d="M7 14L12 9L17 14H7Z" fill="#22c55e"/>
																</svg>
															{:else}
																<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="arrow-down">
																	<path d="M7 10L12 15L17 10H7Z" fill="#ef4444"/>
																</svg>
															{/if}
															<span class="perf-percent" class:positive={performance.overallPerformance.priceChangePercent >= 0} class:negative={performance.overallPerformance.priceChangePercent < 0}>
																{pricePerformanceService.formatPriceChange(performance.overallPerformance.priceChangePercent)}
															</span>
														</div>
													{/if}
												{/await}
											</div>
											{#await Promise.all([calculateBoxUsdValue(lockBox), calculateLockPerformance(lockBox)]) then [usdValue, performance]}
												{#if usdValue > 0 && performance && !performance.error && performance.overallPerformance}
													<div class="price-comparison">
														L: ${performance.overallPerformance.historicalValue.toFixed(2)} | C: ${performance.overallPerformance.currentValue.toFixed(2)}
													</div>
												{:else if usdValue > 0}
													<div class="token-usd">{priceService.formatUsd(usdValue)}</div>
												{/if}
											{/await}
										</div>
									</div>
								</div>

								<!-- Footer with Timing and Address -->
								<div class="card-footer">
									<div class="timing-compact">
										{#if !lockBox.canWithdraw}
											<span class="blocks-remaining">{nFormatter(lockBox.blocksRemaining)} blocks</span>
										{/if}
									</div>
									<div class="depositor-info-compact">
										<span class="depositor-label">Depositor:</span>
										<span class="depositor-compact">
											{lockBox.depositorAddress.slice(0, 6)}...{lockBox.depositorAddress.slice(-4)}
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
								class="compact-lock-card multi-token"
								class:ready={lockBox.canWithdraw}
								transition:fly={{ y: 20, duration: 300 }}
							>
								<!-- Card Header with Status -->
								<div class="card-header">
									<div class="left-section">
										<div class="status-indicator" class:ready={lockBox.canWithdraw}></div>
										{#if lockBox.lockName}
											<div class="lock-title-improved">
												<div class="lock-name-text">{lockBox.lockName}</div>
												{#if lockBox.lockDescription}
													<div class="lock-description-improved">{lockBox.lockDescription}</div>
												{/if}
											</div>
										{/if}
									</div>
									<div class="unlock-height">#{nFormatter(lockBox.unlockHeight, false, true)}</div>
								</div>

								<!-- Main Content with Multiple Token Images -->
								<div class="card-content">
									<!-- ERG Section -->
									<div class="token-section primary">
										<div class="token-image-container">
											<img
												src={getErgImageUrl()}
												alt="ERG"
												class="token-image"
												loading="lazy"
											/>
										</div>
										<div class="token-info">
											<div class="token-amount-with-perf">
												<span class="amount-text">{nFormatter(lockBox.value / 1e9)} ERG</span>
												{#await calculateLockPerformance(lockBox) then performance}
													{#if performance && !performance.error && performance.overallPerformance}
														<div class="inline-performance">
															{#if performance.overallPerformance.priceChangePercent >= 0}
																<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="arrow-up">
																	<path d="M7 14L12 9L17 14H7Z" fill="#22c55e"/>
																</svg>
															{:else}
																<svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="arrow-down">
																	<path d="M7 10L12 15L17 10H7Z" fill="#ef4444"/>
																</svg>
															{/if}
															<span class="perf-percent" class:positive={performance.overallPerformance.priceChangePercent >= 0} class:negative={performance.overallPerformance.priceChangePercent < 0}>
																{pricePerformanceService.formatPriceChange(performance.overallPerformance.priceChangePercent)}
															</span>
														</div>
													{/if}
												{/await}
											</div>
											
											<!-- Total USD Value -->
											{#await Promise.all([calculateBoxUsdValue(lockBox), calculateLockPerformance(lockBox)]) then [usdValue, performance]}
												{#if usdValue > 0 && performance && !performance.error && performance.overallPerformance}
													<div class="price-comparison">
														L: ${performance.overallPerformance.historicalValue.toFixed(2)} | C: ${performance.overallPerformance.currentValue.toFixed(2)}
													</div>
												{:else if usdValue > 0}
													<div class="token-usd">{priceService.formatUsd(usdValue)}</div>
												{/if}
											{/await}
										</div>
									</div>

									<!-- Additional Tokens Section -->
									{#if lockBox.assets && lockBox.assets.length > 0}
										<div class="additional-tokens">
											<div class="tokens-row">
												{#each lockBox.assets.slice(0, 3) as asset, i}
													<div class="mini-token">
														<div class="mini-token-image">
															<img
																src={getTokenImageUrl(asset)}
																alt={asset.name || 'Token'}
																class="mini-image"
																onerror={(event) => setPlaceholderImage(event, asset)}
																loading="lazy"
															/>
														</div>
														<div class="mini-token-info">
															<div class="mini-amount">{nFormatter(asset.amount / 10 ** (asset.decimals || 0))}</div>
															<div class="mini-name">{(asset.name || 'Token').slice(0, 8)}</div>
														</div>
													</div>
												{/each}
												{#if lockBox.assets.length > 3}
													<div class="more-tokens">+{lockBox.assets.length - 3}</div>
												{/if}
											</div>
										</div>
									{/if}
								</div>

								<!-- Footer with Timing and Address -->
								<div class="card-footer">
									<div class="timing-compact">
										{#if !lockBox.canWithdraw}
											<span class="blocks-remaining">{nFormatter(lockBox.blocksRemaining)} blocks</span>
										{/if}
									</div>
									<div class="depositor-info-compact">
										<span class="depositor-label">Depositor:</span>
										<span class="depositor-compact">
											{lockBox.depositorAddress.slice(0, 6)}...{lockBox.depositorAddress.slice(-4)}
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

	.leaderboard-controls {
		padding: 1.5rem;
		text-align: center;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.load-more-btn {
		background: #667eea;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.load-more-btn:hover {
		background: #5a67d8;
		transform: translateY(-1px);
	}

	.load-more-btn.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}

	.load-more-btn.secondary:hover {
		background: rgba(255, 255, 255, 0.2);
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

	/* Compact Locks Grid */
	.locks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.compact-lock-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		transition: all 0.3s ease;
		position: relative;
		display: flex;
		flex-direction: column;
		height: 200px; /* Increased height to prevent chopping */
		overflow: hidden;
	}

	.compact-lock-card:hover {
		transform: translateY(-2px);
		border-color: rgba(102, 126, 234, 0.3);
		background: rgba(102, 126, 234, 0.05);
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
	}

	.compact-lock-card.ready {
		border-color: rgba(34, 197, 94, 0.3);
		background: rgba(34, 197, 94, 0.03);
	}

	.compact-lock-card.multi-token {

	}

	/* Card Header */
	.card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		min-height: 24px;
	}

	.left-section {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.status-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: rgba(255, 193, 7, 0.8);
		flex-shrink: 0;
	}

	.status-indicator.ready {
		background: rgba(34, 197, 94, 0.8);
		box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
	}

	.lock-title-improved {
		flex: 1;
		min-width: 0;
	}

	.lock-name-text {
		font-size: 0.875rem;
		font-weight: 600;
		color: #667eea;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.3;
	}

	.lock-description-improved {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
		line-height: 1.2;
	}

	.unlock-height {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		flex-shrink: 0;
	}

	/* Card Content */
	.card-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Token Section */
	.token-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.token-section.primary {
		padding-bottom: 0.5rem;
	}

	.token-image-container {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.token-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.token-info {
		flex: 1;
		min-width: 0;
	}

	.token-amount-with-perf {
		display: flex;
		align-items: center;
		justify-content: space-between;
		line-height: 1.2;
	}

	.amount-text {
		font-size: 1.1rem;
		font-weight: 700;
		color: white;
	}

	.inline-performance {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.token-usd {
		font-size: 0.875rem;
		color: #4fd1c5;
		font-weight: 500;
		line-height: 1.2;
	}

	.price-comparison {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 400;
		line-height: 1.2;
		font-family: 'JetBrains Mono', monospace;
	}

	/* Additional Tokens */
	.additional-tokens {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 0.5rem;
	}

	.tokens-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}

	.mini-token {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
		flex-shrink: 0;
	}

	.mini-token-image {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.mini-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.mini-token-info {
		min-width: 0;
	}

	.mini-amount {
		font-size: 0.75rem;
		font-weight: 600;
		color: white;
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60px;
	}

	.mini-name {
		font-size: 0.625rem;
		color: rgba(255, 255, 255, 0.6);
		line-height: 1.1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 60px;
	}

	.more-tokens {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		flex-shrink: 0;
	}

	/* Total Value */
	.total-value {
		font-size: 1rem;
		font-weight: 600;
		color: #4fd1c5;
		text-align: center;
		padding: 0.25rem 0;
	}

	.arrow-up, .arrow-down {
		flex-shrink: 0;
	}

	.perf-percent {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.perf-percent.positive {
		color: #22c55e;
	}

	.perf-percent.negative {
		color: #ef4444;
	}

	/* Card Footer */
	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: auto;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		min-height: 20px;
	}

	.timing-compact {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.ready-text {
		color: #22c55e;
		font-weight: 600;
	}

	.blocks-remaining {
		font-family: 'JetBrains Mono', monospace;
	}

	.depositor-info-compact {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.depositor-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
	}

	.depositor-compact {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.8);
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

	/* Search and Sort Container */
	.search-and-sort {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 300px;
	}

	/* Search Box Styles */
	.search-box {
		position: relative;
		width: 100%;
	}

	.search-input {
		width: 100%;
		padding: 0.75rem 1rem;
		padding-right: 2.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: white;
		font-size: 0.875rem;
		transition: all 0.2s;
		box-sizing: border-box;
	}

	.search-input:focus {
		outline: none;
		border-color: #667eea;
		background: rgba(102, 126, 234, 0.05);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.search-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}

	.clear-search {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.clear-search:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
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

		.search-and-sort {
			width: 100%;
			min-width: unset;
		}

		.sort-controls {
			width: 100%;
		}

		.stats-grid {
			grid-template-columns: 1fr;
		}

		.locks-grid {
			grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
			gap: 0.75rem;
		}

		.compact-lock-card {
			height: 180px;
		}

		.compact-lock-card.multi-token {
			height: 140px;
		}

		.token-image-container {
			width: 32px;
			height: 32px;
		}

		.amount-text {
			font-size: 1rem;
		}

		.mini-token-image {
			width: 20px;
			height: 20px;
		}

		.mini-amount {
			font-size: 0.7rem;
			max-width: 50px;
		}

		.mini-name {
			font-size: 0.6rem;
			max-width: 50px;
		}

		.tokens-grid {
			grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		}

		.table-header,
		.table-row {
			font-size: 0.75rem;
		}

		.perf-percent {
			font-size: 0.8rem;
		}

		.card-footer {
			font-size: 0.7rem;
		}
	}

	@media (max-width: 480px) {
		.locks-grid {
			grid-template-columns: 1fr;
		}

		.compact-lock-card {
			height: 170px;
		}

		.compact-lock-card.multi-token {
			height: 260px;
		}

		.tokens-row {
			gap: 0.375rem;
		}

		.mini-token {
			gap: 0.25rem;
		}
	}

	/* Price Performance Styles */
	.price-performance {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.performance-icon {
		font-size: 1rem;
	}

	.performance-text {
		font-weight: 700;
	}

	.performance-details {
		margin-left: auto;
	}

	.performance-details small {
		font-size: 0.75rem;
		opacity: 0.8;
		font-weight: 400;
	}

	/* Performance Color Classes - Matching UI Theme */
	.performance-diamond {
		background: rgba(224, 164, 88, 0.15);
		color: #e0a458;
		border: 1px solid rgba(224, 164, 88, 0.3);
	}

	.performance-rocket {
		background: rgba(102, 126, 234, 0.15);
		color: #667eea;
		border: 1px solid rgba(102, 126, 234, 0.3);
	}

	.performance-great {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
		border: 1px solid rgba(52, 211, 153, 0.3);
	}

	.performance-good {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.performance-neutral {
		background: rgba(234, 179, 8, 0.15);
		color: #eab308;
		border: 1px solid rgba(234, 179, 8, 0.3);
	}

	.performance-poor {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.performance-bad {
		background: rgba(220, 38, 38, 0.15);
		color: #dc2626;
		border: 1px solid rgba(220, 38, 38, 0.3);
	}

	/* Hover Effects */
	.price-performance:hover {
		transform: translateY(-1px);
		filter: brightness(1.05);
	}

	/* Mobile Responsive for Performance */
	@media (max-width: 768px) {
		.price-performance {
			font-size: 0.8rem;
			gap: 0.375rem;
			padding: 0.375rem 0.5rem;
		}
		
		.performance-details {
			display: none; /* Hide price details on mobile for space */
		}
	}
</style>