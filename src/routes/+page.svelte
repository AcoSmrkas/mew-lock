<script lang="ts">
	import { onMount } from 'svelte';
	import { nFormatter } from '$lib/utils/utils.js';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import { calculateBurnStats, fetchBurnTransactions, type BurnStats, type BurnTransaction } from '$lib/api-explorer/burnTracker';
	import { getActiveCampaigns } from '$lib/api-explorer/burnCampaigns';

	let loading = true;
	let stats: BurnStats | null = null;
	let recentBurns: BurnTransaction[] = [];
	let activeCampaigns = [];

	onMount(async () => {
		await loadBurnData();
	});

	async function loadBurnData() {
		loading = true;
		try {
			const [burnStats, burnTxs] = await Promise.all([
				calculateBurnStats(500),
				fetchBurnTransactions(0, 6)
			]);

			stats = burnStats;
			recentBurns = burnTxs.items;
			activeCampaigns = getActiveCampaigns();
		} catch (error) {
			console.error('Error loading burn data:', error);
		} finally {
			loading = false;
		}
	}

	function formatAddress(address: string): string {
		return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
	}

	function formatTokenAmount(amount: number, decimals?: number): string {
		if (decimals === undefined || decimals === 0) {
			return nFormatter(amount);
		}
		return nFormatter(amount / Math.pow(10, decimals));
	}
</script>

<svelte:head>
	<title>Burn Tracker - Track Token Burns on Ergo</title>
	<meta
		name="description"
		content="Track token burns, compete in burn contests, and climb the leaderboards on Ergo blockchain."
	/>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
</svelte:head>

<Navigation />

