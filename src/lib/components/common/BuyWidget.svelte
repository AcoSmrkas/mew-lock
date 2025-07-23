<script lang="ts">
	import { ErgoAddress } from '@fleet-sdk/core';
	import { buyTx } from '$lib/contract/buyTx.js';
	import { buyOfferTx } from '$lib/contract/buyOfferTx.js';
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
		destroy,
		nFormatter,
		showCustomToast,
		getConnectedWalletAddress,
		formatNftUrl,
		getImageUrl,
		isWalletConected,
		setPlaceholderImage,
		getCommonBoxIds,
		consumeClick,
		truncateAddress,
		hex2a
	} from '$lib/utils/utils.js';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import AddressModal from '$lib/components/common/AddressModal.svelte';
	import {
		DEV_PK,
		API_HOST,
		COLLECTIONS,
		OFFERS_CONTRACT,
		OFFERS_ESCROW_CONTRACT,
		OLD_CONTRACTS_CRC32,
		OLD_ESCROWS_CRC32,
		ITEMS_PER_PAGE,
		EE_API
	} from '$lib/common/const.ts';
	import {
		fetchBoxes,
		getBlockHeight,
		fetchContractBoxFromTx,
		updateTempBoxes
	} from '$lib/api-explorer/explorer.ts';
	import { prices } from '$lib/utils/prices.js';
	import axios from 'axios';
	import { fade, fly } from 'svelte/transition';

	export let offer;
	export let index;
	export let isMewLock = false;

	$: updateOffer(offer);

	function updateOffer(offer) {
		updateImageUrls($showNsfw);
	}

	$: connected_wallet_address.subscribe((value) => {
		connectedWalletAddress = value;
	});

	$: assetsInfos.subscribe(async (value) => {
		if (value.length == 0) {
			return;
		}

		await updateAssetInfo();
		isLoading = false;
	});

	let processing = false;
	let isLoading = true;
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;
	let connectedWalletAddress = '';
	let imageUrls = [];
	let showModal = false;
	let currentImageIndex = 0;

	let isPhygital = offer.category?.toLowerCase().substr(0, 8) == 'phygital';
	let merchantData = null;
	let showAddressModal = false;
	let shippingInfo = {
		fullname: '',
		address: '',
		city: '',
		state: '',
		zip: '',
		country: '',
		phone: ''
	};

	function validateShipping() {
		let shippingParams = Object.keys(shippingInfo);

		for (let key of shippingParams) {
			if (shippingInfo[key] == '') {
				return false;
			}
		}

		return true;
	}

	async function submitOrder(type) {
		const selectedWalletErgo = get(selected_wallet_ergo);

		if (!isWalletConected()) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}

		// Handle MewLock deposit
		if (isMewLock) {
			return await handleMewLockDeposit();
		}

		console.log('Selected Wallet Ergo:', selectedWalletErgo);

		if (isPhygital && offer.seller !== connectedWalletAddress && !validateShipping()) {
			showCustomToast('Please provide shipping info.', 1500, 'info');
			return;
		}

		if (isPhygital && merchantData == null) {
			showCustomToast('Failed to fetch merchant data.', 1500, 'danger');
			return;
		}

		processing = true;

		const contractBox = await fetchContractBoxFromTx(offer.txidin);

		if (contractBox == null) {
			showCustomToast('Failed to fetch contract box.', 1500, 'danger');
			processing = false;
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
		let orderType = 'Sell';

		try {
			const tryOffer = hex2a(contractBox.additionalRegisters.R8.renderedValue).split(',')[2];

			if (tryOffer && tryOffer == 'Offer') {
				orderType = 'Offer';
			}
		} catch (e) {}

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
				let royaltyAsset = offer.assets[0];
				if (orderType == 'Offer') {
					console.log(contractBox.additionalRegisters.R7.serializedValue);
					royaltyAsset = (
						await axios.post(`${EE_API}tokens/byId`, {
							ids: [contractBox.additionalRegisters.R7.renderedValue]
						})
					).data.items[0];
					royaltyAsset.mintTx = royaltyAsset.transactionId;
				}

				let rData = (
					await axios.get(`https://api.ergoplatform.com/api/v1/transactions/${royaltyAsset.mintTx}`)
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
				} else if (
					rInput.additionalRegisters &&
					rInput.additionalRegisters.R4 &&
					rInput.additionalRegisters.R4.renderedValue &&
					!rInput.additionalRegisters.R5
				) {
					if (rInput.additionalRegisters.R4.sigmaType == 'SInt') {
						royalties.push([rInput.address, rInput.additionalRegisters.R4.renderedValue]);
					}
				}
			} catch (e) {
				console.error(e);
				showCustomToast('Failed to fetch royalty data.', 1500, 'danger');
				processing = false;
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
				if (
					contractBox.address == OFFERS_CONTRACT ||
					contractBox.address == OFFERS_ESCROW_CONTRACT
				) {
					unsigned = await buyOfferTx(
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
				}
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

				await submitShippingInfo(transactionId);

				closeModal();
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
				console.log(e);
				showCustomToast(`Failed to submit TX.`, 5000, 'danger');
			}
		}

		processing = false;
	}

	async function updateAssetInfo() {
		try {
			const assetInfoMap = new Map($assetsInfos.map((item) => [item.id, item]));

			let tInfo = assetInfoMap.get(offer.payasset);
			if (tInfo) {
				offer.payassetname = tInfo.name;
				offer.payassetinfo = tInfo;
				offer.payassetinfo.tokenId = tInfo.id;

				if (tInfo.cachedurl && tInfo.cachedurl !== '') {
					offer.payassetinfo.imageLink = tInfo.cachedurl;
				} else if (tInfo.iconurl && tInfo.iconurl !== '') {
					offer.payassetinfo.imageLink = tInfo.iconurl;
				} else if (tInfo.additionalRegisters.R9?.renderedValue) {
					offer.payassetinfo.imageLink = formatNftUrl(tInfo.additionalRegisters.R9.renderedValue);
				} else {
					offer.payassetinfo.imageLink = '';
				}

				if (tInfo.additionalRegisters) {
					const r7SerializedValue = tInfo.additionalRegisters.R7?.serializedValue;
					if (r7SerializedValue === '0e020101') {
						offer.payassettype = 'Image';
						offer.payassetinfo.isImage = true;
					}
					if (r7SerializedValue === '0e020102') {
						offer.payassettype = 'Audio';
						offer.payassetinfo.isAudio = true;
					}
					if (r7SerializedValue === '0e020103') {
						offer.payassettype = 'Video';
						offer.payassetinfo.isVideo = true;
					}
				}
			}

			offer.payassetUsdPrice = prices[offer.payasset];

			for (const token of offer.assets) {
				if (token.tokenId == 'ERG') {
					token.isUpdated = true;
					token.name = 'ERG';
					token.decimals = 9;
					token.usdPrice = prices['ERG'];
					token.imageLink = 'https://ergexplorer.com/images/logo-new.png';
					continue;
				}

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

					if (tokenInfo.cachedurl && tokenInfo.cachedurl !== '') {
						token.imageLink = tokenInfo.cachedurl;
					} else if (tokenInfo.iconurl && tokenInfo.iconurl !== '') {
						token.imageLink = tokenInfo.iconurl;
					} else if (tokenInfo.additionalRegisters.R9?.renderedValue) {
						token.imageLink = formatNftUrl(tokenInfo.additionalRegisters.R9.renderedValue);
					} else {
						token.imageLink = '';
					}

					token.description = tokenInfo.description;
					token.nsfw = tokenInfo.nsfw;
					token.scam = tokenInfo.scam;
					token.mintTx = tokenInfo.transactionId;
					token.verified = COLLECTIONS.includes(tokenInfo.collectionid);
				}
			}
		} catch (error) {
			console.error('Error updating asset info:', error);
		}

		updateImageUrls($showNsfw);
		paymentImageUrl($showNsfw);
	}

	function updateImageUrls(showNsfw) {
		const newUrls = offer.assets.map((asset) => getImageUrl(asset, showNsfw));

		if (JSON.stringify(newUrls) !== JSON.stringify(imageUrls)) {
			imageUrls = newUrls;
		}
	}

	function paymentImageUrl(showNsfw) {
		if (!offer.payassetinfo) return;

		offer.payassetimage = getImageUrl(offer.payassetinfo, showNsfw);
	}

	onMount(async () => {
		let contractBox, address;

		if (offer.ismempool) {
			contractBox = offer.box;
			address = offer.seller;
		} else {
			contractBox = await fetchContractBoxFromTx(offer.txidin);

			address = ErgoAddress.fromPublicKey(contractBox.additionalRegisters.R5.renderedValue, 0);
			offer.seller = address.encode();
		}

		connectedWalletAddress = await getConnectedWalletAddress();
		offer.payasseturl =
			offer.payasset == 'ERG' ? '' : `https://www.ergexplorer.com/token/${offer.payasset}`;

		if (isPhygital) {
			merchantData = (await axios.get(`${API_HOST}mart/getMerchantData?address=${offer.seller}`))
				.data; //

			if (merchantData.total == 1 && merchantData.items[0].authorized != false) {
				merchantData = merchantData.items[0];
			} else {
				merchantData = null;
			}
		}
	});

	$: updateImageUrls($showNsfw);
	$: paymentImageUrl($showNsfw);

	function openModal() {
		showModal = true;
	}

	function closeModal() {
		showModal = false;
	}

	let intervalId;

	function nextImage() {
		currentImageIndex = (currentImageIndex + 1) % imageUrls.length;
	}

	onMount(() => {
		nextImageInterval();
	});

	function nextImageInterval() {
		if (imageUrls.length > 1) {
			intervalId = setInterval(nextImage, 3000); // Change image every 3 seconds
		}
	}

	function clearImageInterval() {
		if (intervalId) {
			clearInterval(intervalId);
		}
	}

	onDestroy(() => {
		clearImageInterval();
	});

	function changeImage() {
		clearImageInterval();

		if (imageUrls.length > 1) {
			nextImage();
		}

		nextImageInterval();
	}

	function isVulnerable() {
		return (
			offer.seller === $connected_wallet_address &&
			(offer.contract === OLD_CONTRACTS_CRC32[0] || offer.contract === OLD_ESCROWS_CRC32[0])
		);
	}

	function handleButtonClick() {
		if (offer.seller === connectedWalletAddress) {
			submitOrder();
		} else {
			submitOrder('buy');
		}
	}

	function makeOffer(asset) {
		closeModal();

		const tokenId = asset.tokenId;
		const event = new CustomEvent('makeOffer', {
			detail: { tokenId }
		});
		window.dispatchEvent(event);
	}

	let onTxSubmitted = function (txId) {
		submitShippingInfo(txId);
	};

	async function submitShippingInfo(transactionId) {
		if (isPhygital && offer.seller !== connectedWalletAddress) {
			const today = new Date();
			const formattedDate = today.toISOString().split('T')[0];

			const formattedData = {
				FullName: shippingInfo.fullname,
				TxID: transactionId,
				Address: shippingInfo.address,
				City: shippingInfo.city,
				State: shippingInfo.state,
				Zip: shippingInfo.zip,
				Country: shippingInfo.country,
				Phone: shippingInfo.phone,
				WalletAddress: $connected_wallet_address,
				NFTPurchaseDate: formattedDate,
				Notes: 'Cats send their regards.'
			};

			const data = {
				shippingInfo: formattedData,
				merchantId: merchantData.id
			};

			const response = await axios.post(`${API_HOST}mart/handleShippingInfo`, data, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			});
		}
	}

	async function handleMewLockDeposit() {
		processing = true;

		try {
			let myAddress, height, utxos;

			if ($selected_wallet_ergo != 'ergopay') {
				myAddress = await ergo.get_change_address();
				utxos = await fetchBoxes($connected_wallet_address);
				height = await ergo.get_current_height();
			} else {
				myAddress = get(connected_wallet_address);
				utxos = await fetchBoxes($connected_wallet_address);
				height = await getBlockHeight();
			}

			// Calculate unlock height based on offer duration
			const unlockHeight = height + (offer.lockDuration || 720); // Default 720 blocks (~24 hours)

			// Create MewLock deposit transaction
			const mewLockTx = await createMewLockDeposit(
				myAddress,
				utxos,
				height,
				offer.payamount,
				unlockHeight
			);

			if ($selected_wallet_ergo != 'ergopay') {
				const signed = await ergo.sign_tx(mewLockTx);
				const transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Tokens locked successfully! They will unlock at block ${unlockHeight}.<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				const usedBoxIds = getCommonBoxIds(utxos, signed.inputs);
				const newOutputs = signed.outputs.filter((output) => output.ergoTree == utxos[0].ergoTree);
				updateTempBoxes(myAddress, usedBoxIds, newOutputs);

				closeModal();
			} else {
				unsignedTx = mewLockTx;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (e) {
			console.error(e);
			if (e.message && e.message.substr(0, 19) == 'Insufficient inputs') {
				showCustomToast(`Insufficient funds.`, 5000, 'danger');
			} else {
				showCustomToast(`Failed to lock tokens.`, 5000, 'danger');
			}
		}

		processing = false;
	}

	async function createMewLockDeposit(myAddress, utxos, height, amount, unlockHeight) {
		// Import the MewLock transaction function
		const { createMewLockDepositTx } = await import('$lib/contract/mewLockTx.ts');
		
		return createMewLockDepositTx(
			myAddress,
			utxos,
			height,
			BigInt(amount),
			unlockHeight
		);
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
	<div
		in:fly={{ y: -20, duration: 200, delay: (index % ITEMS_PER_PAGE) * 50 }}
		out:fade={{ duration: 150 }}
		class="item flex relative rounded-lg overflow-hidden"
		class:col-span-2-custom={offer.payassettype}
		class:flex-col={offer.payassettype}
		class:no-pointer-events={offer.issold}
		on:click={openModal}
		class:old-contract={isVulnerable()}
	>
		{#if isVulnerable()}
			<div
				class="absolute top-0 w-100 h-14 p-1 rounded-top-lg bg-red-700 text-white"
				style="z-index: 6;"
			>
				<p class="w-100">Cancel this listing!</p>
				<p class="w-100">
					<a on:click={(e) => consumeClick(e)} href="/notice" class="absolute right-2 underline"
						>Why?</a
					>
				</p>
			</div>
		{/if}
		<div class="flex flex-grow" class:flex-col={!offer.payassettype}>
			{#if offer.assets.length == 1 && !offer.payassettype}
				<div class="flex flex-grow justify-center relative w-full h-[180px] bg-black">
					{#if offer.assets[0]}
						<img
							src={imageUrls[0]}
							class="max-w-full max-h-full h-auto m-auto"
							class:p-4={!offer.assets[0].isImage &&
								!offer.assets[0].isVideo &&
								!offer.assets[0].isAudio &&
								!offer.imagePh}
							alt="Asset"
							loading="lazy"
							on:error={(event) => {
								offer.imagePh = true;
								setPlaceholderImage(event, offer.assets[0]);
							}}
						/>
						{#if offer.assets[0].verified}
							<!-- Verified Badge as SVG -->
							<span
								title="Verified Collection"
								class="absolute top-[5px] right-[5px] p-[2px] rounded-full border-1 border-primary"
								style="background-color: var(--forms-bg); z-index: 5;"
							>
								<svg
									viewBox="0 0 16 16"
									fill="none"
									xmlns="http://www.w3.org/2000/svg"
									class="p-[2px] w-[30px] h-[30px]"
								>
									<path
										fill-rule="evenodd"
										clip-rule="evenodd"
										d="M14.6563 5.24291C15.4743 5.88358 16 6.8804 16 8C16 9.11964 15.4743 10.1165 14.6562 10.7572C14.7816 11.7886 14.4485 12.8652 13.6568 13.6569C12.8651 14.4486 11.7885 14.7817 10.7571 14.6563C10.1164 15.4743 9.1196 16 8 16C6.88038 16 5.88354 15.4743 5.24288 14.6562C4.21141 14.7817 3.13481 14.4485 2.34312 13.6568C1.55143 12.8652 1.2183 11.7886 1.34372 10.7571C0.525698 10.1164 0 9.1196 0 8C0 6.88038 0.525715 5.88354 1.34376 5.24288C1.21834 4.21141 1.55147 3.13481 2.34316 2.34312C3.13485 1.55143 4.21145 1.2183 5.24291 1.34372C5.88358 0.525698 6.8804 0 8 0C9.11964 0 10.1165 0.525732 10.7572 1.3438C11.7886 1.21838 12.8652 1.55152 13.6569 2.3432C14.4486 3.13488 14.7817 4.21146 14.6563 5.24291ZM12.2071 6.20711L10.7929 4.79289L7 8.58579L5.20711 6.79289L3.79289 8.20711L7 11.4142L12.2071 6.20711Z"
										style="fill: var(--main-color);"
									/>
								</svg>
							</span>
						{/if}
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
			{:else if offer.assets.length > 1 && !offer.payassettype}
				<!-- Bundle Thumbnails -->
				<div class="relative w-full h-[180px] bg-black flex items-center justify-center overflow-hidden">
					
					<!-- Animated Bundle Stack -->
					<div class="bundle-stack">
						{#each offer.assets.slice(0, 4) as asset, index}
							<div class="bundle-item-container stack-item-{index}">
								<img
									src={imageUrls[index]}
									class="bundle-thumb-large"
									alt={asset.name || 'Asset'}
									loading="lazy"
									on:error={(event) => setPlaceholderImage(event, asset)}
								/>
								<!-- Amount Badge -->
								<div class="amount-badge">
									{nFormatter(asset.amount, asset.decimals)}
								</div>
								<!-- Asset Name (visible when on top) -->
								<div class="asset-name-overlay">
									{asset.name || 'Unnamed'}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if offer.assets.length === 1}
				<div class="p-2 pb-0 flex-1">
					<div class="assets-container mt-0 mb-0">
						{#each offer.assets as asset, index}
							<div class="asset-list-item flex items-center mb-2 justify-between">
								<div class="flex items-center">
									<div class="relative" style="min-width: fit-content;">
										<img
											class="w-8 h-8 rounded-md mr-2"
											src={imageUrls[index]}
											alt=""
											on:error={(event) => setPlaceholderImage(event, asset)}
										/>
									</div>
									<div>
										<p class="text-sm text-primary font-bold">
											{asset.tokenId == 'erg' ? 'ERG' : asset.name || 'Unnamed Asset'}
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
			{/if}

			{#if offer.assets.length > 1}
				<!-- Assets Summary (for bundles only) -->
				<div class="assets-summary">
					{#each offer.assets.slice(0, 3) as asset, index}
						<div class="summary-item">
							<div class="summary-left">
								<img 
									src={imageUrls[index]} 
									alt=""
									class="summary-icon"
									on:error={(event) => setPlaceholderImage(event, asset)}
								/>
								<span class="summary-name">
									{(asset.name || 'Asset').length > 15 ? (asset.name || 'Asset').substring(0, 15) + '...' : (asset.name || 'Asset')}
								</span>
							</div>
							<span class="summary-amount">
								{nFormatter(asset.amount, asset.decimals)}
							</span>
						</div>
					{/each}
					{#if offer.assets.length > 3}
						<div class="summary-more">
							+{offer.assets.length - 3} more
						</div>
					{/if}
				</div>
			{/if}

			{#if !offer.payassettype}
				<div class="p-2">
					<div
						class="pt-2 flex justify-between items-center"
						style="border-top: solid 1px var(--borders);"
					>
						<span class="text-sm text-light me-[10px]">Price</span>
						<span class="font-bold text-white">
							{nFormatter(offer.payamount)}
							<span class="text-primary">
								{#if offer.payassetname}
									{offer.payassetname}
								{:else}
									ERG
								{/if}
							</span>
						</span>
					</div>
				</div>
			{:else}
				<div class="w-50 flex-1 bg-black" style="border-radius: 0 5px 0 0; align-content: center;">
					<!-- svelte-ignore a11y-img-redundant-alt -->
					<img
						src={offer.payassetimage}
						class="w-max-auto h-max-100 my-auto"
						style="border-radius: 0 5px 0 0;"
						alt="Payment Asset"
						on:error={(event) => setPlaceholderImage(event, offer.payassetinfo)}
					/>
				</div>
			{/if}
		</div>
		{#if offer.payassettype}
			<div class="p-2">
				<div
					class="pt-2 flex justify-between items-center"
					style="border-top: solid 1px var(--borders);"
				>
					<span class="text-sm text-light">Offering for</span>
					<span class="font-bold text-white">
						{nFormatter(offer.payamount)}
						<span class="text-primary">{offer.payassetname || 'ERG'}</span>
					</span>
				</div>
			</div>
		{/if}
		{#if offer.issold}
			<div class="z-10 absolute w-full h-full bg-black bg-opacity-75 text-center rounded-lg">
				<p
					class="font-bold text-primary text-4xl relative top-50 -translate-y-1/2 -rotate-45 opacity-100"
				>
					Sold
				</p>
			</div>
		{/if}
	</div>

	{#if showModal && !showAddressModal}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="modal modal-open"
			in:fade={{ duration: 200 }}
			out:fade={{ duration: 150 }}
			on:click={closeModal}
		>
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="modal-box flex flex-col md:flex-row rounded-lg overflow-hidden"
				in:fly={{ y: 20, duration: 200 }}
				out:fade={{ duration: 150 }}
				on:click={consumeClick}
			>
				{#if offer.assets.length === 1}
					<!-- Single Asset View -->
					<div class="single-asset-view flex flex-col md:flex-row w-full">
						<!-- Image container -->
						<div class="image-container bg-black md:w-1/2">
							{#if offer.assets[0].isImage || offer.assets[0].isVideo || offer.assets[0].isAudio}
								<button
									disabled={processing}
									class="btn btn-secondary flex-grow absolute top-2 right-2 z-10 px-3 py-1 rounded-md border-0"
									style="border: 0 !important;"
									on:click={() => makeOffer(offer.assets[0])}
								>
									Make Offer
								</button>
							{/if}

							{#if imageUrls.length > 0}
								<img
									src={imageUrls[0]}
									alt={offer.assets[0].name}
									class="token-image-single object-contain"
									loading="lazy"
									on:error={(event) => setPlaceholderImage(event, offer.assets[0])}
								/>
							{/if}
						</div>
						<!-- Details and Price section -->
						<div class="details-and-price w-full sm:w-full p-4 flex flex-col justify-between">
							<div
								class="asset-details mb-2"
								style="background: var(--footer);border-radius: 10px;padding: 10px;"
							>
								<a target="_new" href="https://ergexplorer.com/token/{offer.assets[0].tokenId}">
									<h2 class="text-lg font-bold text-primary">{offer.assets[0].name}</h2>
								</a>
								{#if offer.assets[0].name !== 'ERG'}
									<p class="text-sm text-gray-400 max-w-[425px] max-h-[75px] overflow-y-auto">
										{offer.assets[0].description}
									</p>
								{/if}
								{#if offer.assets[0].amount > 1}
									<p class="text-sm text-gray-400">
										Amount: {nFormatter(offer.assets[0].amount)}
									</p>
								{/if}
								{#if offer.assets[0].usdPrice}
									<p class="text-xs text-gray-400">
										(${nFormatter(offer.assets[0].usdPrice * offer.assets[0].amount)} USD)
									</p>
								{/if}
							</div>
							<div class="p-2 bg-bg rounded-lg mb-3">
								<p class="w-100">
									<b>Seller:</b>
									<a
										class="text-primary"
										href="https://ergexplorer.com/addresses/{offer.seller}"
										target="_new">{truncateAddress(offer.seller)}</a
									>
									<a class="font-bold float-end" href="/explore?seller={offer.seller}">View More</a>
								</p>
							</div>

							{#if offer.assets[0].collectionname}
								<div class="p-2 bg-bg rounded-lg mb-3">
									<a
										href="/collections?collection={offer.assets[0].collectionid}"
										class="text-sm text-primary-light flex items-center gap-1"
									>
										<b>Collection:</b>
										<span class="text-primary" title={offer.assets[0].collectionname}>
											{offer.assets[0].collectionname.length > 20
												? offer.assets[0].collectionname.substring(0, 20) + '...'
												: offer.assets[0].collectionname}
										</span>
										{#if offer.assets[0].verified}
											<span class="verified-icon ml-1" title="Verified Collection">
												<svg
													viewBox="0 0 16 16"
													fill="none"
													xmlns="http://www.w3.org/2000/svg"
													class="w-[14px] h-[14px] inline-block"
												>
													<path
														fill-rule="evenodd"
														clip-rule="evenodd"
														d="M14.6563 5.24291C15.4743 5.88358 16 6.8804 16 8C16 9.11964 15.4743 10.1165 14.6562 10.7572C14.7816 11.7886 14.4485 12.8652 13.6568 13.6569C12.8651 14.4486 11.7885 14.7817 10.7571 14.6563C10.1164 15.4743 9.1196 16 8 16C6.88038 16 5.88354 15.4743 5.24288 14.6562C4.21141 14.7817 3.13481 14.4485 2.34312 13.6568C1.55143 12.8652 1.2183 11.7886 1.34372 10.7571C0.525698 10.1164 0 9.1196 0 8C0 6.88038 0.525715 5.88354 1.34376 5.24288C1.21834 4.21141 1.55147 3.13481 2.34316 2.34312C3.13485 1.55143 4.21145 1.2183 5.24291 1.34372C5.88358 0.525698 6.8804 0 8 0C9.11964 0 10.1165 0.525732 10.7572 1.3438C11.7886 1.21838 12.8652 1.55152 13.6569 2.3432C14.4486 3.13488 14.7817 4.21146 14.6563 5.24291ZM12.2071 6.20711L10.7929 4.79289L7 8.58579L5.20711 6.79289L3.79289 8.20711L7 11.4142L12.2071 6.20711Z"
														style="fill: var(--main-color);"
													/>
												</svg>
											</span>
										{/if}
									</a>
								</div>
							{/if}
							<div class="price-and-separator unset items-center justify-between">
								<div
									class="separator"
									style="flex-grow: 1; border-top: solid 1px var(--borders); margin: 0; margin-right: 10px;"
								/>
								<div class="price text-lg text-white">
									{#if isMewLock}
										<p>
											Lock Amount:
											<span class="font-bold">{nFormatter(offer.payamount)}</span>
											<span class="font-bold text-primary">ERG</span>
										</p>
										<p class="text-xs text-gray-400">
											Lock Duration: {offer.lockDuration || 720} blocks (~{Math.round((offer.lockDuration || 720) / 60)} hours)
										</p>
									{:else}
										<p>
											Price:
											<span class="font-bold">{nFormatter(offer.payamount)}</span>
											<span class="font-bold text-primary"
												>{@html offer.payassetname
													? '<a href="https://ergexplorer.com/token/' +
													  offer.payasset +
													  '" target="_new">' +
													  offer.payassetname +
													  '</a>'
													: 'ERG'}</span
											>
										</p>
										{#if offer.payassetUsdPrice}
											<p class="text-xs text-gray-400">
												(${nFormatter(offer.payamount * offer.payassetUsdPrice, 2)} USD)
											</p>
										{/if}
									{/if}
								</div>
							</div>
							{#if offer.royalties && offer.royalties.length > 0}
								<p class="mt-4">Royalty Percentage: {offer.royaltyFee / 1000n}%</p>
							{/if}

							{#if isPhygital && offer.seller !== connectedWalletAddress}
								<div style="place-content: space-between;" class="mt-4 flex flex-row space-x-4">
									<p id="phygital-ship-text" class="w-auto content-center max-w-50">
										This is a <b class="text-primary">Phygital NFT</b>, provided by
										<a class="font-bold" target="_new" href={merchantData?.storeurl}
											>{merchantData?.store}</a
										>.<br />To complete your order, please provide a valid shipping address. Check
										the token description for info on how to pay for and get a shipping estimate.
									</p>
									<button
										class="btn btn-primary"
										on:click={() => {
											showAddressModal = !showAddressModal;
										}}>Shipping Address</button
									>
								</div>
							{/if}

							<div class="buttons flex justify-between gap-2 mt-4">
								<button
									disabled={processing}
									class="btn btn-secondary flex-grow"
									on:click={closeModal}>Close</button
								>
								<button
									disabled={processing}
									class="btn btn-primary flex-grow"
									on:click={handleButtonClick}
								>
									{isMewLock ? 'Lock Tokens' : (offer.seller === connectedWalletAddress ? 'Cancel' : 'Buy')}
								</button>
							</div>
						</div>
					</div>
				{:else}
					<!-- Multiple Assets View -->
					<div class="flex flex-col md:flex-row w-full">
						<!-- Image container with auto slideshow -->
						<div class="image-container bg-black pe-4 w-full md:w-1/2 relative hidden md:block">
							{#if imageUrls.length > 0}
								<!-- svelte-ignore a11y-click-events-have-key-events -->
								<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
								<img
									src={imageUrls[currentImageIndex]}
									alt={offer.assets[currentImageIndex].name}
									on:click={changeImage}
									class="token-image object-contain"
									loading="lazy"
									on:error={(event) => setPlaceholderImage(event, offer.assets[currentImageIndex])}
								/>
							{/if}
						</div>
						<!-- Content section -->
						<div class="content w-full md:w-1/2 p-3 p-sm-4">
							<div class="asset-list mb-3 max-h-60 overflow-y-auto">
								{#each offer.assets as asset, index}
									<div
										class="asset-item flex items-center p-2 rounded-md mb-2"
										style="background: rgba(11, 6, 18, 0.57);"
									>
										<img
											src={imageUrls[index]}
											alt={asset.name}
											class="w-8 h-8 object-cover rounded-md mr-2 me-2"
											loading="lazy"
											on:error={(event) => setPlaceholderImage(event, imageUrls[index])}
										/>
										<div>
											<a
												href={`https://ergexplorer.com/token#${asset.tokenId}`}
												target="_blank"
												rel="noopener noreferrer"
												class="text-primary"
											>
												<b>{asset.name}</b>
											</a>
											<p class="text-sm text-gray-400">
												Amount: {nFormatter(asset.amount, asset.decimals)}
											</p>
											{#if asset.usdPrice}
												<p class="text-xs text-gray-400">
													(${nFormatter(asset.usdPrice * asset.amount, 2)} USD)
												</p>
											{:else}
												<p class="text-xs text-gray-400" />
											{/if}
										</div>
									</div>
								{/each}
							</div>

							{#if offer.royalties && offer.royalties.length > 0}
								<p class="mt-3">Royalty Percentage: {offer.royaltyFee / 1000n}%</p>
							{/if}

							<div class="p-2 bg-bg rounded-lg mb-3">
								<p class="w-100">
									<b>Seller:</b>
									<a
										class="text-primary"
										href="https://ergexplorer.com/addresses/{offer.seller}"
										target="_new">{truncateAddress(offer.seller)}</a
									>
									<a class="font-bold float-end" href="/explore?seller={offer.seller}">View More</a>
								</p>
							</div>
							<div
								class="asset-details"
								style="background: var(--footer);border-radius: 10px;padding: 10px;"
							>
								<p class="text-lg">
									Price:
									<span class="font-bold text-white">{nFormatter(offer.payamount)}</span>
									<span class="font-bold text-primary">{offer.payassetname || 'ERG'}</span>
								</p>
								{#if offer.payassetUsdPrice}
									<p class="text-xs text-gray-400">
										(${nFormatter(offer.payamount * offer.payassetUsdPrice, 2)} USD)
									</p>
								{/if}
							</div>

							<div class="buttons flex justify-between gap-2 mt-4">
								<button class="btn btn-secondary flex-grow" on:click={closeModal}>Close</button>
								<button class="btn btn-primary flex-grow" on:click={handleButtonClick}>
									{offer.seller === connectedWalletAddress ? 'Cancel' : 'Buy'}
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}
{:else}
	<div class="invalid-offer-message">Invalid offer. Please check the parameters.</div>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:onTxSubmitted bind:showErgopayModal bind:isAuth bind:unsignedTx>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

{#if showModal && showAddressModal}
	<div class="modal modal-open" in:fly={{ y: 20, duration: 200 }} out:fade>
		<AddressModal bind:showAddressModal bind:shippingInfo>
			<button slot="btn">Confirm</button>
		</AddressModal>
	</div>
{/if}

<style>
	#phygital-ship-text {
		max-width: 250px;
	}

	.modal-open {
		display: flex;
		align-items: center;
		justify-content: center;
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		z-index: 999;
	}
	.single-asset-view {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	.details-and-price {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 16px;
	}

	.price-and-separator {
		display: flex;
		align-items: center;
	}

	.separator {
		border-top: solid 1px var(--borders);
		margin: 0 10px;
	}

	.details-and-price .price {
		text-align: right;
	}
	.modal-box {
		overflow-y: auto !important;
		max-height: 90%;
		background: var(--forms-bg);
		border: 2px solid var(--info-color);
		border-radius: 10px;
		max-width: auto;
		width: auto;
		min-width: 400px;
		display: flex;
	}

	.image-container {
		position: relative;
		width: 500px;
		overflow: hidden;
	}

	.token-image {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain; /* Fill container by covering it */
		object-position: center; /* Center the image */
		overflow: hidden;
		margin: 0 auto;
		padding-left: 25px;
	}

	.token-image-single {
		width: 100%;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		object-fit: contain; /* Fill container by covering it */
		object-position: center; /* Center the image */
		overflow: hidden;
		margin: 0 auto;
		padding: 25px;
	}

	.image-container img {
		transition: opacity 0.5s ease-in-out;
	}

	.content {
		width: 100%;
		padding: 20px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	.invalid-offer-message {
		text-align: center;
		padding: 20px;
		background: #dc3545;
		color: white;
		border-radius: 4px;
		margin-top: 20px;
	}

	.item {
		background: var(--forms-bg);
		transition: all 0.25s ease;
		width: 100%;
	}

	.item:hover {
		scale: 1.03;
		cursor: pointer;
	}

	.assets-container {
		max-height: 225px;
		overflow-y: auto;
	}

	.buttons {
		display: flex;
		flex-direction: row;
	}

	.image-container img {
		max-height: inherit; /* Adjust size as needed */
	}

	.image-container:has(.token-image-single) {
		max-height: 325px;
	}

	@media (max-width: 568px) {
		.token-image {
			padding: 25px;
		}

		.modal-box {
			flex-direction: column;
			width: 95%;
			min-width: auto;
		}

		.image-container {
			width: 100%;
		}

		.content {
			width: 100%;
		}
	}

	.old-contract {
		border: 1px solid red;
	}

	.asset-list-item:last-child {
		margin-bottom: 1px !important;
	}

	/* Bundle Animated Stack */
	.bundle-stack {
		position: relative;
		width: 120px;
		height: 140px;
		margin: auto;
		margin-bottom: 8px;
	}

	.bundle-item-container {
		position: absolute;
		width: 120px;
		height: 120px;
		transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
		animation-fill-mode: forwards;
	}

	.bundle-thumb-large {
		width: 100%;
		height: 100%;
		border-radius: 12px;
		object-fit: cover;
		border: 3px solid rgba(255, 255, 255, 0.3);
	}

	/* Amount Badge */
	.amount-badge {
		position: absolute;
		bottom: -4px;
		right: -4px;
		background: var(--main-color);
		color: var(--background);
		padding: 2px 6px;
		border-radius: 8px;
		font-size: 10px;
		font-weight: bold;
		border: 2px solid var(--background);
		min-width: 20px;
		text-align: center;
	}

	/* Asset Name Overlay */
	.asset-name-overlay {
		position: absolute;
		bottom: -20px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.8);
		color: white;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 9px;
		font-weight: 500;
		white-space: nowrap;
		opacity: 0;
		transition: opacity 0.3s ease;
		max-width: 100px;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Auto-rotating stack animation */
	.stack-item-0 {
		z-index: 4;
		transform: rotate(-2deg) scale(1);
		animation: rotateStack0 8s infinite;
	}

	.stack-item-0 .asset-name-overlay {
		opacity: 1;
	}

	.stack-item-1 {
		z-index: 3;
		transform: rotate(3deg) scale(0.95) translateX(8px) translateY(8px);
		animation: rotateStack1 8s infinite;
	}

	.stack-item-2 {
		z-index: 2;
		transform: rotate(-1deg) scale(0.9) translateX(-6px) translateY(12px);
		animation: rotateStack2 8s infinite;
	}

	.stack-item-3 {
		z-index: 1;
		transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px);
		animation: rotateStack3 8s infinite;
	}

	/* Show asset name only for front item */
	.stack-item-1 .asset-name-overlay,
	.stack-item-2 .asset-name-overlay, 
	.stack-item-3 .asset-name-overlay {
		opacity: 0;
	}

	/* Keyframe animations for rotating stack */
	@keyframes rotateStack0 {
		0%, 25% { z-index: 4; transform: rotate(-2deg) scale(1); }
		33% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
		75%, 100% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
	}

	@keyframes rotateStack1 {
		0%, 25% { z-index: 3; transform: rotate(3deg) scale(0.95) translateX(8px) translateY(8px); }
		33%, 50% { z-index: 4; transform: rotate(-2deg) scale(1); }
		58% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
		75%, 100% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
	}

	@keyframes rotateStack2 {
		0%, 50% { z-index: 2; transform: rotate(-1deg) scale(0.9) translateX(-6px) translateY(12px); }
		58%, 75% { z-index: 4; transform: rotate(-2deg) scale(1); }
		83% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
		100% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
	}

	@keyframes rotateStack3 {
		0%, 75% { z-index: 1; transform: rotate(2deg) scale(0.85) translateX(4px) translateY(16px); }
		83%, 100% { z-index: 4; transform: rotate(-2deg) scale(1); }
	}

	/* Assets Summary */
	.assets-summary {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		margin: 8px 8px 0 8px;
		min-height: 70px;
		justify-content: flex-start;
	}

	.summary-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 2px 0;
	}

	.summary-left {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}

	.summary-icon {
		width: 18px;
		height: 18px;
		border-radius: 4px;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.2);
		flex-shrink: 0;
	}

	.summary-name {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.9);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.summary-amount {
		font-size: 11px;
		color: var(--main-color);
		font-weight: 600;
		white-space: nowrap;
		margin-left: 8px;
	}

	.summary-more {
		font-size: 9px;
		color: var(--main-color);
		font-weight: 600;
		text-align: center;
		padding: 2px 0;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		margin-top: 2px;
	}

	/* Responsive adjustments */
	@media (max-width: 600px) {
		.bundle-stack {
			width: 100px;
			height: 120px;
		}
		
		.bundle-item-container {
			width: 100px;
			height: 100px;
		}
		
		.amount-badge {
			font-size: 9px;
			padding: 1px 4px;
		}
		
		.asset-name-overlay {
			font-size: 8px;
			padding: 1px 6px;
		}

		.assets-summary {
			margin: 6px 4px 0 4px;
			padding: 6px;
		}

		.summary-icon {
			width: 16px;
			height: 16px;
		}

		.summary-name {
			font-size: 10px;
		}

		.summary-amount {
			font-size: 10px;
		}

		.summary-more {
			font-size: 8px;
		}
	}

	/* Bundle Badge */
	.bundle-badge {
		background: var(--main-color);
		color: var(--background);
	}
</style>
