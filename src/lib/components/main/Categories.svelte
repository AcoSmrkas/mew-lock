<!-- Categories.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { CATEGORIES } from '$lib/common/const.ts';
	import { fly } from 'svelte/transition';

	const categories = writable([]);
	const loading = writable(true);

	let hideButtons = false;

	onMount(() => {
		const categoryList = CATEGORIES.map((category) => ({
			name: category.name,
			icon: getCategoryIcon(category.name), // You'll need to implement this function based on your icons
			link: `/explore?category=${category.name}`,
			itemCount: category.ordercount + category.soldcount
		}));

		categories.set(categoryList);
		loading.set(false);

		setTimeout(handleResize, 10);
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function handleResize() {
		const container = document.querySelector('#categories-inner');
		const scrollContainer = document.querySelector('#categories-scroll');

		if (container && scrollContainer) {
			// Get the actual computed width
			const scrollWidth = scrollContainer.scrollWidth;
			const containerWidth = container.scrollWidth + 50;

			// Compare the widths and set `hideButtons`
			if (scrollWidth < containerWidth) {
				hideButtons = true; // Ensure `hideButtons` is reactive if needed
			} else {
				hideButtons = false;
			}
		}
	}

	function scrollLeft() {
		const container = document.querySelector('.categories-scroll');
		if (container) {
			container.scrollBy({ left: -200, behavior: 'smooth' });
		}
	}

	function scrollRight() {
		const container = document.querySelector('.categories-scroll');
		if (container) {
			container.scrollBy({ left: 200, behavior: 'smooth' });
		}
	}

	let usedEmojis = new Set();
	const catEmojis = ['🐱', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🐈', '🐈‍⬛'];
	const categoryToEmoji = new Map();

	function getCategoryIcon(category: string) {
		// If we already assigned an emoji to this category, return it
		if (categoryToEmoji.has(category)) {
			return categoryToEmoji.get(category);
		}

		// Reset if we've used all emojis
		if (usedEmojis.size >= catEmojis.length) {
			usedEmojis.clear();
			categoryToEmoji.clear();
		}

		// Get available emojis
		const availableEmojis = catEmojis.filter((emoji) => !usedEmojis.has(emoji));

		// Select random emoji from available ones
		const randomIndex = Math.floor(Math.random() * availableEmojis.length);
		const selectedEmoji = availableEmojis[randomIndex];

		// Store the selection
		usedEmojis.add(selectedEmoji);
		categoryToEmoji.set(category, selectedEmoji);

		return selectedEmoji;
	}
</script>

<div class="categories-wrapper relative w-full py-2">
	{#if $loading}
		<div class="loading-placeholder">
			<div class="animate-pulse category-card-bg rounded-xl w-32 h-24" />
		</div>
	{:else}
		<div id="categories-inner" class="relative" class:px-6={!hideButtons}>
			<!-- Added padding container -->
			<!-- Scroll Left Button -->
			<button
				class="absolute left-0 z-10 justify-center items-center w-8 h-8 scroll-button-bg hover:scroll-button-hover rounded-full text-[#f4d22c] top-[30px]"
				class:hidden={hideButtons}
				class:flex={!hideButtons}
				on:click={scrollLeft}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</button>

			<!-- Categories Container -->
			<div
				id="categories-scroll"
				class="categories-scroll flex gap-2 overflow-x-auto scroll-smooth"
				class:px-3={!hideButtons}
				class:justify-between={hideButtons}
			>
				{#each $categories as category, index}
					<a
						in:fly={{ y: -20, duration: 200, delay: 50 * index }}
						href={category.link}
						class="flex-grow group"
					>
						<div
							class="flex flex-col items-center min-w-[100px] w-32 lg:w-auto h-26 category-card-bg hover:category-card-hover rounded-xl p-2 transition-all duration-300"
							class:w-auto={hideButtons}
						>
							<span class="text-2xl mb-2">{category.icon}</span>
							<span class="text-[#f4d22c] text-sm font-medium">{category.name}</span>
							<span class="font-bold">{category.itemCount}</span>
						</div>
					</a>
				{/each}
			</div>

			<!-- Scroll Right Button -->
			<button
				class="absolute right-0 z-10 justify-center items-center w-8 h-8 scroll-button-bg hover:scroll-button-hover rounded-full text-[#f4d22c] top-[30px]"
				class:hidden={hideButtons}
				class:flex={!hideButtons}
				on:click={scrollRight}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M9 18l6-6-6-6" />
				</svg>
			</button>
		</div>
	{/if}
</div>

<style>
	.categories-scroll {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.categories-scroll::-webkit-scrollbar {
		display: none;
	}

	.loading-placeholder {
		display: flex;
		justify-content: center;
		padding: 1rem;
	}

	.scroll-smooth {
		scroll-behavior: smooth;
	}

	.category-card-bg {
		background: var(--forms-bg);
	}

	.category-card-bg:hover {
		scale: 1.025;
	}

	.scroll-button-bg {
		background: var(--forms-bg);
	}

	.scroll-button-hover {
		background: var(--forms-bg);
		opacity: 0.9;
	}

	.transition-all {
		transition: all 0.3s ease;
	}
</style>
