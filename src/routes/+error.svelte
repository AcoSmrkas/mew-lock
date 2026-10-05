<script lang="ts">
	import { page } from '$app/stores';
	import Navigation from '$lib/components/common/Navigation.svelte';

	$: notFound = $page.status === 404;
</script>

<div class="h-full flex flex-col grow main-page">
	<Navigation />
	<main class="error-page">
		<div class="error-card">
			<h1>{notFound ? 'Page not found' : 'Something went wrong'}</h1>
			<p>
				{notFound
					? "This page doesn't exist. Your locks are on chain and unaffected."
					: 'This page failed to load. Your locks are on chain and unaffected. Try again in a minute.'}
			</p>
			<div class="error-actions">
				<a class="error-btn primary" href="/my-locks">My Locks</a>
				<a class="error-btn" href="/">Home</a>
			</div>
		</div>
	</main>
</div>

<style>
	.error-page {
		display: flex;
		justify-content: center;
		padding: 4rem 1rem;
	}

	.error-card {
		width: 100%;
		max-width: 480px;
		padding: 3rem 2rem;
		text-align: center;
		background: var(--ml-surface);
		border: 1px solid var(--ml-border);
		border-radius: var(--ml-radius-lg);
	}

	h1 {
		color: var(--ml-text);
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
	}

	p {
		color: var(--ml-muted);
		margin: 0 0 2rem 0;
	}

	.error-actions {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.error-btn {
		padding: 0.75rem 1.5rem;
		border: 1px solid var(--ml-border-strong);
		border-radius: var(--ml-radius);
		color: var(--ml-text);
		font-weight: 600;
		text-decoration: none;
	}

	.error-btn.primary {
		background: var(--ml-gradient);
		border-color: transparent;
	}
</style>
