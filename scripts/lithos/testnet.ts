// MewLock campaign testnet runner (lock asset A, earn asset B). Real
// transactions on the Ergo testnet, signed with sigma-rust (Nautilus's engine)
// and validated by public testnet nodes.
//
//   npx vite-node scripts/lithos/testnet.ts <command> [--slot N] [--stake lit|meow|erg] [--reward lit|meow|erg] [--demo]
//
//   wallet               addresses and balances of the slot
//   tokens               mint the test tokens (tLIT, tMEOW) once, slot 0
//   fund-slot --slots 1,2  give those slots tERG, tLIT and tMEOW from slot 0, in one tx
//   deploy               markers, NFT and a 30-block campaign for --stake/--reward
//   deploy --demo        week-long campaign with the mainnet tiers in blocks, for the page
//   scenario             locks, top-up, refusals, then finish
//   finish               unlocks + sweep (resumable)
//   send <addr> <tLIT> [tERG]   fund a tester (slot 0)
//   faucet [boxes]       fill the page's public test faucet (slot 0)
//   status               campaign and positions of the slot's deployment
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type ErgoUnsignedTransaction, OutputBuilder, TransactionBuilder } from '@fleet-sdk/core';
import { SByte, SColl, SLong } from '@fleet-sdk/serializer';
import { type CampaignState, parseCampaignBox, parsePositionBox, type PositionState } from '../../src/lib/lithos/boxes.ts';
import { compileCampaign, compilePosition } from '../../src/lib/lithos/compile.ts';
import { type LithosDeployment, pinParams, readDeployment } from '../../src/lib/lithos/deployment.ts';
import { initialVirtualWeight } from '../../src/lib/lithos/math.ts';
import {
	type AssetId,
	CAMPAIGN_RESERVE,
	CAMPAIGN_VERSION,
	type CampaignParams,
	POSITION_DEPOSIT
} from '../../src/lib/lithos/params.ts';
import {
	buildCampaignCreateTx,
	buildLockTx,
	buildMintTx,
	buildSweepTx,
	buildTopUpTx,
	buildUnlockTx,
	TX_FEE
} from '../../src/lib/lithos/txs.ts';
import * as chain from './chain.ts';
import { loadOrCreateWallet, type TestKey } from './wallet.ts';

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 ? argv[i + 1] : fallback;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const slot = Number(flag('slot', '0'));

const DIR = resolve(process.cwd(), '.testnet');
const TOKENS_FILE = resolve(DIR, 'tokens.json');
const STATE_FILE = resolve(DIR, slot === 0 ? 'state.json' : `state-${slot}.json`);
const DEMO_FILE = resolve(process.cwd(), 'src/lib/lithos/deployments/testnet.json');
const SCENARIO_FILE = resolve(DIR, `scenario-${slot}.json`);
const EXPLORER_TX = 'https://testnet.ergoplatform.com/en/transactions/';
const UNIT = 1_000_000_000n; // every test asset has 9 decimals
// We broadcast at once, so a few blocks of headroom is plenty (the UI uses 20).
const TESTNET_UNLOCK_BUFFER = 5;

type Asset = 'lit' | 'meow' | 'erg';
type Step = { label: string; txId: string; height: number };
type Tokens = { tLIT?: string; tMEOW?: string };

const { keys } = loadOrCreateWallet(slot);
const log = (...a: unknown[]) => console.log(...a);
/** Exact decimal for 9-decimal raw amounts (Number would round at this scale). */
const fmt = (raw: bigint) => {
	const v = raw < 0n ? -raw : raw;
	const frac = (v % UNIT).toString().padStart(9, '0').replace(/0+$/, '');
	return `${raw < 0n ? '-' : ''}${(v / UNIT).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
};

function readJson<T>(file: string, fallback: T): T {
	return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;
}
function tokens(): Tokens {
	const t = readJson<Tokens>(TOKENS_FILE, {});
	// Older state kept the tLIT id in state.json.
	const legacy = readJson<{ litId?: string }>(resolve(DIR, 'state.json'), {}).litId;
	return legacy && !t.tLIT ? { ...t, tLIT: legacy } : t;
}
function assetId(a: Asset): AssetId {
	if (a === 'erg') return null;
	const t = tokens();
	const id = a === 'lit' ? t.tLIT : t.tMEOW;
	if (!id) throw new Error(`no ${a === 'lit' ? 'tLIT' : 'tMEOW'} yet: run \`tokens\` first`);
	return id;
}
const tickerOf = (a: Asset) => (a === 'erg' ? 'tERG' : a === 'lit' ? 'tLIT' : 'tMEOW');

