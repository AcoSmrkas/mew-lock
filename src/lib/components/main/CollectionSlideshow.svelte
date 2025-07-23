<script>
	import { onMount } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { writable } from 'svelte/store';
	import { nFormatter } from '$lib/utils/utils.js';
	import { EE_API } from '$lib/common/const.ts';

	// Store for ERG price
	const ergPrice = writable(0);
	const ergPriceLoading = writable(true);

	// Collection data
	let collections = [];
	let topCollections = [];
	let loading = true;
	let error = null;

	// For animations
	let isVisible = false;

	// Number of collections to display
	const displayCount = 10; // Changed this to ensure 10 collections are shown

	// Fetch ERG price from API
	async function fetchErgPrice() {
		try {
			ergPriceLoading.set(true);
			const response = await fetch(`${EE_API}tokens/getErgPrice`);
			const data = await response.json();

			if (data.items && data.items.length > 0) {
				const price = parseFloat(data.items[0].value);
				ergPrice.set(price);
				console.log('Current ERG price:', price);
			} else {
				console.error('ERG price data not found or invalid format');
			}
		} catch (err) {
			console.error(`Error fetching ERG price: ${err.message}`);
		} finally {
			ergPriceLoading.set(false);
		}
	}

	// Fetch collections from API
	async function fetchCollections() {
		try {
			loading = true;

			// First fetch ERG price
			await fetchErgPrice();

			const response = await fetch('https://api.mewfinance.com/mart/getConfig?mart=merch');
			const data = await response.json();

			if (data.collections && Array.isArray(data.collections)) {
				collections = data.collections;
				console.log('Loaded collections:', collections.length);

				// Once we have collections, fetch stats for each
				await fetchCollectionsStats();
			} else {
				error = 'Collections data not found or invalid format';
				loading = false;
			}
		} catch (err) {
			error = `Error fetching collections: ${err.message}`;
			loading = false;
		}
	}

	// Fetch stats for each collection
	async function fetchCollectionsStats() {
		try {
			// Get stats for collections (increased from 15 to 20 for better chances of finding 10 with stats)
			const collectionsToFetch = collections.slice(0, 20);
			const statsPromises = collectionsToFetch.map(async (collection, index) => {
				try {
					const response = await fetch(
						`https://api.mewfinance.com/mart/getCollectionStats?collectionId=${collection.tokenid}`
					);
					const stats = await response.json();

					// Calculate trade volume (total of sold items)
					const tradeVolume = stats.totalSold?.total_usd || 0;

					return {
						...collection,
						stats,
						tradeVolume,
						listedCount: stats.totalListed?.count || 0,
						listedVolume: stats.totalListed?.total_usd || 0,
						soldCount: stats.totalSold?.count || 0,
						floorPrice: stats.floor_price_usd || 0,
						lastSale: stats.lastSale || null,
						latestListing: stats.latestListing || null,
						// Determine if this collection has meaningful stats (relaxed criteria)
						hasStats: true // Always include collections, even with zero stats
					};
				} catch (err) {
					console.error(`Error fetching stats for collection ${collection.name}:`, err);
					return {
						...collection,
						stats: null,
						tradeVolume: 0,
						listedCount: 0,
						listedVolume: 0,
						soldCount: 0,
						floorPrice: 0,
						lastSale: null,
						latestListing: null,
						hasStats: true // Include all collections
					};
				}
			});

			const collectionsWithStats = await Promise.all(statsPromises);

			// Sort by trade volume
			const sortedCollections = collectionsWithStats.sort((a, b) => b.tradeVolume - a.tradeVolume);

			// Take the top 10 collections
			topCollections = sortedCollections.slice(0, displayCount);

			loading = false;

			// Trigger animations
			setTimeout(() => {
				isVisible = true;
			}, 300);
		} catch (err) {
			error = `Error processing collection stats: ${err.message}`;
			loading = false;
		}
	}

	// Format number with commas
	function formatNumber(num, decimals = 2) {
		if (num === undefined || num === null) return '0';
		return num.toLocaleString(undefined, {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals
		});
	}

	// Format currency with $ sign
	function formatCurrency(num, decimals = 2) {
		if (num === undefined || num === null) return '$0';
		if (num === 0) return '$0';

		// For smaller numbers, show more decimals
		if (num < 0.1) return `$${num.toFixed(4)}`;

		return `$${formatNumber(num, decimals)}`;
	}

	// Format ERG value
	function formatErg(usdValue, currentErgPrice) {
		if (usdValue === undefined || usdValue === null || usdValue === 0) return '0 ERG';
		if (currentErgPrice <= 0) return '0 ERG';

		const ergValue = usdValue / currentErgPrice;

		// For very small ERG values
		if (ergValue < 0.01) return `${ergValue.toFixed(4)} ERG`;

		// For small ERG values
		if (ergValue < 1) return `${ergValue.toFixed(2)} ERG`;

		// For larger values
		return `${formatNumber(ergValue, 2)} ERG`;
	}

	// Truncate text helper
	function truncateText(text, maxLength = 100) {
		if (!text) return '';
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
	}

	// Handle navigation buttons for mobile scroll
	function scrollNext() {
		const container = document.querySelector('.collections-grid');
		if (container) {
			const cardWidth = container.querySelector('.collection-card')?.offsetWidth || 200;
			const scrollAmount = cardWidth + 16; // card width + gap
			container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
		}
	}

	function scrollPrev() {
		const container = document.querySelector('.collections-grid');
		if (container) {
			const cardWidth = container.querySelector('.collection-card')?.offsetWidth || 200;
			const scrollAmount = cardWidth + 16; // card width + gap
			container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
		}
	}

	onMount(() => {
		fetchCollections();
	});
