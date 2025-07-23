<script lang="ts">
	import { onMount } from 'svelte';
	import axios from 'axios';
	import { CONTRACT_CRC32, API_HOST } from '$lib/common/const.ts';
	import { truncateAddress } from '$lib/utils/utils.js';
	import {
		selected_wallet_ergo,
		connected_wallet_address,
		assetsInfos,
		showNsfw
	} from '$lib/store/store.ts';

	let isLoading = true;

	$: assetsInfos.subscribe(async (value) => {
		if (value.length == 0) {
			return;
		}

		isLoading = false;
	});

	async function updateAssetInfo(offer) {
		try {
			const assetInfoMap = new Map($assetsInfos.map((item) => [item.id, item]));

			let tInfo = assetInfoMap.get(offer.payasset);
			if (tInfo) {
				offer.payassetname = tInfo.name;
			}

			for (const token of offer.assets) {
				const tokenInfo = assetInfoMap.get(token.tokenId);

				if (tokenInfo && !token.isUpdated) {
					token.isUpdated = true;
					token.name = tokenInfo.name;
					token.decimals = parseInt(tokenInfo.decimals);

					if (tokenInfo.additionalRegisters) {
						const r9RenderedValue = tokenInfo.additionalRegisters.R9?.renderedValue;
						if (r9RenderedValue) {
							const ipfsLink = formatNftUrl(r9RenderedValue);
							token.imageLink = ipfsLink;
						}

						const r7SerializedValue = tokenInfo.additionalRegisters.R7?.serializedValue;
						if (r7SerializedValue === '0e020101') {
							token.isImage = true;
						}
						if (r7SerializedValue === '0e020102') {
							token.isAudio = true;
						}
						if (r7SerializedValue === '0e020103') {
							token.isVideo = true;
						}
					}

					token.nsfw = tokenInfo.nsfw;
					token.scam = tokenInfo.scam;
					token.mintTx = tokenInfo.transactionId;
				}
			}
		} catch (error) {
			console.error('Error updating asset info:', error);
		}
	}

	interface Order {
		id: string;
		contract: string;
		seller: string;
		payasset: string;
		payamount: string;
		txidin: string;
		txidout: string | null;
		status: string;
		timestamp: string;
		buyer: string | null;
		usdamount: string;
		payassetname: string;
		assetname: string;
		assets: Array<{ tokenid: string; amount: number; name: string }>;
	}

	let orders: Order[] = [];

	onMount(async () => {
		try {
			const response = await axios.get(
				`${API_HOST}mart/getOrders?contract=${CONTRACT_CRC32}&status=Sold`
			);

			orders = response.data.items;

			for (let order of orders) {
				const assetInfoMap = new Map($assetsInfos.map((item) => [item.id, item]));

				let tInfo = assetInfoMap.get(order.payasset);
				if (tInfo) {
					order.payassetname = tInfo.name;
				}
			}
		} catch (error) {
			console.error('Error fetching orders:', error);
		}
	});

	function openErgExplorer(txid: string) {
		window.open(`https://ergexplorer.com/transactions#${txid}`, '_blank');
	}
</script>

<div class="container">
	<br />
	<h1 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">Activity</h1>

	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
		{#each orders as order}
			<div class="card">
				<div class="card-content">
					<h3 class="text-primary font-bold">Buy Order</h3>
					<br />
					<p class="truncate"><strong class="text-white">Assets:</strong></p>
					<ul class="asset-list">
						{#each order.assets as asset}
							<li class="asset-item">
								<p>
									<span class="asset-name text-primary">{asset.name}</span>:
									<span class="asset-amount">{asset.amount}</span>
								</p>
							</li>
						{/each}
					</ul>
					<br />
					<p>
						<strong class="text-primary w-[55px] inline-block">Token:</strong>
						{order.payamount}
						{@html order.payassetname != undefined
							? '<a target="_new" class="text-primary font-bold" href="https://ergexplorer.com/token/' +
							  order.payasset +
							  '">' +
							  order.payassetname +
							  '<a>'
							: '<span class="text-primary font-bold">ERG</span>'}
					</p>
					<p>
						<strong class="text-primary w-[55px] inline-block">Time:</strong>
						{new Date(order.timestamp).toLocaleString()}
					</p>
					<p>
						<strong class="text-primary w-[55px] inline-block">Seller:</strong>
						{truncateAddress(order.seller)}
					</p>
					<p>
						<strong class="text-primary w-[55px] inline-block">Buyer:</strong>
						{order.buyer ? truncateAddress(order.buyer) : 'N/A'}
					</p>
					{#if order.txidout}
						<br />
						<br />
						<p class="text-primary absolute bottom-[10px]">
							<a href="#" on:click={() => openErgExplorer(order.txidout)}>
								View Transaction <i class="fa-solid fa-up-right-from-square" />
							</a>
						</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	{#if orders.length === 0}
		<p>No activity.</p>
	{/if}
</div>
<br />

<style>
	.card {
		background-color: var(--forms-bg);
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 16px;
		transition: transform 0.3s ease-in-out;
		border: 0;
	}

	.card:hover {
		transform: translateY(-4px);
	}

	.card-content {
		color: white;
	}

	.asset-list {
		list-style-type: none;
		padding: 0;
		margin: 0;
	}

	.asset-item {
	}

	.asset-name {
		font-weight: bold;
	}

	.asset-amount {
	}
</style>
