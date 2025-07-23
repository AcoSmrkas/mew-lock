<script>
	import { fade, fly } from 'svelte/transition';
	import SellWidget from './SellWidget.svelte';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let offerTokenId;
	export let sellTokenId;

	// Function to close the modal
	export let onClose = () => {
		dispatch('close');
	};

	// Function to handle clicks within modal content (stop propagation)
	const stopPropagation = (event) => {
		event.stopPropagation();
	};
</script>

<div class="modal-overlay" in:fade={{ duration: 200 }} out:fade={{ duration: 150 }}>
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="modal-content w-11/12 sm:w-4/5 p-3 p-sm-4 md:w-3/4 lg:w-2/3 overflow-x-hidden"
		in:fly={{ y: 20, duration: 200 }}
		out:fade={{ duration: 150 }}
		on:click|stopPropagation
	>
		<SellWidget on:close={onClose} bind:offerTokenId bind:sellTokenId />
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
	}

	.modal-content {
		border: 2px solid var(--info-color);
		color: white;
		border-radius: 20px;
		max-height: 90%;
		display: flex;
		flex-direction: column;
		gap: 20px;
		background: var(--forms-bg);
		position: relative;
		overflow-y: auto;
	}
</style>
