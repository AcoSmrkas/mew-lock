<script lang="ts">
	import { onMount } from 'svelte';
	import BuyWidget from '$lib/components/common/BuyWidget.svelte';
	import Loading from '$lib/components/common/Loading.svelte';
	import { fetchAssetsInfo } from '$lib/store/store';
	import {
		API_HOST,
		OLD_CONTRACTS_CRC32,
		CONTRACT_CRC32,
		OFFERS_CRC32
	} from '$lib/common/const.ts';

	let offers = [];
	let loadComplete = false;
	let loading = false;

	onMount(async () => {
		await loadOffers();
	});

	async function loadOffers() {
		loading = true;
		try {
			// Fetch offers strictly from OFFERS_CRC32 contract only
			const url = `${API_HOST}mart/getOrders?contract[]=${OFFERS_CRC32}&offset=0&limit=10&status=Order`;

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Error fetching offers: ${response.statusText}`);
			}

			const data = await response.json();
			offers = data.items || [];

			// Fetch asset info for the offers
			if (offers.length > 0) {
				await fetchAssetsInfo(offers);
			}

			loadComplete = true;
		} catch (error) {
			console.error('Failed to load offers:', error);
			offers = [];
			loadComplete = true;
		} finally {
			loading = false;
		}
	}
</script>

{#if loading}
	<div class="w-100 relative min-h-[200px] mt-[100px] col-span-12 my-6 bg-bg">
		<Loading />
	</div>
{:else if loadComplete && offers.length > 0}
	{#each offers as offer, index}
		<BuyWidget {offer} {index} />
	{/each}
{:else}
	<div class="no-offers">
		<p>No offers available at the moment.</p>
	</div>
{/if}

<style>
	.no-offers {
		grid-column: 1 / -1;
		text-align: center;
		color: #888;
		padding: 40px 20px;
	}
</style>
