<script lang="ts">
	import { showPleaseWaitModal } from '$lib/store/store.ts';

	export let onBtnClick: Function | undefined;

	let dialog: HTMLDialogElement;

	$: if (dialog && $showPleaseWaitModal) {
		dialog.showModal();
	}

	$: if (dialog && !$showPleaseWaitModal) {
		dialog.close();
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	class="bg-transparent border-0"
	bind:this={dialog}
	on:close={() => {
		showPleaseWaitModal.set(false);
	}}
>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="p-5 rounded-lg border-0" style="background: var(--forms-bg)" on:click|stopPropagation>
		<!-- svelte-ignore a11y-autofocus -->
		<div class="flex justify-center border-0 mt-5">
			<img src="logo.png" class="w-auto h-[150px]" />
		</div>
	</div>
</dialog>

<style>
	img {
		animation: riseDrop 1.5s infinite;
	}

	dialog {
		border-radius: 0.2em;
		border: none !important;
		padding: 0;
		background: rgba(16, 16, 16, 0.2);
		color: #d1d1d1;
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(2px);
	}
	dialog > div:focus-visible {
		border: unset !important;
		outline: unset !important;
	}
	dialog > div {
		padding: 1em;
	}
	dialog[open] {
		animation: zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
	@keyframes zoom {
		from {
			transform: scale(0.95);
		}
		to {
			transform: scale(1);
		}
	}
	dialog[open]::backdrop {
		animation: fade 0.2s ease-out;
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes riseDrop {
		0% {
			transform: translateY(0) rotate(0deg); /* Start at the original position */
		}
		75% {
			transform: translateY(-50px) rotate(10deg); /* Slowly rise up */
			animation-timing-function: ease-in-out; /* Smooth easing */
		}
		90% {
			transform: translateY(0) rotate(0deg); /* Drop back down fast */
			animation-timing-function: ease-in; /* Fast drop */
		}
		100% {
			transform: translateY(0) rotate(0deg); /* Ensure it stays down for a bit */
		}
	}
</style>
