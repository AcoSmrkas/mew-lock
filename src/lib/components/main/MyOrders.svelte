<script lang="ts">
	import { offersMy, assetsInfos, loadingOffers } from '$lib/store/store';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import { getConnectedWalletAddress } from '$lib/utils/utils.js';

	let myOrders = [];
	let connectedWalletAddress = '';
	let loadComplete = false;
	let offersLoaded = false;

	$: assetsInfos.subscribe(async (value) => {
		if (value.length == 0 && $loadingOffers) {
			offersLoaded = false;
			return;
		}

		offersLoaded = true;
		loadComplete = true;
	});

	// Subscribe to offers and filter for my orders
	$: offersMy.subscribe(async (offers) => {
		if ($loadingOffers) {
			loadComplete = false;
		}

		connectedWalletAddress = await getConnectedWalletAddress();

		myOrders = offers.filter((offer) => {
			return offer.seller === connectedWalletAddress;
		});

		if ($loadingOffers == false) {
			loadComplete = true;
		}
	});
</script>

{#if loadComplete && myOrders.length > 0}
	{#each myOrders as offer}
		<BuyWidget {offer} />
	{/each}
{:else if myOrders.length == 0 && loadComplete && offersLoaded}
	<p>No orders found.</p>
{:else}
	<p>Loading...</p>
{/if}
