<script lang="ts">
	import { showCustomToast } from '$lib/utils/utils.js';

	export let showPopup: boolean;
	export let popupInfo: any;
	export let onBtnClick: Function | undefined;

	let title: string;
	let description: string;
	let imglink: string;

	let dialog: HTMLDialogElement;

	$: if (dialog && showPopup) {
		if (!popupInfo) {
			showPopup = false;
		} else {
			title = popupInfo.title;
			description = popupInfo.description;
			imglink = popupInfo.imglink;

			dialog.showModal();
		}
	}

	function onClose() {
		showPopup = false;
	}

	function onError(text) {
		showCustomToast(text, 3000, 'danger');
		onClose();
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	class="bg-transparent border-2 border-info rounded-lg"
	bind:this={dialog}
	on:click={dialog.close}
	on:close={onClose}
>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="rounded-lg p-2 py-4 p-sm-4"
		style="background: var(--forms-bg)"
		on:click|stopPropagation
	>
		<div
			class="leading-6 pb-2 mb-3 text-white text-center font-bold w-100"
			style="font-family:'Manrope';font-size:1.5em;"
		>
			{title}
		</div>
		<div class="mb-3 border-2" id="popup-img-holder" style="border-color: var(--main-color)">
			<img id="popup-img" src={imglink} />
		</div>
		<p class="w-100 text-center">{description}</p>
		<slot />
		<!-- svelte-ignore a11y-autofocus -->
		<div class="flex justify-center mt-8">
			<button
				class="btn btn-secondary"
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
	#popup-img-holder {
		max-width: 512px;
		width: 100%;
		margin: 0 auto;
	}

	#popup-img {
		width: 100%;
		max-width: 512px;
		height: auto;
	}

	dialog {
		padding: 0;
		background: rgba(16, 16, 16, 0.2);
		color: #d1d1d1;
		border: 1px solid #80808045;
		max-width: 550px;
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.3);
		backdrop-filter: blur(2px);
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
