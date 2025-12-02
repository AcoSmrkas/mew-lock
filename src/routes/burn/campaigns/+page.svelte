<script lang="ts">
	import { onMount } from 'svelte';
	import {
		getAllCampaigns,
		getActiveCampaigns,
		getUpcomingCampaigns,
		getEndedCampaigns,
		type BurnCampaign
	} from '$lib/api-explorer/burnCampaigns';

	let campaigns: BurnCampaign[] = [];
	let filter: 'all' | 'active' | 'upcoming' | 'ended' = 'all';

	onMount(() => {
		loadCampaigns();
	});

	function loadCampaigns() {
		campaigns = getAllCampaigns();
	}

	$: filteredCampaigns = (() => {
		switch (filter) {
			case 'active':
				return getActiveCampaigns();
			case 'upcoming':
				return getUpcomingCampaigns();
			case 'ended':
				return getEndedCampaigns();
			default:
				return campaigns;
		}
	})();

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getDaysRemaining(endDate: number): number {
		const now = Date.now();
		const diff = endDate - now;
		return Math.ceil(diff / (1000 * 60 * 60 * 24));
	}

	function getDaysUntilStart(startDate: number): number {
		const now = Date.now();
		const diff = startDate - now;
		return Math.ceil(diff / (1000 * 60 * 60 * 24));
	}

	function getStatusBadgeClass(status: BurnCampaign['status']): string {
		switch (status) {
			case 'active':
				return 'status-active';
			case 'upcoming':
				return 'status-upcoming';
			case 'ended':
				return 'status-ended';
		}
	}

	function getStatusText(campaign: BurnCampaign): string {
		switch (campaign.status) {
			case 'active':
				const daysLeft = getDaysRemaining(campaign.endDate);
				return daysLeft > 0 ? `${daysLeft} days left` : 'Ending soon';
			case 'upcoming':
				const daysUntil = getDaysUntilStart(campaign.startDate);
				return `Starts in ${daysUntil} days`;
			case 'ended':
				return 'Ended';
		}
	}
</script>

<svelte:head>
	<title>Burn Campaigns - MewLock</title>
</svelte:head>

