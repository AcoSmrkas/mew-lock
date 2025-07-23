<script lang="ts">
	import {
		collectionOffers,
		collectionOrderOffers,
		assetsInfos,
		loadingCollectionOffers,
		loadCollectionOffers
	} from '$lib/store/store';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import { onMount } from 'svelte';
	import Loading from '../common/Loading.svelte';

	// Make collectionId optional with a default value
	export let collectionId: string = '';

	let orders = [];
	let availableOrders = []; // For storing only available orders
	let loadComplete = false;
	let offersLoaded = false;
	let currentCollection = null;

	// Find collection details if available
	$: if (collectionId && window.appConfig && window.appConfig.collections) {
		currentCollection = window.appConfig.collections.find((c) => c.tokenid === collectionId);
	}

	onMount(() => {
		// console.log(`Collection component mounted with ID: ${collectionId}`);
		if (collectionId) {
			loadCollectionOffers(collectionId);
		} else {
			console.error('No collection ID provided');
		}
	});

	// Subscribe to collection order offers (available items)
	$: collectionOrderOffers.subscribe((offers) => {
		// console.log(`Collection order offers updated: ${offers.length} items`);
		if (offers.length > 0) {
			availableOrders = offers;
			console.log('Available orders updated with new offers');
		} else {
			availableOrders = [];
		}
	});

	// Subscribe to all collection offers
	$: collectionOffers.subscribe((offers) => {
		// console.log(`Collection offers updated: ${offers.length} items`);
		if (offers.length > 0) {
			orders = offers;
		} else {
			orders = [];
		}
	});

	// Subscribe to assets info to know when data is fully loaded
	$: assetsInfos.subscribe(async (value) => {
		// console.log(`Assets info updated: ${value.length} items`);
		if (value.length == 0) {
			offersLoaded = false;
			loadComplete = false;
			return;
		}

		if (offersLoaded || !$loadingCollectionOffers) {
			loadComplete = true;
			console
				.log
				// `Load complete set to true. Orders: ${orders.length}, Available: ${availableOrders.length}`
				();
		}

		if (orders.length > 0 && !offersLoaded) {
			offersLoaded = true;
			// console.log('Offers loaded set to true');
		}
	});

	// Also track the loading state directly
	$: $loadingCollectionOffers, updateLoadState();

	function updateLoadState() {
		// console.log(`Loading state changed: ${$loadingCollectionOffers}`);
		if (!$loadingCollectionOffers && orders.length > 0) {
			offersLoaded = true;
			loadComplete = true;
			// console.log('Load state updated to complete');
		}
	}
</script>

{#if $loadingCollectionOffers}
	<div class="loading-container">
		<Loading />
	</div>
{:else if loadComplete && availableOrders.length > 0}
	{#each availableOrders as offer}
		<BuyWidget {offer} />
	{/each}
{:else if availableOrders.length === 0 && !$loadingCollectionOffers}
	<div class="empty-state">
		<p>No available items found in this collection.</p>
	</div>
{/if}

<style>
	.loading-container {
		margin-top: 50px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 0;
		grid-column: 1 / -1;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		grid-column: 1 / -1;
	}

	.empty-state p {
		margin-bottom: 1rem;
		font-size: 1.1rem;
		opacity: 0.8;
	}

	.refresh-btn {
		background: rgba(155, 102, 255, 0.2);
		color: white;
		border: none;
		border-radius: 4px;
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		cursor: pointer;
		display: flex;
		margin: 0 auto;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: background 0.2s ease;
	}

	.refresh-btn:hover {
		background: rgba(155, 102, 255, 0.3);
	}
</style>
