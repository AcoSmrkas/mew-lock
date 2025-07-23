<script>
	import '../bootstrap.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { reconnectErgoWallet } from '$lib/common/wallet';
	import { getPrices } from '$lib/utils/prices.js';
	import { getConfig, popupData, KYA_KEY } from '$lib/common/const.ts';
	import Footer from '$lib/components/nav/Footer.svelte';
	import Loading from '$lib/components/common/Loading.svelte';
	import InfoPopup from '$lib/components/common/InfoPopup.svelte';
	import { initSocket } from '$lib/socket/socket';
	import { connected_wallet_address, fetchUtxos, selected_wallet_ergo } from '$lib/store/store.ts';
	import SellModal from '$lib/components/common/SellModal.svelte';
	import { showCustomToast } from '$lib/utils/utils.js';

	let ready = true;
	let showPopup = false;
	let popupInfo = null;

	let showModal = false;
	let offerTokenId = '';
	let sellTokenId = '';

	function toggleModal() {
		if (!$selected_wallet_ergo) {
			showCustomToast('Please connect a wallet.', 3000);
			return;
		}

		showModal = !showModal;
	}

	function handleMakeSellEvent(event) {
		sellTokenId = event.detail.tokenId;
		toggleModal();
	}

	function handleMakeOfferEvent(event) {
		offerTokenId = event.detail.tokenId;
		toggleModal();
	}

	$: fetchUtxos($connected_wallet_address);

	onMount(() => {
		initSocket();
		fetchUtxos($connected_wallet_address);

		(async () => {
			await reconnectErgoWallet();
			await getConfig();
			await getPrices(null);

			handlePopup();

			ready = true;
		})();

		window.addEventListener('makeSell', handleMakeSellEvent);
		window.addEventListener('makeOffer', handleMakeOfferEvent);
		return () => {
			window.removeEventListener('makeSell', handleMakeSellEvent);
			window.removeEventListener('makeOffer', handleMakeOfferEvent);
		};
	});

	function handlePopup() {
		let kyaAccepted = localStorage.getItem(KYA_KEY);

		if (kyaAccepted != 'true') {
			setTimeout(handlePopup, 500);
			return;
		}

		if (!popupData) return;

		popupInfo = popupData;
		let popupKey = `popup_${popupInfo.id}`;

		if (localStorage.getItem(popupKey)) return;

		showPopup = true;

		localStorage.setItem(popupKey, true);
	}
</script>

{#if ready}
	<slot />
	<InfoPopup bind:showPopup bind:popupInfo>
		<button slot="btn">Close</button>
	</InfoPopup>

	{#if showModal}
		<SellModal on:close={toggleModal} bind:offerTokenId bind:sellTokenId />
	{/if}

{:else}
	<div class="container loading-holder">
		<Loading />
	</div>
{/if}


<style type="text/css">
	.loading-holder {
		margin-top: 250px;
		min-height: 450px;
	}
</style>
