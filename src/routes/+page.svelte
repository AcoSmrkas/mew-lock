<script lang="ts">
	import { onMount } from 'svelte';
	import { nFormatter } from '$lib/utils/utils.js';
	import WalletButton from '$lib/components/nav/WalletButton.svelte';
	import { calculateBurnStats, fetchBurnTransactions, type BurnStats, type BurnTransaction } from '$lib/api-explorer/burnTracker';
	import { getActiveCampaigns } from '$lib/api-explorer/burnCampaigns';

	let loading = true;
	let stats: BurnStats | null = null;
	let recentBurns: BurnTransaction[] = [];
	let activeCampaigns = [];
	let selectedBurn: BurnTransaction | null = null;
	let showBurnModal = false;

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

	function openBurnModal(burn: BurnTransaction) {
		selectedBurn = burn;
		showBurnModal = true;
	}

	function closeBurnModal() {
		showBurnModal = false;
		selectedBurn = null;
	}

	function formatFullTimestamp(timestamp: number): string {
		return new Date(timestamp).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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
					<i class="fas fa-fire-flame-curved"></i>
					<div class="logo-text">
						<div class="logo-title">Burn Tracker</div>
						<div class="logo-subtitle">Track burns, compete, climb</div>
					</div>
				</div>

				<div class="nav-links">
					<a href="/burn" class="nav-btn">
						<i class="fas fa-trophy"></i>
						Leaderboards
					</a>
					<a href="/burn/campaigns" class="nav-btn">
						<i class="fas fa-flag-checkered"></i>
						Campaigns
					</a>
				</div>

				<div class="wallet-section">
					<WalletButton />
				</div>
			</div>

			<!-- Stats Row -->
			<div class="stats-row">
				<div class="stat">
					<i class="fas fa-burn"></i>
					<div class="stat-value">{stats.totalBurns.toLocaleString()}</div>
					<div class="stat-label">Total Burns</div>
				</div>
				<div class="stat">
					<i class="fas fa-users"></i>
					<div class="stat-value">{stats.uniqueBurners.toLocaleString()}</div>
					<div class="stat-label">Burners</div>
				</div>
				<div class="stat">
					<i class="fas fa-coins"></i>
					<div class="stat-value">{stats.topBurnedTokens.length}</div>
					<div class="stat-label">Token Types</div>
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
			<div class="card">
				<div class="card-header">
					<h3><i class="fas fa-clock"></i> Recent Burns</h3>
					<a href="/burn" class="link"><i class="fas fa-arrow-right"></i></a>
				</div>
				<div class="burns-list">
					{#each recentBurns as burn}
						<div class="burn-preview" on:click={() => openBurnModal(burn)} on:keypress={() => {}}>
							<i class="fas fa-fire-alt burn-icon"></i>
							<div class="burn-info">
								<div class="burn-user">{formatAddress(burn.burnerAddress)}</div>
								<div class="burn-summary">
									burned {burn.burnedTokens.length} token{burn.burnedTokens.length > 1 ? 's' : ''}
								</div>
							</div>
							<i class="fas fa-chevron-right burn-arrow"></i>
						</div>
					{/each}
				</div>
			</div>

			<!-- Active Campaigns -->
			<div class="card campaign-card">
				<div class="card-header">
					<h3><i class="fas fa-trophy"></i> Active Campaigns</h3>
					<a href="/burn/campaigns" class="link"><i class="fas fa-arrow-right"></i></a>
				</div>
				<div class="campaigns-list">
					{#if activeCampaigns.length > 0}
						{#each activeCampaigns.slice(0, 3) as campaign}
							<div class="campaign-preview" on:click={() => window.open('/burn/campaigns', '_blank')} on:keypress={() => {}}>
								<div class="campaign-badge">LIVE</div>
								<div class="campaign-info">
									<div class="campaign-name">{campaign.name}</div>
									<div class="campaign-meta">
										{#if campaign.participants}
											<span><i class="fas fa-users"></i> {campaign.participants}</span>
										{/if}
										{#if campaign.prizes && campaign.prizes.length > 0}
											<span><i class="fas fa-gift"></i> {campaign.prizes.length} prizes</span>
										{/if}
									</div>
								</div>
								<i class="fas fa-chevron-right campaign-arrow"></i>
							</div>
						{/each}
					{:else}
						<div class="no-campaigns">
							<i class="fas fa-calendar-times"></i>
							<p>No active campaigns</p>
							<a href="/burn/campaigns" class="view-all-link">View All Campaigns</a>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Burn Details Modal -->
{#if showBurnModal && selectedBurn}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-overlay" on:click={closeBurnModal}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h2><i class="fas fa-fire-alt"></i> Burn Transaction Details</h2>
				<button class="modal-close" on:click={closeBurnModal}>
					<i class="fas fa-times"></i>
				</button>
			</div>

			<div class="modal-body">
				<div class="detail-section">
					<div class="detail-label">Burner Address</div>
					<div class="detail-value address-value">
						{selectedBurn.burnerAddress}
						<a
							href={`https://explorer.ergoplatform.com/en/addresses/${selectedBurn.burnerAddress}`}
							target="_blank"
							rel="noopener noreferrer"
							class="external-link"
						>
							<i class="fas fa-external-link-alt"></i>
						</a>
					</div>
				</div>

				<div class="detail-section">
					<div class="detail-label">Transaction ID</div>
					<div class="detail-value address-value">
						{selectedBurn.txId}
						<a
							href={`https://explorer.ergoplatform.com/en/transactions/${selectedBurn.txId}`}
							target="_blank"
							rel="noopener noreferrer"
							class="external-link"
						>
							<i class="fas fa-external-link-alt"></i>
						</a>
					</div>
				</div>

				<div class="detail-row">
					<div class="detail-section">
						<div class="detail-label">Timestamp</div>
						<div class="detail-value">{formatFullTimestamp(selectedBurn.timestamp)}</div>
					</div>
					<div class="detail-section">
						<div class="detail-label">Block Height</div>
						<div class="detail-value">{selectedBurn.height.toLocaleString()}</div>
					</div>
				</div>

				<div class="detail-section">
					<div class="detail-label">Burned Tokens ({selectedBurn.burnedTokens.length})</div>
					<div class="tokens-grid">
						{#each selectedBurn.burnedTokens as token}
							<div class="token-detail">
								<div class="token-header">
									<span class="token-name">{token.name || 'Unknown Token'}</span>
									<span class="token-amount">{formatTokenAmount(token.amount, token.decimals)}</span>
								</div>
								<div class="token-id">
									{token.tokenId}
									<a
										href={`https://explorer.ergoplatform.com/en/token/${token.tokenId}`}
										target="_blank"
										rel="noopener noreferrer"
										class="external-link-small"
									>
										<i class="fas fa-external-link-alt"></i>
									</a>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<div class="modal-footer">
				<button class="modal-btn" on:click={closeBurnModal}>Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(body) {
		background: linear-gradient(135deg, #1a0a0a 0%, #2d1010 50%, #1a0a0a 100%);
		color: white;
		margin: 0;
		padding: 0;
		overflow-x: hidden;
	}

	.page-container {
		height: 100vh;
		padding: 0.75rem;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
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
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: auto auto 1fr;
		gap: 0.75rem;
		width: 100%;
		height: 100%;
	}

	/* Header Row */
	.header-row {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 12px;
	}

	.logo-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logo-section i {
		font-size: 2rem;
		color: #ff6b6b;
		filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.6));
	}

	.logo-text {
		display: flex;
		flex-direction: column;
	}

	.logo-title {
		font-size: 1.25rem;
		font-weight: 700;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		line-height: 1.2;
	}

	.logo-subtitle {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1;
	}

	.nav-links {
		display: flex;
		gap: 0.75rem;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: white;
		text-decoration: none;
		font-weight: 500;
		font-size: 0.85rem;
		transition: all 0.2s;
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 107, 107, 0.4);
		color: #ff6b6b;
	}

	.wallet-section {
		min-width: 150px;
	}

	/* Stats Row */
	.stats-row {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}

	.stat {
		text-align: center;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.2s;
	}

	.stat:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 107, 107, 0.3);
	}

	.stat i {
		color: #ff6b6b;
		font-size: 1.5rem;
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


	.card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1rem;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}


	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
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
		gap: 0.6rem;
		flex: 1;
		overflow-y: auto;
		min-height: 0;
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
	}

	.rank {
		min-width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.6);
		flex-shrink: 0;
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
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
	}

	/* Burns List */
	.burns-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.burn-preview {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.burn-preview:hover {
		background: rgba(255, 107, 107, 0.05);
		border-color: rgba(255, 107, 107, 0.3);
		transform: translateX(2px);
	}

	.burn-icon {
		color: #ff6b6b;
		font-size: 1.1rem;
		flex-shrink: 0;
		filter: drop-shadow(0 0 6px rgba(255, 107, 107, 0.6));
	}

	.burn-info {
		flex: 1;
		min-width: 0;
	}

	.burn-user {
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		margin-bottom: 0.2rem;
	}

	.burn-summary {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.burn-arrow {
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.8rem;
		flex-shrink: 0;
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

	/* Campaign Card */
	.campaigns-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.campaign-preview {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.campaign-preview:hover {
		background: rgba(255, 107, 107, 0.05);
		border-color: rgba(255, 107, 107, 0.3);
		transform: translateX(2px);
	}

	.campaign-badge {
		padding: 0.25rem 0.5rem;
		background: rgba(34, 197, 94, 0.2);
		border: 1px solid rgba(34, 197, 94, 0.3);
		border-radius: 4px;
		color: #22c55e;
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		flex-shrink: 0;
	}

	.campaign-info {
		flex: 1;
		min-width: 0;
	}

	.campaign-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: white;
		margin-bottom: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.campaign-meta {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.campaign-meta span {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.campaign-arrow {
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.8rem;
		flex-shrink: 0;
	}

	.no-campaigns {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		text-align: center;
		flex: 1;
	}

	.no-campaigns i {
		font-size: 2rem;
		color: rgba(255, 255, 255, 0.2);
		margin-bottom: 0.75rem;
	}

	.no-campaigns p {
		color: rgba(255, 255, 255, 0.5);
		margin: 0 0 1rem 0;
		font-size: 0.9rem;
	}

	.view-all-link {
		color: #ff6b6b;
		text-decoration: none;
		font-size: 0.85rem;
		font-weight: 600;
		transition: all 0.2s;
	}

	.view-all-link:hover {
		color: #ffaa00;
	}

	/* Modal Styles */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: linear-gradient(135deg, #1a0a0a 0%, #2d1010 100%);
		border: 1px solid rgba(255, 107, 107, 0.3);
		border-radius: 16px;
		max-width: 600px;
		width: 100%;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 60px rgba(255, 107, 107, 0.3);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		color: white;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.modal-header i {
		color: #ff6b6b;
	}

	.modal-close {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s;
	}

	.modal-close:hover {
		background: rgba(255, 107, 107, 0.2);
		border-color: rgba(255, 107, 107, 0.3);
		color: #ff6b6b;
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.detail-section {
		margin-bottom: 1.5rem;
	}

	.detail-section:last-child {
		margin-bottom: 0;
	}

	.detail-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 0.5rem;
		font-weight: 600;
	}

	.detail-value {
		font-size: 0.95rem;
		color: white;
		word-break: break-all;
	}

	.address-value {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		font-family: monospace;
		font-size: 0.85rem;
	}

	.external-link {
		color: #ff6b6b;
		text-decoration: none;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.external-link:hover {
		color: #ffaa00;
	}

	.detail-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.tokens-grid {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.token-detail {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
	}

	.token-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.token-name {
		font-weight: 600;
		color: white;
		font-size: 0.95rem;
	}

	.token-amount {
		color: #ff6b6b;
		font-weight: 700;
		font-size: 1rem;
	}

	.token-id {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		font-family: monospace;
		word-break: break-all;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.external-link-small {
		color: #ff6b6b;
		text-decoration: none;
		transition: all 0.2s;
		flex-shrink: 0;
		font-size: 0.7rem;
	}

	.external-link-small:hover {
		color: #ffaa00;
	}

	.modal-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		display: flex;
		justify-content: flex-end;
	}

	.modal-btn {
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.modal-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
	}

	@media (max-width: 1200px) {
		.content-grid {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: auto auto 1fr 1fr;
		}

		.header-row {
			flex-wrap: wrap;
			gap: 1rem;
			justify-content: center;
		}

		.logo-section {
			width: 100%;
			justify-content: center;
		}

		.nav-links {
			order: 3;
		}

		.wallet-section {
			order: 2;
		}

	}

	@media (max-width: 768px) {
		.page-container {
			padding: 0.5rem;
		}

		.content-grid {
			grid-template-columns: 1fr;
			gap: 0.5rem;
			grid-template-rows: auto auto repeat(4, 1fr);
		}

		.header-row {
			padding: 0.75rem;
		}

		.logo-title {
			font-size: 1.1rem;
		}

		.stats-row {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.nav-links {
			width: 100%;
		}

		.nav-btn {
			flex: 1;
			justify-content: center;
		}

		.wallet-section {
			width: 100%;
		}

		.modal-content {
			max-height: 95vh;
		}

		.modal-header {
			padding: 1rem;
		}

		.modal-body {
			padding: 1rem;
		}

		.detail-row {
			grid-template-columns: 1fr;
			gap: 0.75rem;
		}
	}
</style>
