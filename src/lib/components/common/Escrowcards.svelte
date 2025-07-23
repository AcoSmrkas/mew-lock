<script lang="ts">
	import { buyTx } from '$lib/contract/buyTx.js';
	import { cancelTx } from '$lib/contract/cancelTx.js';
	import { get } from 'svelte/store';
	import {
		selected_wallet_ergo,
		connected_wallet_address,
		assetsInfos,
		showNsfw
	} from '$lib/store/store.ts';
	import { onMount, onDestroy } from 'svelte';
	import {
		nFormatter,
		showCustomToast,
		getConnectedWalletAddress,
		getImageUrl,
		isWalletConected,
		setPlaceholderImage,
		getCommonBoxIds
	} from '$lib/utils/utils.js';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import { DEV_PK } from '$lib/common/const.ts';
	import {
		fetchBoxes,
		getBlockHeight,
		fetchContractBoxFromTx,
		updateTempBoxes
	} from '$lib/api-explorer/explorer.ts';
	import { prices } from '$lib/utils/prices.js';
	import axios from 'axios';

	export let offer;

	$: assetsInfos.subscribe(async (value) => {
		if (value.length == 0) {
			return;
		}

		await updateAssetInfo();
		isLoading = false;
	});

	let isLoading = true;
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;
	let connectedWalletAddress = '';
	let imageUrls = [];
	let currentImageIndex = 0;
	export let seller; // New prop for seller
	export let buyer; // New prop for buyer

	async function submitOrder(type) {
		const selectedWalletErgo = get(selected_wallet_ergo);

		if (!isWalletConected()) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}

		console.log('Selected Wallet Ergo:', selectedWalletErgo);

		const contractBox = await fetchContractBoxFromTx(offer.txidin);

		if (contractBox == null) {
			showCustomToast('Failed to fetch contract box.', 1500, 'danger');
			return;
		}

		let myAddress, height, utxos;
		unsignedTx = null;

		if ($selected_wallet_ergo != 'ergopay') {
			myAddress = await ergo.get_change_address();
			utxos = await fetchBoxes($connected_wallet_address);
			height = await ergo.get_current_height();
		} else {
			myAddress = get(connected_wallet_address);
			utxos = await fetchBoxes($connected_wallet_address);
			height = await getBlockHeight();
		}

		contractBox.additionalRegisters.R4.renderedValue =
			contractBox.additionalRegisters.R4.renderedValue.replace(/^CBigInt\(|\)$/g, '');

		const priceInTokens = BigInt(contractBox.additionalRegisters.R4.renderedValue);
		const devAddress = DEV_PK;

		let devFee;
		try {
			devFee = BigInt(contractBox.additionalRegisters.R6.renderedValue);
		} catch {
			devFee = 2000;
		}

		if (devFee < 2000) {
			devFee = 2000;
		}

		let royaltyFee;
		try {
			royaltyFee = BigInt(contractBox.additionalRegisters.R9.renderedValue);
		} catch {
			royaltyFee = 0;
		}

		let royalties = [];
		if (royaltyFee > 0) {
			try {
				let rData = (
					await axios.get(
						`https://api.ergoplatform.com/api/v1/transactions/${offer.assets[0].mintTx}`
					)
				).data;
				const rInput = rData.inputs[0];
				if (
					rInput.additionalRegisters &&
					rInput.additionalRegisters.R4 &&
					rInput.additionalRegisters.R4.renderedValue &&
					rInput.additionalRegisters.R5 &&
					rInput.additionalRegisters.R5.renderedValue
				) {
					if (
						rInput.additionalRegisters.R4.renderedValue == 2 &&
						rInput.additionalRegisters.R5.sigmaType == 'Coll[(Coll[SByte], SInt)]'
					) {
						const royaltyRenderedValue = rInput.additionalRegisters.R5.renderedValue;

						const pairs = royaltyRenderedValue.slice(1, -1).split('],[');
						const extractedValues = pairs.flatMap((pair) => {
							return pair.replace(/[\[\]]/g, '').split(',');
						});

						for (let i = 0, j = 0; i < extractedValues.length; i += 2, j++) {
							royalties.push([extractedValues[j * 2], extractedValues[j * 2 + 1]]);
						}
					} else if (
						rInput.additionalRegisters.R4.sigmaType == 'SInt' &&
						rInput.additionalRegisters.R5.sigmaType == 'Coll[SByte]'
					) {
						royalties.push([
							rInput.additionalRegisters.R5.renderedValue,
							rInput.additionalRegisters.R4.renderedValue
						]);
					}
				}
			} catch (e) {
				console.error(e);
				showCustomToast('Failed to fetch royalty data.', 1500, 'danger');
				return;
			}
		}

		let assetTokenId = '';
		if (contractBox.additionalRegisters.R7 && contractBox.additionalRegisters.R7.renderedValue) {
			assetTokenId = contractBox.additionalRegisters.R7.renderedValue;
		}

		let box = JSON.parse(JSON.stringify(contractBox));
		for (const [k, v] of Object.entries(box.additionalRegisters)) {
			box.additionalRegisters[k] = v.serializedValue;
		}

		const isErgPayment = assetTokenId.length === 0 || assetTokenId == 0;

		try {
			let unsigned = null;

			if (type == 'buy') {
				unsigned = await buyTx(
					box,
					myAddress,
					utxos,
					height,
					priceInTokens,
					offer.seller,
					devAddress,
					isErgPayment,
					assetTokenId,
					devFee,
					royaltyFee,
					royalties
				);
			} else {
				unsigned = await cancelTx(
					box,
					myAddress,
					utxos,
					height,
					priceInTokens,
					offer.seller,
					devAddress,
					isErgPayment,
					assetTokenId,
					devFee,
					royaltyFee
				);
			}

			if (selectedWalletErgo != 'ergopay') {
				const signed = await ergo.sign_tx(unsigned);
				const transactionId = await ergo.submit_tx(signed);

				console.log('Transaction ID:', transactionId);

				showCustomToast(
					`Transaction submitted successfully.<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				const usedBoxIds = getCommonBoxIds(utxos, signed.inputs);
				const newOutputs = signed.outputs.filter((output) => output.ergoTree == utxos[0].ergoTree);

				updateTempBoxes(myAddress, usedBoxIds, newOutputs);
			} else {
				unsignedTx = unsigned;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (e) {
			console.error(e);

			if (e.message && e.message.substr(0, 19) == 'Insufficient inputs') {
				showCustomToast(`Insufficient funds.`, 5000, 'danger');
			} else if (e.info && e.info == 'User rejected') {
				//
			} else {
				showCustomToast(`Failed to submit TX.`, 5000, 'danger');
			}
		}
	}

	async function updateAssetInfo() {
		try {
			const assetInfoMap = new Map($assetsInfos.map((item) => [item.id, item]));

			let tInfo = assetInfoMap.get(offer.payasset);
			if (tInfo) {
				offer.payassetname = tInfo.name;
			}

			offer.payassetUsdPrice = prices[offer.payasset];

			for (const token of offer.assets) {
				const tokenInfo = assetInfoMap.get(token.tokenId);

				if (tokenInfo && !token.isUpdated) {
					token.isUpdated = true;
					token.name = tokenInfo.name;
					token.decimals = parseInt(tokenInfo.decimals);

					token.usdPrice = prices[token.tokenId];

					if (tokenInfo.additionalRegisters) {
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

					token.imageLink = tokenInfo.cachedurl;
					token.nsfw = tokenInfo.nsfw;
					token.scam = tokenInfo.scam;
					token.mintTx = tokenInfo.transactionId;
				}
			}
		} catch (error) {
			console.error('Error updating asset info:', error);
		}

		updateImageUrls($showNsfw);
	}

	function updateImageUrls(showNsfw) {
		imageUrls = offer.assets.map((asset) => getImageUrl(asset, showNsfw));
	}

	onMount(async () => {
		connectedWalletAddress = await getConnectedWalletAddress();
		offer.payasseturl =
			offer.payasset == 'ERG' ? '' : `https://www.ergexplorer.com/token/${offer.payasset}`;
	});

	$: updateImageUrls($showNsfw);

	let intervalId;

	function nextImage() {
		currentImageIndex = (currentImageIndex + 1) % imageUrls.length;
	}

	onMount(() => {
		if (imageUrls.length > 1) {
			intervalId = setInterval(nextImage, 3000); // Change image every 3 seconds
		}
	});

	onDestroy(() => {
		if (intervalId) {
			clearInterval(intervalId);
		}
	});
	// Function to determine button text and action
	function getButtonText() {
		return offer.seller === connectedWalletAddress ? 'Cancel' : 'Buy';
	}
	function handleButtonClick() {
		if (offer.seller === connectedWalletAddress) {
			submitOrder();
		} else {
			submitOrder('buy');
		}
	}
	function changeImage(index) {
		currentImageIndex = index;
	}
	// Function to truncate addresses
	function truncateAddress(address: string): string {
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
</script>

{#if isLoading}
	<div class="skeleton-card">
		<div class="skeleton-image" />
		<div class="skeleton-text" />
		<div class="skeleton-text" />
		<div class="skeleton-button" />
	</div>
{:else if offer}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="item relative flex flex-col rounded-lg overflow-hidden">
		{#if offer.assets.length == 1}
			<div class="flex justify-center relative w-full h-[180px] bg-black">
				{#if offer.assets[0]}
					<img
						src={imageUrls[0]}
						class="max-w-full max-h-full h-auto m-auto"
						alt=""
						loading="lazy"
						on:error={(event) => setPlaceholderImage(event, offer.assets[0])}
					/>
				{:else}
					<div class="w-full h-full flex items-center justify-center text-gray-500">
						<svg
							class="w-16 h-16"
							fill="currentColor"
							viewBox="0 0 20 20"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								fill-rule="evenodd"
								d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
								clip-rule="evenodd"
							/>
						</svg>
					</div>
				{/if}
			</div>
		{/if}

		<div class="p-3 flex-grow">
			<div class="assets-container mt-0 mb-0">
				{#each offer.assets as asset, index}
					<div class="flex items-center mb-2 justify-between">
						<div class="flex items-center">
							<div class="relative" style="min-width: fit-content;">
								<img
									class="w-8 h-8 rounded-full mr-2"
									src={imageUrls[index]}
									alt=""
									on:error={(event) => setPlaceholderImage(event, asset)}
								/>
							</div>
							<div class="truncate" style="max-width: 120px;">
								<p class="text-sm text-primary font-bold truncate">
									{asset.name || 'Unnamed Asset'}
								</p>
								<p class="text-xs text-gray-400">
									Amount: {nFormatter(asset.amount, asset.decimals)}
								</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="p-3">
			<div class="escrow-info mb-3 flex justify-between">
				<div class="buyer-seller">
					<span class="text-xs text-gray-500"
						><strong>Seller:</strong> {truncateAddress(seller)}</span
					>
					<span class="text-xs text-gray-500"><strong>Buyer:</strong> {truncateAddress(buyer)}</span
					>
				</div>
			</div>
			<div class="pt-2 flex justify-between items-center border-t border-gray-200">
				<span class="text-sm text-gray-500">Total Price</span>
				<span class="font-bold">
					{nFormatter(offer.payamount)}
					<span class="text-primary">{offer.payassetname || 'ERG'}</span>
				</span>
			</div>
		</div>
	</div>
{:else}
	<div class="invalid-offer-message">Invalid offer. Please check the parameters.</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:showErgopayModal bind:isAuth bind:unsignedTx>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	.item {
		background: var(--forms-bg);
		border: 1px solid var(--borders);
		border-radius: 8px;
		transition: all 0.25s ease;
		width: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.item:hover {
		transform: scale(1.03);
		cursor: pointer;
	}

	.assets-container {
		max-height: 225px;
		overflow-y: auto;
	}

	.escrow-info {
		flex-direction: row;
		justify-content: space-between;
		text-align: left;
		margin-bottom: 1rem;
	}

	.buyer-seller span {
		display: block;
		margin-bottom: 0.25rem;
	}

	.invalid-offer-message {
		text-align: center;
		padding: 20px;
		background: #dc3545;
		color: white;
		border-radius: 4px;
		margin-top: 20px;
	}

	/* Skeleton Card */
	.skeleton-card {
		display: flex;
		flex-direction: column;
		background: var(--forms-bg);
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.skeleton-image,
	.skeleton-text,
	.skeleton-button {
		background: #e0e0e0;
		border-radius: 4px;
	}

	.skeleton-image {
		height: 150px;
		margin-bottom: 1rem;
	}

	.skeleton-text {
		height: 20px;
		margin-bottom: 0.5rem;
		width: 80%;
	}

	.skeleton-button {
		height: 30px;
		width: 50%;
	}

	@media (max-width: 768px) {
		.item {
			padding: 0.5rem;
		}

		.escrow-info {
			flex-direction: column;
			text-align: center;
		}

		.buyer-seller span {
			margin-bottom: 0.5rem;
		}
	}
</style>