</script>

<div class="collections-container">
	{#if loading}
		<div class="loading-container">
			<div class="spinner" />
			<p>Loading collections data...</p>
		</div>
	{:else if error}
		<div class="error-container">
			<p class="error-message">{error}</p>
			<button class="retry-button" on:click={fetchCollections}>Retry</button>
		</div>
	{:else if topCollections.length === 0}
		<div class="empty-container">
			<p>No collections data available</p>
		</div>
	{:else}
		<!-- Collections Grid -->
		<div class="collections-wrapper">
			<button
				class="scroll-nav scroll-prev"
				on:click={scrollPrev}
				aria-label="Previous collections"
			>
				<span>‹</span>
			</button>

			<div class="collections-grid">
				{#each topCollections as collection, i}
					{#if isVisible}
						<a
							href="/collections?collection={collection.tokenid}"
							class="collection-card"
							in:fly={{ y: 20, duration: 300, delay: 100 + i * 50 }}
						>
							<div
								class="card-banner"
								style="background-image: url('{collection.images_url ||
									'https://via.placeholder.com/400x150?text=No+Image'}')"
							>
								<div class="banner-overlay" />
								<div class="rank-badge">#{i + 1}</div>

								<div class="collection-logo">
									<img
										src={collection.images_url || 'https://via.placeholder.com/80x80?text=No+Image'}
										alt={collection.name}
									/>
								</div>
							</div>

							<div class="card-content">
								<h3 class="collection-name">{collection.name}</h3>

								<div class="stats-container">
									<div class="main-stats">
										<div class="stat volume">
											<span class="stat-value">${nFormatter(collection.tradeVolume)}</span>
											<span class="stat-label">Volume</span>
										</div>

										<div class="stat floor">
											<span class="stat-value">${nFormatter(collection.floorPrice)}</span>
											<span class="stat-label">Floor</span>
										</div>
									</div>

									<div class="secondary-stats">
										<div class="stat-row">
											<div class="small-stat">
												<span class="small-stat-label">Items:</span>
												<span class="small-stat-value"
													>{collection.listedCount + collection.soldCount}</span
												>
											</div>

											<div class="small-stat">
												<span class="small-stat-label">Listed:</span>
												<span class="small-stat-value">{collection.listedCount}</span>
											</div>

											<div class="small-stat">
												<span class="small-stat-label">Sold:</span>
												<span class="small-stat-value">{collection.soldCount}</span>
											</div>
										</div>

										{#if collection.lastSale}
											<div class="last-sale">
												<span class="sale-label">Last Sale:</span>
												<span class="sale-price">
													${nFormatter(collection.lastSale.usd_amount)}
												</span>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</a>
					{/if}
				{/each}
			</div>

			<button class="scroll-nav scroll-next" on:click={scrollNext} aria-label="Next collections">
				<span>›</span>
			</button>
		</div>

		<!-- Current ERG Price -->
	{/if}
</div>

<style>
	/* Use CSS variables from your app.css */
	.collections-container {
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
	}

	.section-header {
		display: flex;
		align-items: center;
		margin-bottom: 2rem;
	}

	.section-header h2 {
		font-size: 1.75rem;
		font-weight: bold;
		color: var(--secondary-color);
		margin: 0;
		padding-right: 1rem;
	}

	.header-line {
		flex: 1;
		height: 2px;
		background: linear-gradient(90deg, var(--main-color), transparent);
	}

	/* ERG Price Display */
	.erg-price-display {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 1.5rem 0;
		padding: 0.75rem;
		background-color: var(--forms-bg);
		border-radius: 8px;
		font-size: 0.9rem;
	}

	.erg-price-label {
		margin-right: 0.5rem;
		color: var(--text-light);
	}

	.erg-price-value {
		font-weight: bold;
		color: var(--secondary-color);
	}

	.refresh-price {
		background: none;
		border: none;
		color: var(--main-color);
		cursor: pointer;
		padding: 0.3rem;
		margin-left: 0.75rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
	}

	.refresh-price:hover {
		background-color: rgba(4, 223, 255, 0.1);
	}

	.small-spinner {
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top: 2px solid var(--main-color);
		border-radius: 50%;
		width: 16px;
		height: 16px;
		animation: spin 1s linear infinite;
		margin-right: 0.5rem;
	}

	/* Loading States */
	.loading-container,
	.error-container,
	.empty-container {
		width: 100%;
		height: 200px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		background-color: var(--footer);
		border-radius: 16px;
		color: var(--text-light);
		margin-bottom: 2rem;
	}

	.spinner {
		border: 4px solid rgba(255, 255, 255, 0.1);
		border-top: 4px solid var(--main-color);
		border-radius: 50%;
		width: 40px;
		height: 40px;
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

	.error-message {
		color: #ff4b4b;
		margin-bottom: 1rem;
	}

	.retry-button {
		padding: 0.5rem 1rem;
		background-color: var(--forms-bg);
		color: var(--main-color);
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.retry-button:hover {
		background-color: var(--main-color);
		color: var(--footer);
	}

	.collections-wrapper {
		position: relative;
		width: 100%;
		margin-bottom: 1rem;
	}

	.collections-grid {
		display: flex;
		overflow-x: auto;
		overflow-y: hidden;
		scroll-snap-type: x mandatory;
		gap: 1rem;
		padding: 0.5rem 0.25rem 1.5rem;
		padding-bottom: 0.5rem;
		-webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
	}

	.collection-card {
		min-width: 280px;
		width: 280px;
		flex-shrink: 0;
		scroll-snap-align: start;
	}

	/* Hide scrollbar but keep functionality */
	.collections-grid::-webkit-scrollbar {
		height: 4px;
	}

	.collections-grid::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	.collections-grid::-webkit-scrollbar-thumb {
		background: var(--main-color);
		border-radius: 10px;
	}

	/* Scroll navigation */
	.scroll-nav {
		position: absolute;
		visibility: visible;
		top: 59%;
		transform: translateY(-50%);
		width: 40px;
		height: 40px;
		background-color: var(--footer);
		color: var(--secondary-color);
		border: none;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 10;
		opacity: 0.8;
		transition: opacity 0.2s, background-color 0.2s;
		font-size: 1.5rem;
		font-weight: bold;
	}

	.scroll-nav:hover {
		opacity: 1;
		background-color: var(--main-color);
		color: var(--footer);
	}

	.scroll-prev {
		left: 0.5rem;
	}

	.scroll-next {
		right: 0.5rem;
	}

	.collection-card {
		background-color: var(--footer);
		border-radius: 12px;
		overflow: hidden;
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
		transition: transform 0.3s, box-shadow 0.3s;
		height: 100%;
	}

	.collection-card:hover {
		transform: translateY(-6px);
	}

	.card-banner {
		height: 100px;
		background-size: cover;
		background-position: center;
		position: relative;
	}

	.banner-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2), var(--footer));
	}

	.rank-badge {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		background-color: var(--main-color);
		color: var(--footer);
		font-weight: bold;
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		border-radius: 20px;
		z-index: 10;
	}

	.collection-logo {
		position: absolute;
		bottom: -30px;
		left: 50%;
		transform: translateX(-50%);
		width: 60px;
		height: 60px;
		border-radius: 50%;
		overflow: hidden;
		background-color: var(--footer);
		border: 3px solid var(--forms-bg);
		z-index: 10;
	}

	.collection-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card-content {
		padding: 2rem 1rem 1rem;
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.collection-name {
		font-size: 1rem;
		font-weight: bold;
		color: var(--secondary-color);
		margin: 0 0 1rem 0;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.stats-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.main-stats {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.25rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.75rem;
		border-radius: 8px;
		background-color: var(--forms-bg);
		width: 48%;
	}

	.stat-value {
		font-weight: bold;
		font-size: 0.8rem;
		color: var(--secondary-color);
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--text-light);
		margin-bottom: 0.25rem;
	}

	.usd-conversion {
		font-size: 0.65rem;
		color: var(--text-light);
		opacity: 0.8;
	}

	.usd-conversion-small {
		font-size: 0.65rem;
		color: var(--text-light);
		opacity: 0.8;
		display: block;
		margin-top: 0.1rem;
	}

	.volume .stat-value {
		color: var(--main-color);
	}

	.floor .stat-value {
		color: var(--info-color);
	}

	.secondary-stats {
		background-color: var(--forms-bg);
		border-radius: 8px;
		padding: 0.75rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}

	.small-stat {
		font-size: 0.7rem;
		display: flex;
		align-items: center;
	}

	.small-stat-label {
		color: var(--text-light);
		margin-right: 0.25rem;
	}

	.small-stat-value {
		color: var(--text-strong);
		font-weight: bold;
	}

	.last-sale {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding-top: 0.5rem;
		font-size: 0.7rem;
		border-top: 1px solid var(--borders);
	}

	.sale-label {
		color: var(--text-light);
	}

	.sale-price {
		font-weight: bold;
		color: var(--main-color);
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.collection-card {
			min-width: 250px;
			/* width: 250px; */
		}

		.collection-name {
			font-size: 0.9rem;
		}

		.stat {
			padding: 7px;
		}

		.stat-value {
			font-size: 0.85rem;
		}

		.card-content {
			padding: 2rem 0.75rem 0.75rem;
		}
	}
</style>
