<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { getImageUrl, setPlaceholderImage } from '$lib/utils/utils.js';
	import { CONTRACT_CRC32, API_HOST } from '$lib/common/const.ts';

	const API_URL = `${API_HOST}mart/getOrders?contract=${CONTRACT_CRC32}&status=Sold`;

	const tokens = writable([]);
	const loading = writable(true);
	const error = writable(null);

	async function fetchTokens() {
		try {
			const response = await fetch(API_URL);
			const data = await response.json();

			const tokenMap = new Map();

			data.items.forEach((item) => {
				item.assets.forEach((asset) => {
					const { tokenId, name, amount } = asset;

					if (tokenMap.has(tokenId)) {
						const tokenData = tokenMap.get(tokenId);
						tokenData.amount += amount;
						tokenData.count += 1;
					} else {
						tokenMap.set(tokenId, {
							tokenId,
							name,
							amount,
							count: 1,
							image: getImageUrl(asset) // Use the utility function to get the image URL
						});
					}
				});
			});

			const topTokens = Array.from(tokenMap.values())
				.sort((a, b) => b.amount - a.amount)
				.slice(0, 5); // Display only top 5 tokens

			tokens.set(topTokens);
		} catch (err) {
			error.set('Failed to fetch token data');
		} finally {
			loading.set(false);
		}
	}

	onMount(() => {
		fetchTokens();
	});
</script>

<div class="top-tokens-container">
	{#if $loading}
		<p>Loading top traded tokens...</p>
	{:else if $error}
		<p>{$error}</p>
	{:else if $tokens.length === 0}
		<p>No tokens sold.</p>
	{:else}
		{#each $tokens as token (token.tokenId)}
			<div class="token-card">
				<img
					src={token.image}
					alt={token.name}
					class="token-image"
					on:error={(e) => setPlaceholderImage(e, token)}
				/>
				<h3 class="token-name">{token.name}</h3>
				<p class="token-sold-amount">Total Sold: {token.amount}</p>
				<p class="token-sold-count">Number of Trades: {token.count}</p>
			</div>
		{/each}
	{/if}
</div>

<style>
	.top-tokens-container {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 20px;
	}

	.token-card {
		flex: 0 1 calc(20% - 20px);
		background: var(--forms-bg);
		border-radius: 12px;
		padding: 15px;
		text-align: center;
		color: #fff;
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
		transition: transform 0.2s ease;
		max-width: 100%;
	}

	.token-card:hover {
		transform: translateY(-5px);
	}

	.token-image {
		max-width: 100%;
		height: auto;
		border-radius: 8px;
		margin: 0 auto 15px auto; /* Centering the image */
		display: block;
	}

	.token-name {
		font-size: 1.25em;
		margin-bottom: 10px;
		color: #f4d22c; /* Updated heading text color */
	}

	.token-sold-amount,
	.token-sold-count {
		font-size: 1em;
		margin: 5px 0;
	}

	@media (max-width: 1200px) {
		.token-card {
			flex: 0 1 calc(33.333% - 20px);
		}
	}

	@media (max-width: 768px) {
		.token-card {
			flex: 0 1 calc(50% - 20px);
		}
	}

	@media (max-width: 480px) {
		.token-card {
			flex: 0 1 100%;
		}
	}
</style>
