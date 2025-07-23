<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import {
		selected_wallet_ergo,
		connected_wallet_address,
		connected_wallet_addresses,
		mewTier,
		connected_wallet_balance,
		wallet_init,
		showNsfw
	} from '$lib/store/store.ts';
	import WalletsModal from '$lib/components/common/WalletsModal.svelte';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import AddressChangeModal from '$lib/components/common/AddressChangeModal.svelte';
	import NotificationFetcher from '$lib/components/common/NotificationFetcher.svelte';
	import NotificationItem from '$lib/components/common/NotificationItem.svelte';
	import { connectErgoWallet, disconnectErgoWallet, KEY_ADDRESS } from '$lib/common/wallet.js';
	import { fetchConfirmedBalance } from '$lib/api-explorer/explorer.ts';
	import {
		nFormatter,
		showCustomToast,
		isMobileDevice,
		truncateAddress
	} from '$lib/utils/utils.js';
	import { writable } from 'svelte/store';
	import { fly } from 'svelte/transition';

	// Create a store for notifications
	export const notificationsStore = writable([]);

	let showWalletsModal = false;
	let showErgopayModal = false;
	let qrCodeText = false;
	let isAuth = false;
	let balanceInNanoErg = '0';
	let balanceErg = '';
	let paymentTokenBalance = '0.00';
	let truncatedAddress = '';
	let showAddressChangeModal = false;
	let isDropdownOpen = false;
	let activeTab = 'wallet'; // 'wallet' or 'notifications'
	let hasUnreadNotifications = false;
	let checkingForNew = false;
	let showQrModal = false; // For QR code modal
	let notificationFetcher; // Reference to notification fetcher component
	let refreshIntervalId; // For periodic notification checks

	let selectedAddress = '';
	let notifications = [];
	let qrCode = null; // For QR code generation

	// Function to toggle the QR Modal
	function toggleQrModal(e) {
		e?.stopPropagation();
		showQrModal = !showQrModal;

		if (showQrModal) {
			setTimeout(generateQRCode, 1);
		}
	}

	// Generate QR code for MewFi Mart link
	function generateQRCode() {
		const address = get(connected_wallet_address);
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
		const url = `https://mart.mewfinance.com/explore?seller=${get(connected_wallet_address)}`;
		navigator.clipboard
			.writeText(url)
			.then(() => showCustomToast('URL copied to clipboard', 'success'))
			.catch((err) => showCustomToast('Failed to copy URL', 'error'));
	}

	async function clickOnNautilusButton() {
		showWalletsModal = false;
		if ($selected_wallet_ergo) {
			await disconnectErgoWallet();
			balanceErg = '';
			paymentTokenBalance = '0.00';
			truncatedAddress = '';
		} else {
			await connectErgoWallet('nautilus');
		}
	}

	async function clickOnErgopayButton() {
		showWalletsModal = false;
		if ($selected_wallet_ergo) {
			await disconnectErgoWallet();
			balanceErg = '';
			paymentTokenBalance = '0.00';
			truncatedAddress = '';
		} else {
			isAuth = true;
			showErgopayModal = true;
		}
	}

	async function loadBalance(wallet, address) {
		if (!$selected_wallet_ergo || !wallet) {
			return;
		}

		selectedAddress = address;

		console.log('Loading balance', selectedAddress);

		try {
			const balanceData = await fetchConfirmedBalance($connected_wallet_address);

			// Fetch balance from API
			if (!balanceData) {
				throw 'Failed to fetch balance';
			}

			balanceInNanoErg = balanceData.nanoErgs;
			connected_wallet_balance.set(balanceData.nanoErgs);
			balanceErg = (+balanceInNanoErg / 10 ** 9).toFixed(2);

			const address = $connected_wallet_address;
			truncatedAddress = address.substr(0, 4) + '...' + address.substr(address.length - 4);
		} catch (error) {
			console.error('Failed to fetch balance:', error);
			showCustomToast('Failed to fetch balance', 3000, 'danger');
		}
	}

	$: loadBalance($selected_wallet_ergo, $connected_wallet_address);

	function toggleDropdown(e) {
		isDropdownOpen = !isDropdownOpen;
		e.stopPropagation();
	}

	function handleAddressChange() {
		connected_wallet_address.set(selectedAddress);
		localStorage.setItem(KEY_ADDRESS, selectedAddress);
		truncatedAddress =
			selectedAddress.substr(0, 4) + '...' + selectedAddress.substr(selectedAddress.length - 4);
		isDropdownOpen = false;
	}

	// Mark notification as read
	function markAsRead(id) {
		notificationsStore.update((notifs) => {
			return notifs.map((n) => {
				if (n.txidin === id) {
					return { ...n, read: true };
				}
				return n;
			});
		});
	}

	// Mark all notifications as read
	function markAllAsRead() {
		notificationsStore.update((notifs) => {
			return notifs.map((n) => ({ ...n, read: true }));
		});
		hasUnreadNotifications = false;
	}

	// Navigate to transaction details
	function navigateToTransaction(txid) {
		if (txid) {
			window.open(`https://ergexplorer.com/transactions#${txid}`, '_blank');
		}
	}

	// Force refresh notifications
	function refreshNotifications() {
		if (notificationFetcher) {
			checkingForNew = notificationFetcher.refresh();
		}
	}

	// Handle new notifications
	function handleNewNotifications(event) {
		const { orders, count } = event.detail;

		if (count > 0) {
			// Count by type
			const newBuys = orders.filter((o) => o.notificationType === 'buy').length;
			const newSells = orders.filter((o) => o.notificationType === 'sell').length;
			const newListings = orders.filter((o) => o.notificationType === 'list').length;
			const newCanceled = orders.filter((o) => o.notificationType === 'cancel').length;

			// Create meaningful message
			let message = '';
			if (newBuys > 0) message += `${newBuys} new purchase${newBuys > 1 ? 's' : ''}, `;
			if (newSells > 0) message += `${newSells} new sale${newSells > 1 ? 's' : ''}, `;
			if (newListings > 0) message += `${newListings} new listing${newListings > 1 ? 's' : ''}, `;
			if (newCanceled > 0)
				message += `${newCanceled} canceled order${newCanceled > 1 ? 's' : ''}, `;

			// Remove trailing comma and space
			if (message.endsWith(', ')) {
				message = message.slice(0, -2);
			}

			// Show toast notification
			showCustomToast(message, 'success');
			hasUnreadNotifications = true;
		}
	}

	// Handle loaded notifications
	function handleNotificationsLoaded(event) {
		const { orders } = event.detail;
		notifications = orders;
		hasUnreadNotifications = orders.some((n) => !n.read);

		// Update the notificationsStore for external access
		notificationsStore.set(orders);
	}

	// Set active tab
	function setActiveTab(tab) {
		activeTab = tab;
		if (tab === 'notifications') {
			// Only mark as read when switching to notification tab
			markAllAsRead();
		}
	}

	onMount(() => {
		// Initialize notification fetcher right away, don't wait for tab click
		if (get(connected_wallet_address)) {
			// Small delay to ensure component is fully mounted
			setTimeout(() => {
				if (notificationFetcher) {
					notificationFetcher.refresh();
				}
			}, 100);
		}

		// Check for new notifications every 2 minutes
		refreshIntervalId = setInterval(() => {
			if (get(connected_wallet_address)) {
				refreshNotifications();
			}
		}, 2 * 60 * 1000);

		// Close dropdown when clicking outside
		const handleDocumentClick = () => {
			if (isDropdownOpen) {
				isDropdownOpen = false;
			}
		};

		if (typeof document !== 'undefined') {
			document.addEventListener('click', handleDocumentClick);
		}

		return () => {
			// Clean up on component destroy
			if (refreshIntervalId) {
				clearInterval(refreshIntervalId);
			}

			if (typeof document !== 'undefined') {
				document.removeEventListener('click', handleDocumentClick);
			}
		};
	});