function record(step: Step) {
	const s = readJson<{ steps: Step[] }>(STATE_FILE, { steps: [] });
	s.steps.push(step);
	writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n');
}
function deploymentFile() {
	return argv.includes('--demo') ? DEMO_FILE : SCENARIO_FILE;
}
function loadDeployment(): LithosDeployment {
	const file = existsSync(SCENARIO_FILE) && !argv.includes('--demo') ? SCENARIO_FILE : DEMO_FILE;
	const d = readDeployment(readJson(file, {}));
	if (!d) throw new Error('no deployment for this slot: run `deploy` first');
	return d;
}

const boxesOf = (k: TestKey) => chain.unspentByAddress(k.address);

/** Sign with sigma-rust, broadcast, wait for a block and for the index to catch up. */
async function submit(label: string, tx: ErgoUnsignedTransaction, signers: TestKey[]): Promise<Step> {
	const signed = await chain.sign(tx.toEIP12Object(), signers.map((s) => s.key));
	const txId = await chain.broadcast(signed);
	log(`  ${label}: ${EXPLORER_TX}${txId}`);
	const height = await chain.waitForConfirmation(signed);
	await chain.waitIndexed(height);
	const step = { label, txId, height };
	record(step);
	return step;
}

async function campaignOf(d: LithosDeployment): Promise<CampaignState> {
	const box = (await chain.unspentByTokenId(d.campaignNftId)).find((b) => b.ergoTree === d.campaignTree);
	if (!box) throw new Error('campaign box not found (swept?)');
	return parseCampaignBox(box, d);
}

async function positionsOf(d: LithosDeployment): Promise<PositionState[]> {
	const boxes = await chain.unspentByTokenId(d.markerId);
	return boxes.map((b) => parsePositionBox(b, d)).filter((p): p is PositionState => p !== null);
}

/** What `address` gained of an asset in a mined tx (nanoERG for ERG): outputs minus inputs. */
async function gained(txId: string, address: string, id: AssetId): Promise<bigint> {
	const tx = await chain.minedTx(txId);
	const sum = (boxes: any[]) =>
		boxes
			.filter((b) => b.address === address)
			.reduce(
				(acc, b) =>
					acc +
					(id === null
						? BigInt(b.value)
						: (b.assets as { tokenId: string; amount: bigint }[])
								.filter((a) => a.tokenId === id)
								.reduce((s, a) => s + BigInt(a.amount), 0n)),
				0n
			);
	return sum(tx.outputs) - sum(tx.inputs);
}

async function wallet() {
	for (const k of Object.values(keys)) {
		const { nanoErg, tokens: t } = chain.balanceOf(await boxesOf(k));
		const names = tokens();
		const list = [...t.entries()]
			.map(([id, amt]) => `${fmt(amt)} ${id === names.tLIT ? 'tLIT' : id === names.tMEOW ? 'tMEOW' : id.slice(0, 6)}`)
			.slice(0, 4)
			.join(', ');
		log(`slot ${slot} ${k.role.padEnd(6)} ${k.address}  ${fmt(nanoErg)} tERG  ${list}`);
	}
}

async function mint(name: string, amount: bigint, decimals: number, description: string): Promise<string> {
	const tx = buildMintTx({
		height: await chain.height(),
		inputs: await boxesOf(keys.main),
		to: keys.main.address,
		amount,
		name,
		description,
		decimals
	});
	await submit(`mint ${name}`, tx, [keys.main]);
	return tx.inputs[0].boxId;
}

async function tokensCmd() {
	if (slot !== 0) throw new Error('mint test tokens from slot 0');
	const t = tokens();
	if (!t.tLIT) t.tLIT = await mint('tLIT', 1_000_000_000n * UNIT, 9, 'Test stand-in for Lithos LIT (MewLock testnet runner)');
	if (!t.tMEOW) t.tMEOW = await mint('tMEOW', 1_000_000_000n * UNIT, 9, 'Second test token (MewLock testnet runner)');
	mkdirSync(DIR, { recursive: true });
	writeFileSync(TOKENS_FILE, JSON.stringify(t, null, 2) + '\n');
	log(t);
}

