<script lang="ts">
	import '$lib/lithos/lithos.css';
	// Deploy a campaign from a connected wallet: mint the position markers and
	// the campaign NFT, compile the contract (the leftover goes to an address of
	// your choice, baked in), and create the campaign box. Three signatures, no
	// keys anywhere else. The compiler (several MB) only loads here.
	import { onMount } from 'svelte';
	import { AddressType, type Box } from '@fleet-sdk/common';
	import { ErgoAddress, type ErgoUnsignedTransaction } from '@fleet-sdk/core';
	import Navigation from '$lib/components/common/Navigation.svelte';
	import { connected_wallet_address } from '$lib/store/store.ts';
	import { leftoverClash, pickNetwork, type NetworkConfig } from '$lib/lithos/network.ts';
	import { DEV_PK } from '$lib/common/const.ts';
	import { getHeight, getJson, normalizeBox, tokenTotal } from '$lib/lithos/api.ts';
	import { buildCampaignCreateTx, buildMintTx } from '$lib/lithos/txs.ts';
	import { initialVirtualWeight } from '$lib/lithos/math.ts';
	import {
		CAMPAIGN_RESERVE,
		CAMPAIGN_VERSION,
		fleetNetwork,
		POSITION_DEPOSIT,
		type CampaignParams,
		type Tier
	} from '$lib/lithos/params.ts';
	import { type LithosDeployment, pinParams } from '$lib/lithos/deployment.ts';
	import { fmtAmount, fmtBlocks, parseAmount } from '$lib/lithos/format.ts';
	import { loadTestWallet, signLocally, submitSigned, testBoxes, type TestWallet } from '$lib/lithos/testWallet.ts';
	import { describeError, usingErgoPay } from '$lib/lithos/wallet.ts';

	// The EIP-12 wallet Nautilus injects once connected.
	const ergo = () => (window as unknown as { ergo: any }).ergo;

	const LIT_MAINNET = 'c1980d829988229516430a47a5eca376060b6ce859616db0936e78ab25cb6de7';
	const MARKER_SUPPLY = 1_000_000_000n;

	let net: NetworkConfig | null = null;
	let testWallet: TestWallet | null = null;
	$: signer = testWallet?.address ?? $connected_wallet_address;

	// Mainnet defaults: the launch campaign. Tiers are the agreed 30/90/180/365
	// days at 1.0/1.25/1.5/2.0x (720 blocks a day); how long locks stay open and
	// the budget are left empty on purpose, so they are chosen, not inherited.
	let label = 'Lithos Lock';
	let note = '';
	let stakeId = LIT_MAINNET;
	let rewardId = LIT_MAINNET;
	let ticker = 'LIT';
	let decimals = 9;
	let tiersText = '21600:1.0, 64800:1.25, 129600:1.5, 262800:2.0';
	let openBlocks = 0;
	let grace = 720;
	let budgetInput = '';
	let minLockInput = '1';
	let baseAprPct = 50;
	// The Mew dev fee wallet (DEV_PK, also paid by MewLock, lending and delegation).
	let leftoverTo = DEV_PK;

	let log: string[] = [];
	let busy = false;
	let result: LithosDeployment | null = null;
	let utxos: Box<bigint>[] = [];

	// Progress survives a reload: after each signature the tx id is saved, so a
	// refresh resumes instead of minting (and paying for) everything again.
	const PROGRESS_KEY = 'lithos_deploy_progress';
	type Draft = Omit<LithosDeployment, 'campaignNftId' | 'markerId' | 'genesisTxId' | 'genesisHeight'> & {
		change: string;
	};
	type Progress = {
		draft: Draft;
		markerId?: string;
		markerTxId?: string;
		campaignNftId?: string;
		nftTxId?: string;
		createTxId?: string;
	};
	let progress: Progress | null = null;

	function saveProgress(p: Progress) {
		progress = p;
		try {
			localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
		} catch {
			// no storage: the run still works, it just cannot resume
		}
	}
	function clearProgress() {
		progress = null;
		try {
			localStorage.removeItem(PROGRESS_KEY);
		} catch {
			// nothing stored
		}
	}

	onMount(() => {
		net = pickNetwork(new URL(window.location.href));
		if (net.network === 'testnet') {
			testWallet = loadTestWallet();
			const t = net.deployment?.params.stakeId;
			if (t) stakeId = rewardId = t;
			ticker = 'tLIT';
			label = 'Lithos Lock, testnet deploy rehearsal';
			note = 'Testnet rehearsal of a Lithos Lock campaign.';
			tiersText = '10:1.0, 30:1.25, 60:1.5, 120:2.0';
			openBlocks = 2_160;
			grace = 30;
			budgetInput = '1000';
			leftoverTo = '';
		}
		try {
			const saved = localStorage.getItem('lithos_last_deploy');
			if (saved) result = JSON.parse(saved);
			const p = localStorage.getItem(PROGRESS_KEY);
			if (p && JSON.parse(p).draft?.network === net.network) progress = JSON.parse(p);
		} catch {
			// nothing saved
		}
	});

	$: tiers = parseTiers(tiersText, net?.network === 'mainnet');
	$: mainnet = net?.network === 'mainnet';
	$: leftoverProblem = checkLeftover(leftoverTo, net);
	$: budget = parseAmount(budgetInput, decimals);
	$: minLock = parseAmount(minLockInput, decimals);
	$: problem = !net
		? 'Loading…'
		: !signer
		? 'Connect a wallet (Nautilus)'
		: !testWallet && usingErgoPay()
		? 'Use Nautilus: deploying takes three signatures in a row'
		: !tiers
		? 'Tiers must look like "10:1.0, 30:1.25"'
		: !budget || budget <= 0n
		? 'Enter a budget'
		: !minLock || minLock <= 0n
		? 'Enter a minimum lock'
		: !openBlocks || openBlocks < 10
		? 'Choose how long locks stay open'
		: grace < 0
		? 'Check the grace period'
		: leftoverProblem
		? leftoverProblem
		: '';
	$: stepsDone = progress ? (progress.createTxId ? 3 : progress.nftTxId ? 2 : progress.markerTxId ? 1 : 0) : 0;

	function parseTiers(text: string, days: boolean): Tier[] | null {
		const tiers: Tier[] = [];
		for (const part of text.split(',').map((p) => p.trim()).filter(Boolean)) {
			const m = /^(\d+)\s*:\s*(\d+(?:\.\d+)?)$/.exec(part);
			if (!m) return null;
			const blocks = Number(m[1]);
			// Mainnet labels whole days (720 blocks); anything else is labelled in blocks.
			const label = days && blocks % 720 === 0 ? `${blocks / 720} days` : `${blocks} blocks`;
			tiers.push({ blocks, boostBps: Math.round(Number(m[2]) * 10_000), label });
		}
		return tiers.length ? tiers : null;
	}

	/** Why the leftover address cannot be used, or ''. Empty means the signer's wallet (testnet only). */
	function checkLeftover(text: string, net: NetworkConfig | null): string {
		const address = text.trim();
		if (!net) return '';
		if (!address) return net.network === 'mainnet' ? 'Enter the leftover address' : '';
		let parsed: ErgoAddress;
		try {
			parsed = ErgoAddress.fromBase58(address);
		} catch {
			return 'The leftover address is not a valid address';
		}
		if (parsed.network !== fleetNetwork(net.network)) return 'The leftover address is on the wrong network';
		if (parsed.type !== AddressType.P2PK) return 'The leftover address must be a wallet, not a contract';
		const clash = leftoverClash(net, address);
		if (clash) return `The ${clash.label} already pays that address: use another one until it is swept`;
		return '';
	}

	const say = (line: string) => (log = [...log, line]);

	async function walletUtxos(): Promise<Box<bigint>[]> {
		if (testWallet) return testBoxes(net!, testWallet.address);
		return (((await ergo().get_utxos()) ?? []) as unknown[]).map(normalizeBox);
	}

	/** After a reload: wait until the wallet itself shows a box holding `tokenId`. */
	async function walletUtxosWith(tokenId: string): Promise<Box<bigint>[]> {
		for (let i = 0; i < 60; i++) {
			const boxes = await walletUtxos();
			if (boxes.some((b) => b.assets.some((a) => a.tokenId === tokenId))) return boxes;
			await new Promise((r) => setTimeout(r, 10_000));
		}
		throw new Error(`the wallet does not show token ${tokenId} yet; try Resume again in a minute`);
	}

	async function waitConfirmed(txId: string): Promise<number> {
		for (let i = 0; i < 180; i++) {
			try {
				// A source that has not indexed the block yet can answer without a height;
				// only a real one means confirmed (an early answer pinned genesisHeight: null).
				const height = Number((await getJson(`${net!.explorerApi}/transactions/${txId}`)).inclusionHeight);
				if (Number.isInteger(height) && height > 0) return height;
			} catch {
				// not found yet
			}
			await new Promise((r) => setTimeout(r, 10_000));
		}
		throw new Error(`${txId} was not confirmed within 30 minutes`);
	}

	/**
	 * Sign and submit, record the tx id (so a reload can resume), wait for a
	 * block, and carry the wallet's new boxes into the next step.
	 */
	async function step(tx: ErgoUnsignedTransaction, what: string, changeTree: string, onSubmitted: (txId: string) => void) {
		const eip12 = tx.toEIP12Object();
		let id: string;
		let outputs: Box<bigint>[];
		if (testWallet) {
			const signed = signLocally(eip12, () => testWallet!.key);
			id = await submitSigned(net!, signed);
			outputs = signed.outputs.map(normalizeBox);
		} else {
			const signed = await ergo().sign_tx(eip12);
			id = await ergo().submit_tx(signed);
			outputs = (signed.outputs as unknown[]).map((o) => normalizeBox({ ...(o as object), transactionId: id }));
		}
		onSubmitted(id);
		say(`${what}: submitted ${id}. Waiting for a block…`);
		const height = await waitConfirmed(id);
		say(`${what}: confirmed at block ${height.toLocaleString('en-US')}.`);
		const spent = new Set(eip12.inputs.map((i) => i.boxId));
		utxos = [...utxos.filter((b) => !spent.has(b.boxId)), ...outputs.filter((o) => o.ergoTree === changeTree)];
		return { id, height };
	}

	/** Compile with the form's values, then run the three steps. */
	async function deploy() {
		if (problem || !net || !tiers || !budget || !minLock) return;
		busy = true;
		log = [];
		result = null;
		try {
			const network = net.network;
			const change = testWallet ? testWallet.address : await ergo().get_change_address();
			const leftover = leftoverTo.trim() || change;
			const clash = leftoverClash(net, leftover);
			if (clash) throw new Error(`the ${clash.label} already pays ${leftover}; choose another leftover address`);
			utxos = await walletUtxos();
			const have = rewardId ? tokenTotal(utxos, rewardId) : 0n;
			if (rewardId && have < budget) throw new Error(`The wallet holds ${fmtAmount(have, decimals)} ${ticker}, less than the budget.`);

			say('Compiling the contract (loads the ErgoScript compiler once)…');
			const { compileCampaign, compilePosition } = await import('$lib/lithos/compile.ts');
			const h = await getHeight(net);
			const params: CampaignParams = {
				network,
				stakeId: stakeId || null,
				rewardId: rewardId || null,
				feeAddress: leftover,
				start: h,
				end: h + openBlocks,
				grace,
				slack: 60,
				tiers,
				minLock,
				deposit: POSITION_DEPOSIT,
				reserve: CAMPAIGN_RESERVE
			};
			const positionTree = compilePosition(network);
			const campaignTree = compileCampaign(params, positionTree);
			const v0 = initialVirtualWeight(budget, Math.round(baseAprPct * 100));
			say(`Compiled. Locks will be open from block ${h.toLocaleString('en-US')} to ${params.end.toLocaleString('en-US')}; leftover goes to ${leftover}.`);
			saveProgress({
				draft: {
					network,
					contract: CAMPAIGN_VERSION,
					label,
					note,
					params: pinParams(params),
					assets: { stake: { ticker, decimals }, reward: { ticker, decimals } },
					positionTree,
					campaignTree,
					initialBudget: budget.toString(),
					initialV: v0.toString(),
					change
				}
			});
			await runSteps(false);
		} catch (e) {
			say(`Stopped: ${describeError(e)}`);
			console.error(e);
		} finally {
			busy = false;
		}
	}

	async function resume() {
		busy = true;
		log = [`Resuming at step ${stepsDone + 1} of 3.`];
		try {
			await runSteps(true);
		} catch (e) {
			say(`Stopped: ${describeError(e)}`);
			console.error(e);
		} finally {
			busy = false;
		}
	}

	/** Whatever of the three steps is left. `resumed`: this page did not see earlier steps, so ask the wallet. */
	async function runSteps(resumed: boolean) {
		const { ErgoAddress } = await import('@fleet-sdk/core');
		const d = progress!.draft;
		const changeTree = ErgoAddress.fromBase58(d.change).ergoTree;

		if (!progress!.markerTxId) {
			if (resumed) utxos = await walletUtxos();
			const tx = buildMintTx({
				height: await getHeight(net!),
				inputs: utxos,
				to: d.change,
				amount: MARKER_SUPPLY,
				name: 'LITLOCK position',
				description: 'Mew Lock campaign position marker',
				decimals: 0
			});
			const markerId = tx.inputs[0].boxId;
			await step(tx, '1/3 position markers', changeTree, (id) => saveProgress({ ...progress!, markerId, markerTxId: id }));
		} else if (resumed) {
			say('Position markers were sent before; waiting for them…');
			await waitConfirmed(progress!.markerTxId);
		}

		if (!progress!.nftTxId) {
			if (resumed) utxos = await walletUtxosWith(progress!.markerId!);
			const tx = buildMintTx({
				height: await getHeight(net!),
				inputs: utxos,
				to: d.change,
				amount: 1n,
				name: 'LITLOCK campaign',
				description: `Mew Lock campaign: ${d.label}`,
				decimals: 0
			});
			const campaignNftId = tx.inputs[0].boxId;
			await step(tx, '2/3 campaign NFT', changeTree, (id) => saveProgress({ ...progress!, campaignNftId, nftTxId: id }));
		} else if (resumed) {
			say('Campaign NFT was sent before; waiting for it…');
			await waitConfirmed(progress!.nftTxId);
		}

		let genesisHeight: number;
		if (!progress!.createTxId) {
			if (resumed) utxos = await walletUtxosWith(progress!.campaignNftId!);
			const tx = buildCampaignCreateTx({
				height: await getHeight(net!),
				inputs: utxos,
				changeAddress: d.change,
				campaignTree: d.campaignTree,
				campaignNftId: progress!.campaignNftId!,
				markerId: progress!.markerId!,
				markerSupply: MARKER_SUPPLY,
				rewardId: d.params.rewardId,
				reserve: BigInt(d.params.reserve),
				budget: BigInt(d.initialBudget),
				v0: BigInt(d.initialV)
			});
			genesisHeight = (await step(tx, '3/3 campaign box', changeTree, (id) => saveProgress({ ...progress!, createTxId: id }))).height;
		} else {
			say('Campaign box was sent before; waiting for it…');
			genesisHeight = await waitConfirmed(progress!.createTxId);
		}

		const { change: _change, ...rest } = d;
		result = {
			...rest,
			campaignNftId: progress!.campaignNftId!,
			markerId: progress!.markerId!,
			genesisTxId: progress!.createTxId!,
			genesisHeight
		};
		try {
			localStorage.setItem('lithos_last_deploy', JSON.stringify(result));
		} catch {
			// shown below either way
		}
		clearProgress();
		say('Done. Send the JSON below to the Mew team so the page can show this campaign.');
	}

	function copyResult() {
		navigator.clipboard?.writeText(JSON.stringify(result, null, '\t'));
	}