</script>

{#if !$wallet_init}
	<div />
{:else if $selected_wallet_ergo}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div class="wallet-container relative">
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modern-wallet-button" on:click={toggleDropdown}>
			<span class="tier-badge py-1 px-2">T{$mewTier}</span>
			<span class="address-text">
				{#if truncatedAddress.length > 0}
					{truncatedAddress}
				{:else}
					<div class="btn-spinner" style="scale: 0.7;" />
				{/if}
			</span>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="dropdown-icon {isDropdownOpen ? 'rotate-180' : ''}"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
			{#if hasUnreadNotifications}
				<span class="notification-dot" />
			{/if}
		</div>

		{#if isDropdownOpen}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				on:click={(e) => e.stopPropagation()}
				in:fly={{ y: -10, duration: 200 }}
				out:fly={{ y: -5, duration: 200 }}
				class="modern-wallet-dropdown"
			>
				<div class="tabs">
					<button
						class="tab-button {activeTab === 'wallet' ? 'active' : ''}"
						on:click|stopPropagation={() => setActiveTab('wallet')}
					>
						Wallet
					</button>
					<button
						class="tab-button {activeTab === 'notifications' ? 'active' : ''}"
						on:click|stopPropagation={() => setActiveTab('notifications')}
					>
						Transactions
						{#if hasUnreadNotifications}
							<span class="tab-notification-indicator" />
						{/if}
					</button>
				</div>

				{#if activeTab === 'wallet'}
					<div class="wallet-info">
						<div class="info-row pt-0">
							<span class="info-label">Connection:</span>
							<span class="info-value">
								{get(selected_wallet_ergo).charAt(0).toUpperCase() +
									get(selected_wallet_ergo).slice(1).toLowerCase()}
							</span>
						</div>
						<div class="info-row">
							<span class="info-label">Balance:</span>
							<span class="info-value">
								{#if balanceErg === ''}
									<div class="btn-spinner" style="scale: 0.7;" />
								{:else}
									{balanceErg} <span class="font-bold text-primary">ERG</span>
								{/if}
							</span>
						</div>

						<div class="info-row">
							<span class="info-label">MEW Tier:</span>
							<span class="info-value">{$mewTier}</span>
						</div>
						<div class="info-row">
							<span class="info-label">Address:</span>
							<div class="address-explorer-row">
								<span class="info-value full-address"
									>{truncateAddress($connected_wallet_address, 7)}</span
								>
								<a
									href={`https://ergexplorer.com/addresses#${$connected_wallet_address}`}
									target="_blank"
									rel="noopener noreferrer"
									class="explorer-link"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
										<polyline points="15 3 21 3 21 9" />
										<line x1="10" y1="14" x2="21" y2="3" />
									</svg>
								</a>
							</div>
						</div>
						<div class="info-row">
							<span class="info-label">My Profile:</span>
							<a href={`/profile`} rel="noopener noreferrer" class="explorer-link">
								<button class="btn-info p-1 text-bg text-xs rounded-md pt-0 pb-0 me-2">View</button>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
									<polyline points="15 3 21 3 21 9" />
									<line x1="10" y1="14" x2="21" y2="3" />
								</svg>
							</a>
						</div>
						<div class="info-row">
							<span class="info-label">Personal Mart:</span>
							<button
								class="share-button"
								on:click|stopPropagation={toggleQrModal}
								title="Show QR code for your personalized Mew Mart link"
							>
								<i class="fa-solid fa-qrcode" /> Share
							</button>
						</div>
					</div>

					<div class="nsfw-toggle">
						<label class="inline-flex items-center cursor-pointer">
							<input type="checkbox" bind:checked={$showNsfw} class="sr-only peer" />
							<div
								class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-400 rounded-full peer bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"
							/>
							<span class="ms-3 text-sm font-medium text-gray-200">Show NSFW content</span>
						</label>
					</div>

					<div class="wallet-actions">
						{#if $connected_wallet_addresses.length > 1}
							<button
								class="btn btn-info w-full"
								on:click|stopPropagation={() => {
									isDropdownOpen = false;
									showAddressChangeModal = true;
								}}
								>Change Address
							</button>
						{/if}

						<button
							class="btn btn-secondary w-full disconnect"
							on:click|stopPropagation={clickOnNautilusButton}
						>
							<i class="fa-solid fa-wallet" /> Disconnect
						</button>
					</div>
				{:else}
					<div class="notifications-container">
						<div class="notifications-header">
							<span class="notifications-title">Recent Transactions</span>
							<button
								class="refresh-button"
								on:click|stopPropagation={refreshNotifications}
								disabled={checkingForNew}
								title="Refresh transactions"
							>
								<i class="fa-solid fa-sync-alt {checkingForNew ? 'fa-spin' : ''}" />
							</button>
						</div>

						<NotificationFetcher
							type="all"
							bind:this={notificationFetcher}
							on:newOrders={handleNewNotifications}
							on:loaded={handleNotificationsLoaded}
							let:orders
							let:isRefreshing={checkingForNew}
							showNotifications={activeTab === 'notifications'}
						>
							<div
								slot="loading"
								style="display: {activeTab === 'notifications' ? 'block' : 'none'}"
							>
								<div class="loading-indicator">Loading transactions...</div>
							</div>

							<div slot="empty" style="display: {activeTab === 'notifications' ? 'block' : 'none'}">
								<div class="empty-notifications">No transactions to display</div>
							</div>

							<!-- Only render items when tab is active but keep fetcher always working -->
							{#if activeTab === 'notifications'}
								{#each orders as notification}
									<NotificationItem
										{notification}
										onMarkAsRead={markAsRead}
										onNavigate={navigateToTransaction}
									/>
								{/each}
							{/if}
						</NotificationFetcher>

						{#if notifications.length > 0}
							<div class="notification-actions">
								<button class="action-button" on:click|stopPropagation={markAllAsRead}>
									<i class="fa-solid fa-check-double" /> Mark all as read
								</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{:else}
	<button class="modern-connect-btn" on:click={() => (showWalletsModal = true)}>
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M21,18V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19A2,2 0 0,1 21,5V6H12C10.89,6 10,6.89 10,8V16A2,2 0 0,0 12,18H21M12,16H22V8H12V16M16,13.5A1.5,1.5 0 0,1 14.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12A1.5,1.5 0 0,1 16,13.5Z" fill="currentColor"/>
		</svg>
		Connect Wallet
	</button>
{/if}

<!-- Add this outside the dropdown but inside the component -->
{#if showQrModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="modal-backdrop" on:click={toggleQrModal}>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="modal-content qr-modal bg-form" on:click|stopPropagation>
			<h2 class="modal-title">Personalized Mew Mart Link</h2>
			<div id="qr-code-container" class="qr-code-container" />
			<br />
			<button on:click={copyUrlToClipboard} class="btn btn-primary mb-3 mt-1">Copy URL</button>
			<button on:click={toggleQrModal} class="btn btn-secondary">Close</button>
		</div>
	</div>
{/if}

{#if showWalletsModal}
	<WalletsModal bind:showWalletsModal>
		<div class="w-52 h-52">
			<div
				class="leading-6 pb-2 text-white w-100 text-center font-bold"
				style="font-family:'Manrope';font-size:1.5em;"
			>
				Select Wallet
			</div>
			<div class="w-full mt-6 mb-4">
				{#if !isMobileDevice() && (!window.ergoConnector || !window.ergoConnector['nautilus'])}
					<a
						href="https://chrome.google.com/webstore/detail/nautilus-wallet/gjlmehlldlphhljhpnlddaodbjjcchai"
						target="blank_"
						style="height: 50px;text-wrap:nowrap;"
						class="w-full flex justify-center items-center btn btn-primary mb-3 install-naut"
					>
						<img style="height: 1.4em; width: 1.4em;" src="/wallets/nautilus.svg" alt="" />
						<div>Install Nautilus</div>
					</a>
				{:else if !isMobileDevice()}
					<button
						on:click={clickOnNautilusButton}
						class:grayscale={!window.ergoConnector['nautilus']}
						class="w-full flex justify-center items-center btn btn-primary mb-3"
					>
						<img style="height: 1.4em; width: 1.4em;" src="/wallets/nautilus.svg" alt="" />
						<div class="flex justify-center">
							{#if $selected_wallet_ergo == 'nautilus'}
								Disconnect
							{/if}
							Nautilus
						</div>
					</button>
				{/if}
				<button
					on:click={clickOnErgopayButton}
					class="w-full flex justify-center items-center btn btn-primary mb-3"
				>
					<svg
						stroke="currentColor"
						fill="currentColor"
						stroke-width="0"
						viewBox="0 0 24 24"
						aria-hidden="true"
						focusable="false"
						height="20"
						width="20"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path fill="none" d="M0 0h24v24H0z" />
						<path
							d="M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3zm-2 20h-4v-1h4v1zm3.25-3H6.75V4h10.5v14z"
						/>
					</svg>
					<div class="flex justify-center">
						{#if $selected_wallet_ergo == 'ergopay'}
							Disconnect
						{/if}
						Ergopay
					</div>
				</button>
			</div>
		</div>
		<button slot="btn">Close</button>
	</WalletsModal>
{/if}

{#if showErgopayModal}
	<ErgopayModal bind:showErgopayModal bind:qrCodeText bind:isAuth>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}

{#if showAddressChangeModal}
	<AddressChangeModal bind:showAddressChangeModal onBtnClick={handleAddressChange}>
		<div
			class="leading-6 pb-2 text-white w-100 text-center font-bold rounded-lg"
			style="font-family:'Manrope';font-size:1.5em;"
		>
			Select Address
		</div>
		<br />
		<div class="address-select-container">
			<label class="pb-1 address-select-label" for="paymentToken">Selected Address:</label>
			<div class="select-wrapper">
				<select id="paymentToken" class="address-select" bind:value={selectedAddress}>
					{#each $connected_wallet_addresses as address}
						<option value={address} selected={address === selectedAddress}>
							{address}
						</option>
					{/each}
				</select>
				<div class="select-arrow">
					<i class="fa-solid fa-chevron-down" />
				</div>
			</div>
		</div>
		<span slot="btn">Confirm</span>
	</AddressChangeModal>
{/if}

<style>
	/* Modern Wallet Button Styling */
	.wallet-container {
		position: relative;
	}

	.modern-connect-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1.75rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 12px;
		color: white;
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow: 0 4px 16px rgba(102, 126, 234, 0.2);
	}

	.modern-connect-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.35);
	}

	.modern-wallet-button {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.3s ease;
		backdrop-filter: blur(10px);
		position: relative;
	}

	.modern-wallet-button:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(102, 126, 234, 0.3);
		transform: translateY(-1px);
	}

	.modern-wallet-dropdown {
		position: absolute;
		top: 110%;
		right: 0;
		width: 275px;
		background: rgba(26, 26, 46, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1rem;
		z-index: 50;
		backdrop-filter: blur(20px);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
	}

	.wallet-button {
		display: flex;
		align-items: center;
		gap: 8px;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.2s ease;
		position: relative;
	}

	.wallet-button:hover {
		background: rgba(0, 0, 0, 0.3);
	}
	/* Modal Styles */
	.modal-header {
		margin-bottom: 16px;
		text-align: center;
	}

	.modal-title {
		color: white;
		font-family: 'Manrope', sans-serif;
		font-size: 1.5em;
		font-weight: 600;
		margin: 0;
	}

	.address-select-container {
		margin-bottom: 20px;
	}

	.address-select-label {
		display: block;
		color: rgba(255, 255, 255, 0.7);
		font-size: 14px;
		margin-bottom: 8px;
	}

	.select-wrapper {
		position: relative;
		margin-bottom: 16px;
	}

	.address-select {
		width: 100%;
		padding: 10px 14px;
		background-color: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: white;
		font-size: 14px;
		appearance: none;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.address-select:focus {
		border-color: rgba(155, 102, 255, 0.5);
		outline: none;
	}

	.select-arrow {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: rgba(255, 255, 255, 0.6);
		pointer-events: none;
	}

	.full-address-display {
		background-color: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 12px;
		margin-top: 12px;
	}

	.full-address-wrapper {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 6px;
		background-color: rgba(0, 0, 0, 0.3);
		border-radius: 6px;
		padding: 8px 10px;
	}

	.full-address {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.9);
		word-break: break-all;
	}

	.copy-button {
		background: transparent;
		border: none;
		color: rgba(155, 102, 255, 0.6);
		cursor: pointer;
		padding: 4px;
		transition: color 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-left: 8px;
		flex-shrink: 0;
	}

	.copy-button:hover {
		color: rgba(155, 102, 255, 0.9);
	}

	.modal-actions {
		display: flex;
		gap: 10px;
		margin-top: 20px;
	}

	.action-button {
		flex: 1;
		padding: 10px;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.action-button.cancel {
		background-color: rgba(0, 0, 0, 0.3);
		color: rgba(255, 255, 255, 0.8);
	}

	.action-button.cancel:hover {
		background-color: rgba(0, 0, 0, 0.4);
	}

	.action-button.confirm {
		background-color: rgba(155, 102, 255, 0.2);
		color: white;
	}

	.action-button.confirm:hover {
		background-color: rgba(155, 102, 255, 0.3);
	}
	.notification-dot {
		position: absolute;
		top: 3px;
		right: 3px;
		width: 8px;
		height: 8px;
		background-color: #ff6b6b;
		border-radius: 50%;
	}

	.tier-badge {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		font-size: 12px;
		font-weight: 600;
		border-radius: 6px;
		padding: 0.25rem 0.5rem !important;
		box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
	}

	.address-text {
		color: rgba(255, 255, 255, 0.9);
		font-size: 14px;
		font-weight: 500;
		font-family: 'JetBrains Mono', monospace;
	}

	.dropdown-icon {
		color: rgba(255, 255, 255, 0.7);
		transition: transform 0.3s ease;
		width: 16px;
		height: 16px;
	}

	.dropdown-icon.rotate-180 {
		transform: rotate(180deg);
	}

	.wallet-dropdown {
		position: absolute;
		top: 110%;
		right: 0;
		width: 275px;
		padding: 12px;
		z-index: 50;
	}

	.tabs {
		display: flex;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		margin-bottom: 12px;
	}

	.tab-button {
		flex: 1;
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		padding: 8px 0;
		padding-top: 0;
		font-size: 13px;
		cursor: pointer;
		position: relative;
		transition: color 0.2s ease;
	}

	.tab-button:hover {
		color: rgba(255, 255, 255, 0.8);
	}

	.tab-button.active {
		color: white;
		font-weight: 500;
	}

	.tab-button.active:after {
		content: '';
		position: absolute;
		bottom: -1px;
		left: 25%;
		width: 50%;
		height: 2px;
		background: var(--main-color);
		border-radius: 2px;
	}

	.tab-notification-indicator {
		display: inline-block;
		width: 6px;
		height: 6px;
		background-color: #ff6b6b;
		border-radius: 50%;
		margin-left: 4px;
		vertical-align: top;
	}

	.wallet-info {
		margin-bottom: 12px;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
	}

	.info-row:last-child {
		border-bottom: none;
	}

	.info-label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 12px;
	}

	.info-value {
		color: white;
		font-size: 13px;
		text-align: right;
	}

	.address-explorer-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.full-address {
		max-width: 160px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.explorer-link {
		color: rgba(255, 255, 255, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s ease;
	}

	.explorer-link:hover {
		color: rgba(255, 255, 255, 0.8);
	}

	.nsfw-toggle {
		margin-bottom: 12px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.wallet-actions,
	.notification-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.action-button {
		flex: 1;
		padding: 8px;
		background: rgba(0, 0, 0, 0.3);
		color: white;
		border: none;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-size: 12px;
		transition: background 0.2s ease;
	}

	.action-button:hover {
		background: rgba(0, 0, 0, 0.4);
	}

	.action-button.disconnect {
		background: rgba(155, 102, 255, 0.2);
	}

	.action-button.disconnect:hover {
		background: rgba(155, 102, 255, 0.3);
	}

	.action-button.profile {
		background: rgba(0, 123, 255, 0.2);
		text-decoration: none;
	}

	.action-button.profile:hover {
		background: rgba(0, 123, 255, 0.3);
	}

	.connect-wallet-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(155, 102, 255, 0.2);
		color: white;
		border: none;
		border-radius: 8px;
		padding: 8px 14px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.connect-wallet-btn:hover {
		background: rgba(155, 102, 255, 0.3);
	}

	/* Notification styles */
	.notifications-container {
		max-height: 300px;
		overflow-y: auto;
		margin-bottom: 12px;
	}

	.notifications-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
		padding: 0 2px;
	}

	.notifications-title {
		font-size: 14px;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}

	.refresh-button {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		font-size: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.refresh-button:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.9);
	}

	.refresh-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.fa-spin {
		animation: spin 1s linear infinite;
	}

	.empty-notifications,
	.loading-indicator {
		padding: 20px 0;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 13px;
	}

	.notification-item {
		display: flex;
		align-items: flex-start;
		padding: 10px;
		border-radius: 8px;
		margin-bottom: 8px;
		background: rgba(0, 0, 0, 0.2);
		cursor: pointer;
		transition: background 0.2s ease;
		position: relative;
	}

	.notification-item:hover {
		background: rgba(0, 0, 0, 0.3);
	}

	.notification-item.unread {
		background: rgba(155, 102, 255, 0.1);
	}

	.notification-item.unread:hover {
		background: rgba(155, 102, 255, 0.15);
	}

	.notification-icon {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 10px;
		font-size: 14px;
		flex-shrink: 0;
	}

	.notification-icon.buy {
		background: rgba(0, 184, 148, 0.2);
		color: #00b894;
	}

	.notification-icon.sell {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
	}

	.notification-icon.list {
		background: rgba(74, 138, 255, 0.2);
		color: #4a8aff;
	}

	.notification-icon.cancel {
		background: rgba(149, 165, 166, 0.2);
		color: #95a5a6;
	}

	.notification-content {
		flex: 1;
		min-width: 0; /* Ensures text truncation works */
	}

	.notification-title {
		font-size: 13px;
		color: white;
		font-weight: 500;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		margin-bottom: 4px;
	}

	.transaction-type {
		padding: 2px 5px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
	}

	.transaction-type.buy {
		background: rgba(0, 184, 148, 0.2);
		color: #00b894;
	}

	.transaction-type.sell {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
	}

	.transaction-type.list {
		background: rgba(74, 138, 255, 0.2);
		color: #4a8aff;
	}

	.transaction-type.cancel {
		background: rgba(149, 165, 166, 0.2);
		color: #95a5a6;
	}

	.asset-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 120px;
	}

	.asset-count {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
	}

	.transaction-details {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 2px;
	}

	.asset-amount,
	.notification-price {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
	}

	.notification-price {
		color: rgba(155, 102, 255, 0.9);
		font-weight: 500;
	}

	.new-indicator {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 6px;
		height: 6px;
		background-color: #ff6b6b;
		border-radius: 50%;
	}

	.share-button {
		background: rgba(155, 102, 255, 0.2);
		color: white;
		border: none;
		border-radius: 4px;
		padding: 3px 8px;
		font-size: 12px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 5px;
		transition: background 0.2s ease;
	}

	.share-button:hover {
		background: rgba(155, 102, 255, 0.3);
	}

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
		z-index: 1000;
	}

	.qr-modal {
		background: var(--forms-bg);
		border-radius: 10px;
		padding: 20px;
		max-width: 400px;
		text-align: center;
		border: 2px solid var(--info-color) !important;
	}

	.modal-title {
		color: white;
		font-size: 18px;
		margin-bottom: 15px;
	}

	.qr-code-container {
		margin: 0 auto;
		background: white;
		padding: 10px;
		border-radius: 5px;
		display: inline-block;
	}

	@media (max-width: 400px) {
		.wallet-dropdown {
			max-width: none;
			width: 93vw;
			right: -60px;
			/* border-radius: 0 0 12px 12px; */
		}
	}

	.notification-asset-image {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		overflow: hidden;
		margin-right: 10px;
		background: rgba(0, 0, 0, 0.3);
		flex-shrink: 0;
	}

	.notification-asset-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
