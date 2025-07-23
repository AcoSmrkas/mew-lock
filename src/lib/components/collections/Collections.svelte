<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import AllOffers from '$lib/components/main/AllOffers.svelte';
	import SoloOffers from '$lib/components/main/CollectionOffers.svelte';
	import SellModal from '$lib/components/common/SellModal.svelte';
	import { ASSETS, CATEGORIES, ITEMS_PER_PAGE, COLLECTIONS, EE_API } from '$lib/common/const.ts';
	import {
		loadOffers,
		connected_wallet_address,
		setOffersFilter,
		loadingOffers,
		loadCollectionOffers,
		collectionOffers,
		collectionOrderOffers,
		collectionSoldOffers,
		totalBoxes
	} from '$lib/store/store';
	import { updateSearchParams, nFormatter } from '$lib/utils/utils.js';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import Loading from '../common/Loading.svelte';

	// Collection statistics
	let totalItems = 0;
	let availableItems = 0;
	let soldCount = 0;
	let floorPrice = 'N/A';
	let averagePrice = 'N/A';
	let totalVolumeDisplay = 'N/A';
	let collections = [];
	let selectedCollection = 'none';
	let viewMode = 'all';
	let currentCollection = null;
	let collectionUpdateKey = 0;
	let collectionStats = null;
	let loadingStats = false;
	let showAdvancedFilters = false;

	// Collection view tab state
	let activeCollectionTab = 'listed';

	// Collection NFTs state
	let loadingCollectionNFTs = false;
	let collectionAllNFTs = [];
	let currentPage = 1;
	let totalPages = 1;
	const ITEMS_PER_COLLECTION_PAGE = 50;

	// Pagination variables
	let autoLoad = false;
	let currentPageNum = 1;
	let numPages = 1;
	let isDisabled = [true, true, false, false];

	// For collection grid and search
	let collectionSearchTerm = '';
	let filteredCollections = [];
	let collectionDisplayLimit = 10;
	let showAllCollections = false;
	let totalCollectionItems = 0;

	$: if ($page.url.searchParams) {
		if (!mounted) {
			processParams($page.url.searchParams);
		}
	}

	let oldBundle = 'None';
	let oldAddress = '';
	let oldCategory = 'None';
	let oldTokenId = '';
	let oldQuery = '';
	let oldPage = 1;
	let oldSort = 'None';
	let oldPaymentAsset = 'None';
	let oldCollection = 'none';
	let pageSet = false;
	let mounted = false;
	let searchPage = 1;
	let tokenId = 'None';
	let category = 'None',
		paymentasset = 'None',
		bundle = 'None',
		sort = 'None',
		search = '',
		address = '';
	let myHoldings = [];
	let loadingMyHoldings = false;
	let myHoldingsError = null;
	let soldItemsWithImages = [];
	let loadingSoldItemImages = false;

	// Process URL parameters
	function processParams(searchParams) {
		// Process seller parameter
		let tempAddress = searchParams.get('seller');
		if (tempAddress && tempAddress != oldAddress) {
			address = tempAddress;
			oldAddress = address;
			mounted = true;
		}

		// Process type parameter
		let tempBundle = searchParams.get('type');
		if (tempBundle && tempBundle != oldBundle) {
			if (tempBundle == 'single') {
				bundle = 'f';
			} else if (tempBundle == 'bundle') {
				bundle = 't';
			} else {
				bundle = 'None';
			}
			oldBundle = tempBundle;
			mounted = true;
		} else if (!tempBundle) {
			oldBundle = 'None';
		}

		// Process category parameter
		let tempCategory = searchParams.get('category');
		if (tempCategory && tempCategory != oldCategory) {
			category = tempCategory;
			oldCategory = category;
			mounted = true;
		}

		// Process sort parameter
		let tempSort = searchParams.get('sort');
		if (tempSort && tempSort != oldSort) {
			sort = tempSort;
			oldSort = sort;
			mounted = true;
		}

		// Process payment asset parameter
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

		// Process token ID parameter
		let tempTokenId = searchParams.get('tokenId');
		if (tempTokenId && tempTokenId != oldTokenId) {
			tokenId = tempTokenId;
			search = tokenId;
			oldTokenId = tokenId;
			mounted = true;
		}

		// Process search parameter
		let tempQuery = searchParams.get('search');
		if (tempQuery && tempQuery != oldQuery) {
			search = tempQuery;
			oldQuery = search;
			mounted = true;
		}

		// Process page parameter
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

		// Process collection tab parameter
		let tempCollectionTab = searchParams.get('tab');
		if (tempCollectionTab) {
			if (['listed', 'all', 'sold', 'my-holdings'].includes(tempCollectionTab)) {
				activeCollectionTab = tempCollectionTab;
			}
		}
	}

	async function fetchAllCollectionStats() {
		try {
			// const response = await fetch('https://api.mewfinance.com/mart/getAllCollectionsStats');
			// const allStats = await response.json();

			// if (allStats && allStats.collections) {
			// 	updateCollectionsWithStats(allStats.collections);
			// } else {
			await fetchStatsIndividually();
			// }
		} catch (error) {
			console.error('Error fetching all collection stats:', error);
			await fetchStatsIndividually();
		}
	}

	// Collection data fetching
	async function fetchCollections() {
		try {
			const response = await fetch('https://api.mewfinance.com/mart/getConfig?mart=merch');
			const data = await response.json();

			if (data.collections && Array.isArray(data.collections)) {
				collections = data.collections;
				await fetchAllCollectionStats();
				filterCollections();

				if (selectedCollection !== 'none') {
					currentCollection = collections.find((c) => c.tokenid === selectedCollection);
					fetchCollectionStats(selectedCollection);
				}
			}
		} catch (error) {
			console.error('Error fetching collections:', error);
		}
	}

	function updateCollectionsWithStats(statsArray) {
		totalCollectionItems = 0;

		const statsMap = new Map();
		statsArray.forEach((stat) => {
			if (stat.collectionId) {
				statsMap.set(stat.collectionId, stat);
			}
		});

		collections = collections.map((collection) => {
			const stats = statsMap.get(collection.tokenid);
			const listedCount = stats?.totalListed?.count || 0;
			totalCollectionItems += listedCount;

			return {
				...collection,
				itemCount: listedCount,
				stats: stats
			};
		});
	}

	async function fetchStatsIndividually() {
		totalCollectionItems = 0;
		const updatedCollections = [];

		for (const collection of collections) {
			try {
				const response = await fetch(
					`https://api.mewfinance.com/mart/getCollectionStats?collectionId=${collection.tokenid}`
				);
				const stats = await response.json();

				const listedCount = stats?.totalListed?.count || 0;
				totalCollectionItems += listedCount;

				updatedCollections.push({
					...collection,
					itemCount: listedCount,
					stats: stats
				});
			} catch (error) {
				console.error(`Error fetching stats for collection ${collection.tokenid}:`, error);
				updatedCollections.push({
					...collection,
					itemCount: 0
				});
			}
		}

		collections = updatedCollections;
	}

	function loadCollectionCounts() {
		totalCollectionItems = collections.reduce(
			(sum, collection) => sum + (collection.itemCount || 0),
			0
		);
	}

	async function fetchCollectionStats(collectionId) {
		if (!collectionId || collectionId === 'none') return;

		try {
			loadingStats = true;
			const response = await fetch(
				`https://api.mewfinance.com/mart/getCollectionStats?collectionId=${collectionId}`
			);
			const stats = await response.json();
			collectionStats = stats;
			updateStatsFromAPI(stats);
			loadingStats = false;
		} catch (error) {
			console.error(`Error fetching stats for collection ${collectionId}:`, error);
			loadingStats = false;
		}
	}

	function updateStatsFromAPI(stats) {
		if (!stats) return;

		floorPrice = stats.floor_price_usd ? `$${nFormatter(stats.floor_price_usd)}` : 'N/A';

		totalVolumeDisplay = stats.totalSold?.total_usd
			? `$${nFormatter(stats.totalSold.total_usd)}`
			: 'N/A';

		soldCount = stats.totalSold?.count || 0;
		availableItems = stats.totalListed?.count || 0;
		totalItems = (stats.totalSold?.count || 0) + (stats.totalListed?.count || 0);

		if (stats.totalSold?.count && stats.totalSold?.total_usd) {
			const avg = stats.totalSold.total_usd / stats.totalSold.count;
			averagePrice = `$${nFormatter(avg)}`;
		} else {
			averagePrice = 'N/A';
		}
	}

	function toggleCollectionDisplay() {
		showAllCollections = !showAllCollections;
		filterCollections();
	}
	// Add this to your script variables
	let showMobileFilters = false;

	// Add this function to your script
	function toggleMobileFilters() {
		showMobileFilters = !showMobileFilters;

		// Prevent body scrolling when mobile filter panel is open
		if (showMobileFilters) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
	}
	$: if ($page.url.pathname) {
		showMobileFilters = false;
		document.body.style.overflow = '';
	}
	// Reactive statements
	$: (category || paymentasset || bundle || sort) && updateFilter();

	$: connected_wallet_address.subscribe(() => {
		updateFilter(false);
	});

	$: {
		if ($collectionOrderOffers || $collectionSoldOffers) {
			if (!collectionStats) {
				updateCollectionStats();
			}
		}
	}
	$: if (category !== oldCategory && mounted) {
		collectionUpdateKey = Date.now();
		oldCategory = category;
	}
	$: {
		if (mounted && viewMode === 'collection' && selectedCollection !== 'none') {
			if (category || paymentasset || bundle || sort || search || address) {
				refreshCollection();
			}
		}
	}

	$: if ($totalBoxes !== undefined) {
		numPages = Math.ceil($totalBoxes / ITEMS_PER_PAGE) || 1;

		isDisabled = [
			currentPageNum <= 1,
			currentPageNum <= 1,
			currentPageNum >= numPages,
			currentPageNum >= numPages
		];
	}

	$: if ($connected_wallet_address && activeCollectionTab === 'my-holdings') {
		fetchMyHoldings();
	}

	$: if (selectedCollection && activeCollectionTab === 'my-holdings') {
		fetchMyHoldings();
	}

	$: if ($collectionSoldOffers && activeCollectionTab === 'sold') {
		fetchSoldItemsDetails();
	}

	$: if (collections && collections.length > 0) {
		loadCollectionCounts();
	}

	$: {
		filterCollections();
	}

	// Collection management
	function filterCollections() {
		if (!collections || collections.length === 0) {
			filteredCollections = [];
			return;
		}

		let filtered = [];

		if (!collectionSearchTerm || collectionSearchTerm.trim() === '') {
			filtered = showAllCollections ? collections : collections.slice(0, collectionDisplayLimit);
		} else {
			const searchLower = collectionSearchTerm.toLowerCase();
			filtered = collections.filter((collection) =>
				collection.name.toLowerCase().includes(searchLower)
			);
		}

		filteredCollections = filtered.sort((a, b) => {
			const countA = a.itemCount || 0;
			const countB = b.itemCount || 0;
			return countB - countA;
		});
	}

	function handleCollectionSelect(tokenId) {
		selectedCollection = tokenId;

		if (tokenId === 'none') {
			viewMode = 'all';
			collectionStats = null;
			updateSearchParams('collection', null, $page);
			updateFilter();
		} else {
			viewMode = 'collection';
			updateSearchParams('collection', tokenId, $page);
			activeCollectionTab = 'listed';
			updateSearchParams('tab', 'listed', $page);

			if (category != 'None') {
				updateSearchParams('category', category, $page);
			}

			if (sort != 'None') {
				updateSearchParams('sort', sort, $page);
			}

			if (paymentasset != 'None') {
				updateSearchParams('paymentasset', paymentasset == '' ? 'ERG' : paymentasset, $page);
			}

			if (bundle != 'None') {
				updateSearchParams('type', bundle == 't' ? 'bundle' : 'single', $page);
			}

			if (mounted) {
				currentCollection = collections.find((c) => c.tokenid === tokenId);

				loadingOffers.set(true);

				fetchCollectionStats(tokenId)
					.then(() => {
						setOffersFilter(
							category === 'None' ? undefined : category,
							paymentasset === 'None' ? undefined : paymentasset === '' ? 'ERG' : paymentasset,
							bundle === 'None' ? undefined : bundle,
							sort === 'None' ? undefined : sort,
							search === '' ? undefined : search,
							address === '' ? undefined : address,
							null,
							tokenId === 'None' ? undefined : tokenId
						);

						collectionOffers.set([]);
						collectionOrderOffers.set([]);
						collectionSoldOffers.set([]);

						return loadCollectionOffers(tokenId);
					})
					.then(() => {
						if (activeCollectionTab === 'all') {
							return fetchCollectionNFTs(tokenId, 1);
						}
					})
					.catch((error) => {
						console.error('Error loading collection data:', error);
					})
					.finally(() => {
						collectionUpdateKey = Date.now();
						loadingOffers.set(false);
					});
			}
		}
	}

	// Filter management
	function updateFilter(reset = true) {
		if (!mounted) {
			return;
		}

		if (viewMode === 'collection' && selectedCollection !== 'none') {
			updateSearchParams('collection', selectedCollection, $page);
			return;
		}

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

	async function refreshCollection() {
		if (selectedCollection !== 'none') {
			loadingOffers.set(true);

			setOffersFilter(
				category === 'None' ? undefined : category,
				paymentasset === 'None' ? undefined : paymentasset === '' ? 'ERG' : paymentasset,
				bundle === 'None' ? undefined : bundle,
				sort === 'None' ? undefined : sort,
				search === '' ? undefined : search,
				address === '' ? undefined : address,
				null,
				tokenId === 'None' ? undefined : tokenId
			);

			// Clear previous data completely
			collectionOffers.set([]);
			collectionOrderOffers.set([]);
			collectionSoldOffers.set([]);

			// Force component update
			collectionUpdateKey = Date.now();

			// Wait for data to load completely
			await loadCollectionOffers(selectedCollection);

			if (activeCollectionTab === 'all') {
				fetchCollectionNFTs(selectedCollection, currentPage);
			}

			loadingOffers.set(false);
		}
	}

	function updateCollectionStats() {
		if (collectionStats) return;

		const orderItems = get(collectionOrderOffers) || [];
		const soldItems = get(collectionSoldOffers) || [];
		const allItems = get(collectionOffers) || [];

		totalItems = allItems.length;
		availableItems = orderItems.length;
		soldCount = soldItems.length;

		const ergOffers = orderItems.filter(
			(offer) => (offer.payasset === 'ERG' || offer.payasset === '') && offer.payamount > 0
		);

		const soldErgItems = soldItems.filter(
			(offer) => (offer.payasset === 'ERG' || offer.payasset === '') && offer.payamount > 0
		);

		let totalVolume = 0;

		if (soldErgItems.length > 0) {
			totalVolume = soldErgItems.reduce((sum, item) => sum + (item.payamount || 0), 0);
			totalVolumeDisplay = `${totalVolume.toFixed(
				2
			)} <span class="font-bold text-primary">ERG</span>`;
		} else {
			totalVolumeDisplay = 'N/A';
		}

		if (ergOffers.length > 0) {
			const prices = ergOffers.map((offer) => offer.payamount || 0);

			const lowestPrice = Math.min(...prices);
			floorPrice =
				lowestPrice > 0
					? `${lowestPrice.toFixed(2)} <span class="font-bold text-primary">ERG</span>`
					: 'N/A';

			const totalPrice = prices.reduce((sum, price) => sum + price, 0);
			const avgPrice = totalPrice / prices.length;
			averagePrice =
				avgPrice > 0
					? `${avgPrice.toFixed(2)} <span class="font-bold text-primary">ERG</span>`
					: 'N/A';
		} else {
			floorPrice = 'N/A';
			averagePrice = 'N/A';
		}
	}

	// NFT actions
	function handleMakeOffer(tokenId) {
		const event = new CustomEvent('makeOffer', {
			detail: { tokenId }
		});
		window.dispatchEvent(event);
	}

	function handleSell(tokenId) {
		const event = new CustomEvent('makeSell', {
			detail: { tokenId }
		});
		window.dispatchEvent(event);
	}

	// Collection tabs
	function setActiveCollectionTab(tab) {
		activeCollectionTab = tab;
		updateSearchParams('tab', tab, $page);

		if (tab === 'all' && selectedCollection !== 'none') {
			fetchCollectionNFTs(selectedCollection, 1);
		}

		if (tab === 'sold' && selectedCollection !== 'none') {
			fetchSoldItemsDetails();
		}

		if (tab === 'my-holdings') {
			fetchMyHoldings();
		}
	}

	// Data fetching
	async function fetchCollectionNFTs(collectionId, page = 1) {
		if (!collectionId) return;

		if (selectedCollection != collectionId) return;

		try {
			loadingCollectionNFTs = true;

			const limit = ITEMS_PER_COLLECTION_PAGE;
			const offset = (page - 1) * limit;

			const response = await fetch(
				`https://api.ergexplorer.com/tokens/byCollectionId?id=${collectionId}&offset=${offset}&limit=${limit}`
			);
			const data = await response.json();

			if (data.items && Array.isArray(data.items)) {
				collectionAllNFTs = data.items;

				if (data.total) {
					totalPages = Math.ceil(data.total / limit);
				} else {
					totalPages = 1;
				}

				currentPage = page;
			}

			loadingCollectionNFTs = false;
		} catch (error) {
			console.error(`Error fetching collection NFTs for ${collectionId}:`, error);
			loadingCollectionNFTs = false;
		}
	}

	async function fetchMyHoldings() {
		if (!$connected_wallet_address) {
			myHoldings = [];
			myHoldingsError = 'Please connect your wallet to view your holdings';
			return;
		}

		try {
			loadingMyHoldings = true;
			myHoldingsError = null;

			const response = await fetch(
				`https://api.ergoplatform.com/api/v1/addresses/${$connected_wallet_address}/balance/confirmed`
			);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || 'Failed to fetch wallet holdings');
			}

			const tokens = data.tokens || [];

			if (tokens.length === 0) {
				myHoldings = [];
				loadingMyHoldings = false;
				return;
			}

			const tokenIds = tokens.map((token) => token.tokenId);

			const tokenResponse = await fetch(`${EE_API}tokens/byId`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ ids: tokenIds })
			});

			const tokenData = await tokenResponse.json();

			if (!tokenData.items) {
				throw new Error('Failed to fetch token details');
			}

			const tokenDetailsMap = new Map();
			tokenData.items.forEach((token) => {
				tokenDetailsMap.set(token.id, token);
			});

			let holdingsToDisplay = [];

			if (selectedCollection !== 'none') {
				holdingsToDisplay = tokens
					.filter((token) => {
						const details = tokenDetailsMap.get(token.tokenId);
						return details && details.collectionid === selectedCollection;
					})
					.map((token) => {
						const details = tokenDetailsMap.get(token.tokenId);
						return {
							...token,
							...details,
							amount: token.amount,
							id: token.tokenId,
							imageUrl:
								details.cachedurl ||
								details.iconurl ||
								(details.additionalRegisters?.R9
									? formatNftUrl(details.additionalRegisters.R9.renderedValue)
									: null),
							verified: COLLECTIONS.includes(details.collectionid)
						};
					});
			} else {
				holdingsToDisplay = tokens
					.filter((token) => {
						const details = tokenDetailsMap.get(token.tokenId);
						return (
							details &&
							details.type === 'EIP-004' &&
							details.decimals === '0' &&
							token.amount === '1'
						);
					})
					.map((token) => {
						const details = tokenDetailsMap.get(token.tokenId);
						return {
							...token,
							...details,
							id: token.tokenId,
							imageUrl:
								details.cachedurl ||
								details.iconurl ||
								(details.additionalRegisters?.R9
									? formatNftUrl(details.additionalRegisters.R9.renderedValue)
									: null),
							verified: COLLECTIONS.includes(details.collectionid)
						};
					});
			}

			myHoldings = holdingsToDisplay;
			loadingMyHoldings = false;
		} catch (error) {
			console.error('Error fetching holdings:', error);
			myHoldingsError = error.message || 'Failed to load your holdings';
			myHoldings = [];
			loadingMyHoldings = false;
		}
	}

	async function fetchSoldItemsDetails() {
		try {
			loadingSoldItemImages = true;

			const soldItems = get(collectionSoldOffers) || [];

			console.log(soldItems);

			if (soldItems.length === 0) {
				soldItemsWithImages = [];
				loadingSoldItemImages = false;
				return;
			}

			const nftTokenIds = [];
			const paymentTokenIds = [];

			soldItems.forEach((item) => {
				if (item.assets && item.assets.length > 0) {
					nftTokenIds.push(item.assets[0].tokenId);
				}

				if (item.payasset && item.payasset !== 'ERG') {
					paymentTokenIds.push(item.payasset);
				}
			});

			const uniqueTokenIds = [...new Set([...nftTokenIds, ...paymentTokenIds])].filter((id) => id);

			if (uniqueTokenIds.length === 0) {
				soldItemsWithImages = soldItems.map((item) => ({
					...item,
					payassetName: item.payasset === 'ERG' ? 'ERG' : item.payasset
				}));
				loadingSoldItemImages = false;
				return;
			}

			const response = await fetch(`${EE_API}tokens/byId`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ ids: uniqueTokenIds })
			});

			const data = await response.json();

			if (data && data.items) {
				const tokenDetailsMap = new Map();
				data.items.forEach((token) => {
					tokenDetailsMap.set(token.id, token);
				});

				soldItemsWithImages = soldItems.map((item) => {
					const newItem = { ...item };

					if (item.assets && item.assets.length > 0) {
						const tokenId = item.assets[0].tokenId;
						const tokenDetails = tokenDetailsMap.get(tokenId);

						if (tokenDetails) {
							newItem.imageUrl =
								tokenDetails.cachedurl ||
								tokenDetails.iconurl ||
								(tokenDetails.additionalRegisters?.R9
									? formatNftUrl(tokenDetails.additionalRegisters.R9.renderedValue)
									: null);

							newItem.name = item.assets[0].name || tokenDetails.name;
							newItem.collectionName = tokenDetails.collectionname;
						}
					}

					if (item.payasset === 'ERG') {
						newItem.payassetName = 'ERG';
					} else {
						const paymentTokenDetails = tokenDetailsMap.get(item.payasset);
						if (paymentTokenDetails) {
							newItem.payassetName = paymentTokenDetails.name || item.payasset;
						} else {
							newItem.payassetName = item.payasset;
						}
					}

					return newItem;
				});
			} else {
				soldItemsWithImages = soldItems.map((item) => ({
					...item,
					payassetName: item.payasset === 'ERG' ? 'ERG' : item.payasset
				}));
			}

			loadingSoldItemImages = false;
		} catch (error) {
			console.error('Error fetching sold items details:', error);
			soldItemsWithImages =
				get(collectionSoldOffers).map((item) => ({
					...item,
					payassetName: item.payasset === 'ERG' ? 'ERG' : item.payasset
				})) || [];
			loadingSoldItemImages = false;
		}
	}

	// Event handlers
	function handleKeyDown(event) {
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

			if (viewMode === 'collection') {
				refreshCollection();
			} else {
				updateFilter();
			}
		}
	}

	function handleUrlChangedEvent(event) {
		processParams(event.detail.params);
	}

	function handleMakeOfferEvent(event) {
		toggleModal();
	}

	// Pagination
	function handleCollectionNFTsPageChange(page) {
		currentPage = page;
		fetchCollectionNFTs(selectedCollection, page);
	}

	function changePage(page) {
		if (page < 1) page = 1;
		if (page > numPages) page = numPages;

		currentPageNum = page;
		searchPage = page;

		updateSearchParams('page', page, $page);
		loadOffers((page - 1) * ITEMS_PER_PAGE);
	}

	function enterPageNum() {
		const newPage = prompt('Enter page number (1-' + numPages + '):', currentPageNum);
		if (newPage !== null) {
			const pageNum = parseInt(newPage);
			if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
				changePage(pageNum);
			}
		}
	}

	// Infinite scroll
	function activateAutoLoad() {
		autoLoad = true;

		window.onscroll = function () {
			if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
				if (!$loadingOffers && currentPageNum < numPages) {
					currentPageNum++;
					loadOffers((currentPageNum - 1) * ITEMS_PER_PAGE);
				}
			}
		};
	}

	// Helper function to format NFT URLs
	function formatNftUrl(url) {
		if (!url) return null;

		if (url.startsWith('http')) {
			return url;
		}

		if (url.startsWith('ipfs://')) {
			return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
		}

		return url;
	}

	// Function to refresh stats manually
	function refreshStats() {
		if (selectedCollection !== 'none') {
			fetchCollectionStats(selectedCollection);
		}
	}
	// Add this function to your script
	function handleCollectionChange() {
		// Call your existing collection selection handler with the new selectedCollection value
		handleCollectionSelect(selectedCollection);
	}
	onMount(async () => {
		mounted = true;

		await fetchCollections();

		if (viewMode === 'collection' && selectedCollection !== 'none') {
			await fetchCollectionStats(selectedCollection);

			setOffersFilter(
				category === 'None' ? undefined : category,
				paymentasset === 'None' ? undefined : paymentasset === '' ? 'ERG' : paymentasset,
				bundle === 'None' ? undefined : bundle,
				sort === 'None' ? undefined : sort,
				search === '' ? undefined : search,
				address === '' ? undefined : address,
				null,
				tokenId === 'None' ? undefined : tokenId
			);
			await loadCollectionOffers(selectedCollection);

			if (activeCollectionTab === 'all') {
				fetchCollectionNFTs(selectedCollection, 1);
			}
		} else if (!$loadingOffers) {
			updateFilter(false);
		}

		// Add event listeners
		window.addEventListener('urlChanged', handleUrlChangedEvent);

		return () => {
			// Cleanup event listeners
			window.removeEventListener('urlChanged', handleUrlChangedEvent);

			// Remove scroll event listener if it was set
			if (autoLoad) {
				window.onscroll = null;
			}
		};
	});
