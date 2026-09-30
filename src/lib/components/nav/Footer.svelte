<script lang="ts">
	import { ergLocked } from '$lib/store/tvl.ts';
	import { nFormatter } from '$lib/utils/utils.js';

	const year = new Date().getFullYear();

	const links = [
		{
			href: 'https://t.me/MewFinance',
			label: 'Telegram',
			external: true,
			icon: 'M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22S22 17.52 22 12S17.52 2 12 2M16.64 8.8C16.49 10.38 15.75 14.22 15.37 15.99C15.21 16.74 14.9 16.99 14.61 17.02C14.37 17.04 13.62 16.91 12.69 16.64L7.55 14.53C7.27 14.42 7.29 14.05 7.64 13.92L15.33 9.97C15.71 9.8 15.67 9.5 15.33 9.64L9.68 12.81L7.4 12.08C6.99 11.96 6.99 11.64 7.5 11.43L15.89 8.17C16.25 8.05 16.67 8.35 16.64 8.8Z'
		},
		{
			href: 'https://x.com/Mew_finance',
			label: 'Twitter',
			external: true,
			icon: 'M22.46 6C21.69 6.35 20.86 6.58 20 6.69C20.88 6.16 21.56 5.32 21.88 4.31C21.05 4.81 20.13 5.16 19.16 5.36C18.37 4.5 17.26 4 16 4C13.65 4 11.73 5.92 11.73 8.29C11.73 8.63 11.77 8.96 11.84 9.27C8.28 9.09 5.11 7.38 3 4.79C2.63 5.42 2.42 6.16 2.42 6.94C2.42 8.43 3.17 9.75 4.33 10.5C3.62 10.5 2.96 10.3 2.38 10C2.38 10 2.38 10 2.38 10.03C2.38 12.11 3.86 13.85 5.82 14.24C5.46 14.34 5.08 14.39 4.69 14.39C4.42 14.39 4.15 14.36 3.89 14.31C4.43 16 6 17.26 7.89 17.29C6.43 18.45 4.58 19.13 2.56 19.13C2.22 19.13 1.88 19.11 1.54 19.07C3.44 20.29 5.7 21 8.12 21C16 21 20.33 14.46 20.33 8.79C20.33 8.6 20.33 8.42 20.32 8.23C21.16 7.63 21.88 6.87 22.46 6Z'
		},
		{
			href: '/faq',
			label: 'FAQ',
			external: false,
			icon: 'M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22S22 17.52 22 12S17.52 2 12 2M13 19H11V17H13V19M15.07 11.25L14.17 12.17C13.45 12.9 13 13.5 13 15H11V14.5C11 13.4 11.45 12.4 12.17 11.67L13.41 10.41C13.78 10.05 14 9.55 14 9C14 7.9 13.1 7 12 7S10 7.9 10 9H8C8 6.79 9.79 5 12 5S16 6.79 16 9C16 9.88 15.64 10.67 15.07 11.25Z'
		}
	];
</script>

<footer class="site-footer">
	<div class="footer-container">
		<div class="footer-left">
			<div class="footer-brand">
				<span class="footer-name">Mew Lock</span>
				<p>Secure time-locked asset storage on Ergo</p>
			</div>
			<nav class="footer-links" aria-label="Community and help">
				{#each links as link}
					<a
						href={link.href}
						class="footer-link"
						target={link.external ? '_blank' : undefined}
						rel={link.external ? 'noopener' : undefined}
					>
						<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
							<path d={link.icon} fill="currentColor" />
						</svg>
						{link.label}
					</a>
				{/each}
			</nav>
		</div>

		<div class="footer-right">
			{#if $ergLocked !== null}
				<span class="total-locked">
					<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
						<path
							d="M18 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H4C2.9 22 2 21.1 2 20V10C2 8.9 2.9 8 4 8H6V6C6 3.79 7.79 2 10 2H14C16.21 2 18 3.79 18 6V8M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8H16M12 17C10.9 17 10 16.1 10 15S10.9 13 12 13S14 13.9 14 15S13.1 17 12 17Z"
							fill="currentColor"
						/>
					</svg>
					{nFormatter($ergLocked, 2)} ERG secured
				</span>
			{/if}
			<span class="copyright">© {year} Mew Lock</span>
		</div>
	</div>
</footer>

<style>
	.site-footer {
		margin-top: auto;
		background: rgba(0, 0, 0, 0.3);
		border-top: 1px solid var(--ml-border);
		padding: 3rem 0;
	}

	.footer-container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 2rem;
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

	.footer-name {
		display: block;
		color: var(--ml-accent);
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.footer-brand p {
		margin: 0.25rem 0 0;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.footer-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 2rem;
	}

	.footer-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.9rem;
	}

	.footer-link:hover {
		color: var(--ml-accent);
	}

	.footer-right {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-end;
	}

	.total-locked {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--ml-accent);
		font-weight: 600;
		font-size: 0.9rem;
	}

	.copyright {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.8rem;
	}

	@media (max-width: 768px) {
		.site-footer {
			padding: 2rem 0;
		}

		.footer-container {
			flex-direction: column;
			text-align: center;
			padding: 0 1rem;
		}

		.footer-left {
			align-items: center;
		}

		.footer-links {
			justify-content: center;
		}

		.footer-right {
			align-items: center;
		}
	}
</style>
