<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import AllOffers from '$lib/components/main/AllOffers.svelte';
	import SoloOffers from '$lib/components/main/CollectionOffers.svelte'; // Import the SoloOffers component
	import DelegationCards from '$lib/components/main/DelegationCards.svelte';
	import LendingCards from '$lib/components/main/LendingCards.svelte';
	import OffersCards from '$lib/components/main/OffersCards.svelte';
	import Pagination from '$lib/components/common/Pagination.svelte';
	import { ASSETS, CATEGORIES, ITEMS_PER_PAGE } from '$lib/common/const.ts';
	import {
		loadOffers,
		connected_wallet_address,
		setOffersFilter,
		loadingOffers,
		loadCollectionOffers,
		collectionOffers,
		collectionOrderOffers,
		collectionSoldOffers
	} from '$lib/store/store';
	import { updateSearchParams, nFormatter, showCustomToast } from '$lib/utils/utils.js';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { selected_wallet_ergo } from '$lib/store/store.ts';

	// Collection statistics
	let totalItems = 0;
	let availableItems = 0;
	let soldCount = 0;
	let floorPrice = 'N/A';
	let ceilingPrice = 'N/A';
	let averagePrice = 'N/A';
	let totalVolumeDisplay = 'N/A';
	let collections = [];
	let selectedCollection = 'none'; // Default to 'none' for all collections
	let viewMode = 'delegations'; // "all", "collection", "delegations", or "lending"
	let currentCollection = null;
	let collectionUpdateKey = 0; // For forcing SoloOffers component to update
	let collectionStats = null; // Store API stats
	let loadingStats = false; // Loading state for collection stats
	let showAdvancedFilters = false; // Toggle for advanced filters

	let isMobile = false;

	// Function to check screen size
	function updateIsMobile() {
		isMobile = window.matchMedia('(max-width: 768px)').matches;
	}

	$: if ($page.url.searchParams) {
		if (!mounted) {
			processParams($page.url.searchParams);
		}
	}

	function processParams(searchParams) {
		let tempAddress = searchParams.get('seller');
		if (tempAddress && tempAddress != oldAddress) {
			address = tempAddress;
			oldAddress = address;
			mounted = true;
		}

		let tempBundle = searchParams.get('type');
		if (tempBundle && tempBundle != oldBundle) {
			if (tempBundle == 'single') {
				bundle = 'f';
				viewMode = 'all';
			} else if (tempBundle == 'bundle') {
				bundle = 't';
				viewMode = 'all';
			} else if (tempBundle == 'delegations') {
				bundle = 'delegations';
				viewMode = 'delegations';
			} else if (tempBundle == 'lending') {
				bundle = 'lending';
				viewMode = 'lending';
			} else if (tempBundle == 'offers') {
				bundle = 'offers';
				viewMode = 'offers';
			} else {
				bundle = 'None';
				viewMode = 'all';
			}

			oldBundle = tempBundle;
			mounted = true;
		} else if (!tempBundle) {
			oldBundle = 'delegations';
			viewMode = 'delegations';
		}

		let tempCategory = searchParams.get('category');
		if (tempCategory && tempCategory != oldCategory) {
			category = tempCategory;
			oldCategory = category;
			mounted = true;
		}

		let tempSort = searchParams.get('sort');
		if (tempSort && tempSort != oldSort) {
			sort = tempSort;
			oldSort = sort;
			mounted = true;
		}

		let tempPaymentAsset = searchParams.get('paymentasset');
		if (tempPaymentAsset && tempPaymentAsset != oldPaymentAsset) {
			if (tempPaymentAsset == 'ERG') {
				paymentasset = '';
			} else {
				paymentasset = tempPaymentAsset;
			}
			oldPaymentAsset = paymentasset;
			mounted = true;
		}

		let tempTokenId = searchParams.get('tokenId');
		if (tempTokenId && tempTokenId != oldTokenId) {
			tokenId = tempTokenId;
			search = tokenId;
			oldTokenId = tokenId;
			mounted = true;
		}

		let tempQuery = searchParams.get('search');
		if (tempQuery && tempQuery != oldQuery) {
			search = tempQuery;
			oldQuery = search;
			mounted = true;
		}

		let tempPage = searchParams.get('page');
		if (tempPage && parseInt(tempPage) != oldPage) {
			searchPage = parseInt(tempPage);
			if (isNaN(searchPage)) {
				searchPage = 1;
			}
			if (searchPage < 1) {
				searchPage = 1;
			}
			oldPage = searchPage;
			mounted = true;
			pageSet = true;
		} else {
			pageSet = false;
		}

		// Process collection parameter
		let tempCollection = searchParams.get('collection');
		if (tempCollection && tempCollection !== oldCollection) {
			selectedCollection = tempCollection;
			oldCollection = tempCollection;
			viewMode = 'collection';
			mounted = true;
		}
	}

	export let offerTokenId = '';
	let oldBundle = 'delegations';
	let oldAddress = '';
	let oldCategory = 'None';
	let oldTokenId = '';
	let oldQuery = '';
	let oldPage = 1;
	let oldSort = 'None';
	let oldPaymentAsset = 'None';
	let oldCollection = 'none';
	let showModal = false;
	let pageSet = false;
	let mounted = false;
	let searchPage = 1;
	let tokenId = 'None';
	let category = 'None',
		paymentasset = 'None',
		bundle = 'delegations',
		sort = 'None',
		search = '',
		address = '';

	$: (category || paymentasset || bundle || sort) && updateFilter();
	$: connected_wallet_address.subscribe(() => {
		updateFilter(false);
	});

	function updateFilter(reset = true) {
		if (!mounted) {
			return;
		}

		if (viewMode === 'delegations') {
			// For delegations view, just update the type param and return
			updateSearchParams('type', 'delegations', $page);
			return;
		}

		if (viewMode === 'lending') {
			// For lending view, just update the type param and return
			updateSearchParams('type', 'lending', $page);
			return;
		}

		if (viewMode === 'offers') {
			// For offers view, just update the type param and return
			updateSearchParams('type', 'offers', $page);
			return;
		}

		if (viewMode === 'collection' && selectedCollection !== 'none') {
			// Don't apply regular filters for collection view
			updateSearchParams('collection', selectedCollection, $page);
			return;
		}

		// Clear collection param if not in collection mode
		updateSearchParams('collection', null, $page);

		if (category != 'None') {
			updateSearchParams('category', category, $page);
		} else {
			updateSearchParams('category', null, $page);
		}

		if (sort != 'None') {
			updateSearchParams('sort', sort, $page);
		} else {
			updateSearchParams('sort', null, $page);
		}

		if (paymentasset != 'None') {
			updateSearchParams('paymentasset', paymentasset == '' ? 'ERG' : paymentasset, $page);
		} else {
			updateSearchParams('paymentasset', null, $page);
		}

		if (bundle != 'None') {
			updateSearchParams('type', bundle == 't' ? 'bundle' : 'single', $page);
		} else {
			updateSearchParams('type', null, $page);
		}

		setOffersFilter(
			category,
			paymentasset == '' ? 'ERG' : paymentasset,
			bundle,
			sort,
			search,
			address,
			null,
			tokenId
		);

		if (reset && !pageSet) {
			updateSearchParams('page', null, $page);
			searchPage = 1;
		}

		pageSet = false;

		loadOffers((searchPage - 1) * ITEMS_PER_PAGE);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			if (address && address.length == 51) {
				updateSearchParams('seller', address, $page);
			} else {
				updateSearchParams('seller', null, $page);
			}

			if (search && search.length == 64) {
				tokenId = search;
				updateSearchParams('search', null, $page);
				updateSearchParams('tokenId', search, $page);
			} else if (search) {
				updateSearchParams('tokenId', null, $page);
				updateSearchParams('search', search, $page);
			} else {
				tokenId = 'None';
				updateSearchParams('tokenId', null, $page);
				updateSearchParams('search', null, $page);
			}

			updateFilter();
		}
	}

	function handleUrlChangedEvent(event) {
		processParams(event.detail.params);
	}

	onMount(async () => {
		mounted = true;

		if (!$loadingOffers) {
			updateFilter(false);
		}

		updateIsMobile();

		const mediaQuery = window.matchMedia('(max-width: 768px)');
		mediaQuery.addEventListener('change', updateIsMobile);

		window.addEventListener('urlChanged', handleUrlChangedEvent);
		return () => {
			window.removeEventListener('urlChanged', handleUrlChangedEvent);
			mediaQuery.removeEventListener('change', updateIsMobile);
		};
	});