</script>

<svelte:head>
	<title>Deploy a campaign | Mew Lock</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Navigation />

<main class="ll">
	<div class="ll-narrow">
		<header class="ll-header">
			<h1>Deploy a campaign</h1>
			<p class="ll-description">
				Three signatures from your wallet: mint the position markers, mint the campaign NFT, then
				create the campaign box with its budget. Everything below is compiled into the contract and
				cannot change later.
				{#if net?.network === 'testnet'}<b>Testnet</b>{#if testWallet} · signing with the test wallet{/if}.{/if}
			</p>
		</header>

		{#if progress}
			<section class="ll-card ll-form-card ll-resume">
				<h2>Unfinished deployment</h2>
				<p class="ll-card-text">
					"{progress.draft.label}" stopped after step {stepsDone} of 3. Resume to finish it without minting
					again, or discard it (anything already minted stays in the wallet).
				</p>
				<div class="ll-row">
					<button class="ll-btn ll-btn-primary" disabled={busy} on:click={resume}
						>{busy ? 'Working…' : 'Resume'}</button
					>
					<button class="ll-btn ll-btn-secondary" disabled={busy} on:click={clearProgress}
						>Discard</button
					>
				</div>
			</section>
		{/if}

		{#if mainnet}
			<section class="ll-card ll-form-card">
				<h2>Before you start</h2>
				<ol class="ll-checklist">
					<li>
						Use Nautilus on mainnet with the whole budget in LIT plus about 0.05 ERG. Keep this tab open
						for the three signatures (a few minutes); if it reloads, press Resume.
					</li>
					<li>
						Leftover: the Mew dev fee wallet is filled in. Never use the wallet that funded the test
						campaign while that campaign is unswept: the two could be swept together and pay it once.
					</li>
					<li>
						Choose how long locks stay open (720 blocks ≈ 1 day), the budget, and the starting base APR:
						at 50%, one lock of as much LIT as the whole budget, for a year at 2×, takes half of it.
					</li>
					<li>
						Everything is permanent once deployed. A mistake means a new campaign, so read the form
						twice.
					</li>
					<li>
						At the end, copy the deployment JSON and send it to the Mew devs. The campaign shows on
						lock.mewfinance.com/lithos once they have checked it and published it.
					</li>
				</ol>
			</section>
		{/if}

		<form class="ll-card ll-form-card ll-form" on:submit|preventDefault={deploy}>
			<h2>Campaign</h2>
			<label>Label <input bind:value={label} /></label>
			<label>Note shown on the page <input bind:value={note} /></label>
			<div class="ll-form-row">
				<label>Locked token id (empty = ERG) <input class="ll-mono" bind:value={stakeId} /></label>
				<label>Reward token id (empty = ERG) <input class="ll-mono" bind:value={rewardId} /></label>
			</div>
			<div class="ll-form-row">
				<label>Ticker <input bind:value={ticker} /></label>
				<label>Decimals <input type="number" bind:value={decimals} /></label>
			</div>
			<label>Tiers, blocks:multiplier <input bind:value={tiersText} /></label>
			<div class="ll-form-row">
				<label
					>Locks open for (blocks{openBlocks > 0 && net ? `, ${fmtBlocks(openBlocks, net.blockSeconds)}` : ''})
					<input type="number" bind:value={openBlocks} /></label
				>
				<label>Grace before sweep (blocks) <input type="number" bind:value={grace} /></label>
			</div>
			<div class="ll-form-row">
				<label>Budget ({ticker}) <input bind:value={budgetInput} /></label>
				<label>Minimum lock ({ticker}) <input bind:value={minLockInput} /></label>
				<label>Starting base APR (%) <input type="number" bind:value={baseAprPct} /></label>
			</div>
			<label>
				Leftover goes to{mainnet ? ' (a wallet address)' : ' (empty = your wallet)'}
				<input class="ll-mono" bind:value={leftoverTo} placeholder={signer || 'your wallet address'} />
			</label>
			<button
				class="ll-btn ll-btn-primary ll-btn-block ll-btn-lg"
				type="submit"
				disabled={!!problem || busy || !!progress}
			>
				{busy ? 'Deploying… keep this tab open' : problem || 'Deploy (3 signatures)'}
			</button>
		</form>

		{#if log.length}
			<pre class="ll-log">{log.join('\n')}</pre>
		{/if}

		{#if result}
			<section class="ll-card ll-form-card">
				<h2>Deployment</h2>
				<p class="ll-card-text">Campaign NFT <code class="ll-mono">{result.campaignNftId}</code></p>
				<button class="ll-btn ll-btn-primary" on:click={copyResult}>Copy deployment JSON</button>
				<pre class="ll-log">{JSON.stringify(result, null, 2)}</pre>
			</section>
		{/if}
	</div>
</main>
