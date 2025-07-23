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
		{ href: '/locks', label: 'All Locks', icon: 'M22,21H2V3H4V19H6V17H10V19H12V16H16V19H18V17H22V21M16,8H18V15H16V8M12,2H14V15H12V2M8,13H10V15H8V13M4,17H6V15H4V17Z' },
		{ href: '/my-locks', label: 'My Locks', icon: 'M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z' }
	];

	$: currentPath = $page.url.pathname;
</script>

<nav class="main-navigation">
	<div class="nav-container">
		<!-- Logo -->
		<div class="nav-logo">
			<a href="/" on:click={closeMobileMenu}>
				<span class="logo-text">MewLock</span>
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
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d={item.icon} fill="currentColor"/>
					</svg>
					{item.label}
				</a>
			{/each}
		</div>

		<!-- Actions -->
		<div class="nav-actions desktop">
			{#if $connected_wallet_address}
				<button class="lock-btn" on:click={openLockModal}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
					</svg>
					Lock Assets
				</button>
			{/if}
			<WalletButton />
		</div>

		<!-- Mobile Hamburger Menu -->
		<button class="mobile-menu-btn" on:click={toggleMobileMenu} class:active={mobileMenuOpen}>
			<span class="hamburger-line"></span>
			<span class="hamburger-line"></span>
			<span class="hamburger-line"></span>
		</button>
	</div>

	<!-- Mobile Menu Overlay -->
	{#if mobileMenuOpen}
		<div class="mobile-menu-overlay" on:click={closeMobileMenu}>
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
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d={item.icon} fill="currentColor"/>
							</svg>
							{item.label}
						</a>
					{/each}
				</div>

				<!-- Mobile Actions -->
				<div class="mobile-actions">
					{#if $connected_wallet_address}
						<button class="mobile-lock-btn" on:click={openLockModal}>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
							</svg>
							Lock Your Assets
						</button>
					{/if}
					<div class="mobile-wallet-button">
						<WalletButton />
					</div>
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

	/* Mobile Menu Button */
	.mobile-menu-btn {
		display: none;
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
		display: flex;
		justify-content: flex-end;
	}

	.mobile-menu {
		background: rgba(15, 15, 35, 0.98);
		width: 280px;
		height: 100%;
		padding: 5rem 2rem 2rem;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(20px);
	}

	.mobile-nav-links {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 3rem;
	}

	.mobile-nav-link {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		text-decoration: none;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		font-size: 1rem;
		transition: all 0.2s;
	}

	.mobile-nav-link:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
	}

	.mobile-nav-link.active {
		color: #667eea;
		background: rgba(102, 126, 234, 0.1);
		border: 1px solid rgba(102, 126, 234, 0.2);
	}

	.mobile-actions {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.mobile-lock-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		border-radius: 12px;
		color: white;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.mobile-lock-btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(102, 126, 234, 0.3);
	}

	.mobile-wallet-button {
		width: 100%;
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

		.mobile-menu-btn {
			display: flex;
		}
	}
</style>