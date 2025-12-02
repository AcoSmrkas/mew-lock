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
				fetchBurnTransactions(0, 10)
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

	function formatTimestamp(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		return `${days}d ago`;
	}
</script>

<svelte:head>
	<title>Burn Tracker - Track Token Burns on Ergo</title>
	<meta
		name="description"
		content="Track token burns, compete in burn contests, and climb the leaderboards on Ergo blockchain."
	/>
</svelte:head>

<Navigation />

<!-- Hero Section -->
<section class="hero-section">
	<div class="hero-background">
		<div class="fire-animation"></div>
		<div class="fire-animation fire-2"></div>
		<div class="fire-animation fire-3"></div>
	</div>

	<div class="hero-content">
		<h1 class="hero-title">
			🔥 Burn Tracker
		</h1>
		<p class="hero-subtitle">
			Track token burns, compete in contests, and climb the leaderboards
		</p>

		{#if !loading && stats}
			<div class="hero-stats">
				<div class="hero-stat">
					<div class="hero-stat-value">{stats.totalBurns.toLocaleString()}</div>
					<div class="hero-stat-label">Total Burns</div>
				</div>
				<div class="hero-stat">
					<div class="hero-stat-value">{stats.uniqueBurners.toLocaleString()}</div>
					<div class="hero-stat-label">Burners</div>
				</div>
				<div class="hero-stat">
					<div class="hero-stat-value">{stats.topBurnedTokens.length}</div>
					<div class="hero-stat-label">Tokens</div>
				</div>
			</div>
		{/if}

		<div class="hero-actions">
			<a href="/burn" class="cta-button primary">
				View Leaderboards 🏆
			</a>
			<a href="/burn/campaigns" class="cta-button secondary">
				Active Campaigns
			</a>
		</div>
	</div>
</section>

{#if loading}
	<div class="loading-section">
		<div class="spinner"></div>
		<p>Loading burn data...</p>
	</div>
{:else if stats}
	<!-- Active Campaigns Banner -->
	{#if activeCampaigns.length > 0}
		<section class="campaigns-banner">
			<div class="container">
				<h2>🏆 Active Campaigns</h2>
				<div class="campaigns-scroll">
					{#each activeCampaigns as campaign}
						<a href="/burn/campaigns" class="campaign-card-mini">
							<div class="campaign-badge">LIVE</div>
							<div class="campaign-name">{campaign.name}</div>
							<div class="campaign-participants">{campaign.participants || 0} participants</div>
						</a>
					{/each}
				</div>
			</div>
		</section>
	{/if}

	<!-- Leaderboards Section -->
	<section class="leaderboards-section">
		<div class="container">
			<div class="leaderboards-grid">
				<!-- Top Burners -->
				<div class="leaderboard-card">
					<div class="card-header">
						<h2>🔥 Top Burners</h2>
						<a href="/burn" class="view-all">View All →</a>
					</div>
					<div class="leaderboard-list">
						{#each stats.topBurners.slice(0, 5) as burner, index}
							<div class="leaderboard-entry">
								<div class="rank" class:top-3={index < 3}>#{index + 1}</div>
								<div class="entry-info">
									<div class="entry-name">{formatAddress(burner.address)}</div>
									<div class="entry-meta">{burner.burnCount} burns</div>
								</div>
								<div class="entry-badge">{burner.burnCount}x</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Top Burned Tokens -->
				<div class="leaderboard-card">
					<div class="card-header">
						<h2>💎 Most Burned Tokens</h2>
						<a href="/burn" class="view-all">View All →</a>
					</div>
					<div class="leaderboard-list">
						{#each stats.topBurnedTokens.slice(0, 5) as token, index}
							<div class="leaderboard-entry">
								<div class="rank" class:top-3={index < 3}>#{index + 1}</div>
								<div class="entry-info">
									<div class="entry-name">{token.name}</div>
									<div class="entry-meta">{formatTokenAmount(token.totalBurned, token.decimals)} burned</div>
								</div>
								<div class="entry-badge">{token.burnCount}x</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Recent Burns Feed -->
	<section class="recent-burns-section">
		<div class="container">
			<div class="section-header">
				<h2>🔥 Recent Burns</h2>
				<a href="/burn" class="view-all">View All →</a>
			</div>

			<div class="burns-feed">
				{#each recentBurns.slice(0, 6) as burn}
					<div class="burn-item">
						<div class="burn-header">
							<div class="burner-info">
								<span class="burner-address">{formatAddress(burn.burnerAddress)}</span>
								<span class="burn-time">{formatTimestamp(burn.timestamp)}</span>
							</div>
						</div>
						<div class="burn-tokens">
							{#each burn.burnedTokens.slice(0, 3) as token}
								<span class="token-badge">
									{token.name || 'Unknown'}: {formatTokenAmount(token.amount, token.decimals)}
								</span>
							{/each}
							{#if burn.burnedTokens.length > 3}
								<span class="more-tokens">+{burn.burnedTokens.length - 3} more</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="cta-section">
		<div class="container">
			<h2>Ready to Burn?</h2>
			<p>Join the burn community and compete for prizes</p>
			<div class="cta-buttons">
				<a href="/burn" class="cta-button primary large">
					Start Burning 🔥
				</a>
				<a href="/burn/campaigns" class="cta-button secondary large">
					View Campaigns
				</a>
			</div>
		</div>
	</section>
{/if}

<style>
	:global(body) {
		background: linear-gradient(135deg, #1a0a0a 0%, #2d1010 50%, #1a0a0a 100%);
		color: white;
		min-height: 100vh;
	}

	/* Hero Section */
	.hero-section {
		position: relative;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		padding: 2rem;
	}

	.hero-background {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: radial-gradient(circle at 50% 50%, rgba(255, 107, 107, 0.15) 0%, transparent 70%);
		z-index: 0;
	}

	.fire-animation {
		position: absolute;
		bottom: 0;
		width: 300px;
		height: 400px;
		background: radial-gradient(circle, rgba(255, 107, 107, 0.6) 0%, transparent 70%);
		filter: blur(60px);
		animation: flicker 3s infinite ease-in-out;
	}

	.fire-animation.fire-2 {
		left: 20%;
		animation-delay: 1s;
	}

	.fire-animation.fire-3 {
		right: 20%;
		animation-delay: 2s;
	}

	@keyframes flicker {
		0%, 100% {
			opacity: 0.6;
			transform: translateY(0) scale(1);
		}
		50% {
			opacity: 0.9;
			transform: translateY(-20px) scale(1.1);
		}
	}

	.hero-content {
		position: relative;
		z-index: 1;
		text-align: center;
		max-width: 900px;
	}

	.hero-title {
		font-size: 5rem;
		font-weight: 800;
		margin: 0 0 1rem 0;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 50%, #ff6b6b 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: glow 2s ease-in-out infinite;
	}

	@keyframes glow {
		0%, 100% {
			filter: drop-shadow(0 0 20px rgba(255, 107, 107, 0.5));
		}
		50% {
			filter: drop-shadow(0 0 40px rgba(255, 107, 107, 0.8));
		}
	}

	.hero-subtitle {
		font-size: 1.5rem;
		color: rgba(255, 255, 255, 0.8);
		margin: 0 0 3rem 0;
	}

	.hero-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 2rem;
		margin: 3rem 0;
	}

	.hero-stat {
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 107, 107, 0.3);
		border-radius: 16px;
		padding: 2rem;
		backdrop-filter: blur(10px);
		transition: all 0.3s;
	}

	.hero-stat:hover {
		transform: translateY(-5px);
		border-color: rgba(255, 107, 107, 0.6);
		box-shadow: 0 10px 30px rgba(255, 107, 107, 0.3);
	}

	.hero-stat-value {
		font-size: 3rem;
		font-weight: 700;
		color: #ff6b6b;
		margin-bottom: 0.5rem;
	}

	.hero-stat-label {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.7);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.hero-actions {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		margin-top: 3rem;
	}

	.cta-button {
		padding: 1.25rem 2.5rem;
		border-radius: 50px;
		font-weight: 700;
		font-size: 1.1rem;
		text-decoration: none;
		transition: all 0.3s;
		display: inline-block;
	}

	.cta-button.primary {
		background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
		color: white;
		box-shadow: 0 10px 30px rgba(255, 107, 107, 0.4);
	}

	.cta-button.primary:hover {
		transform: translateY(-3px);
		box-shadow: 0 15px 40px rgba(255, 107, 107, 0.6);
	}

	.cta-button.secondary {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 107, 107, 0.5);
		color: white;
	}

	.cta-button.secondary:hover {
		background: rgba(255, 107, 107, 0.2);
		border-color: #ff6b6b;
	}

	.cta-button.large {
		padding: 1.5rem 3rem;
		font-size: 1.2rem;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	/* Loading */
	.loading-section {
		text-align: center;
		padding: 5rem 2rem;
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
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Campaigns Banner */
	.campaigns-banner {
		background: rgba(255, 107, 107, 0.1);
		border-top: 2px solid rgba(255, 107, 107, 0.3);
		border-bottom: 2px solid rgba(255, 107, 107, 0.3);
		padding: 3rem 0;
		margin: 4rem 0;
	}

	.campaigns-banner h2 {
		text-align: center;
		margin: 0 0 2rem 0;
		font-size: 2rem;
	}

	.campaigns-scroll {
		display: flex;
		gap: 1.5rem;
		overflow-x: auto;
		padding-bottom: 1rem;
	}

	.campaign-card-mini {
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 107, 107, 0.3);
		border-radius: 12px;
		padding: 1.5rem;
		min-width: 250px;
		position: relative;
		text-decoration: none;
		color: white;
		transition: all 0.3s;
	}

	.campaign-card-mini:hover {
		transform: translateY(-5px);
		border-color: #ff6b6b;
		box-shadow: 0 10px 25px rgba(255, 107, 107, 0.3);
	}

	.campaign-badge {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: #22c55e;
		color: white;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 700;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.campaign-name {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.campaign-participants {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	/* Leaderboards */
	.leaderboards-section {
		padding: 5rem 0;
	}

	.leaderboards-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 2rem;
	}

	.leaderboard-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
		backdrop-filter: blur(10px);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.card-header h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.view-all {
		color: #ff6b6b;
		text-decoration: none;
		font-weight: 600;
		transition: all 0.2s;
	}

	.view-all:hover {
		color: #ee5a6f;
		transform: translateX(5px);
	}

	.leaderboard-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.leaderboard-entry {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		transition: all 0.2s;
	}

	.leaderboard-entry:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateX(5px);
	}

	.rank {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(255, 107, 107, 0.7);
		min-width: 50px;
		text-align: center;
	}

	.rank.top-3 {
		color: #ff6b6b;
		text-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
	}

	.entry-info {
		flex: 1;
	}

	.entry-name {
		font-weight: 600;
		margin-bottom: 0.25rem;
	}

	.entry-meta {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
	}

	.entry-badge {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-weight: 600;
		font-size: 0.875rem;
	}

	/* Recent Burns */
	.recent-burns-section {
		padding: 5rem 0;
		background: rgba(0, 0, 0, 0.3);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.section-header h2 {
		margin: 0;
		font-size: 2rem;
	}

	.burns-feed {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.burn-item {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1.5rem;
		transition: all 0.3s;
	}

	.burn-item:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-5px);
		box-shadow: 0 10px 25px rgba(255, 107, 107, 0.2);
	}

	.burn-header {
		margin-bottom: 1rem;
	}

	.burner-info {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.burner-address {
		color: #ff6b6b;
		font-weight: 600;
	}

	.burn-time {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
	}

	.burn-tokens {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.token-badge {
		background: rgba(255, 107, 107, 0.15);
		border: 1px solid rgba(255, 107, 107, 0.3);
		color: white;
		padding: 0.4rem 0.8rem;
		border-radius: 16px;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.more-tokens {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
		font-style: italic;
	}

	/* CTA Section */
	.cta-section {
		padding: 6rem 0;
		text-align: center;
	}

	.cta-section h2 {
		font-size: 3rem;
		margin: 0 0 1rem 0;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.cta-section p {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.7);
		margin: 0 0 3rem 0;
	}

	.cta-buttons {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.hero-title {
			font-size: 3rem;
		}

		.hero-stats {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.hero-actions {
			flex-direction: column;
		}

		.leaderboards-grid {
			grid-template-columns: 1fr;
		}

		.burns-feed {
			grid-template-columns: 1fr;
		}

		.cta-buttons {
			flex-direction: column;
		}
	}
</style>
