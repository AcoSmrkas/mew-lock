import {
	CONTRACT_CRC32,
	OFFERS_CRC32,
	ITEMS_PER_PAGE,
	MAIN_PAGE_ITEMS_BUNDLE,
	MAIN_PAGE_ITEMS_SINGLE,
	API_HOST,
	OLD_CONTRACTS_CRC32,
	EE_API
} from '$lib/common/const.ts';
import { writable, get } from 'svelte/store';
import axios from 'axios';
import JSONbig from 'json-bigint-native';
import { fetchBoxes } from '$lib/api-explorer/explorer.js';

const MEW_TIER = 'mew_tier';

export type Token = {
	amount: bigint;
	tokenId: string;
};

export const socket = writable(undefined);
export const mempoolTxs = writable([]);
export const unconfirmedOrderBoxes = writable([]);
export const unconfirmedInputBoxIds = writable([]);
export const wallet_init = writable(false);
export const selected_wallet_ergo = writable('');
export const connected_wallet_address = writable('');
export const connected_wallet_addresses = writable([]);
export const connected_wallet_balance = writable(0);
export const preloaded = writable(false);
export const offers = writable([]);
export const offersPackage = writable([]);
export const offersSolo = writable([]);
export const offersMy = writable([]);
export const assetsInfos = writable([]);
export const totalBoxes = writable(0);
export const mewTier = writable(0);
export const authorizedMerchant = writable(false);
export const merchantName = writable('');
export const merchantSaleFee = writable(0);
export const loadingOffers = writable(false);
export const showPleaseWaitModal = writable(false);
export const collectionOffers = writable([]);
export const collectionOrderOffers = writable([]); // For status=Order items
export const collectionSoldOffers = writable([]); // For status=Sold items
export const loadingCollectionOffers = writable(false);
export const totalCollectionBoxes = writable(0); // Store for total items count
export const utxos = writable([]);
export const utxosTokenInfos = writable([]);
export const utxosAssets = writable([]);
export const utxosLoading = writable(false);

export const showNsfw = persistentWritable('showNsfw', false);

let lastAllOfferRequestId = 0;
let selectedCategory,
	selectedAsset,
	selectedBundle,
	selectedSort,
	selectedSearch,
	selectedAddress,
	selectedNotAddress,
	selectedTokenId;

$: connected_wallet_address.subscribe(async (value) => {
	if (value == '') {
		mewTier.set(0);
		authorizedMerchant.set(false);
		merchantName.set('');
		merchantSaleFee.set(0);
		return;
	}

	const mewTierData = (await axios.post(`${API_HOST}staking/getMewTier`, JSON.stringify([value])))
		.data.items[0];

	mewTier.set(mewTierData.tier);
	localStorage.setItem(MEW_TIER, get(mewTier));

	const merchantData = (await axios.get(`${API_HOST}mart/getMerchantData?address=${value}`)).data;

	authorizedMerchant.set(merchantData.items[0].authorized);

	if (merchantData.items[0].authorized) {
		merchantName.set(merchantData.items[0].store);
		merchantSaleFee.set(merchantData.items[0].salefee);
	} else {
		merchantName.set('');
		merchantSaleFee.set(0);
	}
});

$: unconfirmedInputBoxIds.subscribe((value) => {
	const currentOffers = get(offers);
	const currentOffersPackage = get(offersPackage);
	const currentOffersSolo = get(offersSolo);
	const currentOffersMy = get(offersMy);

	for (const o of currentOffers) {
		if (value.includes(o.boxin)) {
			o.issold = true;
		}
	}

	for (const o of currentOffersPackage) {
		if (value.includes(o.boxin)) {
			o.issold = true;
		}
	}

	for (const o of currentOffersSolo) {
		if (value.includes(o.boxin)) {
			o.issold = true;
		}
	}

	for (const o of currentOffersMy) {
		if (value.includes(o.boxin)) {
			o.issold = true;
		}
	}

	offers.set(currentOffers);
	offersPackage.set(currentOffersPackage);
	offersSolo.set(currentOffersSolo);
	offersMy.set(currentOffersMy);
});

export async function setOffersFilter(
	category,
	asset,
	bundle,
	sort,
	search,
	address,
	notAddress,
	tokenId
) {
	if (category == 'None') {
		category = undefined;
	}

	if (asset == 'None') {
		asset = undefined;
	}

	if (bundle == 'None') {
		bundle = undefined;
	}

	if (sort == 'None') {
		sort = undefined;
	}

	if (search == '') {
		search = undefined;
	}

	if (address == '') {
		address = undefined;
	}

	if (notAddress == '') {
		notAddress = undefined;
	}

	if (tokenId == 'None') {
		tokenId = undefined;
	}

	selectedCategory = category;
	selectedAsset = asset;
	selectedBundle = bundle;
	selectedSort = sort;
	selectedSearch = search;
	selectedAddress = address;
	selectedNotAddress = notAddress;
	selectedTokenId = tokenId;
}

