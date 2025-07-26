import axios from 'axios';

// Hardcode the constants to avoid browser dependencies
const MAIN_PAGE_ITEMS_BUNDLE = 10;
const MAIN_PAGE_ITEMS_SINGLE = 10;
const API_HOST = 'https://api.mewfinance.com/';
const CONTRACT_CRC32 = '1006322691';
const OFFERS_CRC32 = '3062309557';
const OLD_CONTRACTS_CRC32 = ['1785495617', '1006322691'];

async function fetchOrders(offset, limit, bundle = null) {
	try {
		let url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${OFFERS_CRC32}&offset=${offset}&limit=${limit}&status=Order`;

		if (bundle !== null) {
			url += `&bundle=${bundle === true ? 't' : 'f'}`;
		}

		const response = await axios.get(url);
		// Ensure we return an array, not the full response object
		return response.data?.items || response.data || [];
	} catch (error) {
		console.error('Error fetching orders:', error);
		return [];
	}
}

export async function load() {
	// Use streaming to show layout immediately while data loads
	return {
		streamed: {
			preloadedData: Promise.all([
				fetchOrders(0, MAIN_PAGE_ITEMS_BUNDLE, true),
				fetchOrders(0, MAIN_PAGE_ITEMS_SINGLE, false)
			]).then(([packageData, soloData]) => ({
				packageData,
				soloData
			}))
		}
	};
}
