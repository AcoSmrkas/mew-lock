<script lang="ts">
	import { offersSolo, assetsInfos } from '$lib/store/store';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import Loading from '$lib/components/common/Loading.svelte';
	import { unconfirmedInputBoxIds, unconfirmedOrderBoxes } from '$lib/store/store.ts';
	import { parseMempoolBoxToOrder } from '$lib/utils/utils.js';

	let soloOrders = [];
	let loadComplete = false;
	let offersLoaded = false;

	// Subscribe to offers and filter for solo orders
	$: offersSolo.subscribe((offers) => {
		updateOrders(offers, $unconfirmedInputBoxIds);
	});

	$: unconfirmedInputBoxIds.subscribe((value) => {
		updateOrders($offersSolo, value);
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
		soloOrders = offers.filter(
			(offer) => !mempoolBoxes.includes(offer.boxin)
		);
		// soloOrders.unshift(parseMempoolBoxToOrder($unconfirmedOrderBoxes[0]))
	}
</script>

{#if loadComplete && soloOrders.length > 0}
	{#each soloOrders as offer, index}
		<BuyWidget {offer} {index} />
	{/each}
{:else}
	<div class="w-100 relative min-h-[200px] mt-[100px] col-span-12 my-6 bg-bg">
		<Loading />
	</div>
{/if}
