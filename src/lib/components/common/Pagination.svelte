<script>
	import { totalBoxes, loadOffers, loadingOffers } from '$lib/store/store';
	import { ITEMS_PER_PAGE } from '$lib/common//const.ts';
	import { onMount } from 'svelte';
	import { updateSearchParams } from '$lib/utils/utils.js';
	import { page } from '$app/stores';
	import Loading from '$lib/components/common/Loading.svelte';

	let oldPage = 1;
	let searchPage = 1;
	let mounted = false;
	$: if ($page.url.searchParams) {
		if (!mounted) {
			processParams($page.url.searchParams);
		}
	}

	function processParams(searchParams) {
		let tempPage = searchParams.get('page');

		if (tempPage && parseInt(tempPage) != oldPage) {
			searchPage = parseInt(tempPage);
			if (isNaN(searchPage)) {
				searchPage = 1;
			}
			if (searchPage < 1) {
				searchPage = 1;
			}
			oldPage = searchPage;
			offset = (searchPage - 1) * ITEMS_PER_PAGE;

			mounted = true;
		} else if (!tempPage) {
			offset = 0;
		}
	}

	$: totalBoxes.subscribe(async (value) => {
		if (value == 0 && $loadingOffers && !changingPage) {
			autoLoad = false;
			setupPagination(1);
			disableButtons();
			return;
		}

		if (value == 0 && $loadingOffers && changingPage) return;
		if (!first && totalItems == value && !changingPage) {
			return;
		}

		first = false;

		changingPage = false;

		setupPagination(value);
		totalItems = value;
	});

	let first = false;
	var totalItems = 0;
	var numPages = 1;
	var offset = 0;
	var currentPageNum = 1;
	var isDisabled = [true, true, true, true];
	var changingPage = false;

	function setupPagination(totalItems) {
		if (totalItems == 0) {
			return;
		}

		autoLoad = false;
		numPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
		currentPageNum = offset / ITEMS_PER_PAGE + 1;

		if (currentPageNum == 0) {
			currentPageNum = 1;
		}

		jQuery('.pageNum').html(currentPageNum + ' of ' + numPages);

		jQuery('.firstPage').off('click');
		jQuery('.previousPage').off('click');
		jQuery('.nextPage').off('click');
		jQuery('.lastPage').off('click');

		disableButtons();

		if (currentPageNum > 1) {
			isDisabled[0] = false;
			isDisabled[1] = false;

			jQuery('.firstPage').click(() => {
				changePage(-1);
			});
			jQuery('.previousPage').click(() => {
				changePage(currentPageNum - 3);
			});
		}

		if (currentPageNum < numPages) {
			isDisabled[2] = false;
			isDisabled[3] = false;

			jQuery('.nextPage').click(() => {
				changePage(currentPageNum - 1);
			});
			jQuery('.lastPage').click(() => {
				changePage(numPages - 2);
			});
		}
	}

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function enterPageNum(e) {
		let num = prompt('Enter page number:');

		if (isNaN(num) || num == null || num == currentPageNum) {
			return;
		}

		num = clamp(num, 1, numPages) - 2;

		changePage(num);

		e.preventDefault();
	}

	function disableButtons() {
		isDisabled[0] = true;
		isDisabled[1] = true;
		isDisabled[2] = true;
		isDisabled[3] = true;
	}

	async function changePage(num) {
		offset = (num + 1) * ITEMS_PER_PAGE;

		updateSearchParams('page', Math.floor((offset + ITEMS_PER_PAGE) / ITEMS_PER_PAGE), $page);

		setupPagination(totalItems);
		disableButtons();

		changingPage = true;

		await loadOffers(offset);
	}

	let atBottom = false;
	let autoLoad = false;

	onMount(() => {
		first = true;
		mounted = true;

		window.addEventListener('scroll', handleScroll);
		window.addEventListener('urlChanged', handleUrlChangedEvent);

		return () => {
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('urlChanged', handleUrlChangedEvent);
		};
	});

	function handleUrlChangedEvent(event) {
		processParams(event.detail.params);
	}

	function handleScroll() {
		const scrollPosition = window.scrollY + window.innerHeight;
		const documentHeight = document.body.scrollHeight;

		if (scrollPosition >= documentHeight) {
			atBottom = true;
			loadMoreContent();
		} else {
			atBottom = false;
		}
	}

	function loadMoreContent() {
		if (!autoLoad || $loadingOffers || offset + ITEMS_PER_PAGE >= totalItems) return;

		loadOffers(ITEMS_PER_PAGE + offset, true);
		offset += ITEMS_PER_PAGE;
	}

	function activateAutoLoad() {
		autoLoad = true;
		loadMoreContent();
	}
</script>

<div class="h-full flex flex-col grow text-center">
	{#if !autoLoad}
		<nav id="pagination" aria-label="Page navigation">
			<ul class="pagination justify-content-center">
				<li id="" class="page-item firstPageHolder">
					<a
						id=""
						class:is-disabled={isDisabled[0]}
						class="page-link firstPage"
						href="#"
						aria-label="Previous"
					>
						<span aria-hidden="true">&laquo;</span>
					</a>
				</li>
				<li id="" class="page-item previousPageHolder">
					<a
						id=""
						class:is-disabled={isDisabled[1]}
						class="page-link previousPage"
						href="#"
						aria-label="Previous"
					>
						<span aria-hidden="true">&lsaquo;</span>
					</a>
				</li>
				<li style="cursor: pointer;" class="page-item">
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-missing-attribute -->
					<a
						id=""
						class="page-link pageNum"
						style="color: var(--text-white) !important;"
						on:click={enterPageNum}>1 of 1</a
					>
				</li>
				<li id="" class="page-item nextPageHolder">
					<a
						id=""
						class:is-disabled={isDisabled[2]}
						class="page-link nextPage"
						href="#"
						aria-label="Next"
					>
						<span aria-hidden="true">&rsaquo;</span>
					</a>
				</li>
				<li id="" class="page-item lastPageHolder">
					<a
						id=""
						class:is-disabled={isDisabled[3]}
						class="page-link lastPage rounded-e-md"
						href="#"
						aria-label="Next"
					>
						<span aria-hidden="true">&raquo;</span>
					</a>
				</li>

				{#if $totalBoxes > 0 && numPages > 1 && currentPageNum < numPages}
					<li id="" class="ms-2">
						<button
							disabled={$loadingOffers}
							class="page-link rounded-md"
							on:click={activateAutoLoad}
						>
							∞
						</button>
					</li>
				{/if}
			</ul>
		</nav>
	{/if}

	{#if autoLoad && $loadingOffers}
		<div class="w-100 relative min-h-[200px] mt-[100px] my-12 bg-bg">
			<Loading />
		</div>
	{/if}
</div>

<style>
	.is-disabled {
		color: var(--text-light) !important;
		cursor: default !important;
		pointer-events: none;
		user-select: none;
	}

	.page-link {
		padding: 12px 17px;
		border: 0 !important;
		background: var(--forms-bg);
		color: var(--main-color);
	}

	.page-link:focus {
		box-shadow: none;
		border: 1px solid var(--main-color) !important;
	}
</style>
