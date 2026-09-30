<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import { connected_wallet_address, connected_wallet_addresses } from '$lib/store/store.ts';
	import { showCustomToast } from '$lib/utils/utils.js';
	import { networkConfig } from '$lib/lithos/network.ts';
	import { getHeight, getPositions } from '$lib/lithos/api.ts';
	import type { PositionState } from '$lib/lithos/boxes.ts';
	import { BLOCKS_PER_YEAR } from '$lib/lithos/math.ts';
	import { buildUnlockTx } from '$lib/lithos/txs.ts';
	import { estimateDate, fmtAmount, fmtApr, fmtBlocks } from '$lib/lithos/format.ts';
	import {
		currentHeight,
		describeError,
		ownerBoxesFirst,
		signAndSubmit,
		usingErgoPay,
		walletBoxes
	} from '$lib/lithos/wallet.ts';
	import { positionsOwnedBy, walletOwnerAddresses } from '$lib/lithos/ownership.ts';

	const net = networkConfig('mainnet');
	const deployment = net.deployment;
	let height = 0;
	let positions: PositionState[] = [];
	let loading = true;
	let error = '';
	let busy = '';
	let showErgopayModal = false;
	let isAuth = false;
	let unsignedTx: any = null;
	let timer: ReturnType<typeof setInterval> | undefined;

	let ownerAddresses: string[] = [];
	// Re-read the wallet's addresses as soon as it connects or switches, not on the next poll;
	// a slower lookup for an address that is no longer connected is dropped.
	let ownersRun = 0;
	$: loadOwners($connected_wallet_address, $connected_wallet_addresses);
	async function loadOwners(address: string, addresses: string[] | undefined) {
		const run = ++ownersRun;
		const owners = address ? await walletOwnerAddresses([address, ...(addresses ?? [])]) : [];
		if (run === ownersRun) ownerAddresses = owners;
	}
	$: myPositions = positionsOwnedBy(positions, ownerAddresses).sort(
		(a, b) => a.unlockAt - b.unlockAt
	);
	$: readyCount = myPositions.filter((position) => height >= position.unlockAt).length;
	$: asset = deployment?.assets.stake ?? { ticker: 'LIT', decimals: 9 };
	$: rewardAsset = deployment?.assets.reward ?? asset;

	onMount(() => {
		refresh();
		timer = setInterval(refresh, 30_000);
	});
	onDestroy(() => timer && clearInterval(timer));

	async function refresh() {
		if (!deployment) {
			error = 'The Lithos event is not configured.';
			loading = false;
			return;
		}
		try {
			const [nextHeight, list] = await Promise.all([getHeight(net), getPositions(net, deployment)]);
			height = nextHeight;
			positions = list;
			error = '';
		} catch (cause) {
			console.error('Unable to load Lithos positions:', cause);
			error = 'Could not reach the Ergo explorer. We will retry shortly.';
		} finally {
			loading = false;
		}
	}

	function remaining(position: PositionState) {
		return Math.max(0, position.unlockAt - height);
	}
	function apr(position: PositionState) {
		if (!deployment || deployment.params.stakeId !== deployment.params.rewardId) return null;
		const tier = deployment.params.tiers[position.tier];
		if (!tier || position.principal <= 0n) return null;
		return fmtApr(
			Number(
				(position.reward * 10_000n * BigInt(BLOCKS_PER_YEAR)) /
					(position.principal * BigInt(tier.blocks))
			)
		);
	}

	async function unlock(position: PositionState) {
		if (!deployment || busy) return;
		busy = position.box.boxId;
		try {
			const current = await currentHeight(net);
			if (current < position.unlockAt)
				throw new Error(`Locked until block ${position.unlockAt.toLocaleString('en-US')}.`);
			const inputs = ownerBoxesFirst(await walletBoxes(net), position.owner);
			const tx = buildUnlockTx({ deployment, position, inputs, height: current }).toEIP12Object();
			if (usingErgoPay()) {
				unsignedTx = tx;
				isAuth = false;
				showErgopayModal = true;
				return;
			}
			const txId = await signAndSubmit(tx);
			showCustomToast(
				`LIT unlocked.<br><a target="_blank" rel="noopener" href="${net.txUrl(
					txId
				)}">View transaction</a>`,
				10_000,
				'success'
			);
			setTimeout(refresh, 4_000);
		} catch (cause) {
			console.error('Lithos unlock failed:', cause);
			showCustomToast(describeError(cause), 7_000, 'danger');
		} finally {
			busy = '';
		}
	}
