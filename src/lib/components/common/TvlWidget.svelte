<script lang="ts">
	import { onMount } from 'svelte';
	import {
		CONTRACT_CRC32,
		ESCROW_CRC32,
		API_HOST,
		OLD_CONTRACTS_CRC32,
		OLD_ESCROWS_CRC32,
		OFFERS_CRC32,
		OFFERS_ESCROW_CRC32
	} from '$lib/common/const.ts';
	import {
		showCustomToast,
		nFormatter,
		setLocalStorage,
		getLocalStorage
	} from '$lib/utils/utils.js';
	let totalTVL = 0;
	let total = 0;

	async function fetchTransactionData() {
		try {
			total = getLocalStorage('totalOrders');

			if (total == null) {
				const response = await fetch(
					`${API_HOST}mart/getTotalOrders?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${ESCROW_CRC32}&contract[]=${OLD_ESCROWS_CRC32[0]}&contract[]=${OLD_ESCROWS_CRC32[1]}&contract[]=${OFFERS_ESCROW_CRC32}&contract[]=${OFFERS_CRC32}`
				);
				const data = await response.json();

				total = data.items;
				setLocalStorage('totalOrders', total, 30);
			}
		} catch (error) {
			console.error('Failed to fetch transaction data:', error);
			showCustomToast('Failed to fetch transaction data', 3000, 'danger');
		}
	}

	async function fetchTotalTVL() {
		try {
			totalTVL = getLocalStorage('totalTVL');

			if (totalTVL == null) {
				// Fetch data from both contracts
				const [response] = await Promise.all([
					fetch(
						`${API_HOST}mart/getVol?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${ESCROW_CRC32}&contract[]=${OLD_ESCROWS_CRC32[0]}&contract[]=${OLD_ESCROWS_CRC32[1]}&contract[]=${OFFERS_ESCROW_CRC32}&contract[]=${OFFERS_CRC32}`
					)
				]);

				const data = await response.json();

				// Ensure both values are treated as numbers
				const tvlContract = parseFloat(data.items[0].replace(/,/g, '')) || 0;

				// Sum the total volume locked (TVL) from both contracts
				totalTVL = tvlContract.toFixed(2); // Limit to 2 decimal places
				setLocalStorage('totalTVL', totalTVL, 30);
			}
		} catch (error) {
			console.error('Failed to fetch tvl:', error);
			showCustomToast('Failed to fetch tvl', 3000, 'danger');
		}
	}

	onMount(async () => {
		await fetchTotalTVL();
		await fetchTransactionData();
	});
</script>

<div class="grid-container">
	<div class="">
		<div class="grid-item rounded-[8px]">
			<h3 class="text-primary font-bold">Total Volume</h3>
			<p>{totalTVL ? '$' + nFormatter(totalTVL, 2) : 'Loading...'}</p>
		</div>
	</div>
	<div class="">
		<div class="grid-item rounded-[8px]">
			<h3 class="text-primary font-bold"><a href="/activity" class="ml-2">Activity</a></h3>
			<p>{total ? nFormatter(total) + ' orders' : 'Loading...'}</p>
		</div>
	</div>
</div>

<style>
	.tvl-widget {
		background: black;
		padding: 20px;
		border-radius: 8px;
		text-align: center;
		margin-bottom: 20px;
		color: #000;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
	}

	.tvl-widget h2 {
		margin: 0;
		padding-bottom: 10px;
		color: pink;
	}
	.tvl-widget p {
		margin: 0;
		font-size: 1em;
	}
	.grid-container {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 20px;
		text-align: center;
	}
	.grid-item {
		position: relative;
		background: var(--forms-bg);
		padding: 10px;
	}
	.grid-item h3 {
		margin: 0 0 10px;
		font-size: 1.2em;
	}
	.grid-item p {
		margin: 0;
		font-size: 1rem;
	}

	.avatar-group {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.avatar {
		width: 100px;
		height: 100px;
		border-radius: 50%;
		border: 0px solid white;
		margin-left: -10px;
		animation: pulse 2s infinite;
	}

	.avatar:first-child {
		margin-left: 0;
	}

	@keyframes pulse {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
		}
	}

	@media (max-width: 768px) {
		.grid-item {
			min-height: 50px;
		}
	}

	.centered-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		text-align: center;
	}
</style>
