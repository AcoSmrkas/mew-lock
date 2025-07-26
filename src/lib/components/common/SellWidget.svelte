<script lang="ts">
	import { onMount } from 'svelte';
	import {
		selected_wallet_ergo,
		connected_wallet_address,
		showNsfw,
		authorizedMerchant,
		connected_wallet_balance,
		utxosLoading,
		utxosAssets,
		utxosTokenInfos,
		fetchUtxos
	} from '$lib/store/store.ts';
	import {
		CONTRACT,
		ESCROW_CONTRACT,
		DEV_PK,
		MART_NAME,
		ASSETS,
		CATEGORIES,
		MAX_BUNDLE_ASSETS,
		TOKEN_RESTICTIONS,
		OFFERS_CONTRACT,
		OFFERS_ESCROW_CONTRACT,
		LENDING_MIN_FEE_PERCENT,
		STORAGE_RENT_COLLECTORS
	} from '$lib/common/const.ts';
	import { sellTx } from '$lib/contract/sellTx.js';
	import { escrowSellTx } from '$lib/contract/escrowSellTx.js';
	import {
		nFormatter,
		showCustomToast,
		getImageUrl,
		setPlaceholderImage,
		getCommonBoxIds,
		truncateAddress,
		sleep
	} from '$lib/utils/utils.js';
	import { fetchBoxes, getBlockHeight, updateTempBoxes } from '$lib/api-explorer/explorer.ts';
	import { createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import JSONbig from 'json-bigint-native';
	import axios from 'axios';
	import BigNumber from 'bignumber.js';
	import Loading from './Loading.svelte';
	import DelegationWidget from './DelegationWidget.svelte';
	import LendingWidget from './LendingWidget.svelte';
	import { fade, fly } from 'svelte/transition';

	const dispatch = createEventDispatcher();

	let mounted = false;
	let processing = false;
	let openedFromEvent = false;
	let assetsLoading = false;
	let imageUrls = [];
	let utxos = [];
	let assets = [];
	let editAssets = true;
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx = null;
	let search = '';
	let additionalAssets: Array<Token> = [];
	let additionalAssetsFiltered: Array<Token> = [];
	let selectedAssets: Array<Token> = [];
	let priceInErg: undefined | number;
	let priceInToken: undefined | number;
	let paymentInErg: boolean = false;
	let selectedCategory: string = ''; // Added for category dropdown
	let selectedToken = ASSETS[0]; // Default to the first token
	let selectedPaymentTokenId = ASSETS[0].tokenId; // Default to the first token
	let escrow = false;
	let buyerAddress = '';
	let isPhygital = false;
	let activeModalTab = 'offer';
	export let offerTokenId = '';
	export let sellTokenId = '';
	let offerToken = null;
	let offerTokenError = '';
	let triggerDelegationCreate = false;

	// MewLock variables
	let mewLockBoxes = [];
	let selectedMewLockBox = null;
	let mewLockBoxesLoading = false;
	let lockAmount = '';
	let lockDuration = 720; // Default 720 blocks (~12 hours)
	let unlockHeight = '';
	let currentHeight = 0;
	let selectedTokensToLock = []; // Tokens selected for locking

	// Lending variables
	let collateralTokenId = 'erg';
	let collateralAmount = '';
	let durationBlocks = 1440; // Default ~24 hours
	let lendingFeeErg = '0.01'; // Default 0.01 ERG fee

	// Storage Rent Vault variables
	let selectedRentCollector = null;
	let collectorAssets = [];
	let collectorAssetsLoading = false;

	$: filterAssets(search);
	$: isPhygital = selectedCategory?.toLowerCase().substr(0, 8) == 'phygital';

	function filterAssets(search) {
		search = search.toLowerCase();

		additionalAssetsFiltered = additionalAssets.filter((asset) => {
			if (asset.name && typeof asset.name === 'string') {
				return asset.name.toLowerCase().includes(search);
			} else {
				return asset.tokenId.includes(search);
			}
		});
	}

	async function loadWalletBoxes(wallet, forceFresh = false) {
		assetsLoading = true;

		if (forceFresh) {
			await fetchUtxos(wallet);
		}

		let utxosReady = !get(utxosLoading);

		if (!utxosReady) {
			do {
				await sleep(100);
				utxosReady = !get(utxosLoading);
			} while (!utxosReady);
		}

		if ($selected_wallet_ergo) {
			assets = JSONbig.parse(JSONbig.stringify(get(utxosAssets)));
			const tokenInfos = get(utxosTokenInfos);

			for (const asset of assets) {
				const tokenInfo = tokenInfos.find((info) => info.id === asset.tokenId);

				if (tokenInfo) {
					asset.name = tokenInfo.name;
					asset.decimals = tokenInfo.decimals;
					asset.displayAmount = Number(asset.amount) / Math.pow(10, asset.decimals);
					asset.royaltypercent = tokenInfo.royaltypercent;
					if (activeModalTab == 'sell' || activeModalTab == 'lending') {
						asset.minValue = asset.decimals == 0 ? 1 : 1 / Math.pow(10, asset.decimals);
					} else {
						asset.minValue = asset.decimals == 0 ? 100 : 100 / Math.pow(10, asset.decimals);
					}
				} else {
					await axios.get(`https://api.ergexplorer.com/tokens/updateSingle?id=${asset.tokenId}`);
					await loadWalletBoxes($connected_wallet_address, true);
					return;
				}

				asset.imageLink = tokenInfo.cachedurl;
				asset.nsfw = tokenInfo.nsfw;
				asset.scam = tokenInfo.scam;

				if (tokenInfo.iconurl) {
					asset.imageLink = tokenInfo.iconurl;
				}

				for (const restrictedToken of TOKEN_RESTICTIONS) {
					if (restrictedToken.tokenid == asset.tokenId) {
						let found = false;
						for (const whitelistAddress of restrictedToken.addresses) {
							if (whitelistAddress == $connected_wallet_address) {
								found = true;
								break;
							}
						}

						if (!found) {
							asset.restricted = true;
						}
					}
				}
			}

			assets.unshift({
				tokenId: 'erg',
				name: 'ERG',
				decimals: 9,
				amount: $connected_wallet_balance,
				displayAmount: Number($connected_wallet_balance) / Math.pow(10, 9),
				minValue: 0.1,
				imageLink: 'https://ergexplorer.com/images/logo-new.png',
				royaltypercent: 0
			});

			additionalAssets = assets.filter(
				(a) => !selectedAssets.some((sa) => sa.tokenId == a.tokenId)
			);

			if (activeModalTab == 'offer' || activeModalTab == 'storage') {
				additionalAssets = additionalAssets.filter(
					(a) => ASSETS.find((asset) => asset.tokenId == a.tokenId) || a.tokenId == 'erg'
				);
			}

			updateImageUrls($showNsfw);

			filterAssets(search);
			assetsLoading = false;

			if (sellTokenId) {
				selectToken(assets.find((a) => a.tokenId == sellTokenId));
				sellTokenId = '';
			}
		}
	}

	function selectToken(token) {
		if (selectedAssets.length >= MAX_BUNDLE_ASSETS) {
			showCustomToast(`Max limit of 10 assets per Bundle reached.`, 3000);
			return;
		}

		let hasRoyalty = selectedAssets.filter((t) => t.royaltypercent > 0);

		if (hasRoyalty.length > 0 || (selectedAssets.length > 0 && token.royaltypercent > 0)) {
			showCustomToast('Asset with royalties can not be bundled.', 3000);
			return;
		}

		if (token.royaltypercent > 0) {
			token.displayAmount = 1;
			setTokenAmount(token, token.displayAmount);
		}

		additionalAssets = additionalAssets.filter((t) => t.tokenId != token.tokenId);
		selectedAssets = [...selectedAssets, Object.assign({}, token)];

		filterAssets(search);
	}

	function removeToken(token) {
		additionalAssets = [assets.find((a) => a.tokenId == token.tokenId), ...additionalAssets];
		selectedAssets = selectedAssets.filter((t) => t.tokenId != token.tokenId);

		filterAssets(search);
	}

	function cleanUpSaleWidget() {
		if (!mounted) return;
		if (openedFromEvent && activeModalTab == 'offer') return;

		selectedAssets = [];
		priceInErg = undefined;
		priceInToken = undefined;
		paymentInErg = false;
		offerToken = null;
		offerTokenId = '';
		sellTokenId = '';
		escrow = false;
		buyerAddress = '';
		openedFromEvent = false;
		offerTokenError = '';
		// Reset lending variables
		collateralTokenId = 'erg';
		collateralAmount = '';
		durationBlocks = 1440;
		lendingFeeErg = '0.01';
		// Reset storage variables
		selectedRentCollector = null;
		collectorAssets = [];
	}

	async function sellAssets() {
		if (isPhygital) {
			escrow = false;
		}

		if (
			!$selected_wallet_ergo ||
			($selected_wallet_ergo != 'ergopay' &&
				!window.ergoConnector[$selected_wallet_ergo]?.isConnected)
		) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}
		if (selectedAssets.length < 1) {
			showCustomToast('Add assets.', 1500, 'info');
			return;
		}
		if ((paymentInErg && priceInErg == undefined) || (!paymentInErg && priceInToken == undefined)) {
			showCustomToast(
				activeModalTab === 'storage' ? 'Set desired storage amount.' : 'Set a price.',
				1500,
				'info'
			);
			return;
		}
		if (!selectedCategory) {
			showCustomToast('Select a category.', 1500, 'info');
			return;
		}
		if (escrow && buyerAddress.length != 51) {
			showCustomToast('Invalid buyer address.', 1500, 'info');
			return;
		}
		if (activeModalTab == 'offer' && !offerToken) {
			showCustomToast('Choose valid asset for offer.', 1500, 'info');
			return;
		}
		if (activeModalTab == 'storage' && !selectedRentCollector) {
			showCustomToast('Select a storage collector.', 1500, 'info');
			return;
		}
		if (activeModalTab == 'sell' && !selectedToken) {
			showCustomToast('Invalid payment asset selected.', 1500, 'info');
			return;
		}

		if (activeModalTab == 'offer') {
			selectedToken = offerToken;
			selectedToken.tokenId = selectedToken.id;
		}

		if (activeModalTab == 'storage') {
			// Storage works exactly like offers - use the selected collector asset as the desired token
			selectedToken = offerToken;
			selectedToken.tokenId = selectedToken.tokenId;
		}

		processing = true;

		let myAddress, height;
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

		const priceInNanoErg = paymentInErg ? new BigNumber(priceInErg).times(10 ** 9) : undefined;
		const priceInNanoToken = !paymentInErg
			? new BigNumber(priceInToken).times(10 ** selectedToken.decimals).toNumber()
			: undefined;

		const orderType = activeModalTab == 'sell' ? 'Sell' : 'Order';
		let royaltypercent = selectedAssets[0].royaltypercent * 1000;

		if (activeModalTab == 'offer') {
			royaltypercent = offerToken.royaltypercent * 1000;
		}
		if (activeModalTab == 'storage') {
			royaltypercent = offerToken.royaltypercent * 1000;
		}

		let unsigned;

		try {
			if (activeModalTab == 'sell') {
				if (escrow) {
					unsigned = escrowSellTx(
						ESCROW_CONTRACT,
						myAddress,
						utxos,
						height,
						DEV_PK,
						selectedAssets,
						paymentInErg,
						priceInNanoErg,
						selectedToken.tokenId,
						priceInNanoToken,
						buyerAddress,
						royaltypercent
					);
				} else {
					unsigned = sellTx(
						CONTRACT,
						myAddress,
						utxos,
						height,
						DEV_PK,
						selectedAssets,
						paymentInErg,
						priceInNanoErg,
						selectedToken.tokenId,
						priceInNanoToken,
						MART_NAME,
						selectedCategory,
						royaltypercent,
						orderType
					);
				}
			} else {
				if (escrow) {
					unsigned = escrowSellTx(
						OFFERS_ESCROW_CONTRACT,
						myAddress,
						utxos,
						height,
						DEV_PK,
						selectedAssets,
						paymentInErg,
						priceInNanoErg,
						selectedToken.tokenId,
						priceInNanoToken,
						buyerAddress,
						royaltypercent
					);
				} else {
					unsigned = sellTx(
						OFFERS_CONTRACT,
						myAddress,
						utxos,
						height,
						DEV_PK,
						selectedAssets,
						paymentInErg,
						priceInNanoErg,
						selectedToken.tokenId,
						priceInNanoToken,
						MART_NAME,
						selectedCategory,
						royaltypercent,
						orderType
					);
				}
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

			processing = false;
			return;
		}

		let transactionId, signed;
		if ($selected_wallet_ergo != 'ergopay') {
			try {
				signed = await ergo.sign_tx(unsigned);
				transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Order submitted successfully. TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				); // Notify success with TX ID

				const usedBoxIds = getCommonBoxIds(utxos, signed.inputs);
				const newOutputs = signed.outputs.filter((output) => output.ergoTree == utxos[0].ergoTree);

				updateTempBoxes(myAddress, usedBoxIds, newOutputs);

				cleanUpSaleWidget();
				await loadWalletBoxes(myAddress, true);
			} catch (e) {
				console.error(e);
				showCustomToast(`Failed to submit TX.`, 5000, 'danger');
			}
		} else {
			unsignedTx = unsigned;
			isAuth = false;
			showErgopayModal = true;
		}

		processing = false;
	}

	function updateTokenAmount(e, token, displayAmount) {
		if (token.royaltypercent > 0) {
			if (displayAmount != 1) {
				showCustomToast('Assets with royalties can only be offered as 1 unit.', 3000);
			}

			displayAmount = 1;
			e.target.value = displayAmount;
		}

		token.displayAmount = displayAmount;
		setTokenAmount(token, displayAmount);
	}

	function tokenAmountValidate(e, token, displayAmount) {
		if (activeModalTab == 'offer' || activeModalTab == 'storage') {
			if (displayAmount < token.minValue) {
				displayAmount = token.minValue;
				e.target.value = displayAmount;

				showCustomToast(`Minimum offer amount for ${token.name} is ${displayAmount}`, 3000);

				token.displayAmount = displayAmount;
				setTokenAmount(token, displayAmount);
			}
		} else if (activeModalTab == 'sell' || activeModalTab == 'lending') {
			if (displayAmount < token.minValue) {
				displayAmount = token.minValue;
				e.target.value = displayAmount;

				showCustomToast(`Minimum amount for ${token.name} is ${displayAmount}`, 3000);

				token.displayAmount = displayAmount;
				setTokenAmount(token, displayAmount);
			}
		}
	}

	function setTokenAmount(token, displayAmount) {
		token.amount = BigInt(Math.round(displayAmount * Math.pow(10, token.decimals)));
	}

	function updateSelectedToken(this) {
		selectedToken = ASSETS.find((asset) => asset.tokenId === this.value);
		priceInToken = 0;
		jQuery('#price').focus();
	}

	async function updateOfferToken() {
		offerTokenError = '';
		offerToken = null;

		if (offerTokenId.length == 64) {
			try {
				offerTokenError = 'Loading token info...';

				let offerTokenInfo = (
					await axios.post(`https://api.ergexplorer.com/tokens/byId`, { ids: [offerTokenId] })
				).data.items[0];

				if (offerTokenInfo) {
					offerToken = offerTokenInfo;
					priceInToken = 0;
					jQuery('#price').focus();
				} else {
					offerTokenError = 'Invalid token ID.';
				}
			} catch (error) {
				offerTokenError = 'Invalid token ID.';
				console.error(error);
			}
		} else if (offerTokenId.length > 0) {
			offerTokenError = 'Invalid token ID.';
		}
	}

	async function loadCollectorAssets(address) {
		collectorAssetsLoading = true;
		collectorAssets = [];

		try {
			// Get collector's UTXOs
			const utxosResponse = await fetchBoxes(address);

			// Get ERG balance
			let ergBalance = 0;
			const tokens = {};

			for (const utxo of utxosResponse) {
				ergBalance += parseInt(utxo.value);

				if (utxo.assets) {
					for (const asset of utxo.assets) {
						if (tokens[asset.tokenId]) {
							tokens[asset.tokenId].amount += parseInt(asset.amount);
						} else {
							tokens[asset.tokenId] = {
								tokenId: asset.tokenId,
								amount: parseInt(asset.amount)
							};
						}
					}
				}
			}

			// Create assets array like loadWalletBoxes
			const assets = [];

			// Add ERG first
			assets.push({
				tokenId: 'erg',
				name: 'ERG',
				decimals: 9,
				amount: ergBalance,
				displayAmount: ergBalance / Math.pow(10, 9),
				minValue: 0.1,
				imageLink: 'https://ergexplorer.com/images/logo-new.png',
				royaltypercent: 0
			});

			// Get token info for other tokens
			const tokenIds = Object.keys(tokens);
			if (tokenIds.length > 0) {
				try {
					const tokenInfoResponse = await axios.post(`https://api.ergexplorer.com/tokens/byId`, {
						ids: tokenIds.slice(0, 30) // Limit to first 30 tokens
					});

					for (const tokenInfo of tokenInfoResponse.data.items) {
						if (tokens[tokenInfo.id]) {
							const asset = {
								tokenId: tokenInfo.id,
								name: tokenInfo.name,
								decimals: tokenInfo.decimals,
								amount: tokens[tokenInfo.id].amount,
								displayAmount: tokens[tokenInfo.id].amount / Math.pow(10, tokenInfo.decimals),
								minValue: tokenInfo.decimals == 0 ? 1 : 1 / Math.pow(10, tokenInfo.decimals),
								imageLink: tokenInfo.cachedurl || tokenInfo.iconurl,
								royaltypercent: tokenInfo.royaltypercent || 0,
								nsfw: tokenInfo.nsfw,
								scam: tokenInfo.scam
							};
							assets.push(asset);
						}
					}
				} catch (e) {
					console.warn('Failed to fetch token info:', e);
				}
			}

			collectorAssets = assets;
		} catch (error) {
			console.error('Failed to load collector assets:', error);
		}

		collectorAssetsLoading = false;
	}

	function priceValidate(e, token) {
		if (e.target.value.length == 0) {
			e.target.value = 0;
		}

		if (activeModalTab == 'sell') {
			let nanoValue = new BigNumber(e.target.value).times(Math.pow(10, token.decimals));
			let minValue = 100;

			if (nanoValue < minValue) {
				let displayAmount = new BigNumber(minValue)
					.div(Math.pow(10, token.decimals))
					.toFormat()
					.replaceAll(',', '.');

				e.target.value = displayAmount;
				priceInToken = displayAmount;

				showCustomToast(`Minimum sell price for ${token.name} is ${displayAmount}`, 3000);
			}
		} else if (activeModalTab == 'offer') {
			let nanoValue = new BigNumber(e.target.value).times(Math.pow(10, offerToken.decimals));
			let minValue = 1;

			if (nanoValue < minValue) {
				let displayAmount = new BigNumber(minValue)
					.div(Math.pow(10, offerToken.decimals))
					.toFormat()
					.replaceAll(',', '.');

				e.target.value = displayAmount;
				priceInToken = displayAmount;

				showCustomToast(`Minimum amount for ${offerToken.name} is ${displayAmount}`, 3000);
			}
		}
	}

	onMount(() => {
		mounted = true;
		getCurrentBlockHeight();

		return () => {
			mounted = false;
		};
	});

	function close() {
		offerTokenId = '';
		sellTokenId = '';
		dispatch('close');
	}

	function selectTokenForLocking(token) {
		// Check if token is already selected
		if (selectedTokensToLock.some((t) => t.tokenId === token.tokenId)) {
			showCustomToast('Token already selected for locking.', 3000, 'warning');
			return;
		}

		// Add token to selected list with amount
		const tokenToAdd = {
			...token,
			amount: BigInt(Math.round(token.displayAmount * Math.pow(10, token.decimals)))
		};

		selectedTokensToLock = [...selectedTokensToLock, tokenToAdd];

		// Automatically set minimum ERG amount when tokens are selected to prevent storage rent
		if (selectedTokensToLock.length > 0 && (!lockAmount || parseFloat(lockAmount) < 0.1)) {
			lockAmount = '0.1';
			showCustomToast(
				`${token.name} added. ERG amount set to minimum 0.1 ERG to prevent storage rent.`,
				3000,
				'info'
			);
		} else {
			showCustomToast(`${token.name} added to lock list.`, 2000, 'success');
		}
	}

	function removeTokenFromLocking(token) {
		selectedTokensToLock = selectedTokensToLock.filter((t) => t.tokenId !== token.tokenId);
		showCustomToast(`${token.name} removed from lock list.`, 2000, 'info');
	}

	function updateTokenLockAmount(token, newAmount) {
		const maxAmount = assets.find((a) => a.tokenId === token.tokenId)?.displayAmount || 0;

		if (newAmount > maxAmount) {
			showCustomToast(`Maximum available: ${maxAmount} ${token.name}`, 3000, 'warning');
			return;
		}

		selectedTokensToLock = selectedTokensToLock.map((t) =>
			t.tokenId === token.tokenId
				? {
						...t,
						displayAmount: newAmount,
						amount: BigInt(Math.round(newAmount * Math.pow(10, t.decimals)))
				  }
				: t
		);
	}

	$: getCurrentBlockHeight();
	$: loadWalletBoxes($connected_wallet_address);

	// Function to scroll to the top of the modal content
	const scrollToTop = () => {
		const modalContent = document.querySelector('.modal-content');
		if (modalContent) {
			modalContent.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		}
	};

	function updateImageUrls(showNsfw) {
		const allAssets = additionalAssets.concat(selectedAssets);

		imageUrls = allAssets.reduce((acc, asset) => {
			acc[asset.tokenId] = getImageUrl(asset, showNsfw);
			return acc;
		}, {});
	}

	function changeTab(tab) {
		if (processing) return;

		activeModalTab = tab;
	}

	async function createLendingOffer() {
		if (!$connected_wallet_address) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}
		if (selectedAssets.length < 1) {
			showCustomToast('Select tokens to lend.', 1500, 'info');
			return;
		}
		if (!collateralAmount) {
			showCustomToast('Set collateral amount.', 1500, 'info');
			return;
		}
		if (collateralTokenId !== 'erg' && !collateralTokenId) {
			showCustomToast('Select collateral asset.', 1500, 'info');
			return;
		}
		if (!lendingFeeErg) {
			showCustomToast('Set lending fee.', 1500, 'info');
			return;
		}

		console.log('🔍 Input values before processing:', {
			collateralAmount: collateralAmount,
			collateralAmountType: typeof collateralAmount,
			collateralTokenId: collateralTokenId,
			durationBlocks: durationBlocks,
			lendingFeeErg: lendingFeeErg
		});

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

			// Import the lending transaction function
			const { createLoanTx } = await import('$lib/contract/lendingTx.ts');

			const loanTokens = selectedAssets.map((token) => ({
				tokenId: token.tokenId,
				amount: token.amount
			}));

			// Ensure collateralAmount is a string and parse it
			const collateralAmountStr = String(collateralAmount);

			console.log('🔍 Collateral amount conversion:', {
				original: collateralAmount,
				asString: collateralAmountStr,
				parsed: parseFloat(collateralAmountStr),
				isErg: collateralTokenId === 'erg'
			});

			// Convert collateral amount properly
			let collateralAmountBigInt;
			try {
				if (collateralTokenId === 'erg') {
					// For ERG, convert to nano ERG (multiply by 10^9)
					const nanoErg = Math.round(parseFloat(collateralAmountStr) * Math.pow(10, 9));
					collateralAmountBigInt = BigInt(nanoErg);
				} else {
					// For tokens, use the raw amount
					const tokenAmount = Math.round(parseFloat(collateralAmountStr));
					collateralAmountBigInt = BigInt(tokenAmount);
				}
				console.log('✅ Converted collateral amount:', collateralAmountBigInt.toString());
			} catch (e) {
				console.error('❌ Error converting collateral amount:', e);
				throw new Error('Invalid collateral amount');
			}

			// Convert lending fee to nano ERG
			const lendingFeeNanoErgBigInt = BigInt(
				Math.round(parseFloat(lendingFeeErg) * Math.pow(10, 9))
			);

			console.log('🏦 Creating loan offer:', {
				lenderAddress: myAddress,
				loanTokens,
				collateralTokenId: collateralTokenId === 'erg' ? '' : collateralTokenId,
				collateralAmount: collateralAmountBigInt.toString(),
				feePercent: LENDING_MIN_FEE_PERCENT,
				durationBlocks: durationBlocks,
				lendingFeeNanoErg: lendingFeeNanoErgBigInt.toString()
			});

			const unsigned = createLoanTx(
				myAddress,
				loanTokens,
				collateralTokenId === 'erg' ? '' : collateralTokenId,
				collateralAmountBigInt,
				LENDING_MIN_FEE_PERCENT,
				durationBlocks, // Keep as number, not BigInt
				lendingFeeNanoErgBigInt,
				utxos,
				height
			);

			let transactionId, signed;
			if ($selected_wallet_ergo != 'ergopay') {
				try {
					signed = await ergo.sign_tx(unsigned);
					transactionId = await ergo.submit_tx(signed);

					showCustomToast(
						`Loan offer created successfully. TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
						10000,
						'success'
					);

					cleanUpSaleWidget();
					await loadWalletBoxes(myAddress, true);
				} catch (e) {
					console.error(e);
					showCustomToast(`Failed to submit TX.`, 5000, 'danger');
				}
			} else {
				unsignedTx = unsigned;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (e) {
			console.error(e);
			if (e.message && e.message.substr(0, 19) == 'Insufficient inputs') {
				showCustomToast(`Insufficient funds.`, 5000, 'danger');
			} else {
				showCustomToast(`Failed to create loan offer.`, 5000, 'danger');
			}
		}

		processing = false;
	}

	$: updateImageUrls($showNsfw);

	async function updateUnlockHeight() {
		if (lockDuration && currentHeight) {
			unlockHeight = (currentHeight + parseInt(lockDuration)).toString();
		}
	}

	async function getCurrentBlockHeight() {
		try {
			const response = await getBlockHeight();
			currentHeight = response;
			// Auto-update unlock height when current height is loaded
			if (lockDuration) {
				updateUnlockHeight();
			}
		} catch (error) {
			console.error('Error fetching current height:', error);
			// Fallback to the explorer API
			try {
				const fallbackResponse = await fetch('https://api.ergoplatform.com/api/v1/info');
				const data = await fallbackResponse.json();
				currentHeight = data.fullHeight;
				if (lockDuration) {
					updateUnlockHeight();
				}
			} catch (fallbackError) {
				console.error('Fallback failed too:', fallbackError);
			}
		}
	}

	async function lockTokens() {
		if (!$connected_wallet_address) {
			showCustomToast('Connect a wallet.', 1500, 'info');
			return;
		}
		if (!lockAmount || lockAmount <= 0) {
			showCustomToast('Enter a valid amount to lock.', 1500, 'info');
			return;
		}
		// Ensure minimum ERG amount when tokens are selected
		if (selectedTokensToLock.length > 0 && parseFloat(lockAmount) < 0.1) {
			showCustomToast(
				'Minimum 0.1 ERG required when locking tokens to prevent storage rent.',
				3000,
				'warning'
			);
			return;
		}
		if (!unlockHeight || unlockHeight <= 0) {
			showCustomToast('Enter a valid unlock height.', 1500, 'info');
			return;
		}

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

			// Use the unlockHeight directly from the input
			const unlockHeightValue = parseInt(unlockHeight);

			// Convert ERG to nanoERG
			const amountToLock = BigInt(Math.round(parseFloat(lockAmount) * 1e9));

			// Prepare tokens to lock
			const tokensToLock = selectedTokensToLock.map((token) => ({
				tokenId: token.tokenId,
				amount: token.amount.toString()
			}));

			// Create MewLock deposit transaction
			const lockTx = await createMewLockDeposit(
				myAddress,
				utxos,
				height,
				amountToLock,
				tokensToLock,
				unlockHeightValue
			);

			if ($selected_wallet_ergo != 'ergopay') {
				const signed = await ergo.sign_tx(lockTx);
				const transactionId = await ergo.submit_tx(signed);

				const assetText =
					selectedTokensToLock.length > 0
						? `ERG and ${selectedTokensToLock.length} token(s)`
						: 'ERG';

				showCustomToast(
					`${assetText} locked successfully! They will unlock at block ${unlockHeightValue}.<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Reset form
				lockAmount = '';
				lockDuration = 720;
				unlockHeight = '';
				selectedTokensToLock = [];

				// Update wallet balance
				await loadWalletBoxes($connected_wallet_address, true);
			} else {
				unsignedTx = lockTx;
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

	async function createMewLockDeposit(
		myAddress,
		utxos,
		height,
		amountToLock,
		tokensToLock,
		unlockHeight
	) {
		// Import the MewLock transaction function
		const { createMewLockDepositTx } = await import('$lib/contract/mewLockTx.ts');

		return createMewLockDepositTx(
			myAddress,
			utxos,
			height,
			amountToLock,
			tokensToLock,
			unlockHeight
		);
	}

	async function loadMewLockBoxes() {
		if (!$connected_wallet_address) return;

		mewLockBoxesLoading = true;
		mewLockBoxes = [];

		try {
			const mewLockAddress = 'HP4Dp7BojEaMUQhmh7MbqbHcZvsF5SdZ'; // Your MewLock contract address

			// Get current block height
			const currentHeight = await getBlockHeight();

			// Search for boxes at the MewLock contract address that belong to the user
			const response = await axios.get(
				`https://api.ergexplorer.com/api/v1/boxes/unspent/byAddress/${mewLockAddress}`
			);

			const userBoxes = response.data.items.filter((box) => {
				// Check if R4 (depositor pubkey) matches user's address
				return box.additionalRegisters?.R4?.renderedValue === $connected_wallet_address;
			});

			for (const box of userBoxes) {
				const unlockHeight = parseInt(box.additionalRegisters.R5.renderedValue);
				const canWithdraw = currentHeight >= unlockHeight;

				mewLockBoxes.push({
					boxId: box.boxId,
					value: parseInt(box.value),
					unlockHeight,
					currentHeight,
					canWithdraw,
					ergoTree: box.ergoTree,
					additionalRegisters: box.additionalRegisters
				});
			}

			// Sort by unlock height (earliest first)
			mewLockBoxes.sort((a, b) => a.unlockHeight - b.unlockHeight);
		} catch (error) {
			console.error('Failed to load MewLock boxes:', error);
			showCustomToast('Failed to load locked tokens.', 3000, 'danger');
		}

		mewLockBoxesLoading = false;
	}

	async function withdrawFromMewLock() {
		if (!selectedMewLockBox || !selectedMewLockBox.canWithdraw) {
			showCustomToast('Selected token is not ready for withdrawal.', 3000, 'warning');
			return;
		}

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

			// Create withdrawal transaction
			const withdrawalTx = await createMewLockWithdrawal(
				myAddress,
				utxos,
				height,
				selectedMewLockBox
			);

			if ($selected_wallet_ergo != 'ergopay') {
				const signed = await ergo.sign_tx(withdrawalTx);
				const transactionId = await ergo.submit_tx(signed);

				showCustomToast(
					`Tokens withdrawn successfully!<br>TX ID: <a target="_new" href="https://ergexplorer.com/transactions/${transactionId}">${transactionId}</a>`,
					10000,
					'success'
				);

				// Refresh the MewLock boxes
				await loadMewLockBoxes();
				selectedMewLockBox = null;

				// Update wallet balance
				await loadWalletBoxes($connected_wallet_address, true);
			} else {
				unsignedTx = withdrawalTx;
				isAuth = false;
				showErgopayModal = true;
			}
		} catch (e) {
			console.error(e);
			showCustomToast(`Failed to withdraw tokens.`, 5000, 'danger');
		}

		processing = false;
	}

	async function createMewLockWithdrawal(myAddress, utxos, height, lockBox) {
		// Import the MewLock transaction function
		const { createMewLockWithdrawalTx } = await import('$lib/contract/mewLockTx.ts');

		return createMewLockWithdrawalTx(myAddress, utxos, height, lockBox);
	}
</script>

<div class="mewlock-header">
	<div class="header-title">
		<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M18 11V7C18 4.79 16.21 3 14 3H10C7.79 3 6 4.79 6 7V11C4.9 11 4 11.9 4 13V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V13C20 11.9 19.1 11 18 11ZM12 17.5C11.17 17.5 10.5 16.83 10.5 16S11.17 14.5 12 14.5S13.5 15.17 13.5 16S12.83 17.5 12 17.5ZM8 11V7C8 5.9 8.9 5 10 5H14C15.1 5 16 5.9 16 7V11H8Z"
				fill="currentColor"
			/>
		</svg>
		MewLock - Time-Locked Storage
	</div>
	<p class="header-subtitle">
		Lock your ERG and tokens in time-based smart contracts for secure storage until unlock height.
	</p>
</div>

<div class="mt-4">
	<h6 class="text-white text-xl font-bold font-manrope text-center mb-3">Lock Your ERG</h6>

	<div class="mewlock-form-card">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
			<div>
				<label class="pb-1 font-bold text-md block" for="lockAmount">Amount to Lock (ERG):</label>
				<input
					id="lockAmount"
					class="bg-form text-white text-sm rounded-lg focus-primary block w-full p-2.5"
					type="number"
					bind:value={lockAmount}
					min="0.1"
					step="0.1"
					placeholder="10.0"
				/>
				{#if selectedTokensToLock.length > 0}
					<small class="text-primary">Minimum 0.1 ERG required when locking tokens</small>
				{/if}
			</div>
			<div>
				<label class="pb-1 font-bold text-md block" for="unlockHeight">Unlock Height (R5):</label>
				<input
					id="unlockHeight"
					class="bg-form text-white text-sm rounded-lg focus-primary block w-full p-2.5"
					type="number"
					bind:value={unlockHeight}
					min="1"
					step="1"
					placeholder="e.g., 1234567"
				/>
				<small class="text-light">Block height when tokens unlock</small>
			</div>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
			<div>
				<label class="pb-1 font-bold text-md block" for="lockDuration"
					>Helper: Lock Duration (blocks):</label
				>
				<input
					id="lockDuration"
					class="bg-form text-white text-sm rounded-lg focus-primary block w-full p-2.5"
					type="number"
					bind:value={lockDuration}
					min="60"
					step="60"
					placeholder="720"
					on:input={updateUnlockHeight}
				/>
				<small class="text-light">~{Math.round(lockDuration / 60)} hours from now</small>
			</div>
			<div>
				<label class="pb-1 font-bold text-md block">Current Block Height:</label>
				<div class="bg-form text-white text-sm rounded-lg p-2.5 border border-gray-600">
					{currentHeight || 'Loading...'}
				</div>
				<small class="text-light">Current blockchain height</small>
			</div>
		</div>

		<div class="p-3 bg-footer rounded-lg">
			<h4 class="text-white font-bold mb-2">🔒 MewLock Smart Contract</h4>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
				<p class="text-gray-300"><strong>ERG Amount:</strong> {lockAmount || '0'} ERG</p>
				<p class="text-gray-300">
					<strong>Additional Tokens:</strong>
					{selectedTokensToLock.length} selected
				</p>
				<p class="text-gray-300"><strong>R4 (depositorPubKey):</strong> Your public key</p>
				<p class="text-gray-300"><strong>R5 (unlockHeight):</strong> {unlockHeight || 'Not set'}</p>
				<p class="text-gray-300">
					<strong>Current Height:</strong>
					{currentHeight || 'Loading...'}
				</p>
			</div>
			{#if unlockHeight && currentHeight}
				<p class="text-sm text-primary mt-2">
					<strong>⏰ Blocks to unlock:</strong>
					{Math.max(0, parseInt(unlockHeight) - currentHeight)}
				</p>
			{/if}
			{#if selectedTokensToLock.length > 0}
				<div class="mt-3 text-xs text-gray-400">
					<strong>Selected tokens:</strong>
					{selectedTokensToLock.map((t) => `${t.displayAmount} ${t.name}`).join(', ')}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Selected Tokens to Lock -->
{#if selectedTokensToLock.length > 0}
	<div class="mt-4">
		<h6 class="text-white text-lg font-bold mb-3">Selected Tokens to Lock</h6>
		<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
			{#each selectedTokensToLock as token}
				<div class="mewlock-token-card">
					<div class="flex justify-between items-center mb-2">
						<span class="font-semibold text-white">{token.name}</span>
						<button
							class="text-red-400 hover:text-red-300 text-sm"
							on:click={() => removeTokenFromLocking(token)}
						>
							<i class="fa-solid fa-times" />
						</button>
					</div>
					<div class="flex items-center gap-2">
						<input
							type="number"
							class="bg-form text-white text-sm rounded p-2 flex-1"
							bind:value={token.displayAmount}
							on:input={(e) => updateTokenLockAmount(token, parseFloat(e.target.value) || 0)}
							min="0"
							step={1 / Math.pow(10, token.decimals)}
						/>
						<span class="text-gray-400 text-sm">{token.name}</span>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- Your Assets for Token Selection -->
<div class="mt-4">
	<h6 class="text-white text-lg font-bold mb-3">Your Assets - Select Additional Tokens to Lock</h6>
	{#if !$connected_wallet_address}
		<div class="bg-bg p-4 rounded-lg text-center">
			<p class="text-gray-300 mb-2">
				<i class="fa-solid fa-wallet text-2xl mb-2" />
			</p>
			<p class="text-gray-300">Connect your wallet to view and select tokens for locking</p>
		</div>
	{:else}
		<div class="mewlock-form-card mb-3">
			<p class="text-gray-300 text-sm mb-2">
				<strong>Address:</strong>
				<a
					href="https://ergexplorer.com/addresses/{$connected_wallet_address}"
					target="_new"
					class="text-primary"
				>
					{$connected_wallet_address.substring(0, 8)}...{$connected_wallet_address.substring(
						$connected_wallet_address.length - 8
					)}
				</a>
			</p>
			<input
				bind:value={search}
				class="bg-form text-white text-sm rounded-lg p-2 w-full"
				type="text"
				placeholder="Search tokens..."
			/>
		</div>
		{#if assetsLoading}
			<div class="bg-form p-8 rounded-lg text-center">
				<div class="loading-spinner mx-auto mb-2" />
				<p class="text-gray-400">Loading assets...</p>
			</div>
		{:else if assets.length > 0}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				{#each assets.filter((a) => a.tokenId !== 'erg' && a.name && a.name
							.toLowerCase()
							.includes(search.toLowerCase()) && !selectedTokensToLock.some((t) => t.tokenId === a.tokenId)) as token}
					<div
						class="bg-form p-3 rounded-lg hover:bg-footer transition-colors cursor-pointer"
						on:click={() => selectTokenForLocking(token)}
					>
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
								<img
									src={token.imageLink}
									alt={token.name}
									class="w-8 h-8 object-contain rounded"
									onerror={(event) => setPlaceholderImage(event, token)}
								/>
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-white font-semibold text-sm truncate">{token.name}</p>
								<p class="text-gray-400 text-xs">Balance: {nFormatter(token.displayAmount)}</p>
								{#if token.royaltypercent > 0}
									<p class="text-primary text-xs">Royalty: {token.royaltypercent}%</p>
								{/if}
							</div>
							<div class="text-primary">
								<i class="fa-solid fa-plus" />
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="bg-form p-8 rounded-lg text-center">
				<p class="text-gray-400">No tokens found in your wallet</p>
				<p class="text-gray-500 text-sm mt-2">Only ERG will be locked</p>
			</div>
		{/if}
	{/if}
</div>

<div
	class="flex sticky bg-form flex-col space-y-3 gap-[20px] sm:flex-row sm:space-y-0 sm:space-x-4 ms-[-22px] bottom-[-20px] sm:bottom-[-25px] p-4 justify-between"
	style="width: calc(100% + 45px);"
>
	<button disabled={processing} class="mewlock-btn secondary flex-grow" on:click={close}
		>Cancel</button
	>
	<button
		class="mewlock-btn primary flex-grow"
		disabled={processing || !lockAmount || lockAmount <= 0 || !unlockHeight || unlockHeight <= 0}
		on:click={lockTokens}
	>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path
				d="M18 11V7C18 4.79 16.21 3 14 3H10C7.79 3 6 4.79 6 7V11C4.9 11 4 11.9 4 13V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V13C20 11.9 19.1 11 18 11ZM12 17.5C11.17 17.5 10.5 16.83 10.5 16S11.17 14.5 12 14.5S13.5 15.17 13.5 16S12.83 17.5 12 17.5ZM8 11V7C8 5.9 8.9 5 10 5H14C15.1 5 16 5.9 16 7V11H8Z"
				fill="currentColor"
			/>
		</svg>
		{selectedTokensToLock.length > 0
			? `Lock ERG + ${selectedTokensToLock.length} Token${
					selectedTokensToLock.length > 1 ? 's' : ''
			  }`
			: 'Lock ERG'}
	</button>
</div>

{#if showErgopayModal}
	<ErgopayModal bind:showErgopayModal bind:isAuth bind:unsignedTx>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

<style>
	/* MewLock Modern Styling */
	.mewlock-header {
		text-align: center;
		margin-bottom: 2rem;
		padding: 1rem;
	}

	.header-title {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.header-title svg {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-radius: 8px;
		padding: 0.25rem;
		flex-shrink: 0;
	}

	.header-subtitle {
		color: rgba(255, 255, 255, 0.7);
		font-size: 1rem;
		margin: 0;
		max-width: 600px;
		margin-left: auto;
		margin-right: auto;
	}

	.mewlock-form-card {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		backdrop-filter: blur(10px);
		transition: all 0.3s ease;
	}

	.mewlock-form-card:hover {
		border-color: rgba(102, 126, 234, 0.3);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
	}

	.mewlock-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem;
		border: none;
		border-radius: 12px;
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.3s ease;
		min-height: 48px;
	}

	.mewlock-btn.primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 4px 16px rgba(102, 126, 234, 0.2);
	}

	.mewlock-btn.primary:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.35);
	}

	.mewlock-btn.secondary {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.mewlock-btn.secondary:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		transform: translateY(-1px);
	}

	.mewlock-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none !important;
		box-shadow: none !important;
	}

	.mewlock-token-card {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		padding: 1rem;
		transition: all 0.3s ease;
	}

	.mewlock-token-card:hover {
		border-color: rgba(102, 126, 234, 0.4);
		background: rgba(255, 255, 255, 0.1);
	}

	/* Override form inputs to match design */
	:global(.mewlock-form-card input) {
		background: rgba(15, 15, 35, 0.8) !important;
		border: 1px solid rgba(255, 255, 255, 0.2) !important;
		border-radius: 8px !important;
		color: white !important;
		transition: all 0.3s ease !important;
	}

	:global(.mewlock-form-card input:focus) {
		outline: none !important;
		border-color: rgba(102, 126, 234, 0.6) !important;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
	}

	/* Style the form labels */
	:global(.mewlock-form-card label) {
		color: rgba(255, 255, 255, 0.9) !important;
		font-weight: 600 !important;
		margin-bottom: 0.5rem !important;
	}

	/* Style small text */
	:global(.mewlock-form-card small) {
		color: rgba(255, 255, 255, 0.6) !important;
		font-size: 0.875rem !important;
	}

	:global(body) {
		background-color: #1a1a1a;
		color: #ffffff;
		margin: 0;
		padding: 0;
	}

	#selected-assets-sticky {
		top: -25px;
	}

	.box {
		background: linear-gradient(145deg, #2a2a2a, #333333);
		border-radius: 15px;
		padding: 2rem;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
	}

	.title {
		font-size: 1.5rem;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.scroll-top-button {
		bottom: 10px;
		right: 10px;
		padding: 10px;
		cursor: pointer;
		font-size: 16px;
		line-height: 0;
		grid-column: -2;
		min-height: 100px;
		height: fill-available;
	}

	.selected-assets {
		overflow-y: auto;
		overflow-x: hidden;
		max-height: 200px;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(225px, 1fr));
		gap: 1rem;
		border-bottom: 1px solid #333;
	}

	.token-card {
		background-color: var(--footer);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
		transition: all 0.2s ease;
		box-sizing: border-box;
		place-content: space-between;
	}

	.token-card:hover {
		scale: 1.03;
	}

	.token-name {
		font-weight: bold;
		white-space: wrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-height: 50px;
		text-align: start;
	}

	.token-restricted {
		background: #333 !important;
		cursor: not-allowed !important;
		scale: 1 !important;
	}

	.token-amount {
		background-color: var(--forms-bg);
		border: none;
		padding: 5px 0;
		border-radius: 5px;
		color: #ffffff;
		width: 100%;
		text-align: center;
	}

	.token-royalty {
		width: 100%;
		text-align: start;
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
	}

	.actions {
		display: flex;
		flex-direction: column;
	}

	.payment-options {
		display: flex;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.radio-label {
		display: flex;
		align-items: center;
		cursor: pointer;
	}

	.radio-label input {
		margin-right: 0.5rem;
	}

	.additional-assets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	.additional-assets .token-card {
		cursor: pointer;
	}

	.additional-assets .token-amount {
		font-size: 0.9rem;
		opacity: 0.8;
	}

	.close-button {
		position: absolute;
		top: 0px;
		right: 0px;
		cursor: pointer;
		font-size: 16px;
		line-height: 0;
	}

	.lending-tab-content {
		padding: 20px;
		text-align: center;
		background: rgba(255, 255, 255, 0.02);
		border-radius: 8px;
		margin: 20px 0;
	}

	.lending-info h4 {
		color: var(--text);
		font-size: 1.3rem;
		font-weight: 600;
		margin: 0 0 12px 0;
	}

	.lending-info p {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.95rem;
		margin: 0 0 16px 0;
	}

	.lending-info ul {
		list-style: none;
		padding: 0;
		margin: 0 0 20px 0;
		text-align: left;
		max-width: 300px;
		margin-left: auto;
		margin-right: auto;
	}

	.lending-info li {
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.85rem;
		margin: 8px 0;
		padding-left: 0;
	}

	.lending-create-btn {
		background: var(--main-color);
		color: white;
		border: none;
		border-radius: 8px;
		padding: 12px 24px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.lending-create-btn:hover {
		background: var(--secondary-color);
		transform: translateY(-1px);
	}
</style>
