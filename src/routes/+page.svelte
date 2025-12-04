<script lang="ts">
	import { onMount } from 'svelte';
	import { nFormatter } from '$lib/utils/utils.js';
	import WalletButton from '$lib/components/nav/WalletButton.svelte';
	import BurnModal from '$lib/components/common/BurnModal.svelte';
	import { fetchAllBurnTransactions, clearBurnCache, type BurnStats, type BurnTransaction } from '$lib/api-explorer/burnTracker';
	import { connected_wallet_address } from '$lib/store/store';

	let loading = true;
	let stats: BurnStats | null = null;
	let recentBurns: BurnTransaction[] = [];
	let selectedBurn: BurnTransaction | null = null;
	let showBurnModal = false;
	let showBurnTokensModal = false;
	let refreshing = false;
	let fakuBalance: number | null = null;
	let loadingFakuBalance = false;
	const FAKU_TOKEN_ID = 'f0cac602d618081f46db086726d3c4da53006b646b50e382989054dcf3c93bd8';
	let preselectedTokenId: string | null = null;

	onMount(async () => {
		await loadBurnData();
	});

	// Watch for wallet address changes to load FAKU balance
	$: if ($connected_wallet_address) {
		loadFakuBalance($connected_wallet_address);
	} else {
		fakuBalance = null;
	}

	async function loadFakuBalance(address: string) {
		if (!address || loadingFakuBalance) return;
		loadingFakuBalance = true;
		try {
			const response = await fetch(`https://api.ergoplatform.com/api/v1/addresses/${address}/balance/confirmed`);
			if (response.ok) {
				const data = await response.json();
				const fakuToken = data.tokens?.find((t: any) => t.tokenId === FAKU_TOKEN_ID);
				if (fakuToken) {
					// Fetch token info to get decimals
					const tokenInfoResponse = await fetch(`https://api.ergexplorer.com/tokens/byId`, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ ids: [FAKU_TOKEN_ID] })
					});
					if (tokenInfoResponse.ok) {
						const tokenInfoData = await tokenInfoResponse.json();
						const tokenInfo = tokenInfoData.items?.[0];
						const decimals = tokenInfo?.decimals || 0;
						fakuBalance = Number(fakuToken.amount) / Math.pow(10, decimals);
					} else {
						// Fallback: assume 0 decimals
						fakuBalance = Number(fakuToken.amount);
					}
				} else {
					fakuBalance = 0;
				}
			}
		} catch (error) {
			console.error('Error loading FAKU balance:', error);
			fakuBalance = null;
		} finally {
			loadingFakuBalance = false;
		}
	}

	async function loadBurnData() {
		loading = true;
		try {
			// Fetch burns (limited to last 500 transactions for faster load)
			console.log('Starting to fetch burn transactions...');
			const allBurns = await fetchAllBurnTransactions(false, 500);
			console.log(`Fetched ${allBurns.items.length} total burns`);

			// Get recent 10 burns for display
			recentBurns = allBurns.items.slice(0, 10);
			console.log(`Recent burns: ${recentBurns.length}`);

			// Calculate stats from all burns
			stats = calculateBurnStatsFromBurns(allBurns.items);
			console.log('Calculated stats:', stats);
		} catch (error) {
			console.error('Error loading burn data:', error);
			// Set empty stats on error to prevent UI from breaking
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

	async function refreshData() {
		if (refreshing) return;
		refreshing = true;
		try {
			clearBurnCache();
			await loadBurnData();
		} finally {
			refreshing = false;
		}
	}

	function openBurnTokensModal() {
		preselectedTokenId = null;
		showBurnTokensModal = true;
	}

	function openBurnFakuModal() {
		preselectedTokenId = FAKU_TOKEN_ID;
		showBurnTokensModal = true;
	}

	function handleBurnSuccess() {
		// Refresh data after successful burn
		refreshData();
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

				<div class="nav-right-section">
					<!-- Desktop Navigation - Icons Only -->
					<div class="nav-links desktop-nav">
						<button class="nav-btn burn-btn" on:click={openBurnTokensModal} title="Burn Tokens">
							<span class="emoji-icon">🔥</span>
							<span class="btn-text">Burn</span>
						</button>
						<a href="/burn" class="nav-btn" title="Leaderboards">
							<i class="fas fa-trophy"></i>
						</a>
						<a href="/burn/campaigns" class="nav-btn" title="Campaigns">
							<i class="fas fa-flag-checkered"></i>
						</a>
						<button class="nav-btn refresh-btn" on:click={refreshData} disabled={refreshing} title="Refresh Data">
							<i class="fas fa-sync-alt" class:spinning={refreshing}></i>
						</button>
					</div>

					<div class="wallet-section">
						<WalletButton />
					</div>
				</div>
			</div>

			<!-- Hero Section with Stats -->
			<div class="hero-section">
				<div class="hero-content">
					<div class="hero-main">
						<div class="hero-icon">🔥</div>
						<div class="hero-text">
							<h1 class="hero-title">Burn Tracker</h1>
							<p class="hero-subtitle">Track burns, compete, and climb the leaderboards</p>
						</div>
					</div>
					<div class="hero-stats">
						<div class="hero-stat">
							<span class="stat-icon">🔥</span>
							<div class="stat-value">{stats.totalBurns.toLocaleString()}</div>
							<div class="stat-label">Burns</div>
						</div>
						<div class="hero-stat">
							<i class="fas fa-users stat-icon"></i>
							<div class="stat-value">{stats.uniqueBurners.toLocaleString()}</div>
							<div class="stat-label">Burners</div>
						</div>
						<div class="hero-stat">
							<i class="fas fa-coins stat-icon"></i>
							<div class="stat-value">{stats.topBurnedTokens.length}</div>
							<div class="stat-label">Tokens</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Top Burners -->
			<div class="card">
				<div class="card-header">
					<h3><span class="emoji-icon">🔥</span> Top Burners</h3>
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
							<span class="burn-icon">🔥</span>
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

			<!-- Christmas Campaign -->
			<div class="card campaign-card">
				<div class="campaign-badge">
					<span class="badge-live">🎄 LIVE</span>
				</div>
				<div class="card-header campaign-header">
					<h3><span class="campaign-title">🎅 Christmas FAKU Burn</span></h3>
				</div>
				<div class="campaign-content">
					{#if $connected_wallet_address && fakuBalance !== null}
						<div class="balance-display">
							<span class="balance-label">Your Balance:</span>
							<span class="balance-value">{nFormatter(fakuBalance)} FAKU</span>
						</div>
					{/if}
					<div class="campaign-reward">
						<div class="reward-label">Bonus Reward</div>
						<div class="reward-value">+0.5%</div>
						<div class="reward-desc">Extra FAKU returned</div>
					</div>
					<div class="campaign-example">
						<div class="example-row">
							<span class="example-label">You burn:</span>
							<span class="example-value">100 FAKU</span>
						</div>
						<div class="example-arrow">↓</div>
						<div class="example-row highlight">
							<span class="example-label">You get:</span>
							<span class="example-value">100.5 FAKU</span>
						</div>
					</div>
					<button class="campaign-btn" on:click={openBurnFakuModal}>
						<span class="emoji-icon">🔥</span>
						Burn FAKU Now
					</button>
				</div>
			</div>

			</div>
	{/if}
</div>

<!-- Mobile Bottom Navigation -->
<nav class="bottom-nav mobile-only">
	<a href="/" class="bottom-nav-item active">
		<i class="fas fa-home"></i>
		<span>Home</span>
	</a>
	<a href="/burn" class="bottom-nav-item">
		<i class="fas fa-trophy"></i>
		<span>Ranks</span>
	</a>
	<button class="bottom-nav-item burn-item" on:click={openBurnTokensModal}>
		<span class="emoji-icon">🔥</span>
		<span>Burn</span>
	</button>
	<a href="/activity" class="bottom-nav-item">
		<i class="fas fa-chart-line"></i>
		<span>Activity</span>
	</a>
</nav>

<!-- Burn Details Modal -->
{#if showBurnModal && selectedBurn}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-overlay" on:click={closeBurnModal}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-content" on:click|stopPropagation>
			<div class="modal-header">
				<h2><span class="emoji-icon">🔥</span> Burn Transaction Details</h2>
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

<!-- Burn Tokens Modal -->
<BurnModal bind:showModal={showBurnTokensModal} bind:preselectedTokenId onSuccess={handleBurnSuccess} />

<style>
	:global(body) {
		background: #000000;
		color: white;
		margin: 0;
		padding: 0;
		overflow-x: hidden;
		padding-top: 0 !important;
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

	:global(body > *) {
		position: relative;
		z-index: 1;
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
		padding: 0.75rem 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 12px;
		gap: 1rem;
	}

	/* Hero Section with Stats */
	.hero-section {
		grid-column: 1 / -1;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 16px;
		padding: 2rem;
		position: relative;
		overflow: hidden;
	}

	.hero-section::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: radial-gradient(ellipse at center, rgba(255, 107, 107, 0.1) 0%, transparent 70%);
		pointer-events: none;
	}

	.hero-content {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 2rem;
		align-items: center;
	}

	.hero-main {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.hero-icon {
		font-size: 5rem;
		filter: drop-shadow(0 0 20px rgba(255, 107, 107, 0.8));
		animation: flameFlicker 3s ease-in-out infinite;
		flex-shrink: 0;
	}

	@keyframes flameFlicker {
		0%, 100% {
			transform: scale(1) rotate(0deg);
			filter: drop-shadow(0 0 20px rgba(255, 107, 107, 0.8));
		}
		25% {
			transform: scale(1.05) rotate(2deg);
			filter: drop-shadow(0 0 25px rgba(255, 107, 107, 0.9));
		}
		50% {
			transform: scale(0.98) rotate(-2deg);
			filter: drop-shadow(0 0 18px rgba(255, 107, 107, 0.7));
		}
		75% {
			transform: scale(1.03) rotate(1deg);
			filter: drop-shadow(0 0 22px rgba(255, 107, 107, 0.85));
		}
	}

	.hero-text {
		flex: 1;
		min-width: 0;
	}

	.hero-title {
		font-size: 3rem;
		font-weight: 800;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0;
		line-height: 1.2;
	}

	.hero-subtitle {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0.5rem 0 0 0;
	}

	.hero-stats {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.hero-stat {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		transition: all 0.2s;
	}

	.hero-stat:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 107, 107, 0.3);
		transform: translateX(4px);
	}

	.hero-stat .stat-icon {
		font-size: 1.25rem;
		color: #ff6b6b;
		filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.4));
		width: 24px;
		text-align: center;
	}

	.hero-stat .stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: #ff6b6b;
		min-width: 60px;
	}

	.hero-stat .stat-label {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		flex: 1;
	}

	.logo-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.nav-right-section {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
		justify-content: flex-end;
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
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		min-width: 48px;
		height: 48px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		color: white;
		text-decoration: none;
		font-weight: 500;
		font-size: 1.1rem;
		transition: all 0.2s;
		cursor: pointer;
		position: relative;
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 107, 107, 0.4);
		color: #ff6b6b;
		transform: translateY(-2px);
	}

	.nav-btn i {
		font-size: 1.1rem;
	}

	.emoji-icon {
		font-size: 1.2rem;
		display: inline-block;
	}

	.stat-emoji {
		font-size: 1.5rem;
		display: block;
		margin-bottom: 0.5rem;
		filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.6));
	}

	.burn-btn {
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%) !important;
		border: 2px solid rgba(255, 107, 107, 0.6) !important;
		color: white !important;
		box-shadow: 0 4px 16px rgba(255, 107, 107, 0.4), 0 0 20px rgba(255, 107, 107, 0.3);
		padding: 0.75rem 1.5rem;
		gap: 0.75rem;
		min-width: auto;
		animation: pulse 2s ease-in-out infinite;
	}

	.burn-btn .btn-text {
		font-size: 0.95rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.burn-btn i {
		font-size: 1.2rem;
		filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.5));
	}

	.burn-btn:hover {
		transform: translateY(-3px) scale(1.05);
		box-shadow: 0 6px 24px rgba(255, 107, 107, 0.6), 0 0 30px rgba(255, 107, 107, 0.4);
		background: linear-gradient(135deg, #ffaa00 0%, #ff6b6b 100%) !important;
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 4px 16px rgba(255, 107, 107, 0.4), 0 0 20px rgba(255, 107, 107, 0.3);
		}
		50% {
			box-shadow: 0 4px 20px rgba(255, 107, 107, 0.6), 0 0 30px rgba(255, 107, 107, 0.5);
		}
	}

	.refresh-btn {
		cursor: pointer;
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinning {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.wallet-section {
		min-width: 150px;
	}

	/* Desktop/Mobile Toggle */
	.desktop-nav {
		display: flex;
	}

	.mobile-only {
		display: none !important;
	}

	@media (min-width: 769px) {
		.mobile-only {
			display: none !important;
		}
	}

	/* Mobile Bottom Navigation */
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
		justify-content: center;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.7rem;
		font-weight: 500;
		transition: all 0.2s;
		cursor: pointer;
		background: transparent;
		border: none;
		min-width: 60px;
	}

	.bottom-nav-item i {
		font-size: 1.25rem;
		transition: all 0.2s;
	}

	.bottom-nav-item span {
		transition: all 0.2s;
	}

	.bottom-nav-item:hover,
	.bottom-nav-item.active {
		color: #ff6b6b;
	}

	.bottom-nav-item:hover i,
	.bottom-nav-item.active i {
		transform: translateY(-2px);
		filter: drop-shadow(0 0 8px rgba(255, 107, 107, 0.6));
	}

	.bottom-nav-item.burn-item {
		color: white;
		position: relative;
	}

	.bottom-nav-item.burn-item .emoji-icon {
		font-size: 1.5rem;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		padding: 0.75rem;
		border-radius: 50%;
		box-shadow: 0 4px 16px rgba(255, 107, 107, 0.4);
		animation: pulse 2s ease-in-out infinite;
	}

	.bottom-nav-item.burn-item:hover .emoji-icon {
		transform: translateY(-4px) scale(1.1);
		box-shadow: 0 6px 24px rgba(255, 107, 107, 0.6);
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

	.stat i,
	.stat .stat-emoji {
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
		max-height: 400px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Campaign Card */
	.campaign-card {
		position: relative;
		background: linear-gradient(135deg, rgba(255, 107, 107, 0.1) 0%, rgba(255, 170, 0, 0.1) 100%);
		border: 2px solid rgba(255, 107, 107, 0.3);
		max-height: 400px;
		overflow: hidden;
	}

	.campaign-badge {
		position: absolute;
		top: -12px;
		right: 1rem;
		z-index: 2;
	}

	.badge-live {
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		color: white;
		padding: 0.4rem 1rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		box-shadow: 0 4px 12px rgba(255, 107, 107, 0.4);
		animation: pulse 2s ease-in-out infinite;
	}

	.campaign-header {
		border-bottom: none;
		margin-bottom: 1rem;
		padding-bottom: 0;
	}

	.campaign-title {
		font-size: 1.1rem;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.campaign-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.balance-display {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
	}

	.balance-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.balance-value {
		font-size: 0.85rem;
		font-weight: 700;
		color: #ff6b6b;
	}

	.campaign-reward {
		text-align: center;
		padding: 0.5rem;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 8px;
	}

	.reward-label {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 0.15rem;
	}

	.reward-value {
		font-size: 1.8rem;
		font-weight: 800;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 0.15rem;
		line-height: 1.2;
	}

	.reward-desc {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.7);
	}

	.campaign-example {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.5rem;
	}

	.example-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0.5rem;
	}

	.example-row.highlight {
		background: rgba(255, 107, 107, 0.15);
		border-radius: 6px;
	}

	.example-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.example-value {
		font-size: 0.8rem;
		font-weight: 700;
		color: #ff6b6b;
	}

	.example-arrow {
		text-align: center;
		font-size: 1.2rem;
		color: #ff6b6b;
		margin: 0.15rem 0;
	}

	.campaign-btn {
		width: 100%;
		padding: 0.75rem;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.3s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.campaign-btn:hover {
		background: linear-gradient(135deg, #ffaa00 0%, #ff6b6b 100%);
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(255, 107, 107, 0.5);
	}

	.campaign-btn .emoji-icon {
		font-size: 1rem;
		filter: none;
	}

	.campaign-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.campaign-footer i {
		color: #ff6b6b;
		font-size: 0.7rem;
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
		font-size: 1.1rem;
		flex-shrink: 0;
		filter: drop-shadow(0 0 6px rgba(255, 107, 107, 0.6));
		display: inline-block;
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
			flex-direction: column;
			gap: 1rem;
		}

		.logo-section {
			width: 100%;
			justify-content: center;
		}

		.nav-right-section {
			width: 100%;
			flex-direction: column;
			gap: 1rem;
		}

		.nav-links {
			width: 100%;
			justify-content: center;
		}

		.wallet-section {
			width: 100%;
			display: flex;
			justify-content: center;
		}
	}

	@media (max-width: 768px) {
		.page-container {
			padding: 0.5rem;
			padding-bottom: 80px; /* Space for bottom nav */
			width: 100%;
		}

		.content-grid {
			grid-template-columns: 1fr;
			gap: 0.5rem;
			grid-template-rows: auto auto auto auto auto auto;
			min-height: auto;
		}

		.header-row {
			padding: 0.75rem;
			flex-direction: row;
		}

		.logo-section {
			width: auto;
			justify-content: flex-start;
		}

		.logo-title {
			font-size: 1.1rem;
		}

		.logo-subtitle {
			font-size: 0.7rem;
		}

		.hero-section {
			padding: 1rem;
		}

		.hero-content {
			grid-template-columns: 1fr;
			gap: 1.25rem;
		}

		.hero-main {
			flex-direction: column;
			align-items: flex-start;
			gap: 1rem;
		}

		.hero-icon {
			font-size: 3.5rem;
		}

		.hero-title {
			font-size: 1.75rem;
		}

		.hero-subtitle {
			font-size: 0.85rem;
		}

		.hero-stats {
			gap: 0.6rem;
		}

		.hero-stat {
			padding: 0.6rem 0.75rem;
		}

		.hero-stat .stat-icon {
			font-size: 1.1rem;
			width: 20px;
		}

		.hero-stat .stat-value {
			font-size: 1.1rem;
			min-width: 50px;
		}

		.hero-stat .stat-label {
			font-size: 0.7rem;
		}

		/* Hide desktop nav, show bottom nav */
		.desktop-nav {
			display: none !important;
		}

		.mobile-only {
			display: flex !important;
		}

		.nav-right-section {
			flex-direction: row;
			gap: 0.75rem;
			width: auto;
		}

		.wallet-section {
			width: auto;
			min-width: auto;
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

		.card {
			padding: 0.75rem;
		}

		.card-header h3 {
			font-size: 0.9rem;
		}

		.stat {
			padding: 0.75rem;
		}

		.stat-value {
			font-size: 1.5rem;
		}

		.stat-label {
			font-size: 0.7rem;
		}

		.logo-icon i {
			font-size: 1.75rem;
		}

		.hero-section {
			padding: 2rem 1rem;
		}

		.hero-icon {
			font-size: 3.5rem;
		}

		.hero-title {
			font-size: 2.5rem;
		}

		.hero-subtitle {
			font-size: 0.95rem;
		}
	}

	/* Extra small screens */
	@media (max-width: 480px) {
		.page-container {
			padding: 0.375rem;
		}

		.content-grid {
			gap: 0.375rem;
		}

		.header-row {
			padding: 0.5rem;
		}

		.logo-title {
			font-size: 1rem;
		}

		.logo-subtitle {
			font-size: 0.65rem;
		}

		.logo-icon i {
			font-size: 1.5rem;
		}

		.stat {
			padding: 0.5rem;
		}

		.stat-value {
			font-size: 1.25rem;
		}

		.stat-label {
			font-size: 0.65rem;
		}

		.card {
			padding: 0.5rem;
		}

		.card-header {
			margin-bottom: 0.5rem;
			padding-bottom: 0.5rem;
		}

		.card-header h3 {
			font-size: 0.85rem;
		}

		.hamburger-btn, .wallet-section {
			flex-shrink: 0;
		}

		.hero-icon {
			font-size: 3rem;
		}

		.hero-title {
			font-size: 2rem;
		}

		.hero-subtitle {
			font-size: 0.85rem;
		}
	}
</style>
