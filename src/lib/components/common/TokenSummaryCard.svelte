<script lang="ts">
	import { nFormatter, getImageUrl, setPlaceholderImage } from '$lib/utils/utils.js';
	import { showNsfw } from '$lib/store/store.ts';

	export let tokenId = null; // null for ERG, tokenId for tokens
	export let tokenName = 'ERG';
	export let totalAmount = 0;
	export let decimals = 9;
	export let asset = null; // for token image
	export let isStatCard = false; // for stat cards
	export let statType = null; // 'locks', 'users', 'ready'
	export let icon = null; // SVG path for stat cards

	// Format amount based on decimals
	$: formattedAmount = isStatCard ? nFormatter(totalAmount) : (tokenId ? nFormatter(totalAmount / Math.pow(10, decimals)) : nFormatter(totalAmount / 1e9));

	// Get token image URL using the same logic as SellWidget
	function getTokenImageUrl(asset) {
		return getImageUrl(asset, $showNsfw);
	}
</script>

{#if isStatCard}
	<!-- Stat Card Layout -->
	<div class="stat-card">
		<div class="stat-content">
			<div class="stat-value">{formattedAmount}</div>
			<div class="stat-label">{tokenName}</div>
		</div>
	</div>
{:else}
	<!-- Token Card Layout -->
	<div class="token-summary-card">
		<div class="token-info">
			<div class="token-image">
				{#if tokenId && asset}
					<img
						src={getTokenImageUrl(asset)}
						alt={tokenName}
						onerror={(event) => setPlaceholderImage(event, asset)}
						loading="lazy"
					/>
				{:else}
					<!-- ERG Icon -->
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
					</svg>
				{/if}
			</div>
			
			<div class="token-details">
				<div class="token-amount">{formattedAmount}</div>
				<div class="token-label">{tokenName} Locked</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.token-summary-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 1rem;
		transition: all 0.3s ease;
		backdrop-filter: blur(10px);
		min-width: 160px;
		height: 90px;
		display: flex;
		align-items: center;
	}

	.token-summary-card:hover {
		transform: translateY(-2px);
		border-color: rgba(102, 126, 234, 0.3);
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
	}

	.token-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.token-image {
		width: 36px;
		height: 36px;
		border-radius: 8px;
		overflow: hidden;
		background: rgba(102, 126, 234, 0.1);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #667eea;
	}

	.token-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.token-details {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.token-amount {
		font-size: 1.25rem;
		font-weight: 700;
		color: white;
		line-height: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.token-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Stat Card Styles */
	.stat-card {
		background: transparent;
		border: none;
		padding: 0;
		min-width: auto;
		height: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stat-card .stat-content {
		text-align: center;
	}

	.stat-card .stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.9);
		line-height: 1;
		margin-bottom: 0.25rem;
	}

	.stat-card .stat-label {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.token-summary-card {
			padding: 0.75rem;
			min-width: 140px;
			height: 80px;
		}

		.token-image {
			width: 32px;
			height: 32px;
		}

		.token-amount {
			font-size: 1.1rem;
		}

		.token-label {
			font-size: 0.7rem;
		}

		.stat-card .stat-value {
			font-size: 1.25rem;
		}

		.stat-card .stat-label {
			font-size: 0.7rem;
		}
	}
</style>