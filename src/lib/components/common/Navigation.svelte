<script lang="ts">
	import { page } from '$app/stores';
	import { connected_wallet_address } from '$lib/store/store';
	import WalletButton from '$lib/components/nav/WalletButton.svelte';
	import MewLockModal from './MewLockModal.svelte';

	let mobileMenuOpen = false;
	let showLockModal = false;

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

	// Navigation items
	const navItems = [
		{ href: '/', label: 'Home', icon: 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z' },
		{ href: '/locks', label: 'All Locks', icon: 'M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z' },
		{
			href: '/my-locks',
			label: 'My Locks',
			icon: 'M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z'
		}
	];

	$: currentPath = $page.url.pathname;
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
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
		color: #667eea;
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
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
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
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
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
		border-radius: 8px;
		color: #667eea;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mobile-lock-icon:hover {
		background: rgba(102, 126, 234, 0.2);
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
		color: #667eea;
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
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
