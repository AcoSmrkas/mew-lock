<script lang="ts">
	import { onMount } from 'svelte';
	import { nFormatter } from '$lib/utils/utils.js';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import LockedAssetCard from '$lib/components/common/LockedAssetCard.svelte';
	import { ErgoAddress } from '@fleet-sdk/core';

	// Platform data variables
	let loading = true;
	let totalValueLocked = 0;
	let totalUsers = 0;
	let totalLocks = 0;
	let readyToUnlock = 0;
	let mewLockBoxes = [];
	let currentHeight = 0;

	// MewLockV2 contract address
	const MEWLOCK_CONTRACT_ADDRESS =
		'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

	onMount(async () => {
		await loadPlatformStats();
	});

	async function loadPlatformStats() {
		loading = true;
		try {
			// Get current height first
			const heightResponse = await fetch('https://api.ergoplatform.com/api/v1/info');
			const heightData = await heightResponse.json();
			currentHeight = heightData.fullHeight || 0;

			// Then get the boxes
			const response = await fetch(
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}`
			);
			const data = await response.json();

			const boxes = data.items || [];
			mewLockBoxes = boxes;

			// Calculate platform stats with proper data parsing
			totalValueLocked = boxes.reduce((sum, box) => {
				const value = box.value ? parseInt(box.value) / 1e9 : 0;
				return sum + value;
			}, 0);

			totalUsers = new Set(
				boxes.map((box) => box.additionalRegisters?.R4?.renderedValue).filter((address) => address)
			).size;

			totalLocks = boxes.length;

			readyToUnlock = boxes.filter((box) => {
				const unlockHeight = box.additionalRegisters?.R5?.renderedValue
					? parseInt(box.additionalRegisters.R5.renderedValue)
					: 0;
				return currentHeight >= unlockHeight;
			}).length;
		} catch (error) {
			console.error('Error loading platform stats:', error);
			// Set default values on error
			mewLockBoxes = [];
			totalValueLocked = 0;
			totalUsers = 0;
			totalLocks = 0;
			readyToUnlock = 0;
		}
		loading = false;
	}

	// Separate ERG-only locks from ERG+token locks with proper data validation
	$: ergOnlyLocks = mewLockBoxes
		.filter((box) => box && (!box.assets || box.assets.length === 0))
		.sort((a, b) => {
			// Sort by creation time (newest first) using boxId as proxy
			return b.boxId?.localeCompare(a.boxId) || 0;
		})
		.slice(0, 6);

	$: ergTokenLocks = mewLockBoxes
		.filter((box) => box && box.assets && box.assets.length > 0)
		.sort((a, b) => {
			// Sort by creation time (newest first) using boxId as proxy
			return b.boxId?.localeCompare(a.boxId) || 0;
		})
		.slice(0, 6);
</script>

<svelte:head>
	<title>Mew Lock - Secure Time-Locked Asset Storage</title>
	<meta
		name="description"
		content="Secure your ERG and tokens with time-locked smart contracts on Ergo blockchain. Set your own unlock conditions and maintain complete control."
	/>
</svelte:head>

<!-- Navigation -->
<Navigation />

<!-- Full Screen Hero Section -->
<section class="hero-section">
	<div class="hero-background">
		<div class="hero-gradient" />
		<div class="hero-particles">
			<!-- Animated background particles -->
			<div class="particle particle-1" />
			<div class="particle particle-2" />
			<div class="particle particle-3" />
			<div class="particle particle-4" />
			<div class="particle particle-5" />
		</div>
	</div>

	<div class="hero-content">
		<div class="hero-center">
			<!-- Main Logo/Brand -->
			<div class="hero-logo">
				<div class="logo-icon">
					<svg
						width="60"
						height="60"
						viewBox="0 0 24 24"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
							fill="currentColor"
						/>
					</svg>
				</div>
				<div class="hero-text">
					<h1 class="hero-title">Mew Lock</h1>
					<p class="hero-subtitle">Secure Time-Locked Asset Storage</p>
				</div>
			</div>

			<!-- Simple Two-Row Layout -->
			<div class="simple-layout">
				<!-- Top Row: Brand Info + Stats -->
				<div class="top-row">
					<div class="brand-section">
						<h2>Secure Time-Locked Asset Storage</h2>
						<p>Lock your ERG and tokens with smart contracts on the Ergo blockchain. Set your own unlock conditions and maintain complete control over your assets.</p>
						<div class="cta-actions">
							<a href="/my-locks" class="cta-btn primary">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
								</svg>
								Lock Assets
							</a>
							<a href="/locks" class="cta-btn secondary">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M22,21H2V3H4V19H6V17H10V19H12V16H16V19H18V17H22V21M16,8H18V15H16V8M12,2H14V15H12V2M8,13H10V15H8V13M4,17H6V15H4V17Z" fill="currentColor"/>
								</svg>
								View All Locks
							</a>
						</div>
					</div>

					<div class="stats-section">
						{#if loading}
							<div class="stats-loading">
								<div class="loader"></div>
								<span>Loading...</span>
							</div>
						{:else}
							<div class="simple-stats">
								<div class="stat-simple">
									<div class="stat-value-large">{nFormatter(totalValueLocked, 2)}</div>
									<div class="stat-label-simple">ERG Locked</div>
								</div>
								<div class="stat-simple">
									<div class="stat-value-large">{totalUsers}</div>
									<div class="stat-label-simple">Active Users</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Bottom Row: How It Works + Recent Activity -->
				<div class="bottom-row">
					<div class="how-it-works-simple">
						<h3>How It Works</h3>
						<div class="steps-simple">
							<div class="step-simple">
								<div class="step-number">1</div>
								<div class="step-content">
									<h4>Lock Assets</h4>
									<p>Secure your ERG or ERG + tokens for a specific duration</p>
								</div>
							</div>
							<div class="step-simple">
								<div class="step-number">2</div>
								<div class="step-content">
									<h4>Time Release</h4>
									<p>Smart contract secures until unlock height</p>
								</div>
							</div>
							<div class="step-simple">
								<div class="step-number">3</div>
								<div class="step-content">
									<h4>Withdraw</h4>
									<p>Only you can claim when ready</p>
								</div>
							</div>
						</div>
					</div>

					<div class="activity-simple">
						<h3>Recent Activity</h3>
						<div class="activity-tabs-simple">
							<div class="activity-tab-simple">
								<h4>ERG Only ({ergOnlyLocks.length})</h4>
								<div class="activity-list-simple">
									{#each ergOnlyLocks.slice(0, 4) as lockBox}
										<div class="activity-item-simple">
											<span class="amount">{nFormatter(lockBox.value ? lockBox.value / 1e9 : 0)} ERG</span>
											<div class="status-simple">
												{#if currentHeight >= (lockBox.additionalRegisters?.R5?.renderedValue ? parseInt(lockBox.additionalRegisters.R5.renderedValue) : 0)}
													<div class="status-icon unlocked">
														<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4C12.76,4 13.5,4.11 14.2,4.31L15.77,2.74C14.61,2.26 13.34,2 12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12M7.91,10.08L6.5,11.5L11,16L21,6L19.59,4.58L11,13.17L7.91,10.08Z" fill="currentColor"/>
														</svg>
													</div>
												{:else}
													<div class="status-icon locked">
														<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z" fill="currentColor"/>
														</svg>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>

							<div class="activity-tab-simple">
								<h4>ERG + Tokens ({ergTokenLocks.length})</h4>
								<div class="activity-list-simple">
									{#each ergTokenLocks.slice(0, 4) as lockBox}
										<div class="activity-item-simple">
											<span class="amount">{nFormatter(lockBox.value ? lockBox.value / 1e9 : 0)} ERG + {lockBox.assets?.length || 0}</span>
											<div class="status-simple">
												{#if currentHeight >= (lockBox.additionalRegisters?.R5?.renderedValue ? parseInt(lockBox.additionalRegisters.R5.renderedValue) : 0)}
													<div class="status-icon unlocked">
														<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4C12.76,4 13.5,4.11 14.2,4.31L15.77,2.74C14.61,2.26 13.34,2 12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12M7.91,10.08L6.5,11.5L11,16L21,6L19.59,4.58L11,13.17L7.91,10.08Z" fill="currentColor"/>
														</svg>
													</div>
												{:else}
													<div class="status-icon locked">
														<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S13.1 17 12 17Z" fill="currentColor"/>
														</svg>
													</div>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>

<!-- Footer -->
<footer class="footer">
	<div class="footer-container">
		<div class="footer-content">
			<div class="footer-left">
				<div class="footer-brand">
					<h4>Mew Lock</h4>
					<p>Secure time-locked asset storage on Ergo</p>
				</div>
				<div class="footer-links">
					<a href="https://t.me/MewFinance" target="_blank" class="footer-link">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22S22 17.52 22 12S17.52 2 12 2M16.64 8.8C16.49 10.38 15.75 14.22 15.37 15.99C15.21 16.74 14.9 16.99 14.61 17.02C14.37 17.04 13.62 16.91 12.69 16.64L7.55 14.53C7.27 14.42 7.29 14.05 7.64 13.92L15.33 9.97C15.71 9.8 15.67 9.5 15.33 9.64L9.68 12.81L7.4 12.08C6.99 11.96 6.99 11.64 7.5 11.43L15.89 8.17C16.25 8.05 16.67 8.35 16.64 8.8Z"
								fill="currentColor"
							/>
						</svg>
						Telegram
					</a>
					<a href="https://x.com/Mew_finance" target="_blank" class="footer-link">
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M22.46 6C21.69 6.35 20.86 6.58 20 6.69C20.88 6.16 21.56 5.32 21.88 4.31C21.05 4.81 20.13 5.16 19.16 5.36C18.37 4.5 17.26 4 16 4C13.65 4 11.73 5.92 11.73 8.29C11.73 8.63 11.77 8.96 11.84 9.27C8.28 9.09 5.11 7.38 3 4.79C2.63 5.42 2.42 6.16 2.42 6.94C2.42 8.43 3.17 9.75 4.33 10.5C3.62 10.5 2.96 10.3 2.38 10C2.38 10 2.38 10 2.38 10.03C2.38 12.11 3.86 13.85 5.82 14.24C5.46 14.34 5.08 14.39 4.69 14.39C4.42 14.39 4.15 14.36 3.89 14.31C4.43 16 6 17.26 7.89 17.29C6.43 18.45 4.58 19.13 2.56 19.13C2.22 19.13 1.88 19.11 1.54 19.07C3.44 20.29 5.7 21 8.12 21C16 21 20.33 14.46 20.33 8.79C20.33 8.6 20.33 8.42 20.32 8.23C21.16 7.63 21.88 6.87 22.46 6Z"
								fill="currentColor"
							/>
						</svg>
						Twitter
					</a>
				</div>
			</div>

			<div class="footer-right">
				<div class="footer-stats">
					<span class="total-locked">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
								fill="currentColor"
							/>
						</svg>
						{nFormatter(totalValueLocked, 2)} ERG Secured
					</span>
					<span class="copyright">© 2025 Mew Lock</span>
				</div>
			</div>
		</div>
	</div>
</footer>

<style>
	/* Global Styles */
	:global(body) {
		margin: 0;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
		background: #0a0a0f;
		color: white;
		overflow-x: hidden;
	}

	/* Hero Section - Full Screen */
	.hero-section {
		position: relative;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.hero-background {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
	}

	.hero-gradient {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: radial-gradient(ellipse at center, rgba(102, 126, 234, 0.1) 0%, transparent 70%);
	}

	.hero-particles {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
	}

	.particle {
		position: absolute;
		background: rgba(102, 126, 234, 0.3);
		border-radius: 50%;
		animation: float 20s infinite linear;
	}

	.particle-1 {
		width: 4px;
		height: 4px;
		top: 20%;
		left: 10%;
		animation-delay: 0s;
	}

	.particle-2 {
		width: 6px;
		height: 6px;
		top: 60%;
		left: 80%;
		animation-delay: -5s;
	}

	.particle-3 {
		width: 3px;
		height: 3px;
		top: 40%;
		left: 20%;
		animation-delay: -10s;
	}

	.particle-4 {
		width: 5px;
		height: 5px;
		top: 80%;
		left: 60%;
		animation-delay: -15s;
	}

	.particle-5 {
		width: 4px;
		height: 4px;
		top: 30%;
		left: 90%;
		animation-delay: -7s;
	}

	@keyframes float {
		0% {
			transform: translateY(0px) rotate(0deg);
			opacity: 0;
		}
		10% {
			opacity: 1;
		}
		90% {
			opacity: 1;
		}
		100% {
			transform: translateY(-100vh) rotate(360deg);
			opacity: 0;
		}
	}

	.hero-content {
		position: relative;
		z-index: 2;
		text-align: center;
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	.hero-center {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		width: 100%;
	}

	/* Hero Logo */
	.hero-logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.logo-icon {
		width: 80px;
		height: 80px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: 0 20px 60px rgba(102, 126, 234, 0.4);
		animation: pulse 3s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
			box-shadow: 0 20px 60px rgba(102, 126, 234, 0.4);
		}
		50% {
			transform: scale(1.05);
			box-shadow: 0 25px 80px rgba(102, 126, 234, 0.6);
		}
	}

	.hero-text {
		text-align: center;
	}

	.hero-title {
		font-size: 3rem;
		font-weight: 900;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin: 0;
		letter-spacing: -0.02em;
	}

	.hero-subtitle {
		font-size: 1.2rem;
		color: rgba(255, 255, 255, 0.8);
		margin: 0.5rem 0 0 0;
		font-weight: 500;
	}

	/* Simple Layout */
	.simple-layout {
		width: 100%;
		max-width: 1200px;
		margin-top: 2rem;
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}

	.top-row {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 3rem;
		align-items: start;
	}

	.bottom-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3rem;
	}

	/* Brand Section */
	.brand-section h2 {
		font-size: 2.5rem;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 1rem;
		line-height: 1.2;
	}

	.brand-section p {
		font-size: 1.25rem;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.6;
		margin-bottom: 2rem;
	}

	/* CTA Actions */
	.cta-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	/* Stats Section */
	.stats-section {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.simple-stats {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		text-align: center;
		width: 100%;
	}

	.stat-simple {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value-large {
		font-size: 2.5rem;
		font-weight: 700;
		color: #667eea;
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.stat-label-simple {
		font-size: 1rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}

	/* Loading */
	.stats-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.loader {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top: 2px solid #667eea;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* How It Works Simple */
	.how-it-works-simple {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
	}

	.how-it-works-simple h3 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.steps-simple {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.step-simple {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		border-left: 3px solid #667eea;
		transition: all 0.3s ease;
	}

	.step-simple:hover {
		background: rgba(102, 126, 234, 0.05);
		border-color: rgba(102, 126, 234, 0.2);
		transform: translateX(4px);
	}

	.step-number {
		width: 28px;
		height: 28px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 700;
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.step-content {
		flex: 1;
	}

	.step-content h4 {
		font-weight: 600;
		color: #ffffff;
		margin-bottom: 0.25rem;
		font-size: 1rem;
	}

	.step-content p {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		line-height: 1.4;
		margin: 0;
	}

	/* Activity Simple */
	.activity-simple {
		background: rgba(255, 255, 255, 0.05);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 2rem;
	}

	.activity-simple h3 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.activity-tabs-simple {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.activity-tab-simple h4 {
		color: #667eea;
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}

	.activity-list-simple {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.activity-item-simple {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.activity-item-simple:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
	}

	.activity-item-simple .amount {
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.status-icon {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.status-icon.locked {
		background: rgba(251, 146, 60, 0.2);
		color: #fb923c;
	}

	.status-icon.unlocked {
		background: rgba(34, 197, 94, 0.2);
		color: #22c55e;
	}

	/* Hero Stats Center */
	.hero-stats-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.stats-loading {
		color: rgba(255, 255, 255, 0.6);
		font-size: 1rem;
	}

	.stats-grid-compact {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		backdrop-filter: blur(20px);
		width: 100%;
	}

	.stat-item {
		text-align: center;
	}

	.stat-value {
		font-size: 2rem;
		font-weight: 800;
		color: #667eea;
		margin-bottom: 0.5rem;
		line-height: 1;
	}

	.stat-label {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.8rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Hero Actions */
	.hero-actions {
		display: flex;
		gap: 1rem;
		justify-content: center;
		width: 100%;
	}

	.cta-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border-radius: 12px;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.3s ease;
		text-decoration: none;
		white-space: nowrap;
		flex: 1;
		border: none;
	}

	/* Locks Preview */
	.locks-preview {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		backdrop-filter: blur(10px);
	}

	.locks-preview h3 {
		color: #667eea;
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		text-align: center;
	}

	.preview-tabs {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.preview-section h4 {
		color: white;
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
	}

	.preview-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.preview-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		font-size: 0.8rem;
	}

	.preview-amount {
		color: rgba(255, 255, 255, 0.9);
		font-weight: 500;
	}

	.preview-status {
		font-size: 0.9rem;
	}

	.cta-btn.primary {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
	}

	.cta-btn.primary:hover {
		color: white !important;
		transform: translateY(-3px);
		box-shadow: 0 15px 40px rgba(102, 126, 234, 0.6);
	}

	.cta-btn.secondary {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		color: white;
		backdrop-filter: blur(10px);
	}

	.cta-btn.secondary:hover {
		color: white !important;
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(102, 126, 234, 0.5);
		transform: translateY(-3px);
	}

	/* Scroll Indicator */
	.scroll-indicator {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.9rem;
		margin-top: 2rem;
		animation: bounce 2s infinite;
	}

	/* Footer */
	.footer {
		background: rgba(0, 0, 0, 0.3);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding: 3rem 0;
	}

	.footer-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.footer-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 2rem;
	}

	.footer-left {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.footer-brand h4 {
		color: #667eea;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
	}

	.footer-brand p {
		color: rgba(255, 255, 255, 0.6);
		margin: 0;
		font-size: 0.9rem;
	}

	.footer-links {
		display: flex;
		gap: 2rem;
	}

	.footer-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.9rem;
		transition: all 0.2s;
	}

	.footer-link:hover {
		color: #667eea;
	}

	.footer-right {
		text-align: right;
	}

	.footer-stats {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.total-locked {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #667eea;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.copyright {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.8rem;
	}

	/* Responsive Design */
	@media (max-width: 1024px) {
		.top-row {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.bottom-row {
			grid-template-columns: 1fr;
			gap: 2rem;
		}

		.brand-section h2 {
			font-size: 2rem;
		}

		.brand-section p {
			font-size: 1.125rem;
		}

		.stat-value-large {
			font-size: 2rem;
		}

		.cta-actions {
			justify-content: center;
		}
	}

	@media (max-width: 640px) {
		.simple-layout {
			gap: 2rem;
		}

		.brand-section h2 {
			font-size: 1.75rem;
		}

		.brand-section p {
			font-size: 1rem;
		}

		.stats-section,
		.how-it-works-simple,
		.activity-simple {
			padding: 1.5rem;
		}

		.stat-value-large {
			font-size: 1.75rem;
		}

		.hero-title {
			font-size: 2.5rem;
		}

		.hero-subtitle {
			font-size: 1rem;
		}

		.logo-icon {
			width: 60px;
			height: 60px;
		}

		.cta-btn {
			padding: 0.625rem 1.25rem;
			font-size: 0.875rem;
		}

		.footer-content {
			flex-direction: column;
			text-align: center;
		}

		.footer-stats {
			align-items: center;
		}
	}

	@media (max-width: 480px) {
		.hero-title {
			font-size: 2rem;
		}

		.hero-content {
			padding: 1rem;
		}

		.stats-grid-compact {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.hero-center {
			gap: 1.5rem;
		}

		.step-number {
			width: 28px;
			height: 28px;
			font-size: 0.8rem;
		}
	}
</style>