<div class="campaigns-page">
	<!-- Header -->
	<div class="page-header">
		<h1>🏆 Burn Campaigns</h1>
		<p class="subtitle">Compete in burn contests and win prizes</p>
	</div>

	<!-- Filters -->
	<div class="filters">
		<button class="filter-btn" class:active={filter === 'all'} on:click={() => (filter = 'all')}>
			All ({campaigns.length})
		</button>
		<button
			class="filter-btn"
			class:active={filter === 'active'}
			on:click={() => (filter = 'active')}
		>
			Active ({getActiveCampaigns().length})
		</button>
		<button
			class="filter-btn"
			class:active={filter === 'upcoming'}
			on:click={() => (filter = 'upcoming')}
		>
			Upcoming ({getUpcomingCampaigns().length})
		</button>
		<button
			class="filter-btn"
			class:active={filter === 'ended'}
			on:click={() => (filter = 'ended')}
		>
			Ended ({getEndedCampaigns().length})
		</button>
	</div>

	<!-- Campaigns Grid -->
	<div class="campaigns-grid">
		{#each filteredCampaigns as campaign}
			<div class="campaign-card" class:ended={campaign.status === 'ended'}>
				<!-- Status Badge -->
				<div class="status-badge {getStatusBadgeClass(campaign.status)}">
					{getStatusText(campaign)}
				</div>

				<!-- Campaign Header -->
				<div class="campaign-header">
					<h2>{campaign.name}</h2>
					<p class="description">{campaign.description}</p>
				</div>

				<!-- Campaign Dates -->
				<div class="campaign-dates">
					<div class="date-item">
						<span class="date-label">Start:</span>
						<span class="date-value">{formatDate(campaign.startDate)}</span>
					</div>
					<div class="date-item">
						<span class="date-label">End:</span>
						<span class="date-value">{formatDate(campaign.endDate)}</span>
					</div>
				</div>

				<!-- Target Info (if applicable) -->
				{#if campaign.targetToken}
					<div class="target-info">
						<span class="target-label">🎯 Target Token:</span>
						<span class="target-value">Specific token required</span>
					</div>
				{/if}

				{#if campaign.targetAmount}
					<div class="target-info">
						<span class="target-label">🎯 Target Amount:</span>
						<span class="target-value">{campaign.targetAmount.toLocaleString()}</span>
					</div>
				{/if}

				<!-- Stats -->
				{#if campaign.participants !== undefined || campaign.totalBurned !== undefined}
					<div class="campaign-stats">
						{#if campaign.participants !== undefined}
							<div class="stat">
								<div class="stat-value">{campaign.participants}</div>
								<div class="stat-label">Participants</div>
							</div>
						{/if}
						{#if campaign.totalBurned !== undefined}
							<div class="stat">
								<div class="stat-value">{campaign.totalBurned.toLocaleString()}</div>
								<div class="stat-label">Total Burned</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Prizes -->
				{#if campaign.prizes && campaign.prizes.length > 0}
					<div class="prizes-section">
						<h3>🏆 Prizes</h3>
						<div class="prizes-list">
							{#each campaign.prizes.slice(0, 3) as prize}
								<div class="prize-item">
									<span class="prize-rank">#{prize.rank}</span>
									<span class="prize-desc">{prize.description}</span>
								</div>
							{/each}
							{#if campaign.prizes.length > 3}
								<div class="more-prizes">+{campaign.prizes.length - 3} more prizes</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Rules Preview -->
				{#if campaign.rules && campaign.rules.length > 0}
					<div class="rules-preview">
						<h3>📋 Rules</h3>
						<ul>
							{#each campaign.rules.slice(0, 2) as rule}
								<li>{rule}</li>
							{/each}
							{#if campaign.rules.length > 2}
								<li class="more-rules">+{campaign.rules.length - 2} more rules</li>
							{/if}
						</ul>
					</div>
				{/if}

				<!-- Action Button -->
				<div class="campaign-actions">
					{#if campaign.status === 'active'}
						<a href="/burn" class="action-btn primary">
							Join Campaign →
						</a>
					{:else if campaign.status === 'upcoming'}
						<button class="action-btn secondary" disabled>
							Coming Soon
						</button>
					{:else}
						<a href="/burn" class="action-btn secondary">
							View Results
						</a>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if filteredCampaigns.length === 0}
		<div class="empty-state">
			<p>No campaigns found in this category.</p>
		</div>
	{/if}
</div>

<style>
	.campaigns-page {
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

	.filters {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.filter-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
		padding: 0.75rem 1.5rem;
		border-radius: 20px;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s;
	}

	.filter-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.filter-btn.active {
		background: rgba(255, 107, 107, 0.2);
		border-color: #ff6b6b;
		color: #ff6b6b;
	}

	.campaigns-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 2rem;
	}

	.campaign-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
		position: relative;
		transition: all 0.3s;
	}

	.campaign-card:hover {
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-4px);
		box-shadow: 0 8px 25px rgba(255, 107, 107, 0.2);
	}

	.campaign-card.ended {
		opacity: 0.7;
	}

	.status-badge {
		position: absolute;
		top: 1rem;
		right: 1rem;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.status-active {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.status-upcoming {
		background: rgba(59, 130, 246, 0.2);
		color: #3b82f6;
		border: 1px solid rgba(59, 130, 246, 0.3);
	}

	.status-ended {
		background: rgba(107, 114, 128, 0.2);
		color: #9ca3af;
		border: 1px solid rgba(107, 114, 128, 0.3);
	}

	.campaign-header {
		margin-bottom: 1.5rem;
		padding-right: 8rem;
	}

	.campaign-header h2 {
		color: white;
		font-size: 1.5rem;
		margin: 0 0 0.5rem 0;
	}

	.description {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.95rem;
		line-height: 1.5;
		margin: 0;
	}

	.campaign-dates {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.date-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.date-label {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.date-value {
		color: white;
		font-weight: 600;
	}

	.target-info {
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 8px;
		padding: 0.75rem;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.target-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
	}

	.target-value {
		color: #ff6b6b;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.campaign-stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.stat {
		text-align: center;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 8px;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: #ff6b6b;
		margin-bottom: 0.25rem;
	}

	.stat-label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.prizes-section,
	.rules-preview {
		margin-bottom: 1.5rem;
	}

	.prizes-section h3,
	.rules-preview h3 {
		color: white;
		font-size: 1rem;
		margin: 0 0 0.75rem 0;
	}

	.prizes-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.prize-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 6px;
	}

	.prize-rank {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-weight: 700;
		font-size: 0.75rem;
	}

	.prize-desc {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
	}

	.more-prizes {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
		font-style: italic;
		padding: 0.5rem;
		text-align: center;
	}

	.rules-preview ul {
		margin: 0;
		padding-left: 1.5rem;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		line-height: 1.6;
	}

	.more-rules {
		color: rgba(255, 255, 255, 0.5);
		font-style: italic;
	}

	.campaign-actions {
		margin-top: 1.5rem;
	}

	.action-btn {
		display: block;
		width: 100%;
		padding: 1rem;
		border: none;
		border-radius: 10px;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
		text-align: center;
		text-decoration: none;
	}

	.action-btn.primary {
		background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
		color: white;
	}

	.action-btn.primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(255, 107, 107, 0.3);
	}

	.action-btn.secondary {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.7);
	}

	.action-btn.secondary:not(:disabled):hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: rgba(255, 255, 255, 0.6);
	}

	@media (max-width: 768px) {
		.campaigns-page {
			padding: 1rem;
		}

		.page-header h1 {
			font-size: 2rem;
		}

		.campaigns-grid {
			grid-template-columns: 1fr;
		}

		.filters {
			justify-content: center;
		}
	}
</style>
