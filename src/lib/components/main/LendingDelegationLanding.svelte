<script lang="ts">
	import { onMount } from 'svelte';
	import MewLockCards from './MewLockCards.svelte';
	import { connected_wallet_address } from '$lib/store/store';
	import { HERO_DESCRIPTION, LOGO_TEXT } from '$lib/common/const.ts';

	export let showHero = true; // Allow hiding hero section

	let stats = {
		totalLockedTokens: 0,
		activeLocks: 0,
		totalValueLocked: 0
	};

	// How it works data - replace emojis with icons
	const mewLockSteps = [
		{
			iconClass: 'fa-solid fa-lock',
			title: 'Lock Your Tokens',
			description: 'Choose the amount of ERG to lock and set your desired lock duration in blocks.'
		},
		{
			iconClass: 'fa-solid fa-clock',
			title: 'Time-Based Security',
			description:
				'Your tokens are secured in the MewLock smart contract until the unlock height is reached.'
		},
		{
			iconClass: 'fa-solid fa-unlock',
			title: 'Withdraw When Ready',
			description:
				'Once the unlock height is reached, you can withdraw your tokens using your private key.'
		}
	];

	onMount(async () => {
		await fetchStats();
	});

	async function fetchStats() {
		try {
			const mewLockAddress = 'HP4Dp7BojEaMUQhmh7MbqbHcZvsF5SdZ'; // Your MewLock contract address

			// Fetch MewLock stats
			const mewLockResponse = await fetch(
				`https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${mewLockAddress}`
			);
			const mewLockData = await mewLockResponse.json();

			const validLocks = mewLockData.items.filter(
				(box) => box.additionalRegisters?.R4 && box.additionalRegisters?.R5
			);

			stats.totalLockedTokens = validLocks.length;

			// Calculate total value locked
			stats.totalValueLocked = validLocks.reduce((total, box) => {
				return total + parseInt(box.value) / 1e9;
			}, 0);

			// Get current height to determine active locks
			const currentHeight = await getCurrentHeight();
			stats.activeLocks = validLocks.filter((box) => {
				const unlockHeight = parseInt(box.additionalRegisters.R5.renderedValue);
				return currentHeight < unlockHeight; // Still locked
			}).length;
		} catch (error) {
			console.error('Error fetching stats:', error);
		}
	}

	async function getCurrentHeight() {
		try {
			const response = await fetch('https://ergo-node.zoomout.io/info');
			const data = await response.json();
			return data.fullHeight;
		} catch (error) {
			console.error('Error fetching current height:', error);
			// Fallback to explorer API
			try {
				const fallbackResponse = await fetch('https://api.ergoplatform.com/api/v1/info');
				const fallbackData = await fallbackResponse.json();
				return fallbackData.height; // Explorer API uses 'height' instead of 'fullHeight'
			} catch (fallbackError) {
				console.error('Fallback failed too:', fallbackError);
				return 0;
			}
		}
	}

	function scrollToSection(section: string) {
		const element = document.getElementById(section + '-section');
		if (element) {
			element.scrollIntoView({ behavior: 'smooth' });
		}
	}
</script>

