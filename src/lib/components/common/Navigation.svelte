<script lang="ts">
	import { page } from '$app/stores';
	import { connected_wallet_address } from '$lib/store/store';
	import WalletButton from '$lib/components/nav/WalletButton.svelte';
	import MewLockModal from './MewLockModal.svelte';
	import { priceService } from '$lib/services/priceService';
	import { onMount } from 'svelte';

	let mobileMenuOpen = false;
	let showLockModal = false;
	let tvl = 0;
	let tvlLoading = true;

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	function openLockModal() {
		showLockModal = true;
		closeMobileMenu();
	}

	function closeLockModal() {
		showLockModal = false;
	}

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS = '5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

	// Navigation items
	const navItems = [
		{ href: '/', label: 'Home', icon: 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z' },
		{ href: '/burn', label: 'Burn Tracker', icon: 'M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z' },
		{ href: '/burn/campaigns', label: 'Campaigns', icon: 'M14.94 19.5L12 17.77L9.06 19.5L9.84 16.16L7.19 13.97L10.59 13.69L12 10.5L13.41 13.69L16.81 13.97L14.16 16.16L14.94 19.5M20 12C20 10.89 20.89 10 22 10V6C22 4.89 21.1 4 20 4H4C2.89 4 2 4.89 2 6V10C3.11 10 4 10.89 4 12C4 13.11 3.11 14 2 14V18C2 19.11 2.89 20 4 20H20C21.11 20 22 19.11 22 18V14C20.89 14 20 13.11 20 12Z' }
	];

	$: currentPath = $page.url.pathname;

	onMount(() => {
		calculateTVL();
		// Update TVL every 5 minutes
		const interval = setInterval(calculateTVL, 5 * 60 * 1000);
		return () => clearInterval(interval);
	});

	async function calculateTVL() {
		try {
			tvlLoading = true;
			
			// Ensure price service is initialized first
			const ergPrice = await priceService.getErgPrice();
			
			// Fetch all locked boxes
			const response = await fetch(`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}`);
			const data = await response.json();
			const boxes = data.items || [];
			
			let totalUsdValue = 0;
			
			for (const box of boxes) {
				// Add ERG value
				const ergAmount = box.value ? parseInt(box.value) / 1e9 : 0;
				totalUsdValue += ergAmount * ergPrice;
				
				// Add token values
				if (box.assets && box.assets.length > 0) {
					for (const asset of box.assets) {
						const tokenPrice = await priceService.getTokenPrice(asset.tokenId);
						if (tokenPrice && tokenPrice.usdPrice) {
							const decimals = asset.decimals || 0;
							const tokenAmount = asset.amount / Math.pow(10, decimals);
							const tokenUsdValue = tokenAmount * tokenPrice.usdPrice;
							totalUsdValue += tokenUsdValue;
						}
					}
				}
			}
			
			tvl = totalUsdValue;
		} catch (error) {
			console.error('Error calculating TVL:', error);
		} finally {
			tvlLoading = false;
		}
	}
</script>

<nav class="main-navigation">
	<div class="nav-container">
		<!-- Logo -->
		<div class="nav-logo">
			<a class="flex space-x-2 items-center" href="/" on:click={closeMobileMenu}>
				<img class="w-auto h-10 inline" src="/logo.png" alt="" />
				<span class="logo-text">Mew Lock</span>
			</a>
		</div>

		<!-- Desktop Navigation -->
		<div class="nav-links desktop">
			{#each navItems as item}
				<a
					href={item.href}
					class="nav-link"
					class:active={currentPath === item.href}
					on:click={closeMobileMenu}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path d={item.icon} fill="currentColor" />
					</svg>
					{item.label}
				</a>
			{/each}
			
			<!-- TVL Display - Hidden -->
			<div class="tvl-display" style="display: none;">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M7,15H9C9,16.08 10.37,17 12,17C13.63,17 15,16.08 15,15C15,13.9 13.96,13.5 11.76,12.97C9.64,12.44 7,11.78 7,9C7,7.21 8.47,5.69 10.5,5.18V3H13.5V5.18C15.53,5.69 17,7.21 17,9H15C15,7.92 13.63,7 12,7C10.37,7 9,7.92 9,9C9,10.1 10.04,10.5 12.24,11.03C14.36,11.56 17,12.22 17,15C17,16.79 15.53,18.31 13.5,18.82V21H10.5V18.82C8.47,18.31 7,16.79 7,15Z" fill="currentColor"/>
				</svg>
				<span class="tvl-label">TVL:</span>
				{#if tvlLoading}
					<span class="tvl-loading">...</span>
				{:else}
					<span class="tvl-value">{priceService.formatUsd(tvl)}</span>
				{/if}
			</div>
		</div>

		<!-- Actions -->
		<div class="nav-actions desktop">
			{#if $connected_wallet_address}
				<button class="lock-btn" on:click={openLockModal}>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
							fill="currentColor"
						/>
					</svg>
					Lock Assets
				</button>
			{/if}
			<WalletButton />
		</div>

		<!-- Mobile Actions -->
		<div class="mobile-actions-header">
			{#if $connected_wallet_address}
				<button class="mobile-lock-icon" on:click={openLockModal}>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
							fill="currentColor"
						/>
					</svg>
				</button>
			{/if}
			<div class="mobile-wallet-header">
				<WalletButton />
			</div>
			<button class="mobile-menu-btn" on:click={toggleMobileMenu} class:active={mobileMenuOpen}>
				<span class="hamburger-line" />
				<span class="hamburger-line" />
				<span class="hamburger-line" />
			</button>
		</div>
	</div>

	<!-- Mobile Menu Overlay -->
	{#if mobileMenuOpen}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="mobile-menu-overlay" on:click={closeMobileMenu}>
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div class="mobile-menu" on:click|stopPropagation>
				<!-- Mobile Navigation Links -->
				<div class="mobile-nav-links">
					{#each navItems as item}
						<a
							href={item.href}
							class="mobile-nav-link"
							class:active={currentPath === item.href}
							on:click={closeMobileMenu}
						>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<path d={item.icon} fill="currentColor" />
							</svg>
							{item.label}
						</a>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</nav>

<!-- MewLock Modal -->
{#if showLockModal}
	<MewLockModal on:close={closeLockModal} />
{/if}

<style>
	.main-navigation {
		position: sticky;
		top: 0;
		z-index: 100;
		background: rgba(15, 15, 35, 0.95);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
	}

	.nav-container {
		max-width: 1400px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 2rem;
	}

	/* Logo */
	.nav-logo a {
		text-decoration: none;
		color: white;
	}

	.logo-text {
		font-size: 1.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #ff6b6b 0%, #ffaa00 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	/* Desktop Navigation */
	.nav-links.desktop {
		display: flex;
		align-items: center;
		gap: 2rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		text-decoration: none;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		transition: all 0.2s;
	}

	.nav-link:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.nav-link.active {
		color: #ff6b6b;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
	}


	/* Actions */
	.nav-actions.desktop {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.lock-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.lock-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
	}

	/* Mobile Actions Header */
	.mobile-actions-header {
		display: none;
		align-items: center;
		gap: 0.75rem;
	}

	.mobile-lock-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
		border-radius: 8px;
		color: #ff6b6b;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mobile-lock-icon:hover {
		background: rgba(255, 107, 107, 0.2);
		transform: scale(1.05);
	}

	.mobile-wallet-header {
		min-width: 120px;
	}

	/* Mobile Menu Button */
	.mobile-menu-btn {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		width: 30px;
		height: 30px;
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
		z-index: 101;
	}

	.hamburger-line {
		width: 100%;
		height: 3px;
		background: white;
		border-radius: 2px;
		transition: all 0.3s ease;
		transform-origin: center;
	}

	.mobile-menu-btn.active .hamburger-line:nth-child(1) {
		transform: rotate(45deg) translate(7px, 7px);
	}

	.mobile-menu-btn.active .hamburger-line:nth-child(2) {
		opacity: 0;
	}

	.mobile-menu-btn.active .hamburger-line:nth-child(3) {
		transform: rotate(-45deg) translate(7px, -7px);
	}

	/* Mobile Menu Overlay */
	.mobile-menu-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		z-index: 99;
	}

	.mobile-menu {
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		width: 100%;
		max-width: 400px;
		margin: 0 auto;
		margin-top: 80px;
		padding: 2rem;
		border-radius: 16px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.mobile-nav-links {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: rgba(255, 255, 255, 0.05);
		padding: 1.5rem;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.mobile-nav-link {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-radius: 12px;
		text-decoration: none;
		color: rgba(255, 255, 255, 0.8);
		font-weight: 500;
		font-size: 1rem;
		transition: all 0.3s ease;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.08);
	}

	.mobile-nav-link:hover {
		color: white;
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.25);
		transform: translateX(4px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.mobile-nav-link.active {
		color: #ff6b6b;
		background: rgba(255, 107, 107, 0.1);
		border: 1px solid rgba(255, 107, 107, 0.2);
	}


	/* Responsive */
	@media (max-width: 768px) {
		.nav-container {
			padding: 1rem;
		}

		.nav-links.desktop,
		.nav-actions.desktop {
			display: none;
		}

		.mobile-actions-header {
			display: flex;
		}

		.logo-text {
			display: none;
		}
	}
</style>