export async function loadOffers(offset, add = false) {
	loadingOffers.set(true);

	if (!add) {
		offers.set([]);
		totalBoxes.set(0);
	}

	let orders = [];
	lastAllOfferRequestId++;
	const allOfferRequestId = 0 + lastAllOfferRequestId;
	const newOrders = await fetchOrders(offset, ITEMS_PER_PAGE);

	if (add) {
		orders = get(offers).concat(newOrders);
	} else {
		orders = newOrders;
	}

	if (allOfferRequestId == lastAllOfferRequestId) {
		await onOffersLoaded(offers, orders);
	}
}

export async function loadOffersPackage() {
	offersPackage.set([]);

	const orders = await fetchOrders(0, MAIN_PAGE_ITEMS_BUNDLE, true);

	await onOffersLoaded(offersPackage, orders);
}

export async function loadOffersSolo() {
	offersSolo.set([]);

	const orders = await fetchOrders(0, MAIN_PAGE_ITEMS_SINGLE, false);

	await onOffersLoaded(offersSolo, orders);
}

export async function loadMyOffers() {
	loadingOffers.set(true);
	offersMy.set([]);

	let walletAddress = get(connected_wallet_address);
	if (walletAddress == '') {
		return;
	}

	const orders = await fetchOrders(0, 1000, null, walletAddress, true);

	await onOffersLoaded(offersMy, orders);
}

async function onOffersLoaded(container, offers) {
	container.set(offers);

	await fetchAssetsInfo(offers);

	loadingOffers.set(false);
}

async function fetchOrders(offset, limit, bundle = null, seller = null, all = false) {
	try {
		let url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${OFFERS_CRC32}&offset=${offset}&limit=${limit}&status=Order`;

		if (bundle !== null || selectedBundle != null) {
			url += `&bundle=${bundle == true || selectedBundle == 't' ? 't' : 'f'}`;
		}

		if (selectedCategory != null) {
			url += `&category=${selectedCategory}`;
		}

		if (selectedAsset != null) {
			url += `&asset=${selectedAsset}`;
		}

		if (all) {
			url += `&hidden=all`;
		}

		if (selectedSort != null) {
			switch (selectedSort) {
				case 'recent':
					url += `&sortDir=DESC`;
					break;
				case 'oldest':
					url += `&sortDir=ASC`;
					break;
				default:
					break;
			}
		}

		if (selectedTokenId != null) {
			url += `&tokenId=${selectedTokenId}`;
		} else {
			if (selectedSearch != null) {
				url += `&search=${selectedSearch.replace(/#/g, '%23')}`;
			}
		}

		if (selectedAddress != null) {
			url += `&address=${selectedAddress}`;
		}

		if (selectedNotAddress != null) {
			url += `&notaddress=${selectedNotAddress}`;
		}

		if (seller !== null) {
			url += `&seller=${seller}`;
		}

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`Error fetching orders list: ${response.statusText}`);
		}

		const data = await response.json();

		if (bundle === null) {
			totalBoxes.set(data.total);
		}

		return data.items;
	} catch (error) {
		console.error('Failed to fetch orders list:', error);
		return [];
	}
}

export async function fetchAssetsInfo(orders) {
	let ids = [];

	const assetsInfosVal = get(assetsInfos);

	for (let offer of orders) {
		ids.push(offer.payasset);
		for (let asset of offer.assets) {
			const assetInfo = assetsInfosVal.find((a) => a.id === asset.tokenId);

			if (assetInfo) {
				continue;
			}

			if (!ids.includes(asset.tokenId)) {
				ids.push(asset.tokenId);
			}
		}
	}

	if (ids.length == 0) {
		return;
	}

	const response = await fetch(`https://api.ergexplorer.com/tokens/byId`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ ids: ids })
	});

	const responseItems = (await response.json()).items;

	assetsInfos.update((a) => {
		return a.concat(responseItems);
	});
}

function persistentWritable(key, initialValue) {
	// Get the initial value from localStorage if it exists, otherwise use the provided initialValue
	const storedValue = localStorage.getItem(key);
	const data = storedValue ? JSON.parse(storedValue) : initialValue;

	const store = writable(data);

	// Subscribe to the store and update localStorage whenever the store's value changes
	store.subscribe((value) => {
		localStorage.setItem(key, JSON.stringify(value));
	});

	return store;
}
/**
 * Loads offers for a specific collection
 * @param collectionId - The ID of the collection to fetch offers for
 * @param limit - Optional limit for number of items to return
 */
