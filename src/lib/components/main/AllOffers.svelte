<script lang="ts">
	import { offers, assetsInfos, loadingOffers, unconfirmedInputBoxIds } from '$lib/store/store';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import Loading from '$lib/components/common/Loading.svelte';

	let orders = [];
	let loadComplete = false;
	let offersLoaded = false;

	// Subscribe to offers and filter for solo orders
	$: offers.subscribe((offers) => {
		updateOrders(offers, $unconfirmedInputBoxIds);
	});

	$: unconfirmedInputBoxIds.subscribe((value) => {
		updateOrders($offers, value);
	});

	$: assetsInfos.subscribe(async (value) => {
		if (value.length == 0) {
			offersLoaded = false;
			loadComplete = 0;
			return;
		}

		if (offersLoaded || loadComplete) return;

		offersLoaded = true;
		loadComplete = true;
	});

	function updateOrders(offers, mempoolBoxes) {
		orders = offers.filter((offer) => !mempoolBoxes.includes(offer.boxin));
	}
</script>

{#if loadComplete && orders.length > 0}
	{#each orders as offer, index}
		<BuyWidget {offer} {index} />
	{/each}
{:else if $loadingOffers}
	<div class="w-100 relative min-h-[200px] mt-[100px] col-span-12 my-12 bg-bg">
		<Loading />
	</div>
{:else}
	<p>No orders found.</p>
{/if}
