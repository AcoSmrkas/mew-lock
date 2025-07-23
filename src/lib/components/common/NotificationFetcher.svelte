<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import { connected_wallet_address } from '$lib/store/store.ts';
	import { ASSETS, API_HOST, CONTRACT_CRC32, OLD_CONTRACT_CRC32 } from '$lib/common/const.ts';

	// Props
	export let type = 'all'; // 'buy', 'sell', 'list', 'cancel', or 'all'
	export let limit = 30;
	export let refreshInterval = 120000; // 2 minutes by default
	export let autoRefresh = true;
	export let showNotifications = true;

	// Local state
	let loading = false;
	let orders = [];
	let refreshIntervalId;
	let isInitialLoad = true;
	let refreshing = false;

	const dispatch = createEventDispatcher();

	// Helper function to get asset info by tokenId
	function getAssetInfo(tokenId: string) {
		if (tokenId === 'ERG') {
			return { name: 'ERG', decimals: 9 };
		}
		if (tokenId === '18c938e1924fc3eadc266e75ec02d81fe73b56e4e9f4e268dffffcb30387c42d') {
			return { name: 'AHT', decimals: 0 };
		}
		if (tokenId === 'bd0c25c373ad606d78412ae1198133f4573b4e4c2d4ed3fc4c2a4547c6c6e12e') {
			return { name: '🤡', decimals: 3 };
		}
		return ASSETS.find((item) => item.tokenId === tokenId) || { name: 'Unknown', decimals: 0 };
	}

	// Function to fetch buy orders
	async function fetchBuyOrders(walletAddress, checkForNew = false) {
		try {
			// For Buy orders: Use status=Sold and filter where buyer is wallet address
			const url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACT_CRC32}&contract[]=${CONTRACT_CRC32}&offset=0&limit=1000&status=Sold&sort=buytime`;
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch buy orders');
			}
			const data = await response.json();

			// Filter orders where the connected wallet is the buyer
			return data.items
				.filter((order) => order.buyer === walletAddress)
				.map((order) => {
					const assetInfo = getAssetInfo(order.payasset);
					return {
						...order,
						payassetName: assetInfo.name,
						payassetDecimals: assetInfo.decimals,
						notificationType: 'buy',
						timestamp: order.timestamp,
						read: isInitialLoad || !checkForNew
					};
				});
		} catch (error) {
			console.error('Error fetching buy orders:', error);
			return [];
		}
	}

	// Function to fetch sell orders
	async function fetchSellOrders(walletAddress, checkForNew = false) {
		try {
			// For Sell orders: Use status=Sold and seller=walletAddress
			const url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACT_CRC32}&contract[]=${CONTRACT_CRC32}&offset=0&limit=30&status=Sold&seller=${walletAddress}`;
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch sell orders');
			}
			const data = await response.json();

			return data.items.map((order) => {
				const assetInfo = getAssetInfo(order.payasset);
				return {
					...order,
					payassetName: assetInfo.name,
					payassetDecimals: assetInfo.decimals,
					notificationType: 'sell',
					timestamp: order.timestamp,
					read: isInitialLoad || !checkForNew
				};
			});
		} catch (error) {
			console.error('Error fetching sell orders:', error);
			return [];
		}
	}

	// Function to fetch listing orders
	async function fetchListingOrders(walletAddress, checkForNew = false) {
		try {
			// For Listing orders: Use status=Order and seller=walletAddress
			const url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACT_CRC32}&contract[]=${CONTRACT_CRC32}&offset=0&limit=30&status=Order&seller=${walletAddress}`;
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch listing orders');
			}
			const data = await response.json();

			return data.items.map((order) => {
				const assetInfo = getAssetInfo(order.payasset);
				return {
					...order,
					payassetName: assetInfo.name,
					payassetDecimals: assetInfo.decimals,
					notificationType: 'list',
					timestamp: order.timestamp,
					read: isInitialLoad || !checkForNew
				};
			});
		} catch (error) {
			console.error('Error fetching listing orders:', error);
			return [];
		}
	}

	// Function to fetch canceled orders
	async function fetchCanceledOrders(walletAddress, checkForNew = false) {
		try {
			// For Canceled orders: Use status=Canceled and seller=walletAddress
			const url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACT_CRC32}&contract[]=${CONTRACT_CRC32}&offset=0&limit=30&status=Canceled&seller=${walletAddress}`;
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch canceled orders');
			}
			const data = await response.json();

			return data.items.map((order) => {
				const assetInfo = getAssetInfo(order.payasset);
				return {
					...order,
					payassetName: assetInfo.name,
					payassetDecimals: assetInfo.decimals,
					notificationType: 'cancel',
					timestamp: order.timestamp,
					read: isInitialLoad || !checkForNew
				};
			});
		} catch (error) {
			console.error('Error fetching canceled orders:', error);
			return [];
		}
	}

	// Main function to load all notifications
	async function loadAllNotifications(checkForNew = false) {
		const walletAddress = get(connected_wallet_address);
		if (!walletAddress) return;

		try {
			if (!checkForNew) {
				loading = true;
			} else {
				refreshing = true;
			}

			// Fetch appropriate orders based on type
			let result = [];
			if (type === 'all') {
				// Fetch all types of orders
				const [buyOrders, sellOrders, listingOrders, canceledOrders] = await Promise.all([
					fetchBuyOrders(walletAddress, checkForNew),
					fetchSellOrders(walletAddress, checkForNew),
					fetchListingOrders(walletAddress, checkForNew),
					fetchCanceledOrders(walletAddress, checkForNew)
				]);
				result = [...buyOrders, ...sellOrders, ...listingOrders, ...canceledOrders];
			} else if (type === 'buy') {
				result = await fetchBuyOrders(walletAddress, checkForNew);
			} else if (type === 'sell') {
				result = await fetchSellOrders(walletAddress, checkForNew);
			} else if (type === 'list') {
				result = await fetchListingOrders(walletAddress, checkForNew);
			} else if (type === 'cancel') {
				result = await fetchCanceledOrders(walletAddress, checkForNew);
			}

			if (checkForNew) {
				// Check for new transactions
				const newOrders = result.filter(
					(newOrder) => !orders.some((existingOrder) => existingOrder.txidin === newOrder.txidin)
				);

				if (newOrders.length > 0) {
					orders = [...newOrders, ...orders];

					// Emit new orders event
					dispatch('newOrders', {
						orders: newOrders,
						count: newOrders.length,
						type
					});
				}
			} else {
				orders = result;
				isInitialLoad = false;
			}

			// Sort orders by timestamp (newest first)
			orders = orders.sort((a, b) => {
				const dateA = new Date(a.timestamp || 0);
				const dateB = new Date(b.timestamp || 0);
				return dateB - dateA;
			});

			// Emit loaded event
			dispatch('loaded', { orders });
		} catch (error) {
			console.error('Error loading orders:', error);
			dispatch('error', { error });
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	// Refresh function that can be called from parent
	export function refresh() {
		loadAllNotifications(true);
		return refreshing;
	}

	// Set up automatic refresh
	onMount(() => {
		loadAllNotifications();

		if (autoRefresh) {
			refreshIntervalId = setInterval(() => {
				loadAllNotifications(true);
			}, refreshInterval);
		}
	});

	// Clean up on component destroy
	onDestroy(() => {
		if (refreshIntervalId) {
			clearInterval(refreshIntervalId);
		}
	});

	// Reactive statement to reload when props change
	$: {
		if (!isInitialLoad && type) {
			loadAllNotifications();
		}
	}
</script>

{#if showNotifications}
	{#if loading}
		<slot name="loading">
			<div class="loading-indicator">Loading transactions...</div>
		</slot>
	{:else if orders.length === 0}
		<slot name="empty">
			<div class="empty-notifications">No transactions to display</div>
		</slot>
	{:else}
		<slot {orders} isRefreshing={refreshing}>
			<!-- Default rendering if no slot content provided -->
			<ul>
				{#each orders as order}
					<li>{order.notificationType}: Transaction {order.txidin}</li>
				{/each}
			</ul>
		</slot>
	{/if}
{/if}

<style>
	.loading-indicator,
	.empty-notifications {
		padding: 20px 0;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 13px;
	}
</style>
