<script lang="ts">
	import '$lib/lithos/lithos.css';
	import { ICON } from '$lib/lithos/icons.ts';
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
	<title>My Lithos Locks | Mew Lock</title>
	<meta
		name="description"
		content="View the remaining time, projected reward and unlock status of your Lithos LIT locks."
	/>
</svelte:head>

<Navigation />

<main class="ll">
	<header class="ll-header ll-header-row">
		<div>
			<span class="ll-badge">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.diamond} /></svg>
				Mew Lock × Lithos · mainnet
			</span>
			<h1>My Lithos Locks</h1>
			<p class="ll-description">
				The LIT you put to work, the reward it has earned, and the exact block where you can take it
				home.
			</p>
		</div>
		<a href="/lithos" class="ll-btn ll-btn-primary">+ Add a LIT lock</a>
	</header>

	{#if !$connected_wallet_address}
		<div class="ll-card ll-state">
			<p class="ll-card-text">Connect your mainnet wallet to see and unlock your LIT positions.</p>
		</div>
	{:else if $connected_wallet_address.startsWith('3')}
		<!-- Testnet P2PK addresses start with 3; these locks are on mainnet. -->
		<div class="ll-card ll-state">
			<p class="ll-card-text">
				This is a testnet wallet. Connect a mainnet wallet to see and unlock your LIT positions.
			</p>
		</div>
	{:else if loading}
		<div class="ll-card ll-state">
			<p class="ll-card-text">Reading your positions from the chain…</p>
		</div>
	{:else if error}
		<div class="ll-callout ll-callout-danger" role="alert">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.alert} /></svg>
			<p>{error}</p>
		</div>
	{:else}
		<section class="ll-stats ll-stats-3" aria-label="Lithos lock summary">
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.lock} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">{myPositions.length}</b>
					<span class="ll-stat-label">Open {asset.ticker} locks</span>
				</div>
			</div>
			<div class="ll-stat" class:ll-stat-success={readyCount > 0}>
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.check} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">{readyCount}</b>
					<span class="ll-stat-label">Ready to unlock</span>
				</div>
			</div>
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.cube} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">#{height.toLocaleString('en-US')}</b>
					<span class="ll-stat-label">Current block</span>
				</div>
			</div>
		</section>

		{#if myPositions.length}
			<section class="ll-lock-list" aria-label="Your Lithos positions">
				{#each myPositions as position (position.box.boxId)}
					{@const blocksLeft = remaining(position)}
					{@const expectedApr = apr(position)}
					<article class="ll-card ll-lock-card" class:ready={blocksLeft === 0}>
						<div class="ll-lock-card-head">
							<div>
								<p class="ll-lock-card-label">
									{asset.ticker} lock · {deployment?.params.tiers[position.tier]?.label ??
										`tier ${position.tier + 1}`}
								</p>
								<h2>{fmtAmount(position.principal, asset.decimals)} {asset.ticker}</h2>
							</div>
							<span class="ll-status-pill" class:open={blocksLeft === 0}>
								<span class="ll-dot" aria-hidden="true" />
								{blocksLeft === 0 ? 'Ready to unlock' : 'Locked'}
							</span>
						</div>
						<dl class="ll-metrics">
							<div>
								<dt>Fixed reward</dt>
								<dd class="ll-gain">
									+{fmtAmount(position.reward, rewardAsset.decimals)} {rewardAsset.ticker}
								</dd>
							</div>
							<div>
								<dt>APR</dt>
								<dd>{expectedApr ?? 'Fixed reward'}</dd>
							</div>
							<div>
								<dt>{blocksLeft === 0 ? 'Unlocked at' : 'Blocks remaining'}</dt>
								<dd>
									{blocksLeft === 0
										? `#${position.unlockAt.toLocaleString('en-US')}`
										: blocksLeft.toLocaleString('en-US')}
								</dd>
							</div>
							<div>
								<dt>Estimated date</dt>
								<dd>{estimateDate(position.unlockAt, height, net.blockSeconds)}</dd>
							</div>
						</dl>
						<p class="ll-hint">
							{#if blocksLeft === 0}
								Your {asset.ticker} and its fixed reward are ready. Your wallet shows the transaction
								before you sign.
							{:else}
								{fmtBlocks(blocksLeft, net.blockSeconds)} to go, then the principal and the fixed reward
								unlock together.
							{/if}
						</p>
						<button
							class="ll-btn ll-btn-success ll-btn-block"
							disabled={blocksLeft !== 0 || busy !== ''}
							on:click={() => unlock(position)}
						>
							{busy === position.box.boxId
								? 'Waiting for the wallet…'
								: blocksLeft === 0
								? `Unlock my ${asset.ticker}`
								: `Unlocks in ${blocksLeft.toLocaleString('en-US')} blocks`}
						</button>
					</article>
				{/each}
			</section>
		{:else}
			<div class="ll-card ll-state">
				<p class="ll-card-text">No Lithos LIT locks found for this wallet.</p>
				<a href="/lithos" class="ll-btn ll-btn-primary">Lock LIT in the event →</a>
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
