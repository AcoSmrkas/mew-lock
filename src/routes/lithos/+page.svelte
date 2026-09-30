<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Box } from '@fleet-sdk/common';
	import { ErgoAddress, type ErgoUnsignedTransaction } from '@fleet-sdk/core';
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
		signAndSubmit,
		usingErgoPay,
		walletBoxes
	} from '$lib/lithos/wallet.ts';
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
	// What is locked (A) and what is paid (B); either may be ERG, and they may be the same.
	$: A = d?.assets.stake ?? { ticker: 'LIT', decimals: 9 };
	$: B = d?.assets.reward ?? { ticker: 'LIT', decimals: 9 };
	$: sameAsset = !!d && d.params.stakeId === d.params.rewardId;
	$: deposit = d ? BigInt(d.params.deposit) : 0n;
	// Reactive so the template re-renders when the deployment (and its decimals) load.
	$: fmtA = (raw: bigint, max = 4) => fmtAmount(raw, A.decimals, max);
	$: fmtB = (raw: bigint, max = 4) => fmtAmount(raw, B.decimals, max);
	// Same asset: an APR. Different assets: B earned per whole A per year (no prices involved).
	$: rateOf = (reward: bigint, principal: bigint, blocks: number) =>
		sameAsset
			? fmtApr(Number((reward * 10_000n * BigInt(BLOCKS_PER_YEAR)) / (principal * BigInt(blocks))))
			: `${fmtRate(yearlyRate(reward, B.decimals, principal, A.decimals, blocks, BLOCKS_PER_YEAR))} ${B.ticker} per ${A.ticker} / yr`;
	$: marginalRate = (boostBps: number) => {
		if (!campaign) return '—';
		const bps = marginalAprBps(campaign.budget, campaign.v, boostBps);
		return sameAsset
			? fmtApr(bps)
			: `${fmtRate((bps / 10_000) * 10 ** (A.decimals - B.decimals))} ${B.ticker} per ${A.ticker} / yr`;
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
	$: mine = testWallet
		? new Set([testWallet.address])
		: new Set([$connected_wallet_address, ...($connected_wallet_addresses ?? [])].filter(Boolean));
	$: myPositions = positions.filter((p) => mine.has(p.owner)).sort((a, b) => a.unlockAt - b.unlockAt);
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

	async function loadWallet() {
		if (!net || !activeAddress) {
			boxes = [];
			return;
		}
		try {
			boxes = testWallet ? await testBoxes(net, testWallet.address) : await walletBoxes(net);
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
			`${what} submitted.<br><a target="_blank" rel="noopener" href="${net!.txUrl(txId)}">View transaction</a>`,
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
				`Test tokens are on the way. You can lock right away.<br><a target="_blank" rel="noopener" href="${net.txUrl(txId)}">View transaction</a>`,
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
					`Rates just moved: your reward is now ${fmtB(plan.quote.reward, B.decimals)} ${B.ticker}. Check it and press Lock again.`,
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
			if (h < p.unlockAt) throw new Error(`Locked until block ${p.unlockAt.toLocaleString('en-US')}.`);
			// Nautilus signs with keys whose boxes are among the inputs, so put
			// the owner's own boxes first.
			const ownerTree = ErgoAddress.fromBase58(p.owner).ergoTree;
			const inputs = [...boxes].sort(
				(a, b) => Number(b.ergoTree === ownerTree) - Number(a.ergoTree === ownerTree)
			);
			await submit(
				buildUnlockTx({ deployment: d, position: p, inputs, height: h }),
				`Unlock of ${fmtA(p.principal)} ${A.ticker} + ${fmtB(p.reward)} ${B.ticker}`
			);
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
	const boost = (bps: number) => `${(bps / 10_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
</script>

<svelte:head>
	<title>Lithos Lock | MewLock</title>
	<meta
		name="description"
		content="Lock LIT for a fixed number of blocks and earn a LIT reward that is fixed the moment you lock. Non-custodial, no admin keys."
	/>
</svelte:head>

<Navigation />

<main class="ll">
	{#if testnet}
		<div class="ll-testnet" role="status">
			<strong>TESTNET</strong> These are test tokens on the Ergo testnet. Use the test wallet below, or
			Nautilus Wallet (Testnet).
			<a href="/lithos?network=mainnet">Switch to mainnet</a>
		</div>
	{/if}

	<header class="ll-hero">
		<p class="ll-kicker">MewLock × Lithos <span>·</span> PoW-Fi</p>
		<h1>Lithos Lock</h1>
		<p class="ll-lede">
			Lock {A.ticker} for a fixed number of blocks. Your {B.ticker} reward is set the moment you lock and comes
			back with your {A.ticker} when the lock ends. No keys, no admins: only you can open your lock.
		</p>
		{#if d}
			<p class="ll-term" aria-live="polite">
				<span class="ll-prompt">&gt;</span>
				block <b>#{height ? height.toLocaleString('en-US') : '…'}</b>
				{#if swept}
					· campaign ended, leftover swept
				{:else if notStarted}
					· locks open at #{d.params.start.toLocaleString('en-US')}
				{:else if open}
					· locks open until #{d.params.end.toLocaleString('en-US')} ({blockDate(d.params.end)})
				{:else}
					· locks closed at #{d.params.end.toLocaleString('en-US')}
				{/if}
				<span class="ll-caret" aria-hidden="true" />
			</p>
		{/if}
	</header>

	{#if !net}
		<p class="ll-muted">Loading…</p>
	{:else if !d}
		<section class="ll-card ll-soon">
			<h2>Opens soon</h2>
			<p>The Lithos Lock campaign is not live on {net.network} yet.</p>
			{#if !testnet}<a class="ll-btn ll-btn-ghost" href="/lithos?network=testnet">Try it on testnet</a>{/if}
		</section>
	{:else}
		{#if loadError}<p class="ll-error">{loadError}</p>{/if}
		{#if d.note}<p class="ll-note-banner" role="note">{d.note}</p>{/if}

		{#if testnet}
			<section class="ll-card ll-testwallet" aria-label="Test wallet">
				{#if !testWallet}
					<div>
						<h2>Test wallet</h2>
						<p class="ll-muted">
							No Nautilus Testnet? Make a throwaway wallet that lives in this browser, get free test
							tokens, and try the whole flow.
						</p>
					</div>
					<button class="ll-btn ll-btn-small" on:click={makeTestWallet}>Create test wallet</button>
				{:else}
					<div>
						<h2>Test wallet</h2>
						<p class="ll-mono">
							<button type="button" class="ll-link" on:click={copyAddress} title="Copy address">
								{testWallet.address.slice(0, 10)}…{testWallet.address.slice(-6)}
							</button>
							· {fmtErg(ergBalance)} tERG{#if d.params.stakeId !== null}{` · ${fmtA(balanceOf(d.params.stakeId), 2)} ${A.ticker}`}{/if}
						</p>
						<p class="ll-muted ll-small">
							The key is stored only in this browser. Test tokens have no value.
						</p>
					</div>
					<div class="ll-row">
						<button class="ll-btn ll-btn-small" disabled={busy !== ''} on:click={getTestTokens}>
							{busy === 'drip'
								? 'Sending…'
								: d.params.stakeId === null
								? `Get ${fmtErg(FAUCET_DRIP.nanoErg)} tERG`
								: `Get ${fmtErg(FAUCET_DRIP.nanoErg)} tERG + ${fmtA(FAUCET_DRIP.tokens, 0)} ${A.ticker}`}
						</button>
						<button class="ll-btn ll-btn-small ll-btn-ghost" on:click={dropTestWallet}>Forget</button>
					</div>
				{/if}
			</section>
		{/if}

		<section class="ll-stats" aria-label="Campaign statistics">
			<div class="ll-stat">
				<span>{A.ticker} locked</span>
				<b>{stats ? fmtA(stats.totalLocked, 2) : '…'}</b>
			</div>
			<div class="ll-stat">
				<span>Lockers</span>
				<b>{stats ? stats.lockers.toLocaleString('en-US') : '…'}</b>
			</div>
			<div class="ll-stat">
				<span>{sameAsset ? 'Base APR for the next lock' : 'Base rate for the next lock'}</span>
				<b class="ll-hot">{marginalRate(10_000)}</b>
			</div>
			<div class="ll-stat">
				<span>Reward budget left ({B.ticker})</span>
				<b>{campaign ? fmtB(campaign.budget, 2) : swept ? '0' : '…'}</b>
			</div>
			<div class="ll-stat">
				<span>Rewards set aside ({B.ticker})</span>
				<b>{stats ? fmtB(stats.rewardsCommitted, 2) : '…'}</b>
			</div>
			<div class="ll-stat">
				<span>Locks close at</span>
				<b>#{d.params.end.toLocaleString('en-US')}</b>
				<small>{blockDate(d.params.end)}</small>
			</div>
		</section>

		<section class="ll-grid">
			<form class="ll-card ll-lock" on:submit|preventDefault={lock}>
				<h2>Lock {A.ticker}</h2>

				<label class="ll-field">
					<span class="ll-label">
						Amount
						{#if activeAddress}
							<button type="button" class="ll-link" on:click={setMax}>
								Balance {fmtA(stakeBalance, 4)} {A.ticker} · Max
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
						<span>{A.ticker}</span>
					</div>
					{#if amountInput !== '' && principal === null}
						<small class="ll-warn">Use a number with up to {A.decimals} decimals.</small>
					{/if}
				</label>

				<fieldset class="ll-tiers">
					<legend class="ll-label">Lock length</legend>
					{#each d.params.tiers as t, i}
						<label class="ll-tier" class:active={tier === i}>
							<input type="radio" name="tier" value={i} bind:group={tier} />
							<b>{t.label}</b>
							<span>
								{t.label.includes('block')
									? fmtBlocks(t.blocks, net.blockSeconds)
									: `${t.blocks.toLocaleString('en-US')} blocks`} · {boost(t.boostBps)}
							</span>
							<span class="ll-hot">
								{marginalRate(t.boostBps)}{sameAsset ? ' APR' : ''} now
							</span>
						</label>
					{/each}
				</fieldset>

				{#if quote && principal && tierDef}
					<dl class="ll-quote">
						<div><dt>You lock</dt><dd>{fmtA(principal, A.decimals)} {A.ticker}</dd></div>
						<div>
							<dt>Reward, fixed now</dt>
							<dd class="ll-hot">+{fmtB(quote.reward, B.decimals)} {B.ticker}</dd>
						</div>
						<div>
							<dt>You get back</dt>
							<dd>
								{#if sameAsset}
									{fmtA(principal + quote.reward, A.decimals)} {A.ticker}
								{:else}
									{fmtA(principal, A.decimals)} {A.ticker} + {fmtB(quote.reward, B.decimals)} {B.ticker}
								{/if}
							</dd>
						</div>
						<div><dt>{sameAsset ? 'APR' : 'Rate'}</dt><dd>{rateOf(quote.reward, principal, tierDef.blocks)}</dd></div>
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
							I understand my {A.ticker} is locked until block #{unlockPreview.toLocaleString('en-US')}
							({fmtBlocks(tierDef.blocks + UNLOCK_BUFFER, net.blockSeconds)}) and nobody can release it early.
						</span>
					</label>
				{/if}

				<button class="ll-btn" type="submit" disabled={!!lockBlocker || busy !== ''}>
					{busy === 'lock' ? 'Waiting for the wallet…' : lockBlocker || `Lock ${A.ticker}`}
				</button>
			</form>

			<section class="ll-card ll-mine" aria-labelledby="mine-title">
				<h2 id="mine-title">Your locks</h2>
				{#if !activeAddress}
					<p class="ll-muted">Connect a wallet to see your locks.</p>
				{:else if myPositions.length === 0}
					<p class="ll-muted">No locks yet. New locks show up here once they are in a block.</p>
				{:else}
					<ul class="ll-positions">
						{#each myPositions as p (p.box.boxId)}
							<li>
								<div>
									<b>{fmtA(p.principal, 4)} {A.ticker}</b>
									<span class="ll-hot">+{fmtB(p.reward, 4)} {sameAsset ? '' : B.ticker}</span>
									<small>{d.params.tiers[p.tier]?.label ?? `tier ${p.tier}`}</small>
								</div>
								<div class="ll-when">
									{#if height >= p.unlockAt}
										<span class="ll-ready">Unlocked since #{p.unlockAt.toLocaleString('en-US')}</span>
									{:else}
										<span>
											#{p.unlockAt.toLocaleString('en-US')} ·
											{fmtBlocks(p.unlockAt - height, net.blockSeconds)} left
										</span>
									{/if}
								</div>
								<button
									class="ll-btn ll-btn-small"
									disabled={height < p.unlockAt || busy !== '' || wrongNetwork}
									on:click={() => unlock(p)}
								>
									{busy === `unlock:${p.box.boxId}` ? 'Waiting…' : 'Unlock'}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if submitted.length}
					<h3>Submitted this session</h3>
					<ul class="ll-submitted">
						{#each submitted as s}
							<li><a href={net.txUrl(s.txId)} target="_blank" rel="noopener">{s.what}</a></li>
						{/each}
					</ul>
				{/if}
				<p class="ll-note">
					Your locked {A.ticker} sits in its own contract box, not at your address, so your wallet balance
					will not show it. It is listed here, and on the explorer.
				</p>
			</section>
		</section>

		<section class="ll-learn" aria-labelledby="learn-title">
			<h2 id="learn-title">How it works</h2>
			<div class="ll-cards">
				<article class="ll-card">
					<h3>What is Lithos?</h3>
					<p>
						Lithos is a decentralized mining pool protocol on Ergo. Smart contracts check miners' work
						with non-interactive share proofs and pay them directly, so no pool operator holds anyone's
						rewards. LIT is its token, with a supply of one billion.
					</p>
				</article>
				<article class="ll-card">
					<h3>Why lock at launch?</h3>
					<p>
						Locked LIT cannot be sold, which steadies the first weeks of trading, and the reward budget
						goes to the people who commit to Lithos the longest.
					</p>
				</article>
				<article class="ll-card">
					<h3>How rewards work</h3>
					<p>
						When you lock, your reward is worked out from your amount, your lock length and how much is
						already locked, then set aside in your own lock box. Each new lock lowers the rate a little
						for the next one; top-ups to the budget raise it. Nothing you already locked ever changes.
					</p>
				</article>
				<article class="ll-card">
					<h3>Blocks, not dates</h3>
					<p>
						Ergo aims for a block every two minutes, 720 a day, but real block times vary. Your lock ends
						at an exact block; the date shown is an estimate and can drift by hours.
					</p>
				</article>
			</div>
		</section>

		<section class="ll-card ll-risks" aria-labelledby="risks-title">
			<h2 id="risks-title">Before you lock</h2>
			<ul>
				<li>
					Your {A.ticker} stays locked until its unlock block. Nobody can release it early: not you, not Mew,
					not Lithos.
				</li>
				<li>
					Your reward is fixed in {B.ticker}, but prices can move a lot, and the ERG/LIT market is thin.
				</li>
				<li>
					The rate shown is for the next lock. It falls as more {A.ticker} locks and rises when the budget is
					topped up. Your own reward never changes after you lock.
				</li>
				<li>
					These contracts are new. They were attack-tested and run end to end on testnet. Only lock what
					you can afford to leave locked.
				</li>
				<li>
					After locks close and a short grace period passes, any unused budget goes to the Mew Finance
					developers' fee address. That address is fixed in the contract.
				</li>
				<li>
					You need a little ERG: {fmtErg(TX_FEE)} for the network fee, plus a {fmtErg(deposit)}
					deposit that comes back when you unlock.
				</li>
			</ul>
		</section>

		<section class="ll-grid ll-admin">
			<form class="ll-card" on:submit|preventDefault={topUp}>
				<h2>Add to the reward pool</h2>
				<p class="ll-muted">
					Anyone can add {B.ticker} to the budget until block #{d.params.end.toLocaleString('en-US')}. It
					raises the rate for every lock after it.
				</p>
				<div class="ll-input">
					<input inputmode="decimal" autocomplete="off" placeholder="0.0" bind:value={topUpInput} />
					<span>{B.ticker}</span>
				</div>
				<button
					class="ll-btn ll-btn-ghost"
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
			<div class="ll-card">
				<h2>Close the campaign</h2>
				<p class="ll-muted">
					After block #{(d.params.end + d.params.grace).toLocaleString('en-US')}, anyone can send what is
					left of the budget to the Mew Finance fee address, as the contract requires. Open locks are not
					affected.
				</p>
				<button
					class="ll-btn ll-btn-ghost"
					disabled={!sweepOpen || !activeAddress || wrongNetwork || busy !== ''}
					on:click={sweep}
				>
					{swept ? 'Already swept' : busy === 'sweep' ? 'Waiting for the wallet…' : 'Sweep leftover'}
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

<style>
	.ll {
		--ll-bg: var(--background, #160d25);
		--ll-panel: #1c1230;
		--ll-line: var(--borders, #ffffff22);
		--ll-text: #e9e4f4;
		--ll-muted: var(--text-light, #ffffff77);
		--ll-accent: var(--main-color, #f9d72d);
		--ll-live: var(--info-color, #04dfff);
		--ll-mono: ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace;
		max-width: 1120px;
		margin: 0 auto;
		padding: 96px 16px 64px;
		color: var(--ll-text);
	}
	.ll-testnet {
		border: 1px dashed var(--ll-live);
		color: var(--ll-live);
		background: #04dfff12;
		border-radius: 10px;
		padding: 10px 14px;
		margin-bottom: 24px;
		font-size: 0.9rem;
	}
	.ll-testnet strong {
		font-family: var(--ll-mono);
		margin-right: 8px;
	}
	.ll-testnet a {
		color: var(--ll-accent);
		margin-left: 8px;
	}
	.ll-hero {
		position: relative;
		isolation: isolate;
		padding: 24px 0 32px;
	}
	/* The grid fades out on its own layer, so the fade never touches the text. */
	.ll-hero::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background-image: linear-gradient(#ffffff0d 1px, transparent 1px),
			linear-gradient(90deg, #ffffff0d 1px, transparent 1px);
		background-size: 32px 32px;
		background-position: -1px -1px;
		mask-image: linear-gradient(to bottom, #000 40%, transparent);
		-webkit-mask-image: linear-gradient(to bottom, #000 40%, transparent);
	}
	.ll-kicker {
		font-family: var(--ll-mono);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		font-size: 0.78rem;
		color: var(--ll-live);
		margin: 0 0 8px;
	}
	.ll-kicker span {
		color: var(--ll-muted);
	}
	h1 {
		font-size: clamp(2.2rem, 6vw, 3.6rem);
		line-height: 1.05;
		margin: 0 0 12px;
		color: var(--ll-accent);
		letter-spacing: -0.02em;
	}
	.ll-lede {
		max-width: 640px;
		font-size: 1.05rem;
		line-height: 1.6;
		color: var(--ll-text);
		margin: 0 0 18px;
	}
	.ll-term {
		font-family: var(--ll-mono);
		font-size: 0.88rem;
		color: #ffffffb3;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.ll-term b {
		color: var(--ll-live);
		font-weight: 600;
	}
	.ll-prompt {
		color: var(--ll-accent);
		margin-right: 6px;
	}
	.ll-caret {
		display: inline-block;
		width: 8px;
		height: 1em;
		margin-left: 4px;
		vertical-align: -2px;
		background: var(--ll-live);
		animation: ll-blink 1.1s steps(1) infinite;
	}
	@keyframes ll-blink {
		50% {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ll-caret {
			animation: none;
		}
	}
	h2 {
		font-size: 1.15rem;
		margin: 0 0 14px;
		color: var(--ll-text);
	}
	h3 {
		font-size: 0.98rem;
		margin: 0 0 8px;
		color: var(--ll-accent);
	}
	.ll-card {
		background: var(--ll-panel);
		border: 1px solid var(--ll-line);
		border-radius: 14px;
		padding: 20px;
	}
	.ll-muted,
	.ll-note {
		color: var(--ll-muted);
		line-height: 1.55;
	}
	.ll-note {
		font-size: 0.82rem;
		margin: 16px 0 0;
	}
	.ll-error {
		color: #ff8a8a;
	}
	.ll-hot {
		color: var(--ll-live);
	}
	.ll-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 12px;
		margin-bottom: 20px;
	}
	.ll-stat {
		background: var(--ll-panel);
		border: 1px solid var(--ll-line);
		border-radius: 12px;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.ll-stat span {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ll-muted);
	}
	.ll-stat b {
		font-family: var(--ll-mono);
		font-size: 1.2rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.ll-stat small {
		color: var(--ll-muted);
		font-size: 0.78rem;
	}
	.ll-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 16px;
		margin-bottom: 32px;
		align-items: start;
	}
	.ll-label {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ll-muted);
		margin-bottom: 8px;
	}
	.ll-link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--ll-live);
		font-size: 0.8rem;
		text-transform: none;
		letter-spacing: 0;
		cursor: pointer;
	}
	.ll-field {
		display: block;
		margin-bottom: 18px;
	}
	.ll-input {
		display: flex;
		align-items: center;
		background: #0000004d;
		border: 1px solid var(--ll-line);
		border-radius: 10px;
		padding: 0 14px;
		margin-bottom: 14px;
	}
	.ll-input:focus-within {
		border-color: var(--ll-live);
	}
	.ll-input input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: 0;
		color: var(--ll-text);
		font-family: var(--ll-mono);
		font-size: 1.25rem;
		padding: 12px 0;
	}
	.ll-input span {
		color: var(--ll-muted);
		font-family: var(--ll-mono);
	}
	.ll-warn {
		color: #ffb86b;
	}
	.ll-tiers {
		border: 0;
		padding: 0;
		margin: 0 0 18px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
	}
	.ll-tiers legend {
		grid-column: 1 / -1;
		width: 100%;
	}
	.ll-tier {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 3px;
		border: 1px solid var(--ll-line);
		border-radius: 10px;
		padding: 12px;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--ll-muted);
	}
	.ll-tier b {
		color: var(--ll-text);
		font-size: 1rem;
	}
	.ll-tier input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.ll-tier.active {
		border-color: var(--ll-accent);
		background: #f9d72d0f;
	}
	.ll-tier:has(input:focus-visible) {
		outline: 2px solid var(--ll-live);
		outline-offset: 2px;
	}
	.ll-quote {
		margin: 0 0 16px;
		border: 1px solid var(--ll-line);
		border-radius: 10px;
		padding: 6px 14px;
		font-size: 0.9rem;
	}
	.ll-quote div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 7px 0;
		border-bottom: 1px dashed var(--ll-line);
	}
	.ll-quote div:last-child {
		border-bottom: 0;
	}
	.ll-quote dt {
		color: var(--ll-muted);
	}
	.ll-quote dd {
		margin: 0;
		text-align: right;
		font-family: var(--ll-mono);
		overflow-wrap: anywhere;
	}
	.ll-check {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-size: 0.88rem;
		line-height: 1.5;
		margin-bottom: 16px;
		cursor: pointer;
	}
	.ll-check input {
		margin-top: 4px;
		accent-color: var(--ll-accent);
	}
	.ll-btn {
		width: 100%;
		border: 0;
		border-radius: 10px;
		padding: 13px 16px;
		font-weight: 700;
		font-size: 1rem;
		background: var(--ll-accent);
		color: #1b1030;
		cursor: pointer;
		transition: filter 0.15s ease;
	}
	.ll-btn:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.ll-btn:focus-visible {
		outline: 2px solid var(--ll-live);
		outline-offset: 2px;
	}
	.ll-btn:disabled {
		cursor: not-allowed;
		background: #ffffff1f;
		color: var(--ll-muted);
	}
	.ll-btn-ghost {
		background: transparent;
		border: 1px solid var(--ll-accent);
		color: var(--ll-accent);
		display: inline-block;
		text-align: center;
		text-decoration: none;
	}
	.ll-btn-small {
		width: auto;
		padding: 8px 14px;
		font-size: 0.88rem;
	}
	.ll-positions,
	.ll-submitted {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.ll-positions li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 6px 12px;
		align-items: center;
		padding: 12px 0;
		border-bottom: 1px solid var(--ll-line);
	}
	.ll-positions li > div:first-child {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: baseline;
		font-family: var(--ll-mono);
	}
	.ll-positions small {
		color: var(--ll-muted);
		font-family: inherit;
	}
	.ll-when {
		grid-column: 1;
		font-size: 0.82rem;
		color: var(--ll-muted);
	}
	.ll-positions button {
		grid-column: 2;
		grid-row: 1 / span 2;
	}
	.ll-ready {
		color: var(--ll-live);
	}
	.ll-mine h3 {
		margin-top: 18px;
		font-size: 0.85rem;
		color: var(--ll-muted);
	}
	.ll-submitted a {
		color: var(--ll-live);
		font-size: 0.88rem;
	}
	.ll-learn {
		margin-bottom: 24px;
	}
	.ll-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 12px;
	}
	.ll-cards p {
		color: var(--ll-muted);
		line-height: 1.6;
		font-size: 0.92rem;
		margin: 0;
	}
	.ll-risks {
		margin-bottom: 32px;
	}
	.ll-risks ul {
		margin: 0;
		padding-left: 18px;
		color: var(--ll-muted);
		line-height: 1.65;
	}
	.ll-risks li + li {
		margin-top: 6px;
	}
	.ll-admin .ll-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.ll-admin .ll-input {
		margin-bottom: 0;
	}

	.ll-note-banner {
		border: 1px solid #f9d72d66;
		background: #f9d72d12;
		color: var(--ll-accent);
		border-radius: 10px;
		padding: 10px 14px;
		margin: 0 0 20px;
		font-size: 0.92rem;
	}
	.ll-testwallet {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 12px 20px;
		margin-bottom: 20px;
		border-style: dashed;
		border-color: #04dfff55;
	}
	.ll-testwallet h2 {
		margin-bottom: 6px;
	}
	.ll-testwallet p {
		margin: 0;
	}
	.ll-mono {
		font-family: var(--ll-mono);
		overflow-wrap: anywhere;
	}
	.ll-small {
		font-size: 0.8rem;
		margin-top: 4px !important;
	}
	.ll-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ll-soon {
		text-align: center;
		padding: 40px 20px;
	}
	@media (max-width: 800px) {
		.ll {
			padding-top: 84px;
		}
		.ll-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
