<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import {
		CONTRACT_CRC32,
		API_HOST,
		ASSETS,
		OLD_CONTRACTS_CRC32,
		EE_API
	} from '$lib/common/const.ts';
	import { nFormatter } from '$lib/utils/utils.js';
	import Loading from '../common/Loading.svelte';

	// Stores
	const activityItems = writable([]);
	const loading = writable(true);
	const error = writable(null);
	const tokenDetailsCache = new Map(); // Cache for token details

	// Pagination state
	let currentPage = 1;
	let totalPages = 1;
	let itemsPerPage = 10; // Number of items to show per page
	let totalItems = 0;

	// Construct API URL - only sold items
	const getSoldApiUrl = (offset = 0, limit = 50) => {
		return `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&status=Sold&sort=buytime&offset=${offset}&limit=${limit}`;
	};

	function getAssetName(tokenId) {
		if (tokenId === 'ERG') {
			return { name: 'ERG', decimals: 9 };
		}
		const asset = ASSETS.find((asset) => asset.tokenId === tokenId);
		return asset
			? { name: asset.name, decimals: asset.decimals }
			: { name: 'Unknown', decimals: 0 };
	}

	// Fetch token details including images
	async function getTokenDetails(tokenId) {
		// Check cache first
		if (tokenDetailsCache.has(tokenId)) {
			return tokenDetailsCache.get(tokenId);
		}

		try {
			const response = await fetch(`${EE_API}tokens/byId`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [tokenId] })
			});

			const data = await response.json();

			if (data && data.items && data.items.length > 0) {
				const token = data.items[0];

				// Prefer cached URL, then icon URL
				let imageUrl = token.cachedurl || token.iconurl;

				// Convert IPFS URL if needed
				if (imageUrl && imageUrl.startsWith('ipfs://')) {
					imageUrl = imageUrl.replace('ipfs://', 'https://gateway.lighthouse.storage/ipfs/');
				}

				const tokenDetails = {
					name: token.name || 'Unknown NFT',
					imageUrl: imageUrl || '/placeholder-nft.png'
				};

				tokenDetailsCache.set(tokenId, tokenDetails);
				return tokenDetails;
			}

			const defaultDetails = {
				name: 'Unknown NFT',
				imageUrl: '/placeholder-nft.png'
			};
			tokenDetailsCache.set(tokenId, defaultDetails);
			return defaultDetails;
		} catch (err) {
			console.error(`Error fetching token details for ${tokenId}:`, err);
			const errorDetails = {
				name: 'Unknown NFT',
				imageUrl: '/placeholder-nft.png'
			};
			tokenDetailsCache.set(tokenId, errorDetails);
			return errorDetails;
		}
	}

	// Fetch sold items
	async function fetchActivityItems(page = 1) {
		try {
			loading.set(true);

			// Calculate offset based on page
			const offset = (page - 1) * itemsPerPage;

			// Fetch sold items
			const soldResponse = await fetch(getSoldApiUrl(offset, itemsPerPage));
			const soldData = await soldResponse.json();

			let soldItems = [];
			if (soldData.items && Array.isArray(soldData.items)) {
				soldItems = soldData.items;
				totalItems = soldData.total || soldItems.length;
				totalPages = Math.ceil(totalItems / itemsPerPage);
			}

			// Process items with token details
			const itemsWithDetails = await Promise.all(
				soldItems.map(async (item) => {
					// Set payment asset name
					if (item.payassetname == null) {
						item.payassetname = getAssetName(item.payasset).name;
					}

					// Process assets to add token details
					for (let asset of item.assets) {
						if (asset.tokenId == 'ERG') {
							asset.name = 'ERG';
							asset.decimals = 9;
							asset.imageUrl = '/erg-logo.png'; // Default ERG logo
						} else {
							// Fetch token details for NFTs (or use cached values)
							const details = await getTokenDetails(asset.tokenId);
							asset.name = details.name;
							asset.imageUrl = details.imageUrl;
						}
					}
					return item;
				})
			);

			// Update store with processed items
			activityItems.set(itemsWithDetails);
		} catch (err) {
			error.set(`Failed to fetch activity: ${err.message}`);
			console.error('Error fetching activity:', err);
		} finally {
			loading.set(false);
		}
	}

	// Change page and load data for that page
	function changePage(newPage) {
		if (newPage === currentPage) return;
		if (newPage < 1 || newPage > totalPages) return;

		currentPage = newPage;
		fetchActivityItems(currentPage);
	}

	function truncateAddress(address: string): string {
		if (!address || address.length <= 10) {
			return address;
		}
		const firstPart = address.substring(0, 5);
		const lastPart = address.substring(address.length - 5);
		return `${firstPart}...${lastPart}`;
	}

	// Format date for display
	function formatDate(timestamp) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	// Initialize data on component mount
	onMount(() => {
		fetchActivityItems(1);
	});
