<script lang="ts">
	import MyOrders from '$lib/components/main/MyOrders.svelte';
	import MyEscrowOrders from '$lib/components/main/MyEscrowOrders.svelte';
	import {
		API_HOST,
		CONTRACT_CRC32,
		ESCROW_CRC32,
		OFFERS_CRC32,
		OFFERS_ESCROW_CRC32,
		OLD_CONTRACTS_CRC32,
		OLD_ESCROWS_CRC32
	} from '$lib/common/const.ts';
	import {
		connected_wallet_address,
		mewTier,
		fetchAssetsInfo,
		authorizedMerchant,
		merchantName
	} from '$lib/store/store';
	import { nFormatter, showCustomToast, clamp } from '$lib/utils/utils.js';
	import AddressModal from '$lib/components/common/AddressModal.svelte';
	import { writable, get } from 'svelte/store';
	import { ASSETS, ERG_LIST_FEE, ERG_CANCEL_FEE, DEV_FEE_NUM } from '$lib/common/const.ts'; // Import assets
	import { getImageUrl, destroyParent } from '$lib/utils/utils.js'; // Import image utility functions
	import axios from 'axios';
	import BigNumber from 'bignumber.js';

	let showQrModal = false; // State for QR code modal
	let connectedWalletAddress = '';
	let walletConnected = false;
	let buyerOrders = [];
	let sellerOrders = [];
	let escrowOrders = null;
	let loadingBuy = true;
	let loadingSell = true;
	let loadingEscrow = true;
	let error = '';
	let qrCode = null;
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
	let merchantData = null;

	// Sorting options
	const sortOptions = writable('newest'); // Possible values: 'newest', 'oldest', 'single-asset', 'multiple-assets'

	// Store for managing collapsible order details
	const openOrderDetails = writable({});

	// Store for managing active tab
	const activeTab = writable('active-orders');

	// Helper function to get asset info by tokenId
	function getAssetInfo(tokenId: string) {
		if (tokenId === 'ERG') {
			return { name: 'ERG', decimals: 9 }; // Handle ERG special case
		}
		if (tokenId === '18c938e1924fc3eadc266e75ec02d81fe73b56e4e9f4e268dffffcb30387c42d') {
			return { name: 'AHT', decimals: 0 }; // Handle AHT special case
		}
		if (tokenId === 'bd0c25c373ad606d78412ae1198133f4573b4e4c2d4ed3fc4c2a4547c6c6e12e') {
			return { name: '🤡', decimals: 3 }; // Handle AHT special case
		}
		return ASSETS.find((item) => item.tokenId === tokenId) || { name: 'Unknown', decimals: 0 };
	}

	// Function to toggle the QR Modal
	function toggleQrModal() {
		showQrModal = !showQrModal;

		if (showQrModal) {
			setTimeout(generateQRCode, 1);
		}
	}

	function showShippingInfo(e, order) {
		e.stopPropagation();
		e.preventDefault();

		merchantData = order.merchantData;

		shippingInfo = {
			fullname: '',
			address: '',
			city: '',
			state: '',
			zip: '',
			country: '',
			phone: '',
			transactionId: order.txidin
		};

		showAddressModal = true;
	}

	// Function to fetch orders where the connected wallet address is the buyer
	async function fetchBuyerOrders(walletAddress: string) {
		loadingBuy = true;
		const url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${OFFERS_CRC32}&offset=0&limit=30&status=Sold&buyer=${walletAddress}`;
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch buyer orders');
			}
			const data = await response.json();

			buyerOrders = data.items.map((order) => {
				const assetInfo = getAssetInfo(order.payasset);
				return {
					...order,
					payassetName: order.payassetname ?? assetInfo.name,
					payassetDecimals: assetInfo.decimals,
					payamount: order.payamount
				};
			});

			for (let buyorder of buyerOrders) {
				if (buyorder.category?.toLowerCase().substr(0, 8) == 'phygital') {
					buyorder.merchantData = await axios.get(
						`${API_HOST}mart/getMerchantData?address={buyorder.seller}`
					);

					buyorder.merchantData = buyorder.merchantData.data.items[0];
				}
			}

			// Apply sorting based on the selected sort option
			sortOrders();
			await fetchAssetsInfo(buyerOrders);
		} catch (e) {
			error = e.message;
		} finally {
			loadingBuy = false;
		}
	}

	// Function to fetch orders where the connected wallet address is the seller
	async function fetchSellerOrders(walletAddress: string) {
		loadingSell = true;
		const url = `${API_HOST}mart/getOrders?contract[]=${OLD_CONTRACTS_CRC32[0]}&contract[]=${OLD_CONTRACTS_CRC32[1]}&contract[]=${CONTRACT_CRC32}&contract[]=${OFFERS_CRC32}&offset=0&limit=30&status=Sold&seller=${walletAddress}`;
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch seller orders');
			}
			const data = await response.json();

			sellerOrders = data.items.map((order) => {
				const assetInfo = getAssetInfo(order.payasset);
				return {
					...order,
					payassetName: order.payassetname ?? assetInfo.name,
					payassetDecimals: assetInfo.decimals,
					payamount: order.payamount
				};
			});

			// Apply sorting based on the selected sort option
			sortOrders();
			await fetchAssetsInfo(sellerOrders);
		} catch (e) {
			error = e.message;
		} finally {
			loadingSell = false;
		}
	}

	async function fetchEscrowOrders(walletAddress: string) {
		loadingEscrow = true;
		escrowOrders = null;

		let url = `${API_HOST}mart/getOrders?contract[]=${OLD_ESCROWS_CRC32[0]}&contract[]=${OLD_ESCROWS_CRC32[1]}&contract[]=${ESCROW_CRC32}&contract[]=${OFFERS_ESCROW_CRC32}&offset=0&limit=30&status=Order&seller=${walletAddress}`;
		try {
			let response = await fetch(url);
			if (!response.ok) {
				throw new Error('Failed to fetch seller orders');
			}
			let data = await response.json();

			escrowOrders = data.items;

			url = `${API_HOST}mart/getOrders?contract[]=${OLD_ESCROWS_CRC32[0]}&contract[]=${OLD_ESCROWS_CRC32[1]}&contract[]=${ESCROW_CRC32}&contract[]=${OFFERS_ESCROW_CRC32}&offset=0&limit=30&status=Order&buyer=${walletAddress}`;
			try {
				response = await fetch(url);
				if (!response.ok) {
					throw new Error('Failed to fetch seller orders');
				}
				data = await response.json();

				// Apply sorting based on the selected sort option
				sortOrders();

				escrowOrders = escrowOrders.concat(data.items);

				await fetchAssetsInfo(escrowOrders);
			} catch (e) {
				error = e.message;
			} finally {
				// loadingEscrow = false;
			}
		} catch (e) {
			error = e.message;
		} finally {
			// loadingEscrow = false;
		}
	}

	// Sort orders based on the selected sort option
	function sortOrders() {
		const option = get(sortOptions);
		if (option === 'newest') {
			buyerOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
			sellerOrders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
		} else if (option === 'oldest') {
			buyerOrders.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
			sellerOrders.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
		} else if (option === 'single-asset') {
			buyerOrders.sort((a, b) => a.assets.length - b.assets.length);
			sellerOrders.sort((a, b) => a.assets.length - b.assets.length);
		} else if (option === 'multiple-assets') {
			buyerOrders.sort((a, b) => b.assets.length - a.assets.length);
			sellerOrders.sort((a, b) => b.assets.length - a.assets.length);
		}
	}

	// Fetch all orders when wallet address is available
	$: connected_wallet_address.subscribe(async (value) => {
		connectedWalletAddress = get(connected_wallet_address);
		walletConnected = connectedWalletAddress !== '';
		if (walletConnected) {
			fetchBuyerOrders(connectedWalletAddress);
			fetchSellerOrders(connectedWalletAddress);
			fetchEscrowOrders(connectedWalletAddress);
		}
	});

	// Function to toggle order details
	function toggleOrderDetails(orderId) {
		openOrderDetails.update((details) => {
			if (details[orderId]) {
				delete details[orderId];
			} else {
				details[orderId] = true;
			}
			return { ...details };
		});
	}

	// Function to truncate text
	function truncateText(text, length) {
		return text.length > length
			? `${text.substring(0, length)}...${text.substring(text.length - 5)}`
			: text;
	}

	// Function to handle tab change
	function changeTab(tab) {
		activeTab.set(tab);
	}

	// Helper function to get the Erg Explorer URL for a given transaction ID
	function getExplorerLink(txid: string): string {
		return `https://ergexplorer.com/transactions#${txid}`;
	}

	let totalBuyOrders = 0;
	let totalSellOrders = 0;
	let totalEscrowOrders = 0;

	// Function to update stats
	function updateStats() {
		totalBuyOrders = buyerOrders.length;
		totalSellOrders = sellerOrders.length;
		totalEscrowOrders = escrowOrders.length;
	}

	// Update stats when orders change
	$: {
		if (buyerOrders && sellerOrders && escrowOrders) {
			updateStats();
		}
	}

	// Generate QR code for MewFi Mart link
	function generateQRCode(address) {
		const url = `https://mart.mewfinance.com/explore?seller=${address}`;

		if (qrCode == null) {
			qrCode = new QRCode(document.getElementById('qr-code-container'), {
				text: url,
				width: 250,
				height: 250,
				colorDark: '#000000',
				colorLight: '#ffffff',
				correctLevel: QRCode.CorrectLevel.L
			});
		} else {
			qrCode.clear(); // clear the code.
			qrCode.makeCode(url); // make another code.
		}
	}

	// Function to copy the URL to the clipboard
	function copyUrlToClipboard() {
		const url = `https://mart.mewfinance.com/explore?seller=${connectedWalletAddress}`;
		navigator.clipboard
			.writeText(url)
			.then(() => showCustomToast('URL copied to clipboard', 'success'))
			.catch((err) => showCustomToast('Failed to copy URL', 'error'));
	}

	let onBtnClick = async function () {
		const today = new Date();
		const formattedDate = today.toISOString().split('T')[0];

		const formattedData = {
			FullName: shippingInfo.fullname,
			TxID: shippingInfo.transactionId,
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

		try {
			const response = await axios.post(`${API_HOST}mart/handleShippingInfo`, data, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			});
			showCustomToast('Sent shipping info success!', 3000, 'info');
		} catch {
			showCustomToast('Failed to send shipping info.', 3000, 'danger');
		}
	};
