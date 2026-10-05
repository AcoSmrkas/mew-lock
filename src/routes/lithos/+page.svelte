<script lang="ts">
	import '$lib/lithos/lithos.css';
	import { ICON } from '$lib/lithos/icons.ts';
	import { onDestroy, onMount } from 'svelte';
	import type { Box } from '@fleet-sdk/common';
	import type { ErgoUnsignedTransaction } from '@fleet-sdk/core';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import ErgopayModal from '$lib/components/common/ErgopayModal.svelte';
	import { connected_wallet_address, connected_wallet_addresses } from '$lib/store/store.ts';
	import { showCustomToast } from '$lib/utils/utils.js';
	import { pickNetwork, type NetworkConfig } from '$lib/lithos/network.ts';
	import {
		getCampaign,
		getHeight,
		getPositions,
		statsOf,
		tokenTotal,
		type CampaignStats
	} from '$lib/lithos/api.ts';
	import type { CampaignState, PositionState } from '$lib/lithos/boxes.ts';
	import { BLOCKS_PER_YEAR, marginalAprBps, quoteLock } from '$lib/lithos/math.ts';
	import { UNLOCK_BUFFER } from '$lib/lithos/params.ts';
	import {
		buildLockTx,
		buildSweepTx,
		buildTopUpTx,
		buildUnlockTx,
		TX_FEE
	} from '$lib/lithos/txs.ts';
	import {
		estimateDate,
		fmtAmount,
		fmtApr,
		fmtBlocks,
		fmtErg,
		fmtRate,
		parseAmount,
		yearlyRate
	} from '$lib/lithos/format.ts';
	import {
		changeAddress,
		currentHeight,
		describeError,
		ownerBoxesFirst,
		signAndSubmit,
		usingErgoPay,
		walletBoxes
	} from '$lib/lithos/wallet.ts';
	import { positionsOwnedBy, walletOwnerAddresses } from '$lib/lithos/ownership.ts';
	import {
		createTestWallet,
		drip,
		FAUCET_DRIP,
		forgetTestWallet,
		lithosKeys,
		loadTestWallet,
		signLocally,
		submitSigned,
		testBoxes,
		type TestWallet
	} from '$lib/lithos/testWallet.ts';

	let net: NetworkConfig | null = null;
	$: d = net?.deployment ?? null;
	$: testnet = net?.network === 'testnet';
	// A retired campaign (`?campaign=<slug>`) only lets its lockers finish: no new locks or top-ups.
	$: retired = !!d?.retired;
	// From the current campaign's page, the way to earlier campaigns that still hold locks.
	$: earlier = net && !retired ? net.retired : [];
	// What is locked (A) and what is paid (B); either may be ERG, and they may be the same.
	$: A = d?.assets.stake ?? { ticker: 'LIT', decimals: 9 };
	$: B = d?.assets.reward ?? { ticker: 'LIT', decimals: 9 };
	$: sameAsset = !!d && d.params.stakeId === d.params.rewardId;
	$: deposit = d ? BigInt(d.params.deposit) : 0n;
	// Where the leftover budget goes, as baked into this campaign's contract.
	$: leftover = d?.params.feeAddress ?? '';
	$: leftoverShort = `${leftover.slice(0, 6)}…${leftover.slice(-4)}`;
	// Reactive so the template re-renders when the deployment (and its decimals) load.
	$: fmtA = (raw: bigint, max = 4) => fmtAmount(raw, A.decimals, max);
	$: fmtB = (raw: bigint, max = 4) => fmtAmount(raw, B.decimals, max);
	// Same asset: an APR. Different assets: B earned per whole A per year (no prices involved).
	$: rateOf = (reward: bigint, principal: bigint, blocks: number) =>
		sameAsset
			? fmtApr(Number((reward * 10_000n * BigInt(BLOCKS_PER_YEAR)) / (principal * BigInt(blocks))))
			: `${fmtRate(
					yearlyRate(reward, B.decimals, principal, A.decimals, blocks, BLOCKS_PER_YEAR)
			  )} ${B.ticker} per ${A.ticker} / yr`;
	$: marginalRate = (boostBps: number) => {
		if (!campaign) return '—';
		const bps = marginalAprBps(campaign.budget, campaign.v, boostBps);
		return sameAsset
			? fmtApr(bps)
			: `${fmtRate((bps / 10_000) * 10 ** (A.decimals - B.decimals))} ${B.ticker} per ${
					A.ticker
			  } / yr`;
	};
	/** nanoERG kept aside for fees and the deposit when the staked asset is ERG. */
	const ERG_HEADROOM = 10_000_000n;

	let height = 0;
	let campaign: CampaignState | null = null;
	let swept = false;
	let positions: PositionState[] = [];
	let stats: CampaignStats | null = null;
	let loading = true;
	let loadError = '';

	// Testnet only: a throwaway in-browser wallet replaces Nautilus when present.
	let testWallet: TestWallet | null = null;
	$: activeAddress = testWallet?.address ?? $connected_wallet_address;

	let boxes: Box<bigint>[] = [];
	$: ergBalance = boxes.reduce((sum, b) => sum + BigInt(b.value), 0n);
	$: balanceOf = (id: string | null) => (id === null ? ergBalance : tokenTotal(boxes, id));
	$: stakeBalance = !d
		? 0n
		: d.params.stakeId === null
		? ergBalance > ERG_HEADROOM
			? ergBalance - ERG_HEADROOM
			: 0n
		: balanceOf(d.params.stakeId);
	$: rewardBalance = !d ? 0n : balanceOf(d.params.rewardId);
	let ownerAddresses: string[] = [];
	$: myPositions = positionsOwnedBy(positions, ownerAddresses).sort((a, b) => a.unlockAt - b.unlockAt);
	$: myPositionIds = new Set(myPositions.map((position) => position.box.boxId));
	let positionFilter: 'mine' | 'all' = 'mine';
	$: visiblePositions = (positionFilter === 'mine' ? myPositions : positions).slice().sort(
		(a, b) => a.unlockAt - b.unlockAt
	);
	// Testnet P2PK addresses start with 3, mainnet ones with 9.
	$: wrongNetwork =
		!testWallet &&
		!!$connected_wallet_address &&
		!!net &&
		$connected_wallet_address.startsWith('3') !== testnet;

	$: open = !!d && height + 1 >= d.params.start && height + 1 <= d.params.end;
	$: notStarted = !!d && height + 1 < d.params.start;
	$: sweepOpen = !!d && !!campaign && height > d.params.end + d.params.grace;

	// Lock form
	let amountInput = '';
	let tier = 1;
	let understood = false;
	let busy = '';
	$: principal = parseAmount(amountInput, A.decimals);
	$: tierDef = d?.params.tiers[tier];
	$: minLock = d ? BigInt(d.params.minLock) : 0n;
	$: quote =
		campaign && tierDef && principal && principal > 0n
			? quoteLock(campaign.budget, campaign.v, principal, tierDef.blocks, tierDef.boostBps)
			: null;
	$: unlockPreview = tierDef ? height + tierDef.blocks + UNLOCK_BUFFER : 0;
	$: lockBlocker = !d
		? 'Not open yet'
		: !activeAddress
		? testnet
			? 'Create a test wallet or connect Nautilus Testnet'
			: 'Connect a wallet to lock'
		: wrongNetwork
		? testnet
			? 'Connect Nautilus Testnet'
			: 'Connect a mainnet wallet'
		: !testWallet && usingErgoPay() && !net?.ergoPay
		? 'ErgoPay works on mainnet only'
		: notStarted
		? 'Locks have not opened yet'
		: !open
		? 'Locks are closed'
		: principal === null || principal === 0n
		? 'Enter an amount'
		: principal < minLock
		? `Minimum ${fmtA(minLock)} ${A.ticker}`
		: principal > stakeBalance
		? `Not enough ${A.ticker}`
		: !understood
		? 'Tick the box above to confirm'
		: '';

	// Fund form
	let topUpInput = '';
	$: topUpAmount = parseAmount(topUpInput, B.decimals);

	// ErgoPay hand-off
	let showErgopayModal = false;
	let isAuth = false;
	// The shared ErgoPay modal types this prop as string but posts whatever it gets as JSON.
	let unsignedTx: any = null;

	let submitted: { txId: string; what: string }[] = [];
	// Positions whose unlock was sent. Confirmed reads still list them for a block or
	// two, and the Unlock button used to come back meanwhile; a second click only
	// failed with a misleading "someone else locked at the same moment".
	let sentUnlocks = new Set<string>();
	let timer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		net = pickNetwork(new URL(window.location.href));
		if (net.network === 'testnet') testWallet = loadTestWallet();
		refresh();
		timer = setInterval(refresh, 30_000);
	});
	onDestroy(() => timer && clearInterval(timer));

	$: if (net && activeAddress !== undefined) loadWallet();

	async function refresh() {
		if (!net || !net.deployment) {
			loading = false;
			return;
		}
		const dep = net.deployment;
		try {
			const [h, list] = await Promise.all([getHeight(net), getPositions(net, dep)]);
			height = h;
			positions = list;
			stats = statsOf(list);
			try {
				campaign = await getCampaign(net, dep);
				swept = false;
			} catch {
				campaign = null;
				swept = true;
			}
			loadError = '';
		} catch (e) {
			loadError = 'Could not reach the explorer. Retrying every 30 seconds.';
			console.error(e);
		}
		loading = false;
		loadWallet();
	}

	// Bumped by every load (and by a disconnect) so a slower, older load never
	// brings back a previous wallet's boxes or "your lock" buttons.
	let walletRun = 0;
	async function loadWallet() {
		const run = ++walletRun;
		if (!net || !activeAddress) {
			boxes = [];
			ownerAddresses = [];
			return;
		}
		try {
			const owners = testWallet
				? [testWallet.address]
				: await walletOwnerAddresses([
						$connected_wallet_address,
						...($connected_wallet_addresses ?? [])
					]);
			const found = testWallet ? await testBoxes(net, testWallet.address) : await walletBoxes(net);
			if (run !== walletRun) return;
			ownerAddresses = owners;
			boxes = found;
		} catch (e) {
			console.error('wallet boxes', e);
		}
	}

	function setMax() {
		amountInput = fmtAmount(stakeBalance, A.decimals, A.decimals).replace(/,/g, '');
	}

	const myChange = () => (testWallet ? Promise.resolve(testWallet.address) : changeAddress());
	const myHeight = () => (testWallet ? getHeight(net!) : currentHeight(net!));

	async function submit(tx: ErgoUnsignedTransaction, what: string) {
		const eip12 = tx.toEIP12Object();
		let txId: string;
		if (testWallet && d) {
			txId = await submitSigned(net!, signLocally(eip12, lithosKeys(d, testWallet)));
			setTimeout(loadWallet, 1_000);
		} else if (usingErgoPay()) {
			unsignedTx = eip12;
			isAuth = false;
			showErgopayModal = true;
			return;
		} else {
			txId = await signAndSubmit(eip12);
		}
		submitted = [{ txId, what }, ...submitted].slice(0, 6);
		showCustomToast(
			`${what} submitted.<br><a target="_blank" rel="noopener" href="${net!.txUrl(
				txId
			)}">View transaction</a>`,
			10_000,
			'success'
		);
		setTimeout(refresh, 5_000);
	}

	async function run(key: string, action: () => Promise<void>) {
		if (busy) return;
		busy = key;
		try {
			await action();
		} catch (e) {
			console.error(e);
			showCustomToast(describeError(e), 7_000, 'danger');
			refresh();
		} finally {
			busy = '';
		}
	}

	function makeTestWallet() {
		testWallet = createTestWallet();
		boxes = [];
	}

	function dropTestWallet() {
		const ok = window.confirm(
			'Forget this test wallet? Its key is only in this browser, so any test tokens and test locks in it are lost for good.'
		);
		if (!ok) return;
		forgetTestWallet();
		testWallet = null;
		boxes = [];
	}

	const getTestTokens = () =>
		run('drip', async () => {
			if (!net || !d || !testWallet) return;
			const txId = await drip(net, d, testWallet.address);
			submitted = [{ txId, what: 'Test tokens from the faucet' }, ...submitted].slice(0, 6);
			showCustomToast(
				`Test tokens are on the way. You can lock right away.<br><a target="_blank" rel="noopener" href="${net.txUrl(
					txId
				)}">View transaction</a>`,
				8_000,
				'success'
			);
			setTimeout(loadWallet, 1_000);
		});

	function copyAddress() {
		if (testWallet) navigator.clipboard?.writeText(testWallet.address);
		showCustomToast('Address copied.', 2_000, 'info');
	}

	const lock = () =>
		run('lock', async () => {
			if (lockBlocker || !d || !net || !principal || !tierDef) return;
			const shown = quote;
			const fresh = await getCampaign(net, d);
			const plan = buildLockTx({
				deployment: d,
				campaign: fresh,
				inputs: boxes,
				changeAddress: await myChange(),
				principal,
				tier,
				height: await myHeight()
			});
			if (shown && plan.quote.reward < shown.reward) {
				campaign = fresh;
				showCustomToast(
					`Rates just moved: your reward is now ${fmtB(plan.quote.reward, B.decimals)} ${
						B.ticker
					}. Check it and press Lock again.`,
					8_000,
					'info'
				);
				return;
			}
			await submit(plan.tx, `Lock of ${fmtA(principal)} ${A.ticker}`);
			amountInput = '';
			understood = false;
		});

	const unlock = (p: PositionState) =>
		run(`unlock:${p.box.boxId}`, async () => {
			if (!d || !net) return;
			const h = await myHeight();
			if (h < p.unlockAt)
				throw new Error(`Locked until block ${p.unlockAt.toLocaleString('en-US')}.`);
			const inputs = ownerBoxesFirst(boxes, p.owner);
			await submit(
				buildUnlockTx({ deployment: d, position: p, inputs, height: h }),
				`Unlock of ${fmtA(p.principal)} ${A.ticker} + ${fmtB(p.reward)} ${B.ticker}`
			);
			if (!usingErgoPay()) sentUnlocks = new Set([...sentUnlocks, p.box.boxId]);
		});

	const topUp = () =>
		run('topup', async () => {
			if (!d || !net || !topUpAmount) return;
			const fresh = await getCampaign(net, d);
			await submit(
				buildTopUpTx({
					deployment: d,
					campaign: fresh,
					inputs: boxes,
					changeAddress: await myChange(),
					amount: topUpAmount,
					height: await myHeight()
				}),
				`Top-up of ${fmtB(topUpAmount)} ${B.ticker}`
			);
			topUpInput = '';
		});

	const sweep = () =>
		run('sweep', async () => {
			if (!d || !net) return;
			const fresh = await getCampaign(net, d);
			await submit(
				buildSweepTx({
					deployment: d,
					campaign: fresh,
					inputs: boxes,
					changeAddress: await myChange(),
					height: await myHeight()
				}),
				'Sweep'
			);
		});

	// Reactive so every date in the template re-renders when the height updates.
	$: blockDate = (h: number) => (net && height ? estimateDate(h, height, net.blockSeconds) : '');
	const boost = (bps: number) =>
		`${(bps / 10_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
</script>

<svelte:head>
	<title>Lithos Lock | Mew Lock</title>
	<meta
		name="description"
		content="Lock LIT for a fixed number of blocks and earn a LIT reward that is fixed the moment you lock. Non-custodial, no admin keys."
	/>
</svelte:head>

<Navigation />

<main class="ll">
	{#if testnet}
		<div class="ll-callout ll-callout-warning" role="status">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.alert} /></svg>
			<p>
				<strong>Testnet.</strong> These are test tokens on the Ergo testnet. Use the test wallet below,
				or Nautilus Wallet (Testnet).
			</p>
			<a class="ll-callout-action" href="/lithos?network=mainnet">Switch to mainnet</a>
		</div>
	{/if}

	<header class="ll-header">
		<span class="ll-badge">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.diamond} /></svg>
			Mew Lock × Lithos
		</span>
		<h1>Lithos Lock</h1>
		<p class="ll-description">
			Lock {A.ticker} for a fixed number of blocks. Your {B.ticker} reward is set the moment you lock
			and comes back with your {A.ticker} when the lock ends. No keys, no admins: only you can open your
			lock.
		</p>
		{#if d}
			<div class="ll-status" aria-live="polite">
				<span class="ll-status-pill" class:open={open && !swept}>
					<span class="ll-dot" aria-hidden="true" />
					{#if swept}
						Campaign ended, leftover swept
					{:else if retired}
						Closed to new locks · unlocks still work
					{:else if notStarted}
						Locks open at block #{d.params.start.toLocaleString('en-US')}
					{:else if open}
						Locks open until block #{d.params.end.toLocaleString('en-US')} · {blockDate(d.params.end)}
					{:else}
						Locks closed at block #{d.params.end.toLocaleString('en-US')}
					{/if}
				</span>
				<span class="ll-status-pill">
					Current block #{height ? height.toLocaleString('en-US') : '…'}
				</span>
			</div>
		{/if}
	</header>

	{#if !net}
		<p class="ll-empty">Loading…</p>
	{:else if !d}
		<section class="ll-card ll-soon">
			<h2>Opens soon</h2>
			<p class="ll-card-text">The Lithos Lock campaign is not live on {net.network} yet.</p>
			{#if !testnet}
				<a class="ll-btn ll-btn-secondary" href="/lithos?network=testnet">Try it on testnet</a>
			{/if}
			{#each earlier as e (e.campaignNftId)}
				<a class="ll-card-link" href="/lithos?campaign={e.slug}">Locked LIT in “{e.label}”? Finish those locks here →</a>
			{/each}
		</section>
	{:else}
		{#if loadError}
			<div class="ll-callout ll-callout-danger" role="alert">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.alert} /></svg>
				<p>{loadError}</p>
			</div>
		{/if}
		{#if d.note}
			<div class="ll-callout" class:ll-callout-info={!retired} class:ll-callout-warning={retired} role="note">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d={retired ? ICON.alert : ICON.info} /></svg>
				<p>{d.note}</p>
				{#if retired}<a class="ll-callout-action" href="/lithos">Go to the current campaign</a>{/if}
			</div>
		{/if}

		{#if testnet}
			<section class="ll-card ll-testwallet" aria-label="Test wallet">
				{#if !testWallet}
					<div>
						<h2>Test wallet</h2>
						<p class="ll-card-text">
							No Nautilus Testnet? Make a throwaway wallet that lives in this browser, get free test
							tokens, and try the whole flow.
						</p>
					</div>
					<button class="ll-btn ll-btn-primary" on:click={makeTestWallet}>Create test wallet</button>
				{:else}
					<div>
						<h2>Test wallet</h2>
						<p class="ll-card-text ll-mono">
							<button type="button" class="ll-link" on:click={copyAddress} title="Copy address">
								{testWallet.address.slice(0, 10)}…{testWallet.address.slice(-6)}
							</button>
							· {fmtErg(ergBalance)} tERG{#if d.params.stakeId !== null}{` · ${fmtA(
									balanceOf(d.params.stakeId),
									2
								)} ${A.ticker}`}{/if}
						</p>
						<p class="ll-hint">The key is stored only in this browser. Test tokens have no value.</p>
					</div>
					<div class="ll-row">
						<button class="ll-btn ll-btn-primary" disabled={busy !== ''} on:click={getTestTokens}>
							{busy === 'drip'
								? 'Sending…'
								: d.params.stakeId === null
								? `Get ${fmtErg(FAUCET_DRIP.nanoErg)} tERG`
								: `Get ${fmtErg(FAUCET_DRIP.nanoErg)} tERG + ${fmtA(FAUCET_DRIP.tokens, 0)} ${
										A.ticker
								  }`}
						</button>
						<button class="ll-btn ll-btn-secondary" on:click={dropTestWallet}>Forget</button>
					</div>
				{/if}
			</section>
		{/if}

		<section class="ll-stats" aria-label="Campaign statistics">
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.lock} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">{stats ? fmtA(stats.totalLocked, 2) : '…'}</b>
					<span class="ll-stat-label">{A.ticker} locked</span>
				</div>
			</div>
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.user} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">{stats ? stats.lockers.toLocaleString('en-US') : '…'}</b>
					<span class="ll-stat-label">Lockers</span>
				</div>
			</div>
			<div class="ll-stat ll-stat-highlight">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.trend} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value ll-gain">{marginalRate(10_000)}</b>
					<span class="ll-stat-label">{sameAsset ? 'Base APR for the next lock' : 'Base rate for the next lock'}</span>
				</div>
			</div>
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.wallet} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">{campaign ? fmtB(campaign.budget, 2) : swept ? '0' : '…'}</b>
					<span class="ll-stat-label">Reward budget left ({B.ticker})</span>
				</div>
			</div>
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.gift} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">{stats ? fmtB(stats.rewardsCommitted, 2) : '…'}</b>
					<span class="ll-stat-label">Rewards set aside ({B.ticker})</span>
				</div>
			</div>
			<div class="ll-stat">
				<span class="ll-stat-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.clock} /></svg></span>
				<div class="ll-stat-body">
					<b class="ll-stat-value">#{d.params.end.toLocaleString('en-US')}</b>
					<span class="ll-stat-label">Locks close · {blockDate(d.params.end)}</span>
				</div>
			</div>
		</section>

		<section class="ll-main">
			{#if retired}
				<div class="ll-card ll-lock ll-soon">
					<h2>Closed to new locks</h2>
					<p class="ll-card-text">
						This campaign only lets its lockers finish. Your locks are listed here; each unlocks with its
						reward once its block is reached.
					</p>
					<a class="ll-btn ll-btn-primary" href="/lithos">Lock {A.ticker} in the current campaign</a>
				</div>
			{:else}
			<form class="ll-card ll-lock" on:submit|preventDefault={lock}>
				<div class="ll-card-head">
					<h2>Lock {A.ticker}</h2>
				</div>

				<label class="ll-field">
					<span class="ll-label">
						Amount
						{#if activeAddress}
							<button type="button" class="ll-link" on:click={setMax}>
								Balance {fmtA(stakeBalance, 4)}
								{A.ticker} · Max
							</button>
						{/if}
					</span>
					<div class="ll-input">
						<input
							inputmode="decimal"
							autocomplete="off"
							placeholder="0.0"
							bind:value={amountInput}
							aria-invalid={amountInput !== '' && principal === null}
						/>
						<span class="ll-input-suffix">{A.ticker}</span>
					</div>
					{#if amountInput !== '' && principal === null}
						<small class="ll-warn">Use a number with up to {A.decimals} decimals.</small>
					{/if}
				</label>

				<fieldset class="ll-field ll-tiers">
					<legend class="ll-label">Lock length</legend>
					<div class="ll-tier-grid">
						{#each d.params.tiers as t, i}
							<label class="ll-tier" class:selected={tier === i}>
								<input type="radio" name="tier" value={i} bind:group={tier} />
								<span class="ll-tier-name">{t.label}</span>
								<span class="ll-tier-meta">
									{t.label.includes('block')
										? fmtBlocks(t.blocks, net.blockSeconds)
										: `${t.blocks.toLocaleString('en-US')} blocks`} · {boost(t.boostBps)}
								</span>
								<span class="ll-tier-rate">
									{marginalRate(t.boostBps)}{sameAsset ? ' APR' : ''} now
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				{#if quote && principal && tierDef}
					<dl class="ll-quote">
						<div>
							<dt>You lock</dt>
							<dd>{fmtA(principal, A.decimals)} {A.ticker}</dd>
						</div>
						<div>
							<dt>Reward, fixed now</dt>
							<dd class="ll-gain">+{fmtB(quote.reward, B.decimals)} {B.ticker}</dd>
						</div>
						<div>
							<dt>You get back</dt>
							<dd>
								{#if sameAsset}
									{fmtA(principal + quote.reward, A.decimals)} {A.ticker}
								{:else}
									{fmtA(principal, A.decimals)}
									{A.ticker} + {fmtB(quote.reward, B.decimals)}
									{B.ticker}
								{/if}
							</dd>
						</div>
						<div>
							<dt>{sameAsset ? 'APR' : 'Rate'}</dt>
							<dd>{rateOf(quote.reward, principal, tierDef.blocks)}</dd>
						</div>
						<div>
							<dt>Unlocks at</dt>
							<dd>block #{unlockPreview.toLocaleString('en-US')} · {blockDate(unlockPreview)}</dd>
						</div>
						<div>
							<dt>Costs</dt>
							<dd>
								{fmtErg(TX_FEE)} ERG fee + {fmtErg(deposit)} ERG deposit, returned at unlock
							</dd>
						</div>
					</dl>
					<label class="ll-check">
						<input type="checkbox" bind:checked={understood} />
						<span>
							I understand my {A.ticker} is locked until block #{unlockPreview.toLocaleString(
								'en-US'
							)}
							({fmtBlocks(tierDef.blocks + UNLOCK_BUFFER, net.blockSeconds)}) and nobody can release
							it early.
						</span>
					</label>
				{/if}

				<button
					class="ll-btn ll-btn-primary ll-btn-block ll-btn-lg"
					type="submit"
					disabled={!!lockBlocker || busy !== ''}
				>
					{busy === 'lock' ? 'Waiting for the wallet…' : lockBlocker || `Lock ${A.ticker}`}
				</button>
			</form>
			{/if}

			<section class="ll-card ll-positions-card" aria-labelledby="mine-title">
				<div class="ll-card-head">
					<h2 id="mine-title">Campaign locks</h2>
					{#if !testnet}<a class="ll-card-link" href="/lithos-locks">Full LIT dashboard →</a>{/if}
				</div>
				<div class="ll-segmented" role="group" aria-label="Filter campaign locks">
					<button
						type="button"
						class:selected={positionFilter === 'mine'}
						aria-pressed={positionFilter === 'mine'}
						on:click={() => (positionFilter = 'mine')}
						>My locks <span class="ll-count">{myPositions.length}</span></button
					>
					<button
						type="button"
						class:selected={positionFilter === 'all'}
						aria-pressed={positionFilter === 'all'}
						on:click={() => (positionFilter = 'all')}
						>All locks <span class="ll-count">{positions.length}</span></button
					>
				</div>

				{#if positionFilter === 'mine' && !activeAddress}
					<p class="ll-empty">Connect a wallet to see your locks.</p>
				{:else if visiblePositions.length === 0}
					<p class="ll-empty">
						{positionFilter === 'mine'
							? 'No locks yet. New locks show up here once they are in a block.'
							: 'No open campaign locks yet.'}
					</p>
				{:else}
					<ul class="ll-positions">
						{#each visiblePositions as p (p.box.boxId)}
							{@const mine = myPositionIds.has(p.box.boxId)}
							<li class="ll-position" class:mine>
								<div class="ll-position-body">
									<div class="ll-position-amounts">
										<b>{fmtA(p.principal, 4)} {A.ticker}</b>
										<span class="ll-gain">+{fmtB(p.reward, 4)} {B.ticker}</span>
										{#if mine}<span class="ll-pill">Your lock</span>{/if}
									</div>
									<div class="ll-position-meta">
										{d.params.tiers[p.tier]?.label ?? `tier ${p.tier}`} ·
										{#if height >= p.unlockAt}
											<span class="ll-ready">Unlocked since #{p.unlockAt.toLocaleString('en-US')}</span>
										{:else}
											unlocks at #{p.unlockAt.toLocaleString('en-US')}, {fmtBlocks(
												p.unlockAt - height,
												net.blockSeconds
											)} left
										{/if}
									</div>
								</div>
								{#if mine}
									<button
										class="ll-btn ll-btn-success ll-btn-sm"
										disabled={height < p.unlockAt ||
											busy !== '' ||
											wrongNetwork ||
											sentUnlocks.has(p.box.boxId)}
										on:click={() => unlock(p)}
									>
										{sentUnlocks.has(p.box.boxId)
											? 'Unlock sent'
											: busy === `unlock:${p.box.boxId}`
											? 'Waiting…'
											: 'Unlock'}
									</button>
								{:else}
									<a
										class="ll-btn ll-btn-secondary ll-btn-sm"
										href={net.txUrl(p.box.transactionId)}
										target="_blank"
										rel="noopener">View</a
									>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}

				{#if submitted.length}
					<h3 class="ll-subhead">Submitted this session</h3>
					<ul class="ll-submitted">
						{#each submitted as s}
							<li><a href={net.txUrl(s.txId)} target="_blank" rel="noopener">{s.what}</a></li>
						{/each}
					</ul>
				{/if}
				<p class="ll-hint">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICON.info} /></svg>
					<span>
						Your locked {A.ticker} sits in its own contract box, not at your address, so your wallet
						balance will not show it. It is listed here, and on the explorer.
					</span>
				</p>
			</section>
		</section>

		<section class="ll-section" aria-labelledby="learn-title">
			<h2 class="ll-section-title" id="learn-title">How it works</h2>
			<div class="ll-steps">
				<article class="ll-card ll-step">
					<span class="ll-step-number">1</span>
					<h3>What is Lithos?</h3>
					<p>
						Lithos is a decentralized mining pool protocol on Ergo. Smart contracts check miners'
						work with non-interactive share proofs and pay them directly, so no pool operator holds
						anyone's rewards. LIT is its token, with a supply of one billion.
					</p>
				</article>
				<article class="ll-card ll-step">
					<span class="ll-step-number">2</span>
					<h3>Why lock at launch?</h3>
					<p>
						Locked LIT cannot be sold, which steadies the first weeks of trading, and the reward
						budget goes to the people who commit to Lithos the longest.
					</p>
				</article>
				<article class="ll-card ll-step">
					<span class="ll-step-number">3</span>
					<h3>How rewards work</h3>
					<p>
						When you lock, your reward is worked out from your amount, your lock length and how much
						is already locked, then set aside in your own lock box. Each new lock lowers the rate a
						little for the next one; top-ups to the budget raise it. Nothing you already locked ever
						changes.
					</p>
				</article>
				<article class="ll-card ll-step">
					<span class="ll-step-number">4</span>
					<h3>Blocks, not dates</h3>
					<p>
						Ergo aims for a block every two minutes, 720 a day, but real block times vary. Your lock
						ends at an exact block; the date shown is an estimate and can drift by hours.
					</p>
				</article>
			</div>
		</section>

		<section class="ll-section" aria-labelledby="risks-title">
			<h2 class="ll-section-title" id="risks-title">Before you lock</h2>
			<div class="ll-card">
				<ul class="ll-risks">
					<li>
						Your {A.ticker} stays locked until its unlock block. Nobody can release it early: not
						you, not Mew, not Lithos.
					</li>
					<li>
						Your reward is fixed in {B.ticker}, but prices can move a lot, and the ERG/LIT market is
						thin.
					</li>
					<li>
						The rate shown is for the next lock. It falls as more {A.ticker} locks and rises when the
						budget is topped up. Your own reward never changes after you lock.
					</li>
					<li>
						These contracts are new. They were attack-tested and run end to end on testnet. Only
						lock what you can afford to leave locked.
					</li>
					<li>
						After locks close and a short grace period passes, any unused budget goes to
						<a href={net.addressUrl(leftover)} target="_blank" rel="noopener">{leftoverShort}</a>.
						That address is fixed in the contract.
					</li>
					<li>
						You need a little ERG: {fmtErg(TX_FEE)} for the network fee, plus a {fmtErg(deposit)}
						deposit that comes back when you unlock.
					</li>
				</ul>
			</div>
		</section>

		<section class="ll-actions" aria-label="Reward pool">
			{#if !retired}
			<form class="ll-card ll-action-card" on:submit|preventDefault={topUp}>
				<h2>Add to the reward pool</h2>
				<p class="ll-card-text">
					Anyone can add {B.ticker} to the budget until block #{d.params.end.toLocaleString(
						'en-US'
					)}. It raises the rate for every lock after it.
				</p>
				<p class="ll-card-text">
					It's a donation: it can't be taken back, and whatever isn't paid out as rewards goes to
					Mew Finance when the campaign closes.
				</p>
				<div class="ll-input">
					<input inputmode="decimal" autocomplete="off" placeholder="0.0" bind:value={topUpInput} />
					<span class="ll-input-suffix">{B.ticker}</span>
				</div>
				<button
					class="ll-btn ll-btn-secondary ll-btn-block"
					type="submit"
					disabled={!activeAddress ||
						wrongNetwork ||
						!(open || notStarted) ||
						!topUpAmount ||
						topUpAmount > rewardBalance ||
						busy !== ''}
				>
					{busy === 'topup' ? 'Waiting for the wallet…' : 'Add to pool'}
				</button>
			</form>
			{/if}
			<div class="ll-card ll-action-card">
				<h2>Close the campaign</h2>
				<p class="ll-card-text">
					After block #{(d.params.end + d.params.grace).toLocaleString('en-US')}, anyone can send
					what is left of the budget to
					<a href={net.addressUrl(leftover)} target="_blank" rel="noopener">{leftoverShort}</a>, as
					the contract requires. Open locks are not affected.
				</p>
				<button
					class="ll-btn ll-btn-secondary ll-btn-block"
					disabled={!sweepOpen || !activeAddress || wrongNetwork || busy !== ''}
					on:click={sweep}
				>
					{swept
						? 'Already swept'
						: busy === 'sweep'
						? 'Waiting for the wallet…'
						: 'Sweep leftover'}
				</button>
			</div>
		</section>
	{/if}
</main>

{#if showErgopayModal}
	<ErgopayModal
		bind:showErgopayModal
		bind:isAuth
		bind:unsignedTx
		qrCodeText=""
		onBtnClick={undefined}
		onTxSubmitted={() => setTimeout(refresh, 5_000)}
	>
		<button slot="btn">Close</button>
	</ErgopayModal>
{/if}