</script>

<div class="container mb-4 mt-4">
	<h1 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">Sales Activity</h1>

	<div class="activity-container">
		{#if $loading}
			<div class="loading-container">
				<div class="spinner" />
				<p>Loading activity...</p>
			</div>
		{:else if $error}
			<p class="error-message">{$error}</p>
		{:else if $activityItems.length === 0}
			<p class="empty-message">No activity found.</p>
		{:else}
			<div class="table-responsive">
				<table class="activity-table">
					<thead>
						<tr>
							<th>Image</th>
							<th>Details</th>
							<th>Price</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{#each $activityItems as item}
							<tr class="activity-row">
								<td class="image-cell">
									{#if item.assets.length === 1}
										<img
											src={item.assets[0].imageUrl || '/placeholder-nft.png'}
											alt={item.assets[0].name}
											class="asset-image"
											onerror="this.onerror=null; this.src='/placeholder-nft.png';"
										/>
									{:else}
										<div class="bundle-images">
											{#each item.assets.slice(0, 3) as asset, i}
												<img
													src={asset.imageUrl || '/placeholder-nft.png'}
													alt={asset.name}
													class="bundle-image"
													style="z-index: {3 - i}; left: {i * 8}px;"
													onerror="this.onerror=null; this.src='/placeholder-nft.png';"
												/>
											{/each}
											{#if item.assets.length > 3}
												<span class="bundle-count">+{item.assets.length - 3}</span>
											{/if}
										</div>
									{/if}
								</td>
								<td class="details-cell">
									<div class="asset-info">
										{#if item.assets.length === 1}
											<span class="asset-name">{item.assets[0].name}</span>
										{:else}
											<span class="bundle-tag">Bundle ({item.assets.length})</span>
										{/if}
									</div>
									<div class="buyer-info">
										<a
											href="https://ergexplorer.com/addresses/{item.buyer}"
											target="_blank"
											class="address-link"
										>
											{truncateAddress(item.buyer)}
										</a>
										<a
											href={`https://ergexplorer.com/transactions/${item.txidout}`}
											target="_blank"
											class="tx-link"
										>
											<i class="fa-solid fa-up-right-from-square" />
										</a>
									</div>
								</td>
								<td class="price-cell">
									<span class="price-value">{nFormatter(item.payamount, 2)}</span>
									<span class="price-currency">{item.payassetname}</span>
								</td>
							</tr>
							<!-- Optional row for bundle details -->
							{#if item.assets.length > 1}
								<tr class="bundle-details-row">
									<td colspan="4">
										<div class="bundle-items">
											{#each item.assets as asset}
												<div class="bundle-item">
													<img
														src={asset.imageUrl || '/placeholder-nft.png'}
														alt={asset.name}
														class="bundle-item-image"
														onerror="this.onerror=null; this.src='/placeholder-nft.png';"
													/>
													<span class="bundle-item-name">{asset.name}</span>
													<span class="bundle-item-amount">{asset.amount}</span>
												</div>
											{/each}
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="pagination">
					<button
						class="pagination-btn {currentPage === 1 ? 'disabled' : ''}"
						on:click={() => changePage(1)}
						disabled={currentPage === 1}
					>
						<i class="fas fa-angle-double-left" />
					</button>
					<button
						class="pagination-btn {currentPage === 1 ? 'disabled' : ''}"
						on:click={() => changePage(currentPage - 1)}
						disabled={currentPage === 1}
					>
						<i class="fas fa-angle-left" />
					</button>

					<div class="page-info">
						Page {currentPage} of {totalPages}
					</div>

					<button
						class="pagination-btn {currentPage >= totalPages ? 'disabled' : ''}"
						on:click={() => changePage(currentPage + 1)}
						disabled={currentPage >= totalPages}
					>
						<i class="fas fa-angle-right" />
					</button>
					<button
						class="pagination-btn {currentPage >= totalPages ? 'disabled' : ''}"
						on:click={() => changePage(totalPages)}
						disabled={currentPage >= totalPages}
					>
						<i class="fas fa-angle-double-right" />
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.activity-container {
		background: var(--forms-bg);
		border-radius: 12px;
		padding: 1rem;
		overflow: hidden;
	}

	.error-message,
	.empty-message {
		text-align: center;
		padding: 2rem;
		color: var(--text-light);
	}

	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 0;
	}

	.spinner {
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top: 3px solid var(--main-color);
		border-radius: 50%;
		width: 30px;
		height: 30px;
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

	.table-responsive {
		overflow-x: auto;
	}

	.activity-table {
		width: 100%;
		border-collapse: collapse;
		color: var(--text-light);
		table-layout: fixed;
	}

	.activity-table th {
		text-align: left;
		padding: 0.8rem;
		font-weight: 600;
		color: var(--secondary-color);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.activity-table th:nth-child(1) {
		width: 60px;
	} /* Image column */
	.activity-table th:nth-child(2) {
		width: auto;
	} /* Details column */
	.activity-table th:nth-child(3) {
		width: 90px;
	} /* Price column */
	.activity-table th:nth-child(4) {
		width: 50px;
	} /* Tx column */

	.activity-row {
		transition: background-color 0.2s;
	}

	.activity-row:hover {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.activity-table td {
		padding: 0.8rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.date-cell {
		white-space: nowrap;
	}

	.image-cell {
		width: 60px;
		padding: 0.4rem;
	}

	.asset-image {
		width: 45px;
		height: 45px;
		object-fit: cover;
		border-radius: 4px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.bundle-images {
		position: relative;
		width: 56px;
		height: 45px;
	}

	.bundle-image {
		position: absolute;
		width: 35px;
		height: 35px;
		object-fit: cover;
		border-radius: 4px;
		border: 1px solid var(--forms-bg);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.bundle-count {
		position: absolute;
		right: 0;
		bottom: 0;
		background: var(--main-color);
		color: white;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: bold;
		font-size: 0.7rem;
		z-index: 5;
	}

	.details-cell {
		max-width: 160px;
		padding: 0.6rem 0.8rem;
	}

	.asset-info {
		margin-bottom: 0.2rem;
	}

	.asset-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		max-width: 100%;
		font-weight: 500;
		color: var(--secondary-color);
	}

	.buyer-info {
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.bundle-tag {
		display: inline-block;
		background: var(--main-color);
		color: white;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.price-cell {
		white-space: nowrap;
	}

	.price-value {
		font-weight: 600;
	}

	.price-currency {
		color: var(--main-color);
		margin-left: 0.2rem;
	}

	.buyer-cell {
		width: 130px;
	}

	.address-link {
		color: var(--text-light);
		text-decoration: none;
		transition: color 0.2s;
	}

	.address-link:hover {
		color: var(--main-color);
	}

	.tx-cell {
		width: 50px;
		text-align: center;
	}

	.tx-link {
		color: var(--main-color);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		transition: background 0.2s;
	}

	.tx-link:hover {
		background: var(--main-color);
		color: white;
	}

	/* Bundle details */
	.bundle-details-row {
		background-color: rgba(0, 0, 0, 0.2);
		font-size: 0.9rem;
	}

	.bundle-details-row td {
		padding: 0.5rem 1rem;
	}

	.bundle-items {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.bundle-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: rgba(255, 255, 255, 0.05);
		padding: 0.3rem 0.5rem;
		border-radius: 4px;
	}

	.bundle-item-image {
		width: 24px;
		height: 24px;
		object-fit: cover;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.bundle-item-name {
		color: var(--secondary-color);
	}

	.bundle-item-amount {
		color: var(--text-light);
		font-size: 0.8rem;
		margin-left: auto;
	}

	/* Pagination styling */
	.pagination {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-top: 1.5rem;
		gap: 0.5rem;
	}

	.pagination-btn {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--footer);
		color: var(--text-light);
		border: none;
		cursor: pointer;
		transition: all 0.2s;
	}

	.pagination-btn:hover:not(.disabled) {
		background: var(--main-color);
		color: white;
	}

	.pagination-btn.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.page-info {
		padding: 0 1rem;
		font-size: 0.9rem;
		color: var(--text-light);
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.activity-container {
			padding: 0.75rem 0.5rem;
		}

		.activity-table th,
		.activity-table td {
			padding: 0.5rem 0.4rem;
		}

		.bundle-items {
			flex-direction: column;
			gap: 0.3rem;
		}

		.asset-image {
			width: 40px;
			height: 40px;
		}

		.bundle-image {
			width: 28px;
			height: 28px;
		}

		.details-cell {
			max-width: 120px;
		}

		.activity-table th:nth-child(1) {
			width: 50px;
		}
		.activity-table th:nth-child(3) {
			width: 70px;
		}
	}

	@media (max-width: 480px) {
		.activity-container {
			padding: 0.5rem 0.25rem;
		}

		.activity-table th,
		.activity-table td {
			padding: 0.4rem 0.3rem;
			font-size: 0.9rem;
		}

		.asset-image {
			width: 36px;
			height: 36px;
		}

		.bundle-image {
			width: 24px;
			height: 24px;
		}

		.details-cell {
			max-width: 100px;
		}

		.price-cell {
			font-size: 0.85rem;
		}

		.pagination-btn {
			width: 32px;
			height: 32px;
		}
	}

	@media (max-width: 576px) {
		.pagination {
			flex-wrap: wrap;
		}

		.page-info {
			width: 100%;
			order: -1;
			text-align: center;
			margin-bottom: 0.5rem;
		}
	}
</style>