export async function loadCollectionOffers(collectionId, limit = 100) {
	// console.log(`Loading collection offers for collection ID: ${collectionId}`);

	if (!collectionId) {
		console.warn('No collection ID provided');
		return;
	}

	loadingCollectionOffers.set(true);
	collectionOffers.set([]);
	collectionOrderOffers.set([]);
	collectionSoldOffers.set([]);
	totalCollectionBoxes.set(0);

	try {
		// Fetch Order status items
		// console.log(`Fetching Order status items for collection with limit: ${limit}`);
		const orderItems = await fetchCollectionOrdersByStatus(collectionId, 'Order', limit);
		// console.log(`Received ${orderItems.length} items with Order status`);
		collectionOrderOffers.set(orderItems);

		// Fetch Sold status items
		// console.log(`Fetching Sold status items for collection with limit: ${limit}`);
		const soldItems = await fetchCollectionOrdersByStatus(collectionId, 'Sold', limit);
		// console.log(`Received ${soldItems.length} items with Sold status`);
		collectionSoldOffers.set(soldItems);

		// Combine both sets for the main collection offers
		const allItems = [...orderItems, ...soldItems];
		// console.log(`Total combined items: ${allItems.length}`);

		// Set the collection offers store
		collectionOffers.set(allItems);

		// Update the total items count
		totalCollectionBoxes.set(allItems.length);

		// Process through the usual onOffersLoaded function
		await onOffersLoaded(collectionOffers, allItems);
		console.log('Collection offers loaded and processed successfully');
	} catch (error) {
		console.error('Failed to load collection offers:', error);
	} finally {
		loadingCollectionOffers.set(false);
	}
}

/**
 * Fetches orders for a specific collection with a given status
 * @param collectionId - The ID of the collection
 * @param status - The status to filter by ("Order" or "Sold")
 * @param limit - Maximum number of items to return
 * @returns Array of order objects
 */
async function fetchCollectionOrdersByStatus(collectionId, status, limit = 100) {
	try {
		let url = `${API_HOST}mart/getOrders?collectionId=${collectionId}&status=${status}&limit=${limit}`;

		// Add contract filtering like in main fetchOrders function
		url += `&contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${OFFERS_CRC32}`;

		// Apply bundle filter
		if (selectedBundle != null) {
			url += `&bundle=${selectedBundle == 't' ? 't' : 'f'}`;
		}

		// Apply category filter
		if (selectedCategory != null) {
			url += `&category=${selectedCategory}`;
		}

		// Apply asset filter
		if (selectedAsset != null) {
			url += `&asset=${selectedAsset}`;
		}

		// Apply sort filter
		if (selectedSort != null) {
			switch (selectedSort) {
				case 'recent':
					url += `&sortDir=DESC`;
					break;
				case 'oldest':
					url += `&sortDir=ASC`;
					break;
				default:
					break;
			}
		}

		// Apply search or token ID filter
		if (selectedTokenId != null) {
			url += `&tokenId=${selectedTokenId}`;
		} else if (selectedSearch != null) {
			url += `&search=${selectedSearch.replace(/#/g, '%23')}`;
		}

		// Apply address filter
		if (selectedAddress != null) {
			url += `&address=${selectedAddress}`;
		}

		// Apply notAddress filter
		if (selectedNotAddress != null) {
			url += `&notaddress=${selectedNotAddress}`;
		}

		// console.log(`Fetching collection items from URL: ${url}`);

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(
				`Error fetching collection orders with status ${status}: ${response.statusText}`
			);
		}

		const data = await response.json();
		// console.log(`Total ${status} items in response: ${data.total}`);

		// Set the total boxes separately for Order status items
		if (status === 'Order') {
			totalCollectionBoxes.set(data.total || 0);
		}

		return data.items || [];
	} catch (error) {
		console.error(`Failed to fetch collection orders with status ${status}:`, error);
		return [];
	}
}

function sumTokens(acc, e) {
	if (acc.some((t) => t.tokenId == e.tokenId)) {
		acc.find((t) => t.tokenId == e.tokenId).amount += e.amount;
		return acc;
	} else {
		return [...acc, e];
	}
}

export async function fetchUtxos(walletAddress) {
	const assetsLoading = get(utxosLoading);
	const selectedWallet = get(selected_wallet_ergo);
	let address = get(connected_wallet_address);

	if (!address) {
		utxosLoading.set(false);
		return;
	}

	if (assetsLoading && address == walletAddress) return;
	if (!walletAddress || walletAddress == '') return;

	if (selectedWallet) {
		let boxes = null;

		utxosLoading.set(true);
		boxes = await fetchBoxes(address);
		const boxesStringified = JSONbig.stringify(boxes);

		const assets = boxes
			.flatMap((b) =>
				b.assets.map((t) => {
					t.amount = BigInt(t.amount);
					return t;
				})
			)
			.reduce(sumTokens, []);
		const ids = assets.map((asset) => asset.tokenId);
		const tokenInfos = (
			await (
				await fetch(`${EE_API}tokens/byId`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ ids: ids })
				})
			).json()
		).items;

		address = get(connected_wallet_address);
		if (address == walletAddress) {
			utxos.set(JSONbig.parse(boxesStringified));
			utxosAssets.set(assets);
			utxosTokenInfos.set(tokenInfos);

			setTimeout(fetchUtxos, 10000, walletAddress);
		}
	}

	utxosLoading.set(false);
}
