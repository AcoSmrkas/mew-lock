<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import LockedAssetCard from './LockedAssetCard.svelte';

	export let mewLockBoxes = [];
	export let currentHeight = 0;

	const dispatch = createEventDispatcher();

	function handleWithdraw(event) {
		dispatch('withdraw', event.detail);
	}

	// Separate ERG-only and token locks
	$: ergOnlyLocks = mewLockBoxes.filter((box) => !box.assets || box.assets.length === 0);
	$: tokenLocks = mewLockBoxes.filter((box) => box.assets && box.assets.length > 0);
</script>

{#if ergOnlyLocks.length > 0}
	<div class="asset-category">
		<div class="category-header">
			<h3>ERG Only Locks</h3>
			<span class="count">{ergOnlyLocks.length} lock{ergOnlyLocks.length !== 1 ? 's' : ''}</span>
		</div>
		<div class="assets-grid">
			{#each ergOnlyLocks as box}
				<LockedAssetCard {box} {currentHeight} on:withdraw={handleWithdraw} />
			{/each}
		</div>
	</div>
{/if}

{#if tokenLocks.length > 0}
	<div class="asset-category">
		<div class="category-header">
			<h3>Token Locks</h3>
			<span class="count">{tokenLocks.length} lock{tokenLocks.length !== 1 ? 's' : ''}</span>
		</div>
		<div class="assets-grid">
			{#each tokenLocks as box}
				<LockedAssetCard {box} {currentHeight} on:withdraw={handleWithdraw} />
			{/each}
		</div>
	</div>
{/if}

<style>
	.asset-category {
		margin-bottom: 3rem;
	}

	.category-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.category-header h3 {
		color: white;
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.count {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.875rem;
		background: rgba(255, 255, 255, 0.05);
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.assets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	@media (max-width: 768px) {
		.assets-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