</script>

<svelte:head>
	<title>My Lithos Locks | MewLock</title>
	<meta
		name="description"
		content="View the remaining time, projected reward and unlock status of your Lithos LIT locks."
	/>
</svelte:head>

<Navigation />

<main class="lithos-locks">
	<header>
		<p class="eyebrow">MewLock × Lithos · mainnet</p>
		<h1>My Lithos Locks</h1>
		<p class="lede">
			The LIT you put to work, the reward it has earned, and the exact block where you can take it
			home.
		</p>
		<a href="/lithos" class="lock-more">+ Add a LIT lock</a>
	</header>

	{#if !$connected_wallet_address}
		<div class="state-card">Connect your mainnet wallet to see and unlock your LIT positions.</div>
	{:else if $connected_wallet_address.startsWith('3')}
		<!-- Testnet P2PK addresses start with 3; these locks are on mainnet. -->
		<div class="state-card">
			This is a testnet wallet. Connect a mainnet wallet to see and unlock your LIT positions.
		</div>
	{:else if loading}
		<div class="state-card">Reading your positions from the chain…</div>
	{:else if error}
		<div class="state-card error">{error}</div>
	{:else}
		<section class="summary" aria-label="Lithos lock summary">
			<div><strong>{myPositions.length}</strong><span>open LIT locks</span></div>
			<div><strong>{readyCount}</strong><span>ready to unlock</span></div>
			<div><strong>#{height.toLocaleString('en-US')}</strong><span>current block</span></div>
		</section>

		{#if myPositions.length}
			<section class="position-list" aria-label="Your Lithos positions">
				{#each myPositions as position (position.box.boxId)}
					{@const blocksLeft = remaining(position)}
					{@const expectedApr = apr(position)}
					<article class:ready={blocksLeft === 0} class="position-card">
						<div class="position-head">
							<div>
								<p class="position-label">
									{asset.ticker} lock · {deployment?.params.tiers[position.tier]?.label ??
										`tier ${position.tier + 1}`}
								</p>
								<h2>{fmtAmount(position.principal, asset.decimals)} {asset.ticker}</h2>
							</div>
							<span class:ready={blocksLeft === 0} class="status"
								>{blocksLeft === 0 ? 'Ready to unlock' : 'Still cooking'}</span
							>
						</div>
						<div class="position-metrics">
							<div>
								<span>Fixed reward</span><strong
									>+{fmtAmount(position.reward, rewardAsset.decimals)} {rewardAsset.ticker}</strong
								>
							</div>
							<div><span>Estimated APR</span><strong>{expectedApr ?? 'Fixed reward'}</strong></div>
							<div>
								<span>{blocksLeft === 0 ? 'Unlocked at' : 'Blocks remaining'}</span><strong
									>{blocksLeft === 0
										? `#${position.unlockAt.toLocaleString('en-US')}`
										: blocksLeft.toLocaleString('en-US')}</strong
								>
							</div>
							<div>
								<span>Estimated date</span><strong
									>{estimateDate(position.unlockAt, height, net.blockSeconds)}</strong
								>
							</div>
						</div>
						<p class="time-note">
							{#if blocksLeft === 0}Your LIT and fixed reward are ready. Your wallet still shows the
								transaction before signing.{:else}{fmtBlocks(blocksLeft, net.blockSeconds)} to go — then
								principal and fixed reward unlock together.{/if}
						</p>
						<button disabled={blocksLeft !== 0 || busy !== ''} on:click={() => unlock(position)}
							>{busy === position.box.boxId
								? 'Waiting for wallet…'
								: blocksLeft === 0
								? 'Unlock my LIT'
								: `Unlocks in ${blocksLeft} blocks`}</button
						>
					</article>
				{/each}
			</section>
		{:else}
			<div class="state-card">
				<p>No Lithos LIT locks found for this wallet.</p>
				<a href="/lithos" class="lock-more">Lock LIT in the event →</a>
			</div>
		{/if}
	{/if}
</main>

{#if showErgopayModal}
	<ErgopayModal
		bind:showErgopayModal
		bind:isAuth
		bind:unsignedTx
		qrCodeText=""
		onBtnClick={undefined}
		onTxSubmitted={() => setTimeout(refresh, 5_000)}><button slot="btn">Close</button></ErgopayModal
	>
{/if}

<style>
	.lithos-locks {
		max-width: 1040px;
		min-height: 100vh;
		margin: 0 auto;
		padding: 104px 20px 64px;
		color: #e9e4f4;
	}
	header {
		margin-bottom: 28px;
	}
	.eyebrow {
		margin: 0 0 8px;
		color: #04dfff;
		font: 700 0.78rem ui-monospace, monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	h1 {
		margin: 0;
		color: #f9d72d;
		font-size: clamp(2.2rem, 6vw, 3.6rem);
		line-height: 1.05;
	}
	.lede {
		max-width: 650px;
		color: #ffffffbb;
		font-size: 1.05rem;
		line-height: 1.55;
	}
	.lock-more {
		display: inline-block;
		border: 1px solid #f9d72d;
		border-radius: 9px;
		padding: 0.7rem 1rem;
		color: #f9d72d;
		font-weight: 700;
		text-decoration: none;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}
	.summary > div,
	.state-card,
	.position-card {
		border: 1px solid #ffffff22;
		border-radius: 14px;
		background: #1c1230;
	}
	.summary > div {
		padding: 16px;
	}
	.summary strong,
	.summary span {
		display: block;
	}
	.summary strong {
		color: #f9d72d;
		font: 700 1.45rem ui-monospace, monospace;
	}
	.summary span {
		margin-top: 4px;
		color: #ffffff99;
		font-size: 0.82rem;
	}
	.position-list {
		display: grid;
		gap: 14px;
	}
	.position-card {
		padding: 20px;
		border-left: 4px solid #04dfff;
	}
	.position-card.ready {
		border-color: #5ee28a;
	}
	.position-head {
		display: flex;
		justify-content: space-between;
		gap: 16px;
		align-items: start;
	}
	.position-label {
		margin: 0 0 4px;
		color: #ffffff99;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.position-head h2 {
		margin: 0;
		color: #fff;
		font-size: 1.5rem;
	}
	.status {
		border-radius: 999px;
		padding: 0.35rem 0.65rem;
		background: #04dfff20;
		color: #04dfff;
		white-space: nowrap;
		font-size: 0.82rem;
		font-weight: 700;
	}
	.status.ready {
		background: #5ee28a22;
		color: #5ee28a;
	}
	.position-metrics {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 10px;
		margin: 20px 0 14px;
	}
	.position-metrics div {
		min-width: 0;
		padding: 12px;
		border-radius: 9px;
		background: #00000033;
	}
	.position-metrics span,
	.position-metrics strong {
		display: block;
		overflow-wrap: anywhere;
	}
	.position-metrics span {
		color: #ffffff88;
		font-size: 0.75rem;
	}
	.position-metrics strong {
		margin-top: 5px;
		color: #fff;
		font: 600 0.95rem ui-monospace, monospace;
	}
	.time-note {
		margin: 0 0 16px;
		color: #ffffffaa;
		line-height: 1.5;
		font-size: 0.9rem;
	}
	button {
		border: 0;
		border-radius: 9px;
		padding: 0.75rem 1rem;
		background: #f9d72d;
		color: #1b1030;
		font-weight: 800;
		cursor: pointer;
	}
	button:disabled {
		background: #ffffff1c;
		color: #ffffff77;
		cursor: not-allowed;
	}
	.state-card {
		padding: 24px;
		color: #ffffffbb;
		line-height: 1.5;
	}
	.state-card.error {
		border-color: #ff8a8a66;
		color: #ffabab;
	}
	@media (max-width: 720px) {
		.summary,
		.position-metrics {
			grid-template-columns: repeat(2, 1fr);
		}
		.lithos-locks {
			padding-top: 86px;
		}
	}
</style>
