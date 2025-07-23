<script lang="ts">
	import { offersPackage, assetsInfos } from '$lib/store/store';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import Loading from '$lib/components/common/Loading.svelte';
	import { unconfirmedInputBoxIds } from '$lib/store/store.ts';

	let packageSales = [];
	let loadComplete = false;
	let offersLoaded = false;

	// Subscribe to offers and filter for package sales
	$: offersPackage.subscribe((offers) => {
		updateOrders(offers, $unconfirmedInputBoxIds);
	});

	$: unconfirmedInputBoxIds.subscribe((value) => {
		updateOrders($offersPackage, value);
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
		packageSales = offers.filter(
			(offer) => offer.assets.length > 1 && !mempoolBoxes.includes(offer.boxin)
		);
	}
</script>

{#if loadComplete && packageSales.length > 0}
	{#each packageSales as offer, index}
		<BuyWidget {offer} {index} />
	{/each}
{:else}
	<div class="w-100 relative min-h-[150px] mt-[100px] col-span-12 my-6 bg-bg">
		<Loading />
	</div>
{/if}
