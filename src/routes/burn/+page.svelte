<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchAllBurnTransactions,
		fetchUserBurnTransactions,
		type BurnTransaction,
		type BurnStats
	} from '$lib/api-explorer/burnTracker';
	import { connected_wallet_address } from '$lib/store/store';
	import { nFormatter } from '$lib/utils/utils';

	let loading = true;
	let stats: BurnStats | null = null;
	let recentBurns: BurnTransaction[] = [];
	let userBurns: BurnTransaction[] = [];
	let activeTab: 'leaderboard' | 'recent' | 'my-burns' = 'leaderboard';
	let error = '';

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		loading = true;
		error = '';
		try {
			// Fetch all burns
			const allBurns = await fetchAllBurnTransactions();

			// Get recent burns for display
			recentBurns = allBurns.items.slice(0, 50);

			// Calculate stats from all burns
			stats = calculateBurnStatsFromBurns(allBurns.items);

			// Load user burns if wallet connected
			if ($connected_wallet_address) {
				userBurns = await fetchUserBurnTransactions($connected_wallet_address, 100);
			}
		} catch (err) {
			console.error('Error loading burn data:', err);
			error = 'Failed to load burn data. Please try again later.';
		} finally {
			loading = false;
		}
	}

	function calculateBurnStatsFromBurns(burns: BurnTransaction[]): BurnStats {
		const burnerStats = new Map<string, { burnCount: number; totalValueBurned: number }>();
		const tokenStats = new Map<string, { name: string; totalBurned: number; burnCount: number; decimals?: number }>();

		// Aggregate stats
		for (const burn of burns) {
			// Burner stats
			const burnerStat = burnerStats.get(burn.burnerAddress) || {
				burnCount: 0,
				totalValueBurned: 0
			};
			burnerStat.burnCount++;
			burnerStats.set(burn.burnerAddress, burnerStat);

			// Token stats
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

		// Convert to arrays and sort
		const topBurners = Array.from(burnerStats.entries())
			.map(([address, stats]) => ({
				address,
				...stats
			}))
			.sort((a, b) => b.burnCount - a.burnCount)
			.slice(0, 10);

		const topBurnedTokens = Array.from(tokenStats.entries())
			.map(([tokenId, stats]) => ({
				tokenId,
				...stats
			}))
			.sort((a, b) => b.totalBurned - a.totalBurned)
			.slice(0, 10);

		return {
			totalBurns: burns.length,
			uniqueBurners: burnerStats.size,
			topBurners,
			topBurnedTokens
		};
	}

	// Reactive: reload user burns when wallet changes
	$: if ($connected_wallet_address) {
		loadUserBurns();
	}

	async function loadUserBurns() {
		if (!$connected_wallet_address) return;
		try {
			userBurns = await fetchUserBurnTransactions($connected_wallet_address, 100);
		} catch (err) {
			console.error('Error loading user burns:', err);
		}
	}

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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
</script>

<svelte:head>
	<title>Burn Tracker - MewLock</title>
</svelte:head>

<div class="burn-tracker-page">
	<!-- Header -->
	<div class="page-header">
		<h1>🔥 Burn Tracker</h1>
		<p class="subtitle">Track token burns, leaderboards, and burning statistics</p>
	</div>

	{#if loading}
		<div class="loading-container">
			<div class="spinner"></div>
			<p>Loading burn data...</p>
		</div>
	{:else if error}
		<div class="error-message">
			<p>{error}</p>
			<button class="retry-btn" on:click={loadData}>Retry</button>
		</div>
	{:else if stats}
		<!-- Stats Overview -->
		<div class="stats-overview">
			<div class="stat-card">
				<div class="stat-value">{stats.totalBurns.toLocaleString()}</div>
				<div class="stat-label">Total Burns</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.uniqueBurners.toLocaleString()}</div>
				<div class="stat-label">Unique Burners</div>
			</div>
			<div class="stat-card">
				<div class="stat-value">{stats.topBurnedTokens.length}</div>
				<div class="stat-label">Tokens Burned</div>
			</div>
			{#if $connected_wallet_address}
				<div class="stat-card highlight">
					<div class="stat-value">{userBurns.length}</div>
					<div class="stat-label">Your Burns</div>
				</div>
			{/if}
		</div>

		<!-- Tabs -->
		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'leaderboard'}
				on:click={() => (activeTab = 'leaderboard')}
			>
				🏆 Leaderboards
			</button>
			<button
				class="tab"
				class:active={activeTab === 'recent'}
				on:click={() => (activeTab = 'recent')}
			>
				🔥 Recent Burns
			</button>
			{#if $connected_wallet_address}
				<button
					class="tab"
					class:active={activeTab === 'my-burns'}
					on:click={() => (activeTab = 'my-burns')}
				>
					👤 My Burns ({userBurns.length})
				</button>
			{/if}
		</div>

		<!-- Tab Content -->
		<div class="tab-content">
			{#if activeTab === 'leaderboard'}
				<div class="leaderboards-grid">
					<!-- Top Burners -->
					<div class="leaderboard-section">
						<h2>🔥 Top Burners</h2>
						<div class="leaderboard-list">
							{#each stats.topBurners as burner, index}
								<div class="leaderboard-item">
									<div class="rank">#{index + 1}</div>
									<div class="item-info">
										<div class="item-name">
											<a
												href="https://ergexplorer.com/addresses/{burner.address}"
												target="_blank"
												rel="noopener"
											>
												{formatAddress(burner.address)}
											</a>
										</div>
										<div class="item-meta">{burner.burnCount} burns</div>
									</div>
									<div class="item-badge">{burner.burnCount}x</div>
								</div>
							{/each}
						</div>
					</div>

					<!-- Top Burned Tokens -->
					<div class="leaderboard-section">
						<h2>💎 Most Burned Tokens</h2>
						<div class="leaderboard-list">
							{#each stats.topBurnedTokens as token, index}
								<div class="leaderboard-item">
									<div class="rank">#{index + 1}</div>
									<div class="item-info">
										<div class="item-name">{token.name}</div>
										<div class="item-meta">
											{formatTokenAmount(token.totalBurned, token.decimals)} burned
										</div>
									</div>
									<div class="item-badge">{token.burnCount}x</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{:else if activeTab === 'recent'}
				<div class="burns-list">
					<h2>Recent Burns</h2>
					{#each recentBurns as burn}
						<div class="burn-card">
							<div class="burn-header">
								<div class="burner">
									<span class="label">Burner:</span>
									<a
										href="https://ergexplorer.com/addresses/{burn.burnerAddress}"
										target="_blank"
										rel="noopener"
									>
										{formatAddress(burn.burnerAddress)}
									</a>
								</div>
								<div class="timestamp">{formatTimestamp(burn.timestamp)}</div>
							</div>
							<div class="burned-tokens">
								{#each burn.burnedTokens as token}
									<div class="token-pill">
										<span class="token-name">{token.name || 'Unknown'}</span>
										<span class="token-amount"
											>{formatTokenAmount(token.amount, token.decimals)}</span
										>
									</div>
								{/each}
							</div>
							<div class="burn-footer">
								<a
									href="https://ergexplorer.com/transactions/{burn.txId}"
									target="_blank"
									rel="noopener"
									class="tx-link"
								>
									View TX →
								</a>
								<span class="height">Height: {burn.height.toLocaleString()}</span>
							</div>
						</div>
					{/each}
				</div>
			{:else if activeTab === 'my-burns'}
				<div class="burns-list">
					<h2>My Burn History</h2>
					{#if userBurns.length === 0}
						<div class="empty-state">
							<p>You haven't burned any tokens yet.</p>
							<p class="empty-hint">Start burning to appear on the leaderboard!</p>
						</div>
					{:else}
						{#each userBurns as burn}
							<div class="burn-card">
								<div class="burn-header">
									<div class="burner">
										<span class="label">Your Burn</span>
									</div>
									<div class="timestamp">{formatTimestamp(burn.timestamp)}</div>
								</div>
								<div class="burned-tokens">
									{#each burn.burnedTokens as token}
										<div class="token-pill">
											<span class="token-name">{token.name || 'Unknown'}</span>
											<span class="token-amount"
												>{formatTokenAmount(token.amount, token.decimals)}</span
											>
										</div>
									{/each}
								</div>
								<div class="burn-footer">
									<a
										href="https://ergexplorer.com/transactions/{burn.txId}"
										target="_blank"
										rel="noopener"
										class="tx-link"
									>
										View TX →
									</a>
									<span class="height">Height: {burn.height.toLocaleString()}</span>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.burn-tracker-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.page-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.page-header h1 {
		font-size: 3rem;
		font-weight: 700;
		background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		margin: 0 0 0.5rem 0;
	}

	.subtitle {
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.1rem;
	}

	.loading-container {
		text-align: center;
		padding: 4rem 2rem;
	}

	.spinner {
		width: 50px;
		height: 50px;
		border: 4px solid rgba(255, 107, 107, 0.2);
		border-top: 4px solid #ff6b6b;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.error-message {
		text-align: center;
		padding: 3rem 2rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 12px;
		color: #ef4444;
	}

	.retry-btn {
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background: #ef4444;
		color: white;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s;
	}

	.retry-btn:hover {
		background: #dc2626;
		transform: translateY(-2px);
	}

	.stats-overview {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		margin-bottom: 3rem;
	}

	.stat-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		transition: all 0.3s;
	}

	.stat-card:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-2px);
	}

	.stat-card.highlight {
		border-color: rgba(255, 107, 107, 0.5);
		background: rgba(255, 107, 107, 0.1);
	}

	.stat-value {
		font-size: 2.5rem;
		font-weight: 700;
		color: #ff6b6b;
		margin-bottom: 0.5rem;
	}

	.stat-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.95rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.tabs {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
	}

	.tab {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		padding: 1rem 1.5rem;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		border-bottom: 3px solid transparent;
		transition: all 0.2s;
		margin-bottom: -2px;
	}

	.tab:hover {
		color: rgba(255, 255, 255, 0.9);
	}

	.tab.active {
		color: #ff6b6b;
		border-bottom-color: #ff6b6b;
	}

	.tab-content {
		min-height: 400px;
	}

	.leaderboards-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
		gap: 2rem;
	}

	.leaderboard-section h2 {
		color: white;
		font-size: 1.5rem;
		margin: 0 0 1.5rem 0;
	}

	.leaderboard-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.leaderboard-item {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem 1.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		transition: all 0.2s;
	}

	.leaderboard-item:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateX(4px);
	}

	.rank {
		font-size: 1.5rem;
		font-weight: 700;
		color: #ff6b6b;
		min-width: 50px;
	}

	.item-info {
		flex: 1;
	}

	.item-name {
		color: white;
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.item-name a {
		color: white;
		text-decoration: none;
		transition: color 0.2s;
	}

	.item-name a:hover {
		color: #ff6b6b;
	}

	.item-meta {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
	}

	.item-badge {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.burns-list h2 {
		color: white;
		font-size: 1.5rem;
		margin: 0 0 1.5rem 0;
	}

	.burn-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1rem;
		transition: all 0.2s;
	}

	.burn-card:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-2px);
	}

	.burn-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.burner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
	}

	.burner a {
		color: #ff6b6b;
		text-decoration: none;
		font-weight: 600;
	}

	.burner a:hover {
		text-decoration: underline;
	}

	.timestamp {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
	}

	.burned-tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.token-pill {
		background: rgba(255, 107, 107, 0.15);
		border: 1px solid rgba(255, 107, 107, 0.3);
		border-radius: 20px;
		padding: 0.5rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.token-name {
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.token-amount {
		color: #ff6b6b;
		font-weight: 700;
		font-size: 0.875rem;
	}

	.burn-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.tx-link {
		color: #ff6b6b;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.875rem;
		transition: all 0.2s;
	}

	.tx-link:hover {
		color: #ee5a6f;
		transform: translateX(4px);
	}

	.height {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.empty-hint {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.875rem;
	}

	@media (max-width: 768px) {
		.burn-tracker-page {
			padding: 1rem;
		}

		.page-header h1 {
			font-size: 2rem;
		}

		.stats-overview {
			grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
			gap: 1rem;
		}

		.leaderboards-grid {
			grid-template-columns: 1fr;
		}

		.tabs {
			flex-direction: column;
			gap: 0;
		}

		.burn-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}
	}
</style>