/** From slot 0, give --slots N[,M...] 1,300 tERG, 150M tLIT and 200M tMEOW each, in one tx. */
async function fundSlot() {
	const slots = (flag('slots') ?? '').split(',').filter(Boolean).map(Number);
	if (slot !== 0 || slots.length === 0 || slots.includes(0)) throw new Error('usage: fund-slot --slots 1,2,3');
	const t = tokens();
	const outputs = slots.map((n) => {
		const out = new OutputBuilder(1_300n * UNIT, loadOrCreateWallet(n).keys.main.address);
		if (t.tLIT) out.addTokens({ tokenId: t.tLIT, amount: 150_000_000n * UNIT });
		if (t.tMEOW) out.addTokens({ tokenId: t.tMEOW, amount: 200_000_000n * UNIT });
		return out;
	});
	const tx = new TransactionBuilder(await chain.height())
		.from(await boxesOf(keys.main))
		.to(outputs)
		.sendChangeTo(keys.main.address)
		.payFee(TX_FEE)
		.build();
	await submit(`fund slots ${slots.join(',')}`, tx, [keys.main]);
}

async function deploy() {
	const main = keys.main;
	const { nanoErg } = chain.balanceOf(await boxesOf(main));
	if (nanoErg < 200_000_000n) throw new Error(`fund ${main.address} with testnet ERG first`);
	const stake = flag('stake', 'lit') as Asset;
	const reward = flag('reward', stake) as Asset;
	const stakeId = assetId(stake);
	const rewardId = assetId(reward);
	const demo = argv.includes('--demo');

	log(`Deploying: lock ${tickerOf(stake)}, earn ${tickerOf(reward)}${demo ? ' (demo)' : ''}`);
	const markerId = await mint('LITLOCK position (testnet)', 1_000_000_000n, 0, 'MewLock position marker');
	const campaignNftId = await mint('LITLOCK campaign (testnet)', 1n, 0, 'MewLock campaign');

	// --demo: the mainnet tiers (30/90/180/365 days at 1.0/1.25/1.5/2.0x) scaled
	// to one testnet block per day, open for about a week. Default: a 30-block
	// campaign for the scripted scenario (testnet blocks come every ~30-60 s).
	const h = await chain.height();
	const params: CampaignParams = {
		network: 'testnet',
		stakeId,
		rewardId,
		feeAddress: keys.fee.address,
		start: h,
		end: demo ? h + 10_080 : h + 30,
		grace: demo ? 60 : 3,
		slack: 60,
		tiers: demo
			? [
					{ blocks: 30, boostBps: 10_000, label: '30 days (demo)' },
					{ blocks: 90, boostBps: 12_500, label: '90 days (demo)' },
					{ blocks: 180, boostBps: 15_000, label: '180 days (demo)' },
					{ blocks: 365, boostBps: 20_000, label: '365 days (demo)' }
			  ]
			: [
					{ blocks: 10, boostBps: 10_000, label: '10 blocks' },
					{ blocks: 20, boostBps: 15_000, label: '20 blocks' }
			  ],
		minLock: stake === 'erg' ? UNIT / 10n : UNIT,
		deposit: POSITION_DEPOSIT,
		reserve: CAMPAIGN_RESERVE
	};
	const positionTree = compilePosition('testnet');
	const campaignTree = compileCampaign(params, positionTree);
	const budget = reward === 'erg' ? 1_000n * UNIT : 1_000_000n * UNIT;
	const v0 = initialVirtualWeight(budget, 5_000);

	log('Creating the campaign box...');
	const genesis = await submit(
		'create campaign',
		buildCampaignCreateTx({
			height: h,
			inputs: await boxesOf(main),
			changeAddress: main.address,
			campaignTree,
			campaignNftId,
			markerId,
			markerSupply: 1_000_000_000n,
			rewardId,
			reserve: params.reserve,
			budget,
			v0
		}),
		[main]
	);

	const deployment: LithosDeployment = {
		network: 'testnet',
		contract: CAMPAIGN_VERSION,
		label: demo ? 'Lithos Lock, testnet demo' : `testnet ${tickerOf(stake)}/${tickerOf(reward)} scenario`,
		params: pinParams(params),
		assets: {
			stake: { ticker: tickerOf(stake), decimals: 9 },
			reward: { ticker: tickerOf(reward), decimals: 9 }
		},
		positionTree,
		campaignTree,
		campaignNftId,
		markerId,
		genesisTxId: genesis.txId,
		genesisHeight: genesis.height,
		initialBudget: budget.toString(),
		initialV: v0.toString()
	};
	const file = deploymentFile();
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(deployment, null, '\t') + '\n');
	log(`Deployed to ${file}. Locks open until ${params.end}; sweep opens after ${params.end + params.grace}.`);
}

