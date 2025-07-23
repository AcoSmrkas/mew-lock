<script lang="ts">
	import { assetsInfos } from '$lib/store/store';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import { getConnectedWalletAddress } from '$lib/utils/utils.js';

	let connectedWalletAddress = '';
	let loadComplete = false;
	let offersLoaded = false;

	export let escrowOrders;

	let lastOrderLength = 0;
	let myEscrows = [];
	let theirEscrows = [];

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

	$: updateOrders(escrowOrders);

	async function updateOrders(orders) {
		if (orders) {
			loadComplete = true;
		}

		if (!orders || orders.length == lastOrderLength) return;

		connectedWalletAddress = await getConnectedWalletAddress();

		myEscrows = orders.filter((o) => o.seller == connectedWalletAddress);

		theirEscrows = orders.filter((o) => o.buyer == connectedWalletAddress);

		lastOrderLength = orders.length;
	}
</script>

<h2 class="font-bold text-white text-xl">My escrow offers</h2>
<br />
<div class="offers-container">
	{#if loadComplete && myEscrows.length > 0}
		{#each myEscrows as offer}
			<BuyWidget {offer} />
		{/each}
	{:else if myEscrows.length == 0 && loadComplete}
		<p>No orders found.</p>
	{:else}
		<p>Loading...</p>
	{/if}
</div>
<br />

<h2 class="font-bold text-white text-xl">Escrow requests</h2>
<br />
<div class="offers-container">
	{#if loadComplete && theirEscrows.length > 0}
		{#each theirEscrows as offer}
			<BuyWidget {offer} />
		{/each}
	{:else if theirEscrows.length == 0 && loadComplete}
		<p>No orders found.</p>
	{:else}
		<p>Loading...</p>
	{/if}
</div>

<style type="text/css">
	.offers-container {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 20px;
		justify-content: space-between;
	}
</style>
