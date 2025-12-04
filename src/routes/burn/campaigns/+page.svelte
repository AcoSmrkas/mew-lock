<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		// Redirect to burn tracker leaderboard
		goto('/burn');
	});
</script>

<svelte:head>
	<title>Redirecting... - MewLock</title>
</svelte:head>

<div class="redirect-page">
	<div class="redirect-content">
		<span class="emoji-icon">🔥</span>
		<h1>Redirecting to Burn Tracker...</h1>
		<p>Campaigns feature is currently unavailable.</p>
	</div>
</div>

<style>
	.redirect-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--background);
		padding: 2rem;
	}

	.redirect-content {
		text-align: center;
	}

	.emoji-icon {
		font-size: 4rem;
		display: block;
		margin-bottom: 1rem;
		filter: drop-shadow(0 0 20px rgba(255, 107, 107, 0.6));
	}

	.redirect-content h1 {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.5rem;
	}

	.redirect-content p {
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.1rem;
	}
</style>