/** Expect sigma-rust to refuse signing. */
async function expectRefused(label: string, tx: unknown, signers: TestKey[]) {
	try {
		await chain.sign(tx as never, signers.map((s) => s.key));
	} catch (e) {
		log(`  refused as expected: ${label} (${String(e).split('\n')[0].slice(0, 110)})`);
		return;
	}
	throw new Error(`FAIL: sigma-rust signed "${label}"`);
}

/** Move `delta` of an asset into a tx output (token entry, or nanoERG for null). */
function shift(box: any, id: AssetId, delta: bigint) {
	if (id === null) box.value = (BigInt(box.value) + delta).toString();
	else {
		const e = box.assets.find((a: any) => a.tokenId === id);
		e.amount = (BigInt(e.amount) + delta).toString();
	}
}

async function lock(d: LithosDeployment, who: TestKey, principal: bigint, tier: number, owner?: TestKey) {
	const plan = buildLockTx({
		deployment: d,
		campaign: await campaignOf(d),
		inputs: await boxesOf(who),
		changeAddress: who.address,
		owner: owner?.address,
		principal,
		tier,
		height: await chain.height(),
		unlockBuffer: TESTNET_UNLOCK_BUFFER
	});
	await submit(
		`lock ${fmt(principal)} ${d.assets.stake.ticker}, tier ${tier}${owner ? ` for ${owner.role}` : ''} -> reward ${fmt(
			plan.quote.reward
		)} ${d.assets.reward.ticker}`,
		plan.tx,
		[who]
	);
	return plan;
}

async function scenario() {
	const d = loadDeployment();
	const { main, other } = keys;
	const ergStake = d.params.stakeId === null;
	const ergReward = d.params.rewardId === null;

	if (chain.balanceOf(await boxesOf(other)).nanoErg < 50_000_000n) {
		log('Funding the second test user for its own fees...');
		const tx = new TransactionBuilder(await chain.height())
			.from(await boxesOf(main))
			.to(new OutputBuilder(100_000_000n, other.address))
			.sendChangeTo(main.address)
			.payFee(TX_FEE)
			.build();
		await submit('fund other', tx, [main]);
	}

	log(`\n1. Locks (${d.label})`);
	const small = ergStake ? 10n * UNIT : 100_000n * UNIT;
	await lock(d, main, small, 0);
	await lock(d, main, small / 2n, 1, other);
	await lock(d, main, ergStake ? 100n * UNIT : 100_000_000n * UNIT, 0);

	log('\n2. Top-up (anyone can fund)');
	const before = await campaignOf(d);
	const topUp = ergReward ? 10n * UNIT : 10_000n * UNIT;
	await submit(
		`top-up ${fmt(topUp)} ${d.assets.reward.ticker}`,
		buildTopUpTx({
			deployment: d,
			campaign: before,
			inputs: await boxesOf(main),
			changeAddress: main.address,
			amount: topUp,
			height: await chain.height()
		}),
		[main]
	);
	const after = await campaignOf(d);
	if (after.budget !== before.budget + topUp || after.v !== before.v) throw new Error('FAIL: top-up state');

	log('\n3. Refusals (nothing here reaches the chain)');
	const probe = buildLockTx({
		deployment: d,
		campaign: after,
		inputs: await boxesOf(main),
		changeAddress: main.address,
		principal: small,
		tier: 0,
		height: await chain.height(),
		unlockBuffer: TESTNET_UNLOCK_BUFFER
	});
	const greedy = structuredClone(probe.tx.toEIP12Object());
	shift(greedy.outputs[1], d.params.rewardId, 1n);
	shift(greedy.outputs[0], d.params.rewardId, -1n);
	greedy.outputs[1].additionalRegisters.R7 = SLong(probe.quote.reward + 1n).toHex();
	await expectRefused('lock taking 1 raw unit more than the curve allows', greedy, [main]);

	const mistyped = structuredClone(probe.tx.toEIP12Object());
	mistyped.outputs[1].additionalRegisters.R4 = SColl(SByte, main.key.publicKey).toHex();
	const nodeSays = await chain.check(await chain.sign(mistyped, [main.key]));
	if (!nodeSays) throw new Error('FAIL: node accepted a position with a mistyped owner register');
	log(`  node rejects the lock sigma-rust signs (mistyped owner R4): ${nodeSays.replace(/\s+/g, ' ').slice(0, 120)}`);

	const pa = (await positionsOf(d)).find((p) => p.owner === main.address && p.principal === small)!;
	await expectRefused(
		'unlock before the unlock height',
		buildUnlockTx({ deployment: d, position: pa, inputs: await boxesOf(main), height: pa.unlockAt }).toEIP12Object(),
		[main]
	);
	await expectRefused(
		'sweep before end + grace',
		buildSweepTx({
			deployment: d,
			campaign: after,
			inputs: await boxesOf(other),
			changeAddress: other.address,
			height: d.params.end + d.params.grace + 1
		}).toEIP12Object(),
		[other]
	);
	await finish();
}

