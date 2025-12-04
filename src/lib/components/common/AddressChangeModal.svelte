<script lang="ts">
	import { fade, fly } from 'svelte/transition';

	export let showAddressChangeModal: boolean; // boolean
	export let onBtnClick: Function | undefined;

	let dialog: HTMLDialogElement;

	$: if (dialog && showAddressChangeModal) dialog.showModal();
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	class="bg-transparent address-modal-border rounded-lg"
	bind:this={dialog}
	on:click={() => {
		dialog.close();
	}}
	on:close={() => {
		showAddressChangeModal = false;
	}}
>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="p-4 rounded-lg address-modal-bg" on:click|stopPropagation>
		<slot />
		<!-- svelte-ignore a11y-autofocus -->
		<div class="flex justify-center mt-8">
			<button
				class="btn btn-primary"
				on:click={() => {
					dialog.close();
					onBtnClick ? onBtnClick() : '';
				}}
			>
				<slot name="btn" />
			</button>
		</div>
	</div>
</dialog>

<style>
	.address-modal-border {
		border: 1px solid rgba(255, 107, 107, 0.3) !important;
	}

	.address-modal-bg {
		background: rgba(22, 13, 37, 0.98) !important;
		backdrop-filter: blur(20px);
	}

	dialog {
		border-radius: 0.2em;
		border: none;
		padding: 0;
		background: rgba(16, 16, 16, 0.2);
		color: #d1d1d1;
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
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
</style>