</script>

{#if showQrModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-backdrop" on:click={toggleQrModal}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-content qr-modal" on:click|stopPropagation>
			<h2 class="modal-title">Personalized Mew Mart Link</h2>
			<div id="qr-code-container" class="qr-code-container" />
			<button on:click={copyUrlToClipboard} class="btn btn-primary mb-3 mt-1">Copy URL</button>
			<button on:click={toggleQrModal} class="btn btn-secondary">Close</button>
		</div>
	</div>
{/if}

<div class="container mb-4">
	<h1 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">Profile</h1>

	{#if walletConnected}
		<div
			class="user-info-container p-3 p-md-4 mb-4 flex flex-col md:flex-row space-y-3 md:space-y-0"
		>
			<div
				class="user-details flex flex-1 space-y-3 sm:space-y-0 md:space-y-3 lg:space-y-0 flex flex-col sm:flex-row md:flex-col lg:flex-row space-x-1 sm:space-x-4 md:space-x-1 lg:space-x-4"
			>
				<div class="flex flex-col flex-1 bg-bg p-3 rounded-md">
					<div class="flex flex-col">
						<p>Address</p>
						<div class="wallet-address">
							<p>
								<a href="https://ergexplorer.com/addresses/{connectedWalletAddress}" target="_new"
									>{truncateText(connectedWalletAddress, 8)}</a
								>
							</p>
						</div>
					</div>
					<div class="flex flex-col mt-auto">
						<p><b class="text-primary">MEW</b> <b>Tier:</b> {$mewTier}</p>
						{#if $mewTier < 6}
							<div class="mt-2" style="align-self: center;">
								<a href="https://mewfinance.com/profile"
									><button class="btn btn-primary">Upgrade Tier</button></a
								>
							</div>
						{/if}
					</div>
				</div>
				<div class="flex-1">
					<p><b class="text-primary">MEW Tier</b> Benefits:</p>
					<ul>
						<li>
							<b class="inline-block w-[90px]">Sale fee:</b>
							{new BigNumber(DEV_FEE_NUM).div(1000).toNumber() - 0.2 * clamp($mewTier, 0, 5)}%
						</li>
						<li>
							<b class="inline-block w-[90px]">List fee:</b>
							{$mewTier <= 5 ? new BigNumber(ERG_LIST_FEE).div(10 ** 9).toString() : '0'}
							<span class="text-primary font-bold">ERG</span>
						</li>
						<li>
							<b class="inline-block w-[90px]">Cancel fee:</b>
							{$mewTier <= 5 ? new BigNumber(ERG_CANCEL_FEE).div(10 ** 9).toString() : '0'}
							<span class="text-primary font-bold">ERG</span>
						</li>
						{@html $mewTier < 4
							? ''
							: `<li class="benefits-list-item">Share of <b class="text-primary">Mew Mart</b>'s revenue as rewards every quarter.</li>`}
					</ul>
				</div>
			</div>
			<div class="flex flex-col user-right space-y-6">
				<div class="user-stats">
					<div class="text-section">
						<h1 class="big-heading">Personal Mart</h1>
						<p class="small-text text-light">Share link to your personalized listings.</p>
					</div>
					<button class="btn btn-primary" on:click={toggleQrModal}> Show </button>
				</div>

				{#if $authorizedMerchant}
					<div>
						<h1 class="big-heading">Phygital NFT Merchant</h1>
						<br />
						<p><b>Authorized:</b> Yes</p>
						<p><b>Merchant ID:</b> {$merchantName}</p>
					</div>
				{:else}
					<div class="user-stats">
						<div class="text-section">
							<h1 class="big-heading">Phygital Merchant</h1>
							<p class="small-text text-light">List and sell Phygital NFTs.</p>
						</div>
						<a
							class="btn btn-primary"
							style="color: var(--background) !important;"
							target="_new"
							href="https://t.me/MewFinance"
						>
							Apply
						</a>
					</div>
				{/if}
			</div>
		</div>

		<div class="tabs flex-col md:flex-row">
			<div>
				<button
					on:click={() => changeTab('active-orders')}
					class:active={$activeTab === 'active-orders'}>Active Orders</button
				>
				<button
					on:click={() => changeTab('buyer-orders')}
					class:active={$activeTab === 'buyer-orders'}
					>My Buys {#if loadingBuy}<div
							class="relative top-[3px] inline-flex btn-spinner"
							style="display: inline-flex; scale: 0.7;"
						/>{:else}<span class="stat-value">({totalBuyOrders})</span>{/if}
				</button>
			</div>
			<div>
				<button
					on:click={() => changeTab('seller-orders')}
					class:active={$activeTab === 'seller-orders'}
					>My Sells {#if loadingSell}<div
							class="relative top-[3px] inline-flex btn-spinner"
							style="display: inline-flex; scale: 0.7;"
						/>{:else}<span class="stat-value">({totalSellOrders})</span>{/if}</button
				>
				<button
					on:click={() => changeTab('escrow-orders')}
					class:active={$activeTab === 'escrow-orders'}
					>Escrow {#if loadingEscrow}<div
							class="relative top-[3px] inline-flex btn-spinner"
							style="display: inline-flex; scale: 0.7;"
						/>{:else}<span class="stat-value">({totalEscrowOrders})</span>{/if}</button
				>
			</div>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		{#if $activeTab === 'escrow-orders'}
			<MyEscrowOrders bind:escrowOrders />
		{/if}

		{#if $activeTab === 'active-orders'}
			<div class="offers-container">
				<MyOrders />
			</div>
		{/if}

		{#if $activeTab === 'buyer-orders'}
			<div class="orders-container">
				{#if loadingBuy}
					<p>Loading...</p>
				{:else if buyerOrders.length > 0}
					{#each buyerOrders as order}
						<a
							href={getExplorerLink(order.txidin)}
							target="_blank"
							rel="noopener noreferrer"
							class="order-card-link"
						>
							<div class="order-card buy-order">
								<div class="order-details flex flex-col">
									{#each order.assets as asset}
										<div class="asset-item">
											<span class="asset-icon">
												<img
													src={getImageUrl(asset)}
													class="asset-image"
													on:error={destroyParent}
													alt="Asset"
												/>
											</span>
											<span class="asset-name text-primary font-bold">{asset.name}</span>
											<span class="asset-amount text-light">Amount: {nFormatter(asset.amount)}</span
											>
										</div>
									{/each}
									{#if order.category?.toLowerCase().substr(0, 8) == 'phygital'}
										<p>
											<b>Store support: </b><a target="_new" href={order.merchantData?.storeurl}
												>{order.merchantData?.store}</a
											>
										</p>
										<button
											on:click={showShippingInfo(event, order)}
											class="mt-auto relative w-full bottom-0 btn btn-secondary"
											>Reenter shipping info</button
										>
									{/if}
								</div>
								<div class="order-total buy-total">
									<span>Total Price</span>
									<span
										>{nFormatter(order.payamount)}
										<span class="text-primary font-bold">{order.payassetName}</span></span
									>
								</div>
							</div>
						</a>
					{/each}
				{:else}
					<p>No orders found.</p>
				{/if}
			</div>
		{/if}

		{#if $activeTab === 'seller-orders'}
			<div class="orders-container">
				{#if loadingSell}
					<p>Loading...</p>
				{:else if sellerOrders.length > 0}
					{#each sellerOrders as order}
						{#if order.buyer}
							<a
								href={getExplorerLink(order.txidin)}
								target="_blank"
								rel="noopener noreferrer"
								class="order-card-link"
							>
								<div class="order-card sell-order">
									<div class="order-details">
										{#each order.assets as asset}
											<div class="asset-item">
												<span class="asset-icon">
													<img
														src={getImageUrl(asset)}
														class="asset-image"
														on:error={destroyParent}
														alt="Asset"
													/>
												</span>
												<span class="asset-name text-primary font-bold">{asset.name}</span>
												<span class="asset-amount text-light"
													>Amount: {nFormatter(asset.amount)}</span
												>
											</div>
										{/each}
									</div>
									<div class="order-total sell-total">
										<span>Total Price</span>
										<span
											>{nFormatter(order.payamount)}
											<span class="text-primary font-bold">{order.payassetName}</span></span
										>
									</div>
								</div>
							</a>
						{/if}
					{/each}
				{:else}
					<p>No orders found.</p>
				{/if}
			</div>
		{/if}
	{:else}
		<p>Please connect your wallet to see your orders.</p>
	{/if}
</div>

{#if showAddressModal}
	<div class="modal modal-open">
		<AddressModal bind:showAddressModal bind:shippingInfo bind:onBtnClick>
			<button>Confirm</button>
		</AddressModal>
	</div>
{/if}

<style>
	ul {
		list-style: square;
		list-style-position: inside;
	}

	:global(ul li::marker) {
		color: var(--main-color);
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

	.modal-content {
		border: 2px solid var(--info-color);
	}

	/* General Styles */
	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 20px;
	}
	.offers-container {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 20px;
		justify-content: space-between;
	}
	/* Section Title */
	.section-title {
		color: white;
		margin-top: 30px;
		margin-bottom: 15px;
		text-align: center;
	}

	/* User Info Container */
	.user-info-container {
		display: flex;
		background-color: var(--forms-bg);
		border-radius: 10px;
		padding: 20px;
		gap: 20px;
		max-width: 100%;
	}

	.wallet-address p {
		font-size: 1.2em;
		font-weight: bold;
		color: var(--main-color);
		margin-bottom: 15px;
	}

	/* Copy Button */
	.copy-button {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-color);
	}

	.copy-button:hover {
		color: var(--main-color);
	}

	/* User Stats */
	.user-stats {
		display: flex;
		justify-content: center;
		gap: 20px;
	}

	/* Stat Card */
	.stat-card {
		background-color: var(--footer);
		padding: 10px;
		border-radius: 5px;
		text-align: center;
	}

	.stat-label {
		font-size: 0.9em;
		color: var(--text-color);
	}

	.stat-value {
		font-size: 1.1em;
		font-weight: bold;
		color: white;
	}

	/* MewFi Link */
	.mewfi-link {
		margin-top: 10px;
	}

	.mewfi-link p {
		font-size: 0.9em;
		color: var(--text-color);
	}

	.mewfi-link button {
		background-color: var(--main-color);
		border: none;
		color: white;
		padding: 10px 20px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 1em;
	}

	.mewfi-link button:hover {
		background-color: var(--main-color-dark);
	}

	/* QR Code Modal */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.qr-modal {
		background: var(--forms-bg);
		border-radius: 10px;
		padding: 20px;
		max-width: 400px;
		text-align: center;
		border: 2px solid var(--info-color) !important;
	}

	.qr-code-container {
		margin: 15px auto;
		border: 2px solid var(--main-color);
	}

	.modal-url {
		font-size: 0.9em;
		color: var(--text-color);
		margin-bottom: 10px;
	}

	.copy-url-button {
		background-color: var(--main-color);
		border: none;
		color: white;
		padding: 10px 20px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 1em;
		margin-right: 10px;
	}

	.copy-url-button:hover {
		background-color: var(--main-color-dark);
	}

	.close-modal-button {
		background-color: var(--footer);
		border: none;
		color: white;
		padding: 10px 20px;
		border-radius: 5px;
		cursor: pointer;
		font-size: 1em;
	}

	.close-modal-button:hover {
		background-color: var(--footer-dark);
	}

	/* Tabs Styles */
	.tabs {
		display: flex;
		margin-bottom: 20px;
		gap: 5px;
	}

	.tabs div {
		display: flex;
		flex: 1;
	}

	.tabs button {
		background: var(--forms-bg);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		color: white;
		cursor: pointer;
		flex: 1;
		padding: 10px;
		text-align: center;
		margin-right: 5px;
	}

	.tabs button:hover {
		color: var(--main-color);
	}

	.tabs button.active {
		background: unset;
		color: var(--main-color);
	}

	/* Orders Container */
	.orders-container {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
		gap: 20px;
		margin-top: 20px;
	}

	/* Order Card */
	.order-card {
		background-color: var(--forms-bg);
		border-radius: 10px;
		color: white;
		display: flex;
		flex-direction: column;
		position: relative;
		min-height: 200px;
		padding-bottom: 50px; /* Space for the total price section */
	}

	.order-details {
		padding: 15px;
		flex-grow: 1; /* Allows the details section to grow and fill available space */
	}

	.order-total {
		padding: 15px;
		display: flex;
		justify-content: space-between;
		font-weight: bold;
		position: absolute;
		bottom: 0;
		width: 100%;
	}

	.buy-total {
		background-color: var(--footer); /* Background for buy orders */
	}

	.sell-total {
		background-color: var(--footer); /* Background for sell orders */
	}

	/* Asset Item */
	.asset-item {
		display: flex;
		align-items: center;
		margin-bottom: 10px;
	}

	.asset-icon {
		margin-right: 10px;
	}

	.asset-image {
		width: 24px;
		height: 24px;
		object-fit: cover;
		border-radius: 50%;
	}

	/* Asset Name and Amount */
	.asset-name {
		flex-shrink: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--main-color);
		font-weight: bold;
	}

	.asset-amount {
		text-align: end;
		flex-grow: 1;
		font-size: 0.8em;
		white-space: nowrap;
		color: var(--text-color);
	}

	/* Error Message */
	.error {
		color: red;
		font-weight: bold;
	}

	.user-details {
		display: flex;
	}

	.user-right {
		flex: 1;
	}

	.user-stats {
		display: flex;
		flex: 1;
		align-items: center; /* Vertically center items */
		justify-content: space-between; /* Space between text and button */
	}

	.text-section {
		flex: 1; /* Allow text section to take up available space */
	}

	.big-heading {
		font-size: 1.8rem; /* Adjust to your preferred size */
		font-weight: bold;
		margin: 0;
	}

	.small-text {
		font-size: 0.875rem; /* Smaller text */
		color: #666; /* Adjust color if needed */
		margin-top: 0.5rem; /* Space between heading and small text */
	}

	.btn-primary {
		padding: 12px 24px; /* Adjust padding for larger button */
		font-size: 1rem; /* Adjust font size for button text */
		background-color: #007bff; /* Primary button color */
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.3s ease;
	}

	.btn-primary:hover {
		background-color: #0056b3; /* Darker color on hover */
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.user-stats {
			flex-direction: column;
			align-items: flex-start;
			gap: 10px;
		}

		.btn-primary {
			width: 100%;
			text-align: center;
			margin-top: 10px;
		}
	}
</style>