/**
 * Unlock every open position we own (after one theft attempt), then sweep.
 * Safe to re-run: it starts from whatever is still on chain.
 */
async function finish() {
	const d = loadDeployment();
	const { stakeId, rewardId } = d.params;
	const same = stakeId === rewardId;
	const open = (await positionsOf(d)).sort((a, b) => a.unlockAt - b.unlockAt);
	log(`\n4. Unlocks (${open.length} open position(s); now ${await chain.height()})`);
	let theftTried = false;
	for (const p of open) {
		const owner = Object.values(keys).find((k) => k.address === p.owner);
		if (!owner) {
			log(`  skipping ${p.box.boxId}: not one of our keys`);
			continue;
		}
		await chain.waitForHeight(p.unlockAt);
		if (!theftTried) {
			const thief = owner.role === 'other' ? keys.main : keys.other;
			await expectRefused(
				`${thief.role} unlocking ${owner.role}'s position after its unlock height`,
				buildUnlockTx({ deployment: d, position: p, inputs: await boxesOf(thief), height: await chain.height() }).toEIP12Object(),
				[thief]
			);
			theftTried = true;
		}
		const step = await submit(
			`unlock ${fmt(p.principal)} ${d.assets.stake.ticker} position (owner: ${owner.role})`,
			buildUnlockTx({ deployment: d, position: p, inputs: await boxesOf(owner), height: await chain.height() }),
			[owner]
		);
		// Owner ERG: the whole position value, minus the fee the owner's inputs paid.
		const ergGot = await gained(step.txId, owner.address, null);
		if (ergGot !== BigInt(p.box.value) - TX_FEE) throw new Error(`FAIL: unlock ERG ${ergGot}`);
		if (stakeId !== null) {
			const a = await gained(step.txId, owner.address, stakeId);
			if (a !== p.principal + (same ? p.reward : 0n)) throw new Error(`FAIL: unlock paid ${a} of A`);
		}
		if (rewardId !== null && !same) {
			const b = await gained(step.txId, owner.address, rewardId);
			if (b !== p.reward) throw new Error(`FAIL: unlock paid ${b} of B`);
		}
		log(`  ${owner.role} got back principal ${fmt(p.principal)} ${d.assets.stake.ticker} + reward ${fmt(p.reward)} ${d.assets.reward.ticker} exactly`);
	}

	const sweepAt = d.params.end + d.params.grace + 1;
	log(`\n5. Sweep (opens at block ${sweepAt}; now ${await chain.height()})`);
	await chain.waitForHeight(sweepAt + 1);
	const last = await campaignOf(d);
	const sweep = buildSweepTx({
		deployment: d,
		campaign: last,
		inputs: await boxesOf(keys.other),
		changeAddress: keys.other.address,
		height: await chain.height()
	});
	if (d.contract >= 3) {
		// Audit F-1: v3 only sweeps as INPUTS(0), so two campaigns can never share one payout.
		const reordered = sweep.toEIP12Object();
		reordered.inputs.push(reordered.inputs.shift()!);
		await expectRefused('sweep that does not spend the campaign first (v3)', reordered, [keys.other]);
	}
	const step = await submit('sweep by a third party (other)', sweep, [keys.other]);
	const feeErg = await gained(step.txId, keys.fee.address, null);
	if (feeErg !== BigInt(last.box.value)) throw new Error(`FAIL: fee address got ${feeErg} nanoERG`);
	if (rewardId !== null) {
		const feeB = await gained(step.txId, keys.fee.address, rewardId);
		if (feeB !== last.budget) throw new Error(`FAIL: fee address got ${feeB} of B`);
	}
	if ((await chain.unspentByTokenId(d.campaignNftId)).length !== 0) throw new Error('FAIL: campaign NFT survived');
	if ((await chain.unspentByTokenId(d.markerId)).length !== 0) throw new Error('FAIL: markers survived');
	log(`  fee address received the leftover ${fmt(last.budget)} ${d.assets.reward.ticker}; campaign NFT and every marker burned`);
	log(`\nAll testnet checks passed for ${d.label}.`);
}

