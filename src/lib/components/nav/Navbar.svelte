<script>
	import WalletButton from '$lib/components/nav/WalletButton.svelte';
	import { page } from '$app/stores';
	let navCollapsed = true;
	let pageName;
	let oldPageName;

	$: page.subscribe((value) => {
		pageName = value.route.id.substr(1);
		const match = pageName.match(/^([^/]+)\//);
		pageName = match ? match[1] : pageName;

		if (pageName != oldPageName) {
			oldPageName = pageName;
			if (!navCollapsed) {
				toggleNav();
			}
		}
	});

	function toggleNav() {
		navCollapsed = !navCollapsed;
	}
</script>

<!-- Modern Minimal Navbar -->
<nav class="fixed top-0 w-full z-50 modern-nav">
	<div class="nav-container">
		<div class="flex items-center justify-between h-20">
			<!-- Logo/Brand -->
			<div class="flex items-center">
				<a href="/" class="brand-link">
					<div class="flex items-center space-x-3">
						<div class="logo-container">
							<span class="text-3xl">🔒</span>
						</div>
						<div class="brand-text">
							<span class="brand-name">Mew Lock</span>
							<span class="brand-tagline">Time-Locked Storage</span>
						</div>
					</div>
				</a>
			</div>

			<!-- Desktop Navigation -->
			<div class="hidden md:flex items-center space-x-1">
				<a href="/" class="nav-link {pageName == '' ? 'active' : ''}"> 🏠 Home </a>
				<a href="/explore" class="nav-link {pageName == 'explore' ? 'active' : ''}"> 🔍 Explore </a>
				<a href="/locks" class="nav-link {pageName == 'locks' ? 'active' : ''}"> 🔒 Locks </a>
				<a href="/activity" class="nav-link {pageName == 'activity' ? 'active' : ''}">
					📊 Activity
				</a>
			</div>

			<!-- Wallet & Mobile Menu -->
			<div class="flex items-center space-x-4">
				{#if pageName != 'privacy-policy'}
					<div class="wallet-container">
						<WalletButton />
					</div>
				{/if}

				<!-- Mobile Lock Icon Button -->
				<a href="/locks" class="lock-icon-btn md:hidden">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
							fill="currentColor"
						/>
					</svg>
				</a>

				<!-- Mobile menu button -->
				<button type="button" on:click={toggleNav} class="mobile-menu-btn md:hidden">
					<div class="hamburger {navCollapsed ? '' : 'active'}">
						<span />
						<span />
						<span />
					</div>
				</button>
			</div>
		</div>

		<!-- Mobile Navigation -->
		<div class="mobile-nav {navCollapsed ? 'collapsed' : 'expanded'}">
			<div class="mobile-nav-content">
				<a href="/" class="mobile-nav-link {pageName == '' ? 'active' : ''}" on:click={toggleNav}>
					<span class="mobile-nav-icon">🏠</span>
					<span>Home</span>
				</a>
				<a
					href="/explore"
					class="mobile-nav-link {pageName == 'explore' ? 'active' : ''}"
					on:click={toggleNav}
				>
					<span class="mobile-nav-icon">🔍</span>
					<span>Explore</span>
				</a>
				<a
					href="/locks"
					class="mobile-nav-link {pageName == 'locks' ? 'active' : ''}"
					on:click={toggleNav}
				>
					<span class="mobile-nav-icon">🔒</span>
					<span>Locks</span>
				</a>
				<a
					href="/activity"
					class="mobile-nav-link {pageName == 'activity' ? 'active' : ''}"
					on:click={toggleNav}
				>
					<span class="mobile-nav-icon">📊</span>
					<span>Activity</span>
				</a>
			</div>
		</div>
	</div>
</nav>

<style>
	/* Modern Navigation Styles */
	.modern-nav {
		background: rgba(22, 13, 37, 0.95);
		backdrop-filter: blur(20px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		transition: all 0.3s ease;
	}

	.nav-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	/* Brand Styles */
	.brand-link {
		transition: all 0.3s ease;
	}

	.brand-link:hover {
		transform: translateY(-1px);
	}

	.logo-container {
		width: 50px;
		height: 50px;
		background: linear-gradient(135deg, rgba(249, 215, 45, 0.2), rgba(4, 223, 255, 0.2));
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
	}

	.brand-text {
		display: flex;
		flex-direction: column;
	}

	.brand-name {
		font-size: 1.5rem;
		font-weight: 800;
		background: linear-gradient(135deg, #f9d72d, #04dfff);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		line-height: 1;
	}

	.brand-tagline {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		font-weight: 500;
		margin-top: 2px;
	}

	/* Desktop Navigation Links */
	.nav-link {
		padding: 12px 20px;
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		font-weight: 500;
		font-size: 0.95rem;
		transition: all 0.3s ease;
		position: relative;
		overflow: hidden;
	}

	.nav-link:hover {
		color: white;
		background: rgba(255, 255, 255, 0.1);
		transform: translateY(-1px);
	}

	.nav-link.active {
		background: rgba(249, 215, 45, 0.15);
		color: #f9d72d;
		box-shadow: 0 4px 20px rgba(249, 215, 45, 0.2);
	}

	.nav-link.active::before {
		content: '';
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 30px;
		height: 2px;
		background: linear-gradient(135deg, #f9d72d, #04dfff);
		border-radius: 2px;
	}

	/* Wallet Container */
	.wallet-container {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 16px;
		padding: 4px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
	}

	/* Lock Icon Button */
	.lock-icon-btn {
		width: 50px;
		height: 50px;
		background: rgba(249, 215, 45, 0.1);
		border: 1px solid rgba(249, 215, 45, 0.2);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #f9d72d;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.lock-icon-btn:hover {
		background: rgba(249, 215, 45, 0.2);
		transform: scale(1.05);
		box-shadow: 0 4px 12px rgba(249, 215, 45, 0.3);
	}

	/* Mobile Menu Button */
	.mobile-menu-btn {
		width: 50px;
		height: 50px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.mobile-menu-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		transform: scale(1.05);
	}

	/* Hamburger Animation */
	.hamburger {
		width: 24px;
		height: 18px;
		position: relative;
		cursor: pointer;
	}

	.hamburger span {
		display: block;
		position: absolute;
		height: 2px;
		width: 100%;
		background: white;
		border-radius: 2px;
		transition: all 0.3s ease;
		left: 0;
	}

	.hamburger span:nth-child(1) {
		top: 0;
	}
	.hamburger span:nth-child(2) {
		top: 50%;
		transform: translateY(-50%);
	}
	.hamburger span:nth-child(3) {
		bottom: 0;
	}

	.hamburger.active span:nth-child(1) {
		transform: rotate(45deg);
		top: 50%;
		margin-top: -1px;
	}

	.hamburger.active span:nth-child(2) {
		opacity: 0;
	}

	.hamburger.active span:nth-child(3) {
		transform: rotate(-45deg);
		bottom: 50%;
		margin-bottom: -1px;
	}

	/* Mobile Navigation */
	.mobile-nav {
		overflow: hidden;
		transition: all 0.3s ease;
		background: rgba(22, 13, 37, 0.98);
		backdrop-filter: blur(20px);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}

	.mobile-nav.collapsed {
		max-height: 0;
		opacity: 0;
	}

	.mobile-nav.expanded {
		max-height: 300px;
		opacity: 1;
	}

	.mobile-nav-content {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mobile-nav-link {
		display: flex;
		align-items: center;
		padding: 16px 20px;
		border-radius: 12px;
		color: rgba(255, 255, 255, 0.8);
		text-decoration: none;
		font-weight: 500;
		transition: all 0.3s ease;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(10px);
	}

	.mobile-nav-link:hover {
		background: rgba(255, 255, 255, 0.15);
		color: white;
		transform: translateX(5px);
		border-color: rgba(255, 255, 255, 0.25);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.mobile-nav-link.active {
		background: rgba(249, 215, 45, 0.15);
		border-color: rgba(249, 215, 45, 0.3);
		color: #f9d72d;
		box-shadow: 0 4px 20px rgba(249, 215, 45, 0.2);
	}

	.mobile-nav-icon {
		font-size: 1.2rem;
		margin-right: 12px;
		width: 24px;
		text-align: center;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.brand-name {
			font-size: 1.25rem;
		}

		.brand-tagline {
			font-size: 0.7rem;
		}

		.logo-container {
			width: 45px;
			height: 45px;
		}

		.nav-container {
			padding: 0 1rem;
		}
	}

	/* Smooth scroll behavior */
	:global(html) {
		scroll-behavior: smooth;
	}

	/* Add padding to body to account for fixed navbar */
	:global(body) {
		padding-top: 80px;
	}
</style>