<div class="page-container">
	{#if loading}
		<div class="loading">
			<div class="spinner"></div>
		</div>
	{:else if stats}
		<!-- Main Content Grid -->
		<div class="content-grid">
			<!-- Hero Section -->
			<div class="hero-card">
				<div class="fire-bg"></div>
				<h1 class="title">
					<i class="fas fa-fire-flame-curved"></i>
					Burn Tracker
				</h1>
				<p class="subtitle">Track burns, compete, climb leaderboards</p>

				<div class="stats-row">
					<div class="stat">
						<i class="fas fa-burn"></i>
						<div class="stat-value">{stats.totalBurns.toLocaleString()}</div>
						<div class="stat-label">Burns</div>
					</div>
					<div class="stat">
						<i class="fas fa-users"></i>
						<div class="stat-value">{stats.uniqueBurners.toLocaleString()}</div>
						<div class="stat-label">Burners</div>
					</div>
					<div class="stat">
						<i class="fas fa-coins"></i>
						<div class="stat-value">{stats.topBurnedTokens.length}</div>
						<div class="stat-label">Tokens</div>
					</div>
				</div>

				<div class="actions">
					<a href="/burn" class="btn primary">
						<i class="fas fa-trophy"></i>
						Leaderboards
					</a>
					<a href="/burn/campaigns" class="btn secondary">
						<i class="fas fa-flag-checkered"></i>
						Campaigns
					</a>
				</div>
			</div>

			<!-- Top Burners -->
			<div class="card">
				<div class="card-header">
					<h3><i class="fas fa-fire"></i> Top Burners</h3>
					<a href="/burn" class="link"><i class="fas fa-arrow-right"></i></a>
				</div>
				<div class="list">
					{#each stats.topBurners.slice(0, 5) as burner, i}
						<div class="list-item">
							<div class="rank" class:top={i < 3}>#{i + 1}</div>
							<div class="info">
								<div class="name">{formatAddress(burner.address)}</div>
								<div class="meta">{burner.burnCount} burns</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Top Tokens -->
			<div class="card">
				<div class="card-header">
					<h3><i class="fas fa-gem"></i> Most Burned</h3>
					<a href="/burn" class="link"><i class="fas fa-arrow-right"></i></a>
				</div>
				<div class="list">
					{#each stats.topBurnedTokens.slice(0, 5) as token, i}
						<div class="list-item">
							<div class="rank" class:top={i < 3}>#{i + 1}</div>
							<div class="info">
								<div class="name">{token.name}</div>
								<div class="meta">{formatTokenAmount(token.totalBurned, token.decimals)}</div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Recent Activity -->
			<div class="card recent">
				<div class="card-header">
					<h3><i class="fas fa-clock"></i> Recent Burns</h3>
					<a href="/burn" class="link"><i class="fas fa-arrow-right"></i></a>
				</div>
				<div class="activity">
					{#each recentBurns as burn}
						<div class="activity-item">
							<i class="fas fa-fire-alt"></i>
							<div class="activity-info">
								<div class="activity-user">{formatAddress(burn.burnerAddress)}</div>
								<div class="activity-tokens">
									{#each burn.burnedTokens.slice(0, 2) as token}
										<span class="badge">{token.name || 'Unknown'}</span>
									{/each}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background: linear-gradient(135deg, #1a0a0a 0%, #2d1010 50%, #1a0a0a 100%);
		color: white;
		margin: 0;
		padding: 0;
		overflow-x: hidden;
	}

	.page-container {
		min-height: 100vh;
		padding: 1rem;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.loading {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 60vh;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 107, 107, 0.2);
		border-top-color: #ff6b6b;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.content-grid {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		grid-template-rows: auto auto;
		gap: 1rem;
		width: 100%;
	}

	.hero-card {
		grid-column: 1;
		grid-row: 1 / 3;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 16px;
		padding: 2rem;
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	.fire-bg {
		position: absolute;
		bottom: -50%;
		left: 50%;
		transform: translateX(-50%);
		width: 300px;
		height: 300px;
		background: radial-gradient(circle, rgba(255, 107, 107, 0.3) 0%, transparent 70%);
		filter: blur(60px);
		animation: pulse 3s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1); }
		50% { opacity: 0.8; transform: translateX(-50%) scale(1.2); }
	}

	.title {
		font-size: 3rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		position: relative;
		z-index: 1;
	}

	.title i {
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.subtitle {
		color: rgba(255, 255, 255, 0.6);
		font-size: 1rem;
		margin: 0 0 2rem 0;
		position: relative;
		z-index: 1;
	}

	.stats-row {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 2rem;
		position: relative;
		z-index: 1;
	}

	.stat {
		flex: 1;
		text-align: center;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.stat i {
		color: #ff6b6b;
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
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

	.actions {
		display: flex;
		gap: 1rem;
		position: relative;
		z-index: 1;
	}

	.btn {
		flex: 1;
		padding: 1rem 1.5rem;
		border-radius: 10px;
		text-decoration: none;
		font-weight: 600;
		text-align: center;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn.primary {
		background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
		color: white;
	}

	.btn.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(255, 107, 107, 0.3);
	}

	.btn.secondary {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
	}

	.btn.secondary:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
	}

	.card.recent {
		grid-column: 2 / 4;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.card-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.card-header i {
		color: #ff6b6b;
	}

	.link {
		color: rgba(255, 255, 255, 0.5);
		transition: color 0.2s;
		text-decoration: none;
	}

	.link:hover {
		color: #ff6b6b;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.list-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		transition: all 0.2s;
	}

	.list-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.rank {
		min-width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.6);
	}

	.rank.top {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		border: 1px solid rgba(255, 107, 107, 0.3);
	}

	.info {
		flex: 1;
		min-width: 0;
	}

	.name {
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.activity {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.activity-item {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		align-items: center;
	}

	.activity-item i {
		color: #ff6b6b;
		font-size: 1.25rem;
	}

	.activity-info {
		flex: 1;
		min-width: 0;
	}

	.activity-user {
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		margin-bottom: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.activity-tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.badge {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 4px;
		color: #ff6b6b;
		white-space: nowrap;
	}

	@media (max-width: 1200px) {
		.content-grid {
			grid-template-columns: 1fr 1fr;
		}

		.hero-card {
			grid-column: 1 / 3;
			grid-row: 1;
		}

		.card.recent {
			grid-column: 1 / 3;
		}

		.activity {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.page-container {
			padding: 0.5rem;
		}

		.content-grid {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}

		.hero-card {
			grid-column: 1;
			grid-row: auto;
			padding: 1.5rem;
		}

		.title {
			font-size: 2rem;
		}

		.stats-row {
			flex-direction: column;
			gap: 0.75rem;
		}

		.actions {
			flex-direction: column;
		}

		.card.recent {
			grid-column: 1;
		}

		.activity {
			grid-template-columns: 1fr;
		}
	}
</style>