</script>

<div class="container">
	<br />
	<h2 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">Collections</h2>

	{#if selectedCollection === 'none' || viewMode !== 'collection'}
		<!-- Top Filters Layout for All Collections View -->
		<div class="advanced-filters-row">
			<div class="combined-filters-row">
				<!-- Left side: Collection dropdown -->
				<div class="filter-section collection-filter-section">
					<select
						bind:value={selectedCollection}
						id="collection"
						class="filter-select collection-select"
						on:change={handleCollectionChange}
					>
						{#each collections as collection}
							<option value={collection.tokenid}>{collection.name}</option>
						{/each}
					</select>
				</div>

				<!-- Middle: Sort dropdown -->

				<!-- Right side: Advanced Filters Toggle -->
				<button
					class="btn btn-primary advanced-filter-toggle"
					on:click={() => (showAdvancedFilters = !showAdvancedFilters)}
				>
					<i class="fas fa-sliders-h" />
					{showAdvancedFilters ? 'Hide Filters' : 'Show Filters'}
				</button>
			</div>

			{#if showAdvancedFilters}
				<div class="advanced-filters-row" transition:slide={{ duration: 300 }}>
					<div class="filters-grid">
						<!-- Seller/Search Filter -->
						<div class="filter-group">
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

						<!-- Asset Name/ID Filter -->
						<div class="filter-group">
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

						<!-- Category Filter -->
						<div class="filter-group">
							<select bind:value={category} id="category" class="filter-select">
								<option value="None" selected>Category (All)</option>
								{#each CATEGORIES as category}
									<option value={category.name}>{category.name}</option>
								{/each}
							</select>
						</div>

						<!-- Payment Filter -->
						<div class="filter-group">
							<select bind:value={paymentasset} id="paymentasset" class="filter-select">
								<option value="None" selected>Payment (All)</option>
								{#each ASSETS as asset}
									<option value={asset.tokenId}>{asset.name}</option>
								{/each}
							</select>
						</div>

						<!-- Type Filter -->
						<div class="filter-group">
							<select bind:value={bundle} id="bundle" class="filter-select">
								<option value="None" selected>Type (All)</option>
								<option value="f">Single offers</option>
								<option value="t">Bundle offers</option>
							</select>
						</div>

						<div class="filter-section sort-filter-section">
							<select bind:value={sort} id="sort" class="filter-select sort-select">
								<option value="None">Recent</option>
								<option value="recent">Most recent</option>
								<option value="oldest">Oldest</option>
							</select>
						</div>
					</div>

					<button on:click={updateFilter} class="btn btn-primary apply-filter-btn" type="button">
						<i class="fas fa-filter" /> Apply Filters
					</button>
				</div>
			{/if}
		</div>

		<!-- All Offers Display -->

		<!-- Pagination -->
		<div class="pagination-container">
			{#if !autoLoad}
				<div class="pagination-wrapper">
					<button
						class="page-link {isDisabled[0] ? 'is-disabled' : ''}"
						on:click={() => changePage(-1)}
						aria-label="First page"
					>
						<i class="fas fa-angle-double-left" />
					</button>

					<button
						class="page-link {isDisabled[1] ? 'is-disabled' : ''}"
						on:click={() => changePage(currentPageNum - 3)}
						aria-label="Previous page"
					>
						<i class="fas fa-angle-left" />
					</button>

					<!-- Current page indicator that's clickable for manual page entry -->
					<button class="page-link pageNum" on:click={enterPageNum}>
						{currentPageNum} of {numPages}
					</button>

					<button
						class="page-link {isDisabled[2] ? 'is-disabled' : ''}"
						on:click={() => changePage(currentPageNum - 1)}
						aria-label="Next page"
					>
						<i class="fas fa-angle-right" />
					</button>

					<button
						class="page-link {isDisabled[3] ? 'is-disabled' : ''}"
						on:click={() => changePage(numPages - 2)}
						aria-label="Last page"
					>
						<i class="fas fa-angle-double-right" />
					</button>

					{#if $totalBoxes > 0 && numPages > 1 && currentPageNum < numPages}
						<button
							class="page-link infinite-btn"
							disabled={$loadingOffers}
							on:click={activateAutoLoad}
							aria-label="Infinite scroll"
						>
							∞
						</button>
					{/if}
				</div>
			{/if}

			{#if autoLoad && $loadingOffers}
				<div class="loading-container">
					<div class="spinner" />
					<p>Loading more offers...</p>
				</div>
			{/if}
		</div>
	{:else if selectedCollection !== 'none' && viewMode === 'collection' && currentCollection}
		<!-- Two-Column Layout for Collection View -->
		<!-- Collection Banner -->
		<div
			class="collection-banner"
			style="background-image: url('{currentCollection.images_url ||
				'https://via.placeholder.com/400x150?text=No+Image'}')"
		>
			<div class="collection-overlay" />

			<div class="collection-stats-container">
				<div class="collection-header">
					<div class="collection-logo">
						<img
							src={currentCollection.images_url ||
								'https://via.placeholder.com/80x80?text=No+Image'}
							alt={currentCollection.name}
						/>
						{#if currentCollection.verified}
							<div class="verified-badge" title="Verified Collection">
								<i class="fas fa-check-circle" />
							</div>
						{/if}
					</div>
					<div class="collection-info">
						<h2 class="collection-name">{currentCollection.name}</h2>

						<!-- Social links -->
						<div class="social-links">
							{#if currentCollection.website}
								<a
									href={currentCollection.website}
									target="_blank"
									rel="noopener noreferrer"
									class="social-link"
									title="Website"
								>
									<i class="fas fa-globe" />
								</a>
							{/if}

							{#if currentCollection.twitter}
								<a
									href="https://twitter.com/{currentCollection.twitter}"
									target="_blank"
									rel="noopener noreferrer"
									class="social-link"
									title="Twitter"
								>
									<i class="fab fa-twitter" />
								</a>
							{/if}

							{#if currentCollection.telegram}
								<a
									href="https://t.me/{currentCollection.telegram}"
									target="_blank"
									rel="noopener noreferrer"
									class="social-link"
									title="Telegram"
								>
									<i class="fab fa-telegram-plane" />
								</a>
							{/if}
							{#if currentCollection.Discord}
								<a
									href={currentCollection.discord}
									target="_blank"
									rel="noopener noreferrer"
									class="social-link"
									title="Telegram"
								>
									<i class="fab fa-discord-plane" />
								</a>
							{/if}
						</div>
					</div>
				</div>

				<div class="collection-stats-overlay">
					{#if loadingStats}
						<div class="loading-stats">
							<div class="spinner-small" />
							<span>Loading stats...</span>
						</div>
					{:else}
						<div class="stat-boxes">
							<div class="stat-box">
								<div class="stat-value">{totalItems}</div>
								<div class="stat-label">Items</div>
							</div>

							<div class="stat-box">
								<div class="stat-value">{availableItems}</div>
								<div class="stat-label">Listed</div>
							</div>

							<div class="stat-box">
								<div class="stat-value">{soldCount}</div>
								<div class="stat-label">Sold</div>
							</div>

							<div class="stat-box price-box">
								<div class="stat-value">{@html floorPrice}</div>
								<div class="stat-label">Floor</div>
							</div>

							<div class="stat-box price-box">
								<div class="stat-value">{@html totalVolumeDisplay}</div>
								<div class="stat-label">Volume</div>
							</div>

							<div class="stat-box price-box">
								<div class="stat-value">{@html averagePrice}</div>
								<div class="stat-label">Avg Price</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Two-column layout for filters and content in collection view -->
		<div class="two-column-layout">
			<!-- Left Column: Filters (Desktop only) -->
			<div class="filters-column">
				<!-- Collection Selector (Always visible) -->
				<!-- Collection Selection Section with Search -->
				<!-- Collection Selection Section with Search -->
				<div class="filter-section">
					<h3 class="filter-heading">Collections</h3>

					<!-- Search bar for collections -->
					<div class="filter-search mb-3">
						<div class="input-with-icon">
							<i class="fas fa-search search-icon" />
							<input
								bind:value={collectionSearchTerm}
								on:input={filterCollections}
								class="search-input"
								type="text"
								placeholder="Search collections..."
							/>
						</div>
					</div>

					<!-- Collections list (single column) -->
					<div class="collections-list">
						<!-- "All Collections" option -->

						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						{#each filteredCollections as collection}
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<div
								class="collection-item {selectedCollection === collection.tokenid
									? 'selected'
									: ''}"
								on:click={() => handleCollectionSelect(collection.tokenid)}
							>
								<div class="collection-thumb">
									<img
										src={collection.images_url || 'https://via.placeholder.com/40x40?text=C'}
										alt={collection.name}
									/>
								</div>
								<div class="collection-name-wrap">
									<span class="collection-name-text">{collection.name}</span>
									<span class="collection-count">{collection.itemCount || 0}</span>
								</div>
							</div>
						{/each}
					</div>

					<!-- Show more/less toggle if collections exceed limit -->
					{#if collections.length > collectionDisplayLimit}
						<button class="btn btn-info w-100" on:click={toggleCollectionDisplay}>
							{showAllCollections
								? 'Show Less'
								: `Show More (${collections.length - collectionDisplayLimit})`}
						</button>
					{/if}
				</div>
				{#if false}
					<!-- Search Filters -->
					<div class="filter-section">
						<h3 class="filter-heading">Search</h3>
						<div class="filter-search">
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

						<div class="filter-search mt-2">
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
					</div>
				{/if}

				<!-- Filter Dropdown Selectors -->
				<div class="filter-section">
					<h3 class="filter-heading">Filters</h3>

					<div class="filter-group mb-2">
						<label for="category-sidebar" class="filter-label">Category</label>
						<select bind:value={category} id="category-sidebar" class="filter-select">
							<option value="None" selected>All Categories</option>
							{#each CATEGORIES as category}
								<option value={category.name}>{category.name}</option>
							{/each}
						</select>
					</div>

					<div class="filter-group mb-2">
						<label for="paymentasset-sidebar" class="filter-label">Payment</label>
						<select bind:value={paymentasset} id="paymentasset-sidebar" class="filter-select">
							<option value="None" selected>All Payments</option>
							{#each ASSETS as asset}
								<option value={asset.tokenId}>{asset.name}</option>
							{/each}
						</select>
					</div>

					<div class="filter-group mb-2">
						<label for="bundle-sidebar" class="filter-label">Type</label>
						<select bind:value={bundle} id="bundle-sidebar" class="filter-select">
							<option value="None" selected>All Types</option>
							<option value="f">Single offers</option>
							<option value="t">Bundle offers</option>
						</select>
					</div>

					<div class="filter-group mb-2">
						<label for="sort-sidebar" class="filter-label">Sort by</label>
						<select bind:value={sort} id="sort-sidebar" class="filter-select">
							<option value="None" selected>Most recent</option>
							<option value="recent">Most recent</option>
							<option value="oldest">Oldest</option>
						</select>
					</div>

					<button on:click={refreshCollection} class="btn btn-primary w-full mt-3" type="button">
						<i class="fas fa-filter" /> Apply Filters
					</button>
				</div>
				<div class="filter-section">
					<h3 class="filter-heading">Ad</h3>
					<a
						class="block bg-bg h-[250px] place-content-center"
						href="https://t.me/MewFinance"
						target="_new"
					>
						<p class="w-full font-bold text-center">Your Ad here.</p>
						<!-- <img
						src="https://8b30f4237c53f8ab981e-32ed400f512ec2f68c7b46cf1b23937c.ssl.cf3.rackcdn.com/blog/google-ads-sizing/250x250.jpg"
						alt="Advertisement"
					/> -->
					</a>
				</div>
			</div>

			<!-- Right Column: Content -->
			<div class="content-column">
				<!-- Collection Tabs -->
				<div class="collection-tabs">
					<button
						class="tab-btn {activeCollectionTab === 'listed' ? 'active' : ''}"
						on:click={() => setActiveCollectionTab('listed')}
					>
						Listed NFTs
					</button>
					<button
						class="tab-btn {activeCollectionTab === 'all' ? 'active' : ''}"
						on:click={() => setActiveCollectionTab('all')}
					>
						All NFTs
					</button>
					<button
						class="tab-btn {activeCollectionTab === 'sold' ? 'active' : ''}"
						on:click={() => setActiveCollectionTab('sold')}
					>
						Sold NFTs
					</button>
					<button
						class="tab-btn {activeCollectionTab === 'my-holdings' ? 'active' : ''}"
						on:click={() => setActiveCollectionTab('my-holdings')}
					>
						My Holdings
					</button>
				</div>

				<!-- Collection View Content -->
				{#if activeCollectionTab === 'listed'}
					<div class="offers-container all-orders">
						<SoloOffers collectionId={selectedCollection} updateKey={collectionUpdateKey} />
					</div>
				{:else if activeCollectionTab === 'all'}
					<div class="tab-content">
						{#if loadingCollectionNFTs}
							<div class="loading-container">
								<Loading />
							</div>
						{:else if collectionAllNFTs.length === 0}
							<div class="empty-state">
								<p>No NFTs found in this collection</p>
							</div>
						{:else}
							<div class="offers-container all-orders">
								{#each collectionAllNFTs as nft}
									<div class="nft-card">
										<div class="nft-image">
											<img
												src={nft.cachedurl || 'https://via.placeholder.com/200x200?text=No+Image'}
												alt={nft.name}
											/>
											<!-- Verified Badge as SVG -->
											<span
												title="Verified Collection"
												class="absolute top-[5px] right-[5px] p-[2px] rounded-full border-1 border-primary"
												style="background-color: var(--forms-bg); z-index: 5;"
											>
												<svg
													viewBox="0 0 16 16"
													fill="none"
													xmlns="http://www.w3.org/2000/svg"
													class="p-[2px] w-[30px] h-[30px]"
												>
													<path
														fill-rule="evenodd"
														clip-rule="evenodd"
														d="M14.6563 5.24291C15.4743 5.88358 16 6.8804 16 8C16 9.11964 15.4743 10.1165 14.6562 10.7572C14.7816 11.7886 14.4485 12.8652 13.6568 13.6569C12.8651 14.4486 11.7885 14.7817 10.7571 14.6563C10.1164 15.4743 9.1196 16 8 16C6.88038 16 5.88354 15.4743 5.24288 14.6562C4.21141 14.7817 3.13481 14.4485 2.34312 13.6568C1.55143 12.8652 1.2183 11.7886 1.34372 10.7571C0.525698 10.1164 0 9.1196 0 8C0 6.88038 0.525715 5.88354 1.34376 5.24288C1.21834 4.21141 1.55147 3.13481 2.34316 2.34312C3.13485 1.55143 4.21145 1.2183 5.24291 1.34372C5.88358 0.525698 6.8804 0 8 0C9.11964 0 10.1165 0.525732 10.7572 1.3438C11.7886 1.21838 12.8652 1.55152 13.6569 2.3432C14.4486 3.13488 14.7817 4.21146 14.6563 5.24291ZM12.2071 6.20711L10.7929 4.79289L7 8.58579L5.20711 6.79289L3.79289 8.20711L7 11.4142L12.2071 6.20711Z"
														style="fill: var(--main-color);"
													/>
												</svg>
											</span>
										</div>
										<div class="nft-info">
											<h3 class="nft-name">
												<a target="_new" href="https://ergexplorer.com/token/{nft.id}">{nft.name}</a
												>
											</h3>
										</div>
										<div class="w-100 p-3">
											<button class="btn btn-primary w-100" on:click={() => handleMakeOffer(nft.id)}
												>Make Offer</button
											>
										</div>
									</div>
								{/each}
							</div>

							<!-- Pagination for All NFTs view -->
							{#if totalPages > 1}
								<div class="pagination-container">
									<div class="pagination-wrapper">
										<button
											class="page-link {currentPage === 1 ? 'is-disabled' : ''}"
											on:click={() => handleCollectionNFTsPageChange(1)}
											aria-label="First page"
										>
											<i class="fas fa-angle-double-left" />
										</button>

										<button
											class="page-link {currentPage === 1 ? 'is-disabled' : ''}"
											on:click={() => handleCollectionNFTsPageChange(currentPage - 1)}
											aria-label="Previous page"
										>
											<i class="fas fa-angle-left" />
										</button>

										<!-- Current page indicator -->
										<span class="page-link">
											{currentPage} / {totalPages}
										</span>

										<button
											class="page-link {currentPage === totalPages ? 'is-disabled' : ''}"
											on:click={() => handleCollectionNFTsPageChange(currentPage + 1)}
											aria-label="Next page"
										>
											<i class="fas fa-angle-right" />
										</button>

										<button
											class="page-link {currentPage === totalPages ? 'is-disabled' : ''}"
											on:click={() => handleCollectionNFTsPageChange(totalPages)}
											aria-label="Last page"
										>
											<i class="fas fa-angle-double-right" />
										</button>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				{:else if activeCollectionTab === 'my-holdings'}
					<div class="tab-content">
						{#if !$connected_wallet_address}
							<div class="connect-wallet-notice">
								<p>Please connect your wallet to view your holdings</p>
								<!-- Use the existing wallet connection flow instead of a dedicated button -->
								<p class="text-sm mt-2">Use the wallet connector in the navigation bar</p>
							</div>
						{:else if loadingMyHoldings}
							<div class="loading-container">
								<Loading />
							</div>
						{:else if myHoldingsError}
							<div class="error-state">
								<p>{myHoldingsError}</p>
							</div>
						{:else if myHoldings.length === 0}
							<div class="empty-state">
								{#if selectedCollection !== 'none'}
									<p>You don't own any NFTs from this collection</p>
								{:else}
									<p>You don't own any NFTs</p>
								{/if}
							</div>
						{:else}
							<div class="offers-container all-orders">
								{#each myHoldings as nft}
									<div class="nft-card">
										<div class="nft-image">
											<img
												src={nft.imageUrl || 'https://via.placeholder.com/200x200?text=No+Image'}
												alt={nft.name}
											/>

											<!-- Verified Badge as SVG -->
											<span
												title="Verified Collection"
												class="absolute top-[5px] right-[5px] p-[2px] rounded-full border-1 border-primary"
												style="background-color: var(--forms-bg); z-index: 5;"
											>
												<svg
													viewBox="0 0 16 16"
													fill="none"
													xmlns="http://www.w3.org/2000/svg"
													class="p-[2px] w-[30px] h-[30px]"
												>
													<path
														fill-rule="evenodd"
														clip-rule="evenodd"
														d="M14.6563 5.24291C15.4743 5.88358 16 6.8804 16 8C16 9.11964 15.4743 10.1165 14.6562 10.7572C14.7816 11.7886 14.4485 12.8652 13.6568 13.6569C12.8651 14.4486 11.7885 14.7817 10.7571 14.6563C10.1164 15.4743 9.1196 16 8 16C6.88038 16 5.88354 15.4743 5.24288 14.6562C4.21141 14.7817 3.13481 14.4485 2.34312 13.6568C1.55143 12.8652 1.2183 11.7886 1.34372 10.7571C0.525698 10.1164 0 9.1196 0 8C0 6.88038 0.525715 5.88354 1.34376 5.24288C1.21834 4.21141 1.55147 3.13481 2.34316 2.34312C3.13485 1.55143 4.21145 1.2183 5.24291 1.34372C5.88358 0.525698 6.8804 0 8 0C9.11964 0 10.1165 0.525732 10.7572 1.3438C11.7886 1.21838 12.8652 1.55152 13.6569 2.3432C14.4486 3.13488 14.7817 4.21146 14.6563 5.24291ZM12.2071 6.20711L10.7929 4.79289L7 8.58579L5.20711 6.79289L3.79289 8.20711L7 11.4142L12.2071 6.20711Z"
														style="fill: var(--main-color);"
													/>
												</svg>
											</span>
										</div>
										<div class="nft-info">
											<h3 class="nft-name">
												<a target="_new" href="https://ergexplorer.com/token/{nft.id}">{nft.name}</a
												>
											</h3>
										</div>
										<div class="w-100 p-3">
											<button class="btn btn-primary w-100" on:click={() => handleSell(nft.id)}
												>Sell</button
											>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else if activeCollectionTab === 'sold'}
					<div class="tab-content">
						{#if loadingSoldItemImages}
							<div class="loading-container">
								<Loading />
							</div>
						{:else if soldItemsWithImages.length === 0}
							<div class="empty-state">
								<p>No sold items found for this collection</p>
							</div>
						{:else}
							<div class="offers-container all-orders">
								{#each soldItemsWithImages as item}
									<div class="nft-card sold-card">
										<div class="nft-image">
											<img
												src={item.imageUrl || 'https://via.placeholder.com/200x200?text=No+Image'}
												alt={item.name}
											/>
											<div class="sold-badge">SOLD</div>
										</div>
										<div class="nft-info">
											<h3 class="nft-name">
												<a
													target="_new"
													href="https://ergexplorer.com/token/{item.assets[0].tokenId}"
													>{item.name}</a
												>
											</h3>
											<div class="sold-price">
												<span class="sold-price-label">Sold for:</span>
												<span class="sold-price-value">
													{item.payamount}
													{item.payassetName || item.payasset || 'ERG'}
												</span>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="w-100 relative min-h-[200px] mt-[100px] col-span-12 my-12 bg-bg">
			<Loading />
		</div>
	{/if}

	<br />
</div>
<!-- Mobile Filter Toggle Button (visible only on mobile) -->
<button class="mobile-filter-toggle btn btn-primary" on:click={toggleMobileFilters}>
	<i class="fas fa-filter" />
</button>

<!-- Mobile Filter Panel (hidden by default) -->
<div class="mobile-filter-panel {showMobileFilters ? 'show' : ''}">
	<div class="filter-panel-header">
		<h3 class="filter-panel-title">Filters</h3>
		<button class="close-panel-btn" on:click={toggleMobileFilters}>
			<i class="fas fa-times" />
		</button>
	</div>

	<div class="compact-filter-card">
		<!-- Two-column grid for dropdowns -->
		<div class="filter-grid">
			<!-- Left column -->
			<div class="filter-column">
				<!-- Collection Selection -->
				<div class="filter-item">
					<label for="mobile-collection" class="filter-label">Collection</label>
					<select
						id="mobile-collection"
						bind:value={selectedCollection}
						class="filter-select"
						on:change={handleCollectionChange}
					>
						<option value="none">All Collections</option>
						{#each collections as collection}
							<option value={collection.tokenid}>{collection.name}</option>
						{/each}
					</select>
				</div>

				<!-- Category Selection -->
				<div class="filter-item">
					<label for="mobile-category" class="filter-label">Category</label>
					<select id="mobile-category" bind:value={category} class="filter-select">
						<option value="None" selected>All Categories</option>
						{#each CATEGORIES as category}
							<option value={category.name}>{category.name}</option>
						{/each}
					</select>
				</div>

				<!-- Payment Selection -->
				<div class="filter-item">
					<label for="mobile-payment" class="filter-label">Payment</label>
					<select id="mobile-payment" bind:value={paymentasset} class="filter-select">
						<option value="None" selected>All Payments</option>
						{#each ASSETS as asset}
							<option value={asset.tokenId}>{asset.name}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Right column -->
			<div class="filter-column">
				<!-- Type Selection -->
				<div class="filter-item">
					<label for="mobile-type" class="filter-label">Type</label>
					<select id="mobile-type" bind:value={bundle} class="filter-select">
						<option value="None" selected>All Types</option>
						<option value="f">Single offers</option>
						<option value="t">Bundle offers</option>
					</select>
				</div>

				<!-- Sort Selection -->
				<div class="filter-item">
					<label for="mobile-sort" class="filter-label">Sort by</label>
					<select id="mobile-sort" bind:value={sort} class="filter-select">
						<option value="None">Most recent</option>
						<option value="recent">Most recent</option>
						<option value="oldest">Oldest</option>
					</select>
				</div>

				<!-- Asset Search -->
				<div class="filter-item">
					<label for="mobile-search" class="filter-label">Asset Search</label>
					<div class="input-with-icon">
						<i class="fas fa-search search-icon" />
						<input
							id="mobile-search"
							bind:value={search}
							on:keydown={handleKeyDown}
							class="search-input"
							type="text"
							placeholder="Asset name or ID..."
						/>
					</div>
				</div>
			</div>
		</div>

		<!-- Seller address (full width) -->
		<div class="filter-item full-width">
			<label for="mobile-seller" class="filter-label">Seller Address</label>
			<div class="input-with-icon">
				<i class="fas fa-user search-icon" />
				<input
					id="mobile-seller"
					bind:value={address}
					on:keydown={handleKeyDown}
					class="search-input"
					type="text"
					placeholder="Seller address..."
				/>
			</div>
		</div>

		<!-- Apply button -->
		<button
			on:click={() => {
				refreshCollection();
				toggleMobileFilters();
			}}
			class="btn btn-primary w-full mt-3"
		>
			Apply Filters
		</button>
	</div>
</div>

<!-- Filter backdrop (darkens the screen behind the filter panel) -->
<div class="filter-backdrop {showMobileFilters ? 'show' : ''}" on:click={toggleMobileFilters} />

<style>
	/* Mobile Filter Panel styles */
	.mobile-filter-toggle {
		display: none; /* Hidden by default */
		position: fixed;
		bottom: 20px;
		left: 20px;
		z-index: 1000;
		width: 50px;
		height: 50px;
		border-radius: 50%;
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
		justify-content: center;
		align-items: center;
		font-size: 1.2rem;
	}

	.mobile-filter-panel {
		position: fixed;
		left: 0;
		bottom: 0;
		width: 100%;
		background: var(--bg);
		z-index: 1010;
		transform: translateY(100%);
		transition: transform 0.3s ease-in-out;
		max-height: 80vh;
		overflow-y: auto;
		border-top-left-radius: 15px;
		border-top-right-radius: 15px;
		box-shadow: 0 -5px 15px rgba(0, 0, 0, 0.2);
		padding: 15px;
	}

	.mobile-filter-panel.show {
		transform: translateY(0);
	}

	.filter-panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 15px;
		padding-bottom: 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.filter-panel-title {
		font-size: 1.1rem;
		font-weight: 600;
		color: white;
		margin: 0;
	}

	.close-panel-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 5px;
	}

	/* Compact card styling */
	.compact-filter-card {
		background: var(--forms-bg);
		border-radius: 10px;
		padding: 15px;
		margin-bottom: 10px;
	}

	/* Grid layout for filters */
	.filter-grid {
		display: flex;
		gap: 10px;
		margin-bottom: 10px;
	}

	.filter-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.filter-item {
		margin-bottom: 8px;
	}

	.filter-label {
		display: block;
		font-size: 0.75rem;
		margin-bottom: 3px;
		color: rgba(255, 255, 255, 0.7);
	}

	.filter-select {
		width: 100%;
		background: var(--footer);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 0.85rem;
	}

	.full-width {
		grid-column: 1 / -1;
	}

	.filter-backdrop {
		display: none; /* Hide by default on all screen sizes */
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.filter-backdrop.show {
		opacity: 1;
		pointer-events: auto;
	}

	/* Only show the mobile elements on small screens */
	@media (max-width: 768px) {
		.mobile-filter-toggle {
			display: flex;
		}

		.filter-backdrop {
			display: block;
		}

		/* Adjust grid to stack on very small screens */
		@media (max-width: 480px) {
			.filter-grid {
				flex-direction: column;
			}
		}
	}

	/* Filter Styles */
	.filter-section {
		background: var(--forms-bg);
		border-radius: 10px;
		padding: 12px;
		margin-bottom: 15px;
	}

	.filter-heading {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0 0 10px 0;
		color: rgba(255, 255, 255, 0.9);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 5px;
	}

	.filter-label {
		display: block;
		font-size: 0.75rem;
		margin-bottom: 3px;
		color: rgba(255, 255, 255, 0.7);
	}

	.filter-select {
		width: 100%;
		background: var(--footer);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 0.85rem;
	}

	.collection-select {
		border: 1px solid var(--main-color);
	}

	.filter-group {
		position: relative;
		margin-bottom: 10px;
	}

	.filter-search {
		margin-bottom: 10px;
	}

	/* Input Styling */
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
		height: 36px;
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

	/* Combined Filters Row */
	.combined-filters-row {
		display: flex;
		align-items: center;
		gap: 15px;
		margin-bottom: 15px;
	}

	.collection-filter-section,
	.sort-filter-section {
		flex: 1;
		background: var(--forms-bg);
		border-radius: 10px;
		padding: 12px;
		margin-bottom: 0;
	}

	.advanced-filter-toggle {
		white-space: nowrap;
		padding: 12px 16px;
		height: 100%;
	}

	/* Advanced Filters */
	.advanced-filters-row {
		margin-bottom: 20px;
		background: var(--forms-bg);
		border-radius: 10px;
		padding: 15px;
	}

	.filters-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 15px;
	}

	.apply-filter-btn {
		width: 100%;
	}

	/* Two-column layout */
	.two-column-layout {
		display: flex;
		gap: 20px;
		margin-bottom: 20px;
	}

	.filters-column {
		width: 280px;
		flex-shrink: 0;
	}

	.content-column {
		flex: 1;
		min-width: 0; /* Allows the column to shrink below its content size */
	}

	/* Collection List Styles */
	.collections-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 300px;
		overflow-y: auto;
		margin-bottom: 10px;
	}

	.collection-item {
		display: flex;
		align-items: center;
		gap: 8px;
		background: var(--footer);
		border-radius: 8px;
		padding: 8px 10px;
		cursor: pointer;
		transition: all 0.2s;
		border: 1px solid transparent;
	}

	.collection-item:hover {
		background: var(--background);
	}

	.collection-item.selected {
		border-color: var(--main-color);
		background: var(--background);
	}

	.collection-name-wrap {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		overflow: hidden;
	}

	.collection-name-text {
		font-size: 0.8rem;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.collection-count {
		background: var(--main-color);
		color: var(--background);
		font-weight: bold;
		font-size: 0.7rem;
		padding: 2px 6px;
		border-radius: 10px;
		margin-left: 8px;
		flex-shrink: 0;
	}

	.collection-thumb {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		overflow: hidden;
		flex-shrink: 0;
	}

	.collection-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.collection-icon {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--main-color);
		flex-shrink: 0;
	}

	.show-more-btn {
		width: 100%;
		text-align: center;
		background: transparent;
		border: none;
		color: var(--main-color);
		font-size: 0.75rem;
		padding: 5px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.show-more-btn:hover {
		text-decoration: underline;
	}

	/* Collection Banner and Stats */
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
		position: relative;
	}

	.collection-logo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.collection-info {
		display: flex;
		flex-direction: column;
	}

	.collection-name {
		font-size: 1.5rem;
		font-weight: bold;
		margin: 0;
		color: white;
		text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
	}

	/* Social Links */
	.social-links {
		display: flex;
		gap: 10px;
		margin-top: 5px;
	}

	.social-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #0e09176e;
		color: var(--main-color);
		text-decoration: none;
		transition: all 0.2s ease;
	}

	.verified-badge {
		position: absolute;
		bottom: -5px;
		right: -5px;
		background: var(--main-color);
		color: white;
		border-radius: 50%;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--bg);
		font-size: 12px;
	}

	/* Collection Stats */
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
	}

	.price-box {
		background: var(--forms-bg);
	}

	.highlight-box {
		border: 1px solid var(--main-color);
	}

	.stat-value {
		font-size: 1.1rem;

		font-weight: bold;
		color: white;
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--main-color);
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	/* Collection Tabs */
	.collection-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid rgba(255, 255, 255, 0.1);
		padding-bottom: 0.5rem;
	}

	.tab-btn {
		background: var(--forms-bg);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		border-radius: 6px 6px 0 0;
	}

	.tab-btn.active {
		color: var(--footer);
		border-bottom-color: var(--main-color);
		background: var(--main-color);
	}

	.tab-btn:hover:not(.active) {
		color: var(--main-color);
	}

	/* NFT Card Styling */
	.offers-container {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 20px;
		justify-content: space-between;
		margin-bottom: 25px;
	}

	.nft-card {
		background: var(--forms-bg);
		border-radius: 12px;
		overflow: hidden;
		transition: all 0.2s ease;
		position: relative;
	}

	.nft-card:hover {
		scale: 1.03;
		box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
	}

	.nft-image {
		height: 180px;
		overflow: hidden;
		position: relative;
		background-color: black;
	}

	.nft-image img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.nft-info {
		padding: 0.75rem;
		padding-bottom: 0;
	}

	.nft-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: white;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Special NFT states */
	.sold-card {
		opacity: 0.9;
	}

	.sold-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		background: rgba(222, 53, 11, 0.8);
		color: white;
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		font-weight: bold;
		border-radius: 4px;
		letter-spacing: 0.5px;
	}

	.sold-price {
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}

	.sold-price-label {
		color: rgba(255, 255, 255, 0.7);
		margin-right: 0.25rem;
	}

	.sold-price-value {
		color: var(--main-color);
		font-weight: 600;
	}

	/* Loading and Error States */
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

	.loading-container,
	.empty-state {
		grid-column: 1/-1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top: 3px solid var(--main-color);
		border-radius: 50%;
		margin-bottom: 1rem;
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

	.error-state {
		grid-column: 1/-1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		padding: 2rem;
		color: rgba(255, 150, 150, 0.9);
		text-align: center;
		background: rgba(255, 0, 0, 0.1);
		border-radius: 12px;
	}

	.connect-wallet-notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		padding: 2rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.7);
		background: rgba(0, 0, 0, 0.2);
		border-radius: 12px;
	}

	/* Pagination */
	.pagination-container {
		margin-top: 20px;
		margin-bottom: 20px;
	}

	.pagination-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 5px;
	}

	.page-link {
		padding: 8px 12px;
		border: 0 !important;
		background: var(--forms-bg);
		color: var(--main-color);
		border-radius: 6px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 36px;
		text-align: center;
	}

	.page-link:hover:not(.is-disabled) {
		background: rgba(255, 255, 255, 0.1);
	}

	.page-link.is-disabled {
		color: var(--text-light) !important;
		cursor: default !important;
		pointer-events: none;
		user-select: none;
		opacity: 0.5;
	}

	.infinite-btn {
		margin-left: 10px;
		font-size: 1.5rem;
		padding: 4px 12px;
	}

	/* Advertisement */
	.ad-placeholder {
		width: 250px;
		max-width: 100%;
		margin: 0 auto 20px auto;
		background: var(--forms-bg);
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		position: relative;
	}

	.ad-placeholder img {
		width: 100%;
		height: auto;
		object-fit: cover;
		display: block;
	}

	.ad-placeholder::after {
		content: 'Advertisement';
		position: absolute;
		top: 5px;
		right: 10px;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(0, 0, 0, 0.3);
		padding: 2px 6px;
		border-radius: 4px;
	}

	/* Mobile Filter Panel */
	.mobile-filter-panel {
		position: fixed;
		left: 0;
		bottom: 0;
		width: 100%;
		background: var(--bg);
		z-index: 1010;
		transform: translateY(100%);
		transition: transform 0.3s ease-in-out;
		max-height: 80vh;
		overflow-y: auto;
		border-top-left-radius: 15px;
		border-top-right-radius: 15px;
		box-shadow: 0 -5px 15px rgba(0, 0, 0, 0.2);
		padding: 15px;
	}

	.mobile-filter-panel.show {
		transform: translateY(0);
	}

	.filter-panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 15px;
		padding-bottom: 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.filter-panel-title {
		font-size: 1.2rem;
		font-weight: 600;
		color: white;
	}

	.close-panel-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.7);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 5px;
	}

	.filter-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.filter-backdrop.show {
		opacity: 1;
		pointer-events: auto;
	}

	/* Mobile filter toggle button */
	.mobile-filter-toggle {
		display: none;
		position: fixed;
		bottom: 20px;
		left: 20px;
		z-index: 1000;
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
		border-radius: 50%;
		width: 50px;
		height: 50px;
		text-align: center;
		line-height: 50px;
		padding: 0;
	}

	/* Utility Classes */
	.all-orders {
		margin-top: 20px;
	}

	.no-orders {
		grid-column: 1 / -1;
		text-align: center;
		color: #888;
	}

	.mt-2 {
		margin-top: 0.5rem;
	}

	.mt-3 {
		margin-top: 0.75rem;
	}

	.mb-2 {
		margin-bottom: 0.5rem;
	}

	.mb-3 {
		margin-bottom: 0.75rem;
	}

	.w-full {
		width: 100%;
	}

	/* Responsive Breakpoints */
	@media (min-width: 400px) {
		.offers-container {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 600px) {
		.offers-container {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (min-width: 900px) {
		.offers-container {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (min-width: 1200px) {
		.offers-container {
			grid-template-columns: repeat(4, 1fr);
		}
	}

	@media (max-width: 1024px) {
		.filters-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.offers-container {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	@media (max-width: 900px) {
		.offers-container {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 768px) {
		.combined-filters-row {
			flex-direction: column;
			align-items: stretch;
		}

		.collection-filter-section,
		.sort-filter-section,
		.advanced-filter-toggle {
			width: 100%;
		}

		.filters-grid {
			grid-template-columns: 1fr;
		}

		.two-column-layout {
			flex-direction: column;
		}

		.filters-column {
			width: 100%;
			order: 2;
			display: none;
		}

		.filters-column.show-mobile {
			display: block;
		}

		.content-column {
			order: 1;
		}

		.collection-tabs {
			flex-wrap: nowrap;
			overflow-x: auto;
			padding-bottom: 10px;
			margin-bottom: 15px;
			-webkit-overflow-scrolling: touch;
			scrollbar-width: none;
		}

		.collection-tabs::-webkit-scrollbar {
			display: none;
		}

		.tab-btn {
			flex: 0 0 auto;
			white-space: nowrap;
		}

		.mobile-filter-toggle {
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.stat-boxes {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 5px;
		}

		.stat-box {
			min-width: 0;
			padding: 0.3rem;
			border-radius: 6px;
		}

		.stat-value {
			font-size: 0.85rem;
		}

		.stat-label {
			font-size: 0.6rem;
		}

		.social-links {
			margin-top: 3px;
			gap: 8px;
		}

		.social-link {
			width: 28px;
			height: 28px;
			font-size: 0.9rem;
		}

		.ad-placeholder img {
			height: 150px;
		}
	}

	@media (max-width: 480px) {
		.offers-container {
			grid-template-columns: repeat(1, 1fr);
		}

		.pagination-wrapper {
			flex-wrap: wrap;
			justify-content: center;
		}

		.page-link {
			padding: 6px 10px;
			min-width: 32px;
			font-size: 0.8rem;
		}

		.collection-header {
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: 0.5rem;
		}

		.collection-logo {
			width: 50px;
			height: 50px;
		}

		.collection-name {
			font-size: 1.2rem;
		}

		.stat-boxes {
			grid-template-columns: repeat(2, 1fr);
		}

		.stat-value {
			font-size: 0.9rem;
		}

		.stat-label {
			font-size: 0.6rem;
		}
	}
</style>
