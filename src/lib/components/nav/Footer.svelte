<script>
	import Modal from '$lib/components/common/Modal.svelte';
	import KYA from '$lib/components/common/KYA.svelte';
	import { FOOTER_TEXT, KYA_KEY } from '$lib/common/const.ts';
	import { page } from '$app/stores';

	let showModal = false;
	let pageName;

	$: page.subscribe((value) => {
		pageName = value.route.id.substr(1);
		const match = pageName.match(/^([^/]+)\//);
		pageName = match ? match[1] : pageName;

		checkKya();
	});

	function checkKya() {
		const kya_accepted = localStorage.getItem(KYA_KEY);
		if (!kya_accepted && pageName != 'privacy-policy') {
			showModal = true;
		}
	}

	function acceptKya() {
		localStorage.setItem(KYA_KEY, 'true');
	}
</script>

<div
	class="w-full flex flex-col gap-2 justify-around p-1 shadow-md"
	style="background: var(--footer)"
>
	<div class="flex flex-row p-3 container font-azeret text-sm">
		<div class="flex flex-col gap-2 grow">
			<h6 class="font-manrope text-white text-xl font-bold mb-2">Social</h6>
			<div>
				<a target="_new" class="text-light" href="https://t.me/MewFinance">Telegram</a>
			</div>
			<!--
			<div>
				<a target="_new" class="text-light" href="https://discord.com/channels/">Discord</a>
			</div>
			-->
			<div>
				<a target="_new" class="text-light" href="https://x.com/Mew_finance">Twitter</a>
			</div>
		</div>
		<div class="flex flex-col gap-2 grow">
			<h6 class="font-manrope text-white text-xl font-bold mb-2">Links</h6>
			<!--
			<div>
				<a class="text-light" href="faq">FAQ</a>
			</div>
			-->
			<div>
				<a class="text-light" href="activity">Activity</a>
			</div>
			<div>
				<a class="text-light" href="faq">FAQ</a>
			</div>
			<div>
				<a class="text-light" href="privacy-policy">Privacy Policy</a>
			</div>
		</div>
	</div>
	<div class="flex flex-grow mt-3 justify-center text-light text-sm p-1 pt-1 pb-3 font-azeret">
		<p>&copy; {@html FOOTER_TEXT} {new Date().getFullYear()}</p>
	</div>
</div>

{#if showModal}
	<Modal bind:showModal onBtnClick={acceptKya}>
		<KYA />
		<span slot="btn">I understand and accept the terms</span>
	</Modal>
{/if}

<style>
	button:hover {
		background: unset;
		color: unset;
	}
</style>
