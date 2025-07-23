<script lang="ts">
	import { connected_wallet_address } from '$lib/store/store.ts';
	import { sleep, showCustomToast } from '$lib/utils/utils.js';
	import { connectErgoWallet } from '$lib/common/wallet.ts';
	import axios from 'axios';
	import { EE_API } from '$lib/common/const.ts';

	export let showErgopayModal: boolean; // boolean
	export let qrCodeText: string;
	export let isAuth: boolean;
	export let unsignedTx: string;
	export let onBtnClick: Function | undefined;
	export let onTxSubmitted: Function | undefined;

	let dialog: HTMLDialogElement;
	let qrCode = null;
	let stopContinuousCheck = true;
	let authId = null;
	let loading = false;

	$: if (dialog && showErgopayModal) {
		loading = true;
		dialog.showModal();
		jQuery('#qrcode').hide();

		try {
			if (isAuth) {
				auth();
			} else {
				getReducedTx();
			}
		} catch (e) {
			onError(e);
		}
	}

	async function getReducedTx() {
		try {
			const response = await axios.post(`${EE_API}ergopay/unsigned`, {
				sender: $connected_wallet_address,
				json: unsignedTx
			});

			if (!isNaN(response.data)) {
				const id = response.data;

				qrCodeText = `ergopay://api.ergexplorer.com/ergopay/get?id=${id}`;
				showQRcode();

				await checkTxId(id);
			} else {
				console.error(response.data);
				onError('Failed to process Ergopay TX.');
			}
		} catch (e) {
			console.error(e);
			onError('Failed to process Ergopay TX.');
		}
	}

	function showQRcode() {
		loading = false;

		if (qrCode == null) {
			qrCode = new QRCode(document.getElementById('qrcode'), {
				text: qrCodeText,
				width: 290,
				height: 290,
				colorDark: '#000000',
				colorLight: '#ffffff',
				correctLevel: QRCode.CorrectLevel.L
			});
		} else {
			qrCode.clear(); // clear the code.
			qrCode.makeCode(qrCodeText); // make another code.
		}

		jQuery('#qrcode').show();
	}

	async function createAuth() {
		try {
			const response = await jQuery.get(`${EE_API}ergopay/createAuth`);

			return response; // Return the response data
		} catch (error) {
			onError('Failed to process Ergopay authorization.');
		}
	}

	async function auth() {
		stopContinuousCheck = false;

		const authData = await createAuth();
		authId = authData.id;

		let authLink =
			'ergopay://api.ergexplorer.com/ergopay/auth?id=' + authId + '&address=#P2PK_ADDRESS#';

		jQuery('#ergopayLink').prop('href', authLink);

		qrCodeText = authLink;
		showQRcode();

		checkAuth();
	}

	async function checkAuth() {
		let authOk = false;
		do {
			authOk = await checkAuthorization();

			if (!authOk.success) {
				authOk = false;
			} else if (authOk.address) {
				connected_wallet_address.set(authOk.address);

				await connectErgoWallet('ergopay');
			}

			if (authOk == false) {
				await sleep(1000);
			}
		} while (authOk == false && stopContinuousCheck == false);

		if (authOk) {
			onClose();
		}
	}

	async function checkTxId(id) {
		let txIdOk = false;
		stopContinuousCheck = false;

		do {
			txIdOk = await checkTxIdPosted(id);

			console.log();

			if (!txIdOk) {
				txIdOk = false;
			} else if (txIdOk) {
				showCustomToast(
					`Transaction submitted successfully. TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${txIdOk}">${txIdOk}</a>`,
					10000,
					'success'
				);

				if (onTxSubmitted) {
					onTxSubmitted(txIdOk);
				}

				onClose();
			}

			if (txIdOk == false) {
				await sleep(1000);
			}
		} while (txIdOk == false && stopContinuousCheck == false);

		if (txIdOk) {
			onClose();
		}
	}

	async function checkAuthorization() {
		if (authId == undefined) {
			return false;
		}

		try {
			const response = await jQuery.get(`${EE_API}ergopay/auth?id=` + authId);

			if (response && response.success) {
				return response;
			} else {
				return false;
			}
		} catch (error) {
			throw new Error(`Error fetching data: ${error}`);
		}
	}

	async function checkTxIdPosted(id) {
		try {
			const response = await axios.get(`${EE_API}ergopay/getTxId?id=` + id);

			if (response.data != '') {
				return response.data;
			} else {
				return false;
			}
		} catch (error) {
			throw new Error(`Error fetching data: ${error}`);
		}
	}

	function onClose() {
		stopContinuousCheck = true;
		showErgopayModal = false;
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
			Ergopay
		</div>
		<div id="qrcode" class="mb-2 border-2" style="border-color: var(--main-color)" />
		{#if loading}
			<div class="w-100 p-5 text-center">Loading...</div>
		{:else}
			<p class="w-100 text-center">
				Scan the QR code or follow this <a
					id="ergopayLink"
					class="font-bold text-primary"
					href={qrCodeText}>LINK</a
				>
			</p>
		{/if}
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
	dialog {
		border-radius: 0.2em;
		border: none;
		padding: 0;
		background: rgba(16, 16, 16, 0.2);
		color: #d1d1d1;
		border: 1px solid #80808045;
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