<div class="landing-container">
	{#if showHero}
		<!-- Original Hero Section -->
		<section class="original-hero-section">
			<div class="hero-flex">
				<div class="hero-content-left">
					<div class="text-center">
						<h1 class="hero-title-original">
							{@html LOGO_TEXT}
						</h1>
					</div>
					<div>
						<p class="hero-subtitle-original">
							{@html HERO_DESCRIPTION}<br />
						</p>
					</div>
					<div class="hero-buttons-original">
						<button class="btn btn-big btn-primary" on:click={() => scrollToSection('mewlock')}>
							<i class="fa-solid fa-lock" /> Lock Tokens
						</button>
						<button class="btn btn-big btn-secondary" on:click={() => scrollToSection('mewlock')}>
							<i class="fa-solid fa-unlock" /> Withdraw Tokens
						</button>
					</div>
				</div>
				<div class="hero-image-wrapper">
					<img src="mart.png" class="hero-image-original" alt="Hero" />
					<div class="hero-gradient" />
				</div>
			</div>

			<!-- Compact stats in hero -->
			<div class="hero-stats-compact">
				<span class="stat-text">Total Locks: <strong>{stats.totalLockedTokens}</strong></span>
				<span class="stat-text">Active Locks: <strong>{stats.activeLocks}</strong></span>
				<span class="stat-text"
					>Total Value Locked: <strong>{stats.totalValueLocked.toFixed(2)} ERG</strong></span
				>
			</div>
		</section>
	{/if}

	<!-- How MewLock Works Section -->
	<section class="how-it-works-section">
		<div class="section-header">
			<h2 class="section-title">How MewLock Works</h2>
			<p class="section-subtitle">Secure time-locked token storage on Ergo blockchain</p>
		</div>

		<div class="steps-container">
			{#each mewLockSteps as step, index}
				<div class="step-card">
					<div class="step-icon">
						<i class={step.iconClass} />
					</div>
					<h3 class="step-title">{step.title}</h3>
					<p class="step-description">{step.description}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- MewLock Section -->
	<section class="offers-section">
		<div class="offers-container" id="mewlock-section">
			<MewLockCards />
		</div>
	</section>
</div>

<style>
	.landing-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1rem;
		color: var(--text-color);
	}

	/* Clean Hero Section Styling */
	.original-hero-section {
		margin-top: 50px;
		margin-bottom: 2rem;
		padding: 2rem 1rem;
	}

	.hero-flex {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		align-items: center;
	}

	@media (min-width: 768px) {
		.hero-flex {
			flex-direction: row;
			gap: 3rem;
		}
	}

	.hero-content-left {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		text-align: center;
		max-width: 100%;
	}

	@media (min-width: 768px) {
		.hero-content-left {
			text-align: left;
			max-width: 60%;
		}
	}

	.hero-title-original {
		font-size: 2.5rem;
		line-height: 1.2;
		font-weight: 800;
		color: white;
		font-family: 'Manrope', sans-serif;
		margin: 0;
	}

	@media (min-width: 640px) {
		.hero-title-original {
			font-size: 3.5rem;
		}
	}

	@media (min-width: 768px) {
		.hero-title-original {
			font-size: 4rem;
		}
	}

	@media (min-width: 1024px) {
		.hero-title-original {
			font-size: 4.5rem;
		}
	}

	.hero-subtitle-original {
		color: var(--text-light);
		font-size: 1rem;
		margin: 0;
		padding: 0.5rem 0;
		font-family: 'Azeret Mono', monospace;
		line-height: 1.6;
	}

	@media (min-width: 768px) {
		.hero-subtitle-original {
			font-size: 1.125rem;
		}
	}

	.hero-buttons-original {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
		width: 100%;
	}

	@media (min-width: 640px) {
		.hero-buttons-original {
			flex-direction: row;
			justify-content: center;
		}
	}

	@media (min-width: 768px) {
		.hero-buttons-original {
			justify-content: flex-start;
		}
	}

	.hero-image-wrapper {
		flex: 1;
		position: relative;
		height: 400px;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	@media (min-width: 768px) {
		.hero-image-wrapper {
			height: 500px;
		}
	}

	.hero-image-original {
		position: relative;
		z-index: 4;
		height: 100%;
		width: auto;
		max-width: 100%;
	}

	@media (min-width: 640px) {
		.hero-image-original {
			max-width: 200%;
			left: -10%;
		}
	}

	@media (min-width: 860px) {
		.hero-image-original {
			max-width: 200%;
			left: 0;
		}
	}

	@media (min-width: 1024px) {
		.hero-image-original {
			max-width: 200%;
			left: 65px;
		}
	}

	/* Compact Hero Stats */
	.hero-stats-compact {
		margin-top: 1rem;
		text-align: center;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 1.5rem;
	}

	@media (max-width: 640px) {
		.hero-stats-compact {
			flex-direction: column;
			gap: 0.5rem;
		}
	}

	.stat-text {
		color: var(--text-light);
		font-size: 0.9rem;
		font-family: 'Azeret Mono', monospace;
	}

	.stat-text strong {
		color: var(--main-color);
		font-weight: 600;
	}

	/* Offers Section */
	.offers-section {
		margin-bottom: 2rem;
	}

	.offers-container {
		margin-bottom: 3rem;
	}

	.section-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.section-subtitle {
		color: var(--text-light);
		font-size: 1rem;
		margin-top: 0.5rem;
	}

	.section-title {
		font-size: 1.8rem;
		font-weight: 600;
		color: var(--secondary-color);
		font-family: 'Manrope', sans-serif;
		margin: 0;
	}

	/* How It Works Section */
	.how-it-works-section {
		margin: 3rem 0;
		padding: 2rem 0;
	}

	.steps-container {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 2rem;
		margin-top: 2rem;
	}

	.step-card {
		background: var(--footer);
		border-radius: 12px;
		padding: 2rem;
		text-align: center;
		transition: transform 0.3s ease;
	}

	.step-card:hover {
		transform: translateY(-5px);
	}

	.step-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.step-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--main-color);
		margin-bottom: 1rem;
		font-family: 'Manrope', sans-serif;
	}

	.step-description {
		color: var(--text-light);
		line-height: 1.6;
		margin: 0;
	}

	/* Responsive Design */
	@media (max-width: 768px) {
		.landing-container {
			padding: 0.5rem;
		}

		.original-hero-section {
			margin-top: 2rem;
		}

		.hero-title-original {
			font-size: 2.5rem;
			line-height: 50px;
		}

		.hero-subtitle-original {
			font-size: 0.9rem;
		}

		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}

		.stat-card {
			padding: 1rem 0.5rem;
		}

		.stat-number {
			font-size: 1.5rem;
		}

		.section-title {
			font-size: 1.5rem;
		}
	}

	@media (max-width: 480px) {
		.hero-buttons-original {
			flex-direction: column;
		}

		.hero-buttons-original .btn {
			width: 100%;
			max-width: 280px;
		}
	}
</style>
