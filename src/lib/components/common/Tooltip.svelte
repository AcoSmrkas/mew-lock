<script>
	import { selected_wallet_ergo, showNsfw } from '$lib/store/store.ts';
	import { fade, fly } from 'svelte/transition';

	export let message = '';
	export let show = false;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="tooltip-container" on:click={(event) => event.stopPropagation()}>
	<slot />

	{#if show}
		<div
			in:fly={{ y: -10, duration: 200 }}
			out:fly={{ y: -5, duration: 200 }}
			class="tooltip-text border-2 border-teal-300"
		>
			<ul>
				{#each message.split('\n') as line}
					<li>{@html line}</li>
				{/each}
			</ul>

			<label class="mt-3 mb-3 inline-flex items-center cursor-pointer">
				<input type="checkbox" bind:checked={$showNsfw} class="sr-only peer" />
				<div
					class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-400 rounded-full peer bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"
				/>
				<span class="ms-3 text-sm font-medium text-gray-200">Show NSFW content</span>
			</label>

			{#if $selected_wallet_ergo}
				<a href="/profile"
					><button style="margin: 0 auto;" class="my-2 block btn btn-primary border-0"
						>My Profile</button
					></a
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tooltip-container {
		position: relative;
		display: inline-block;
	}

	.tooltip-text {
		width: 275px;
		background-color: var(--forms-bg);
		color: #fff;
		text-align: left;
		border-radius: 12px;
		padding: 10px 15px;
		position: absolute;
		z-index: 1;
		top: 125%;
		right: -53px;
		margin-left: -110px;
	}

	@media (max-width: 768px) {
		.tooltip-text {
			right: -110px;
		}
	}

	.tooltip-container[data-show='true'] .tooltip-text {
		visibility: visible;
		opacity: 1;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	li {
		padding: 5px 0;
	}

	.profile-button {
		background-color: #007bff;
		color: #fff;
		border: none;
		padding: 10px 20px;
		border-radius: 5px;
		cursor: pointer;
	}

	.profile-button:hover {
		background-color: #0056b3;
	}
</style>