</script>

<div class="container">
	<br />
	<h2 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">
		{viewMode === 'delegations' ? 'Delegations' : viewMode === 'lending' ? 'Lending' : viewMode === 'offers' ? 'Offers' : 'Offers'}
	</h2>

	<div id="filters" class="filters-container">
		{#if isMobile}
			<div class="filters-header">
				<button
					class="btn btn-info w-100 filter-toggle"
					on:click={() => (showAdvancedFilters = !showAdvancedFilters)}
				>
					<i class="fas fa-sliders-h" />
					{showAdvancedFilters ? 'Hide Filters' : 'Show Filters'}
				</button>
			</div>
		{/if}

		{#if showAdvancedFilters && isMobile}
			<div class="advanced-filters" />
		{/if}

		{#if showAdvancedFilters || !isMobile}
			<div transition:slide={{ duration: 300 }}>
				<div class="search-row">
					<div class="search-field">
						<div class="input-with-icon">
							<i class="fas fa-user search-icon" />
							<input
								on:keydown={handleKeyDown}
								bind:value={address}
								class="search-input"
								type="text"
								placeholder="Seller address..."
							/>
						</div>
					</div>

					<div class="search-field">
						<div class="input-with-icon">
							<i class="fas fa-search search-icon" />
							<input
								on:keydown={handleKeyDown}
								bind:value={search}
								class="search-input"
								type="text"
								placeholder="Asset name or ID..."
							/>
						</div>
					</div>

					<button on:click={updateFilter} class="btn btn-primary search-button" type="button">
						<i class="fas fa-filter" /> Filter
					</button>
				</div>

				<div class="filter-row">
					<select bind:value={category} id="category" class="filter-select">
						<option value="None" selected>Category (All)</option>
						{#each CATEGORIES as category}
							<option value={category.name}>{category.name}</option>
						{/each}
					</select>

					<select bind:value={paymentasset} id="paymentasset" class="filter-select">
						<option value="None" selected>Payment (All)</option>
						{#each ASSETS as asset}
							<option value={asset.tokenId}>{asset.name}</option>
						{/each}
					</select>

					<select 
						bind:value={bundle} 
						id="bundle" 
						class="filter-select"
						on:change={() => {
							if (bundle === 'delegations') {
								viewMode = 'delegations';
							} else if (bundle === 'lending') {
								viewMode = 'lending';
							} else {
								viewMode = 'all';
							}
							updateFilter();
						}}
					>
						<option value="delegations" selected>Delegations</option>
						<option value="lending">Lending</option>
					</select>

					<select bind:value={sort} id="sort" class="filter-select">
						<option value="None" selected>Sort (Recent)</option>
						<option value="recent">Most recent</option>
						<option value="oldest">Oldest</option>
					</select>
				</div>
			</div>
		{/if}
	</div>
	{#if viewMode === 'delegations'}
		<div class="offers-container all-orders">
			<DelegationCards />
		</div>
	{:else if viewMode === 'lending'}
		<div class="offers-container all-orders">
			<LendingCards />
		</div>
	{:else if viewMode === 'offers'}
		<div class="offers-container all-orders">
			<OffersCards />
		</div>
	{:else}
		<div class="offers-container all-orders">
			<AllOffers />
		</div>
		<Pagination />
	{/if}
	<br />
</div>

<style>
	body {
		position: relative;
		margin: 0;
		padding-bottom: 35px;
		background-size: cover;
		background-repeat: no-repeat;
		background-position: center;
		overflow-x: hidden;
	}

	.offers-container,
	.delegations-container,
	.lending-container {
		display: grid;
		grid-template-columns: repeat(1, 1fr);
		gap: 20px;
		justify-content: space-between;
		margin-bottom: 25px;
	}

	@media (min-width: 400px) {
		.offers-container,
		.delegations-container,
		.lending-container {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 600px) {
		.offers-container,
		.delegations-container,
		.lending-container {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 800px) {
		.offers-container,
		.delegations-container,
		.lending-container {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (min-width: 1000px) {
		.offers-container,
		.delegations-container,
		.lending-container {
			grid-template-columns: repeat(5, 1fr);
		}
	}

	.all-orders {
		margin-top: 20px;
	}

	.no-orders {
		grid-column: 1 / -1;
		text-align: center;
		color: #888;
	}

	/* Collection styling */
	.collection-banner {
		height: auto;
		background-size: cover;
		background-position: center;
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		margin-bottom: 1.5rem;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
	}

	.collection-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.8));
		backdrop-filter: blur(1px);
	}

	.collection-stats-container {
		position: relative;
		z-index: 5;
		padding: 1rem;
	}

	.collection-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.collection-logo {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		overflow: hidden;
		border: 3px solid var(--main-color);
		background-color: var(--forms-bg);
		flex-shrink: 0;
	}

	.collection-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.collection-name {
		font-size: 1.5rem;
		font-weight: bold;
		margin: 0;
		color: white;
		text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
	}

	.collection-stats-overlay {
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.stat-boxes {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.stat-box {
		background: var(--forms-bg);
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
		min-width: 70px;
		text-align: center;
		flex: 1;
		flex-basis: calc(16.666% - 0.5rem);
		max-width: 150px;
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.stat-box:hover {
		transform: translateY(-3px);
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
	}

	.price-box {
		background: linear-gradient(135deg, var(--forms-bg), rgba(60, 60, 80, 0.9));
	}

	.highlight-box {
		border: 1px solid var(--main-color);
	}

	.items-box {
		border-left: 3px solid var(--secondary-color);
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: bold;
		color: white;
	}

	.stat-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.7);
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.last-sale-container {
		background: rgba(0, 0, 0, 0.25);
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
		margin-top: 0.5rem;
	}

	.sale-highlight {
		color: var(--main-color);
		font-weight: bold;
	}

	.sale-item {
		opacity: 0.9;
		font-style: italic;
	}

	.sale-time {
		display: block;
		font-size: 0.75rem;
		opacity: 0.7;
		margin-top: 0.25rem;
	}

	.refresh-btn {
		background: rgba(155, 102, 255, 0.5);
		color: white;
		border: none;
		border-radius: 4px;
		width: 36px;
		height: 36px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.2s, transform 0.2s;
		margin-left: 0.5rem;
	}

	.refresh-btn:hover {
		background: rgba(155, 102, 255, 0.7);
		transform: rotate(45deg);
	}

	.loading-stats {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: var(--forms-bg);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		color: white;
	}

	.spinner-small {
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top: 2px solid var(--main-color);
		border-radius: 50%;
		width: 16px;
		height: 16px;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.last-sale-info {
		font-size: 0.8rem;
		opacity: 0.8;
		margin-top: 0.25rem;
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
	}

	/* Compact Filters styling */
	.filters-container {
		margin-bottom: 1.5rem;
		background: var(--forms-bg);
		border-radius: 12px;
		padding: 0.75rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.filters-header {
		/* display: flex; */
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.filter-toggle {
		background: var(--forms-bg);
		border: none;
		border-radius: 8px;
		padding: 0.6rem 1rem;
		font-size: 0.85rem;
		font-weight: 500;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.filter-toggle:hover {
		background: var(--main-color);
	}

	.collection-filter {
		flex: 1;
		max-width: 400px;
	}

	.collection-select {
		border: 1px solid #ffffff00;
	}

	.advanced-filters {
		margin-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 0.75rem;
	}

	.search-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.search-field {
		flex: 1;
	}

	.input-with-icon {
		position: relative;
	}

	.search-icon {
		position: absolute;
		left: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: rgba(255, 255, 255, 0.5);
	}

	.search-input {
		width: 100%;
		height: 40px;
		background: var(--footer);
		border: none;
		border-radius: 8px;
		color: white;
		padding: 0.5rem 0.5rem 0.5rem 2rem;
		font-size: 0.85rem;
	}

	.search-input:focus {
		outline: 1px solid var(--main-color);
	}

	.search-button {
		background: var(--main-color);
		border: none;
		border-radius: 8px;
		height: 40px;
		padding: 0 1rem;
		font-weight: 500;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.search-button:hover {
		background: var(--secondary-color);
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.filter-select {
		background: var(--forms-bg);
		color: white;
		border: none;
		border-radius: 8px;
		padding: 0.5rem;
		font-size: 0.85rem;
		flex: 1;
		min-width: 130px;
	}

	/* Responsive filters */
	@media (max-width: 768px) {
		.filters-header {
			flex-direction: column;
			align-items: stretch;
		}

		.collection-filter {
			max-width: 100%;
		}

		.search-row {
			flex-direction: column;
		}

		.search-button {
			width: 100%;
		}
	}

	/* Improve mobile responsiveness for stats cards */
	@media (max-width: 600px) {
		.collection-stats-container {
			padding: 0.5rem;
		}

		.collection-header {
			margin-bottom: 0.5rem;
		}

		.collection-logo {
			width: 40px;
			height: 40px;
			border-width: 2px;
		}

		.collection-name {
			font-size: 1.1rem;
		}

		.stat-boxes {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 0.3rem;
		}

		.stat-box {
			min-width: 0;
			padding: 0.3rem;
			border-radius: 6px;
			flex-basis: 100%;
		}

		.stat-value {
			font-size: 0.85rem;
		}

		.stat-label {
			font-size: 0.6rem;
		}

		.last-sale-container {
			padding: 0.3rem 0.5rem;
			margin-top: 0.3rem;
		}

		.last-sale-info {
			font-size: 0.75rem;
		}

		.sale-time {
			font-size: 0.65rem;
		}

		.refresh-btn {
			width: 30px;
			height: 30px;
			position: absolute;
			top: 0.5rem;
			right: 0.5rem;
		}
	}

	@media (max-width: 400px) {
		.stat-boxes {
			grid-template-columns: repeat(2, 1fr);
		}

		.collection-header {
			gap: 0.5rem;
		}
	}
</style>