/** Give a tester tLIT and/or tERG: send <address> <tLIT> [tERG] */
async function send() {
	const [, to, litArg = '0', ergArg = '0.1'] = positional;
	if (!to) throw new Error('usage: send <testnet address> <tLIT> [tERG]');
	const lit = BigInt(Math.round(Number(litArg))) * UNIT;
	const out = new OutputBuilder(BigInt(Math.round(Number(ergArg) * 1e9)), to);
	if (lit > 0n) out.addTokens({ tokenId: assetId('lit')!, amount: lit });
	const tx = new TransactionBuilder(await chain.height())
		.from(await boxesOf(keys.main))
		.to(out)
		.sendChangeTo(keys.main.address)
		.payFee(TX_FEE)
		.build();
	await submit(`send ${fmt(lit)} tLIT + ${ergArg} tERG to ${to}`, tx, [keys.main]);
}

/** Fill the page's test faucet: faucet [boxes], each 20 tERG + 2,000,000 tLIT. */
async function faucet() {
	const { FAUCET_ADDRESS } = await import('../../src/lib/lithos/testWallet.ts');
	const count = Number(positional[1] ?? 20);
	const outputs = Array.from({ length: count }, () =>
		new OutputBuilder(20n * UNIT, FAUCET_ADDRESS).addTokens({ tokenId: assetId('lit')!, amount: 2_000_000n * UNIT })
	);
	const tx = new TransactionBuilder(await chain.height())
		.from(await boxesOf(keys.main))
		.to(outputs)
		.sendChangeTo(keys.main.address)
		.payFee(TX_FEE)
		.build();
	await submit(`fill faucet ${FAUCET_ADDRESS} with ${count} boxes`, tx, [keys.main]);
}

async function status() {
	const d = loadDeployment();
	const h = await chain.height();
	log(`${d.label}: height ${h}; locks ${d.params.start}..${d.params.end}; sweep after ${d.params.end + d.params.grace}`);
	try {
		const c = await campaignOf(d);
		log(`campaign budget ${fmt(c.budget)} ${d.assets.reward.ticker}, V ${c.v}, markers left ${c.markersLeft}`);
	} catch (e) {
		log(String(e));
	}
	for (const p of await positionsOf(d)) {
		log(
			`position ${p.box.boxId.slice(0, 10)} owner ${p.owner.slice(0, 10)} ${fmt(p.principal)} + ${fmt(p.reward)} unlocks ${p.unlockAt}`
		);
	}
}

const commands: Record<string, () => Promise<void>> = {
	wallet,
	tokens: tokensCmd,
	'fund-slot': fundSlot,
	deploy,
	scenario,
	finish,
	send,
	faucet,
	status
};
const run = commands[positional[0] ?? 'wallet'];
if (!run) {
	console.error(`unknown command: ${positional[0]} (${Object.keys(commands).join(', ')})`);
	process.exit(1);
}
run().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
