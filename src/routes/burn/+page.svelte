<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchAllBurnTransactions,
		clearBurnCache,
		type BurnTransaction,
		type BurnStats
	} from '$lib/api-explorer/burnTracker';
	import { nFormatter } from '$lib/utils/utils';
	import BurnModal from '$lib/components/common/BurnModal.svelte';
	import WalletButton from '$lib/components/nav/WalletButton.svelte';

	let loading = true;
	let stats: BurnStats | null = null;
	let error = '';
	let refreshing = false;
	let showBurnModal = false;

	// Sorting state
	let burnerSortBy: 'burnCount' | 'address' = 'burnCount';
	let tokenSortBy: 'totalBurned' | 'burnCount' | 'name' = 'totalBurned';

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		error = '';
		try {
			console.log('Burn page: Starting to fetch burn transactions...');
			const allBurns = await fetchAllBurnTransactions(false, 1000);
			console.log(`Burn page: Fetched ${allBurns.items.length} total burns`);

			stats = calculateBurnStatsFromBurns(allBurns.items);
			console.log('Burn page: Calculated stats:', stats);
		} catch (err) {
			console.error('Error loading burn data:', err);
			error = 'Failed to load burn data. Please try again later.';
			stats = {
				totalBurns: 0,
				uniqueBurners: 0,
				topBurners: [],
				topBurnedTokens: []
			};
		} finally {
			loading = false;
		}
	}

	function calculateBurnStatsFromBurns(burns: BurnTransaction[]): BurnStats {
		const burnerStats = new Map<string, { burnCount: number; totalValueBurned: number }>();
		const tokenStats = new Map<string, { name: string; totalBurned: number; burnCount: number; decimals?: number }>();

		for (const burn of burns) {
			const burnerStat = burnerStats.get(burn.burnerAddress) || {
				burnCount: 0,
				totalValueBurned: 0
			};
			burnerStat.burnCount++;
			burnerStats.set(burn.burnerAddress, burnerStat);

			for (const token of burn.burnedTokens) {
				const tokenStat = tokenStats.get(token.tokenId) || {
					name: token.name || 'Unknown Token',
					totalBurned: 0,
					burnCount: 0,
					decimals: token.decimals
				};

				const tokenAmount = typeof token.amount === 'bigint' ? Number(token.amount) : token.amount;
				tokenStat.totalBurned += tokenAmount;
				tokenStat.burnCount++;
				tokenStats.set(token.tokenId, tokenStat);
			}
		}

		const topBurners = Array.from(burnerStats.entries())
			.map(([address, stats]) => ({ address, ...stats }))
			.sort((a, b) => b.burnCount - a.burnCount)
			.slice(0, 50);

		const topBurnedTokens = Array.from(tokenStats.entries())
			.map(([tokenId, stats]) => ({ tokenId, ...stats }))
			.sort((a, b) => b.totalBurned - a.totalBurned)
			.slice(0, 50);

		return {
			totalBurns: burns.length,
			uniqueBurners: burnerStats.size,
			topBurners,
			topBurnedTokens
		};
	}

	function formatAddress(address: string): string {
		return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`;
	}

	function formatTokenAmount(amount: number, decimals?: number): string {
		if (decimals === undefined || decimals === 0) {
			return nFormatter(amount);
		}
		return nFormatter(amount / Math.pow(10, decimals));
	}

	async function refreshData() {
		if (refreshing) return;
		refreshing = true;
		try {
			clearBurnCache();
			await loadData();
		} finally {
			refreshing = false;
		}
	}

	function handleBurnSuccess() {
		refreshData();
	}

	function openBurnModal() {
		showBurnModal = true;
	}

	// Reactive sorted data
	$: sortedBurners = stats ? [...stats.topBurners].sort((a, b) => {
		if (burnerSortBy === 'burnCount') {
			return b.burnCount - a.burnCount;
		} else {
			return a.address.localeCompare(b.address);
		}
	}) : [];

	$: sortedTokens = stats ? [...stats.topBurnedTokens].sort((a, b) => {
		if (tokenSortBy === 'totalBurned') {
			return b.totalBurned - a.totalBurned;
		} else if (tokenSortBy === 'burnCount') {
			return b.burnCount - a.burnCount;
		} else {
			return a.name.localeCompare(b.name);
		}
	}) : [];
</script>

<svelte:head>
	<title>Burn Leaderboard - MewLock</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
</svelte:head>

<div class="page-container">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else if stats}
		<!-- Main Content Grid -->
		<div class="content-grid">
			<!-- Header Row -->
			<div class="header-row">
				<div class="logo-section">
					<span class="emoji-icon">🔥</span>
					<div class="logo-text">
						<div class="logo-title">Burn Leaderboard</div>
						<div class="logo-subtitle">Top burners & tokens</div>
					</div>
				</div>

				<div class="nav-right-section">
					<div class="nav-links desktop-nav">
						<button class="nav-btn burn-btn" on:click={openBurnModal} title="Burn Tokens">
							<span class="emoji-icon">🔥</span>
							<span class="btn-text">Burn</span>
						</button>
						<a href="/" class="nav-btn" title="Home">
							<i class="fas fa-home"></i>
						</a>
						<button class="nav-btn refresh-btn" on:click={refreshData} disabled={refreshing} title="Refresh Data">
							<i class="fas fa-sync-alt" class:spinning={refreshing}></i>
						</button>
					</div>

					<WalletButton />
				</div>
			</div>

			<!-- Stats Row -->
			<div class="stats-row">
				<div class="stat">
					<span class="stat-emoji">🔥</span>
					<div class="stat-value">{stats.totalBurns.toLocaleString()}</div>
					<div class="stat-label">Total Burns</div>
				</div>
				<div class="stat">
					<span class="stat-emoji">👥</span>
					<div class="stat-value">{stats.uniqueBurners.toLocaleString()}</div>
					<div class="stat-label">Burners</div>
				</div>
				<div class="stat">
					<span class="stat-emoji">💎</span>
					<div class="stat-value">{stats.topBurnedTokens.length}</div>
					<div class="stat-label">Tokens</div>
				</div>
			</div>

			<!-- Top Burners Leaderboard -->
			<div class="card leaderboard-card">
				<div class="card-header">
					<h3><span class="emoji-icon">🔥</span> Top Burners</h3>
					<div class="sort-controls">
						<button 
							class="sort-btn" 
							class:active={burnerSortBy === 'burnCount'}
							on:click={() => burnerSortBy = 'burnCount'}
						>
							<i class="fas fa-fire"></i> Burns
						</button>
						<button 
							class="sort-btn" 
							class:active={burnerSortBy === 'address'}
							on:click={() => burnerSortBy = 'address'}
						>
							<i class="fas fa-sort-alpha-down"></i> Address
						</button>
					</div>
				</div>
				<div class="list">
					{#each sortedBurners as burner, index}
						<div class="list-item">
							<div class="rank" class:top3={index < 3}>
								{#if index === 0}🥇
								{:else if index === 1}🥈
								{:else if index === 2}🥉
								{:else}#{index + 1}
								{/if}
							</div>
							<div class="item-content">
								<a 
									href="https://ergexplorer.com/addresses/{burner.address}" 
									target="_blank" 
									rel="noopener"
									class="item-name"
								>
									{formatAddress(burner.address)}
								</a>
								<div class="item-meta">{burner.burnCount} burns</div>
							</div>
							<div class="item-badge">{burner.burnCount}x</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Top Burned Tokens Leaderboard -->
			<div class="card leaderboard-card">
				<div class="card-header">
					<h3><span class="emoji-icon">💎</span> Most Burned Tokens</h3>
					<div class="sort-controls">
						<button 
							class="sort-btn" 
							class:active={tokenSortBy === 'totalBurned'}
							on:click={() => tokenSortBy = 'totalBurned'}
						>
							<i class="fas fa-coins"></i> Amount
						</button>
						<button 
							class="sort-btn" 
							class:active={tokenSortBy === 'burnCount'}
							on:click={() => tokenSortBy = 'burnCount'}
						>
							<i class="fas fa-fire"></i> Burns
						</button>
						<button 
							class="sort-btn" 
							class:active={tokenSortBy === 'name'}
							on:click={() => tokenSortBy = 'name'}
						>
							<i class="fas fa-sort-alpha-down"></i> Name
						</button>
					</div>
				</div>
				<div class="list">
					{#each sortedTokens as token, index}
						<div class="list-item">
							<div class="rank" class:top3={index < 3}>
								{#if index === 0}🥇
								{:else if index === 1}🥈
								{:else if index === 2}🥉
								{:else}#{index + 1}
								{/if}
							</div>
							<div class="item-content">
								<div class="item-name">{token.name}</div>
								<div class="item-meta">
									{formatTokenAmount(token.totalBurned, token.decimals)} burned • {token.burnCount} burns
								</div>
							</div>
							<div class="item-badge">{token.burnCount}x</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Mobile Bottom Navigation -->
<nav class="bottom-nav mobile-only">
	<a href="/" class="bottom-nav-item">
		<i class="fas fa-home"></i>
		<span>Home</span>
	</a>
	<a href="/burn" class="bottom-nav-item active">
		<i class="fas fa-trophy"></i>
		<span>Ranks</span>
	</a>
	<button class="bottom-nav-item burn-item" on:click={openBurnModal}>
		<span class="emoji-icon">🔥</span>
		<span>Burn</span>
	</button>
	<a href="/activity" class="bottom-nav-item">
		<i class="fas fa-chart-line"></i>
		<span>Activity</span>
	</a>
</nav>

<BurnModal bind:showModal={showBurnModal} onSuccess={handleBurnSuccess} />

<style>
	/* Global body background */
	:global(body) {
		background: #000000;
		position: relative;
	}

	:global(body::before) {
		content: '';
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background:
			radial-gradient(ellipse at 20% 80%, rgba(255, 69, 0, 0.15) 0%, transparent 50%),
			radial-gradient(ellipse at 80% 20%, rgba(255, 140, 0, 0.12) 0%, transparent 50%),
			radial-gradient(ellipse at 50% 50%, rgba(255, 0, 0, 0.08) 0%, transparent 60%),
			radial-gradient(ellipse at 30% 30%, rgba(139, 0, 0, 0.1) 0%, transparent 50%);
		filter: blur(80px);
		animation: flameMove 20s ease-in-out infinite;
		pointer-events: none;
		z-index: 0;
	}

	:global(body > *) {
		position: relative;
		z-index: 1;
	}

	@keyframes flameMove {
		0%, 100% {
			transform: translate(0, 0) scale(1);
			opacity: 0.8;
		}
		25% {
			transform: translate(5%, -3%) scale(1.05);
			opacity: 0.9;
		}
		50% {
			transform: translate(-3%, 5%) scale(0.95);
			opacity: 0.85;
		}
		75% {
			transform: translate(3%, 2%) scale(1.02);
			opacity: 0.9;
		}
	}

	.page-container {
		padding: 0.75rem;
		width: 90%;
		max-width: 1400px;
		margin: 0 auto;
	}

	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 3px solid rgba(255, 107, 107, 0.1);
		border-top-color: #ff6b6b;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.content-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: auto auto auto;
		gap: 0.75rem;
		width: 100%;
	}

	/* Header Row */
	.header-row {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 16px;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.logo-section {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.logo-section .emoji-icon {
		font-size: 2.5rem;
		filter: drop-shadow(0 0 20px rgba(255, 107, 107, 0.8));
	}

	.logo-text {
		display: flex;
		flex-direction: column;
	}

	.logo-title {
		font-size: 1.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		line-height: 1.2;
	}

	.logo-subtitle {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.nav-right-section {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.nav-links {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: all 0.2s;
		text-decoration: none;
		font-size: 0.95rem;
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 107, 107, 0.3);
		color: white;
		transform: translateY(-1px);
	}

	.nav-btn.burn-btn {
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		border: none;
		color: white;
		font-weight: 600;
	}

	.nav-btn.burn-btn:hover {
		background: linear-gradient(135deg, #ffaa00 0%, #ff6b6b 100%);
		box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
	}

	.nav-btn .emoji-icon {
		font-size: 1.2rem;
		filter: none;
	}

	.nav-btn i {
		font-size: 1rem;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	/* Stats Row */
	.stats-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 0.75rem;
	}

	.stat {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		text-align: center;
		transition: all 0.2s;
	}

	.stat:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 107, 107, 0.3);
		transform: translateY(-2px);
	}

	.stat-emoji {
		font-size: 1.5rem;
		display: block;
		margin-bottom: 0.5rem;
		filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.4));
	}

	.stat-value {
		font-size: 1.8rem;
		font-weight: 700;
		color: #ff6b6b;
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Cards */
	.card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.leaderboard-card {
		grid-column: span 2;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.card-header h3 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.card-header .emoji-icon {
		font-size: 1.2rem;
		filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.6));
	}

	.sort-controls {
		display: flex;
		gap: 0.25rem;
	}

	.sort-btn {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.4rem 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.75rem;
	}

	.sort-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.9);
	}

	.sort-btn.active {
		background: rgba(255, 107, 107, 0.2);
		border-color: rgba(255, 107, 107, 0.4);
		color: #ff6b6b;
	}

	.sort-btn i {
		font-size: 0.7rem;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		max-height: 500px;
	}

	.list-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.list-item:hover {
		background: rgba(255, 255, 255, 0.05);
		transform: translateX(4px);
	}

	.rank {
		min-width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		font-weight: 700;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.rank.top3 {
		font-size: 1.2rem;
		background: transparent;
	}

	.item-content {
		flex: 1;
		min-width: 0;
	}

	.item-name {
		font-weight: 600;
		color: white;
		font-size: 0.9rem;
		display: block;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-decoration: none;
		transition: color 0.2s;
	}

	.item-name:hover {
		color: #ff6b6b;
	}

	.item-meta {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		margin-top: 0.15rem;
	}

	.item-badge {
		padding: 0.25rem 0.6rem;
		background: rgba(255, 107, 107, 0.15);
		border: 1px solid rgba(255, 107, 107, 0.3);
		border-radius: 12px;
		color: #ff6b6b;
		font-weight: 600;
		font-size: 0.75rem;
	}

	/* Bottom Navigation */
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(22, 13, 37, 0.98);
		backdrop-filter: blur(20px);
		border-top: 1px solid rgba(255, 107, 107, 0.2);
		display: flex;
		justify-content: space-around;
		align-items: center;
		padding: 0.5rem 0;
		z-index: 1000;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
	}

	.bottom-nav-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 1rem;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		transition: all 0.2s;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 0.75rem;
	}

	.bottom-nav-item:hover {
		color: rgba(255, 255, 255, 0.9);
	}

	.bottom-nav-item.active {
		color: #ff6b6b;
	}

	.bottom-nav-item i {
		font-size: 1.2rem;
	}

	.bottom-nav-item.burn-item {
		position: relative;
		bottom: 10px;
	}

	.bottom-nav-item.burn-item .emoji-icon {
		font-size: 1.5rem;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		padding: 0.75rem;
		border-radius: 50%;
		box-shadow: 0 4px 16px rgba(255, 107, 107, 0.4);
		animation: pulse 2s ease-in-out infinite;
		filter: none;
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 4px 16px rgba(255, 107, 107, 0.4);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 6px 20px rgba(255, 107, 107, 0.6);
		}
	}

	.mobile-only {
		display: none !important;
	}

	/* Responsive */
	@media (min-width: 769px) {
		.mobile-only {
			display: none !important;
		}
	}

	@media (max-width: 768px) {
		.mobile-only {
			display: flex !important;
		}

		.desktop-nav {
			display: none !important;
		}

		.page-container {
			padding: 0.5rem;
			padding-bottom: 80px;
			width: 100%;
		}

		.content-grid {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.stats-row {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.5rem;
		}

		.leaderboard-card {
			grid-column: span 1;
		}

		.header-row {
			padding: 0.75rem 1rem;
		}

		.logo-section .emoji-icon {
			font-size: 2rem;
		}

		.logo-title {
			font-size: 1.25rem;
		}

		.sort-controls {
			flex-wrap: wrap;
		}

		.sort-btn {
			padding: 0.35rem 0.6rem;
			font-size: 0.7rem;
		}
	}

	@media (max-width: 480px) {
		.page-container {
			padding: 0.375rem;
			padding-bottom: 80px;
		}

		.content-grid {
			gap: 0.375rem;
		}

		.stat {
			padding: 0.75rem 0.5rem;
		}

		.stat-value {
			font-size: 1.5rem;
		}

		.stat-emoji {
			font-size: 1.25rem;
		}
	}
</style>
