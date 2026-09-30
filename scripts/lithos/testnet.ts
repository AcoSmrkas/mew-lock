// Lithos lock testnet runner. Real transactions on the Ergo testnet, signed
// with sigma-rust (Nautilus's engine) and validated by public testnet nodes.
//
//   npx vite-node scripts/lithos/testnet.ts wallet     addresses and balances
//   npx vite-node scripts/lithos/testnet.ts deploy     mint test LIT (once), markers, NFT, 30-block campaign
//   npx vite-node scripts/lithos/testnet.ts deploy --demo   week-long campaign with the mainnet tiers in blocks
//   npx vite-node scripts/lithos/testnet.ts send <address> <tLIT> [tERG]   fund a tester
//   npx vite-node scripts/lithos/testnet.ts faucet [boxes]   fill the page's public test faucet
//   npx vite-node scripts/lithos/testnet.ts scenario   locks, top-up, refusals, then finish
//   npx vite-node scripts/lithos/testnet.ts finish     unlocks + sweep (resumable)
//   npx vite-node scripts/lithos/testnet.ts status     campaign and positions
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import { type ErgoUnsignedTransaction, OutputBuilder, TransactionBuilder } from '@fleet-sdk/core';
import { SByte, SColl, SLong } from '@fleet-sdk/serializer';
import { type CampaignState, parseCampaignBox, parsePositionBox, type PositionState } from '../../src/lib/lithos/boxes.ts';
import { compileCampaign, compilePosition } from '../../src/lib/lithos/compile.ts';
import { type LithosDeployment, pinParams } from '../../src/lib/lithos/deployment.ts';
import { initialVirtualWeight, lockAprBps } from '../../src/lib/lithos/math.ts';
import type { CampaignParams } from '../../src/lib/lithos/params.ts';
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

const STATE_FILE = resolve(process.cwd(), '.testnet/state.json');
const DEPLOYMENT_FILE = resolve(process.cwd(), 'src/lib/lithos/deployments/testnet.json');
const EXPLORER_TX = 'https://testnet.ergoplatform.com/en/transactions/';
const UNIT = 1_000_000_000n; // test LIT has 9 decimals, like LIT
// We broadcast at once, so a few blocks of headroom is plenty (the UI uses 20).
const TESTNET_UNLOCK_BUFFER = 5;

type Step = { label: string; txId: string; height: number };
type RunnerState = { litId?: string; steps: Step[] };

const { keys } = loadOrCreateWallet();
const log = (...a: unknown[]) => console.log(...a);
/** Exact decimal for 9-decimal raw amounts (Number would round at this scale). */
const fmt = (raw: bigint) => {
	const v = raw < 0n ? -raw : raw;
	const frac = (v % UNIT).toString().padStart(9, '0').replace(/0+$/, '');
	return `${raw < 0n ? '-' : ''}${(v / UNIT).toLocaleString('en-US')}${frac ? `.${frac}` : ''}`;
};

function loadState(): RunnerState {
	return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { steps: [] };
}
function saveState(s: RunnerState) {
	writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n');
}
function loadDeployment(): LithosDeployment {
	if (!existsSync(DEPLOYMENT_FILE)) throw new Error('no testnet deployment yet: run `deploy` first');
	return JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));
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
	const s = loadState();
	s.steps.push(step);
	saveState(s);
	return step;
}

async function campaignOf(d: LithosDeployment): Promise<CampaignState> {
	const boxes = await chain.unspentByTokenId(d.campaignNftId);
	const box = boxes.find((b) => b.ergoTree === d.campaignTree);
	if (!box) throw new Error('campaign box not found (swept?)');
	return parseCampaignBox(box, d);
}

async function positionsOf(d: LithosDeployment): Promise<PositionState[]> {
	const boxes = await chain.unspentByTokenId(d.markerId);
	return boxes.map((b) => parsePositionBox(b, d)).filter((p): p is PositionState => p !== null);
}

async function wallet() {
	for (const k of Object.values(keys)) {
		const { nanoErg, tokens } = chain.balanceOf(await boxesOf(k));
		log(`${k.role.padEnd(6)} ${k.address}  ${fmt(nanoErg)} tERG  ${tokens.size} token(s)`);
	}
}

async function deploy() {
	const main = keys.main;
	const { nanoErg } = chain.balanceOf(await boxesOf(main));
	if (nanoErg < 200_000_000n) throw new Error(`fund ${main.address} with testnet ERG first`);
	const state = loadState();

	if (!state.litId) {
		log('Minting test LIT (1,000,000,000 tLIT, 9 decimals)...');
		const tx = buildMintTx({
			height: await chain.height(),
			inputs: await boxesOf(main),
			to: main.address,
			amount: 1_000_000_000n * UNIT,
			name: 'tLIT',
			description: 'Test stand-in for Lithos LIT (MewLock testnet runner)',
			decimals: 9
		});
		const litId = tx.inputs[0].boxId;
		await submit('mint tLIT', tx, [main]);
		saveState({ ...loadState(), litId });
	}
	const litId = loadState().litId!;

	log('Minting position markers...');
	const markerTx = buildMintTx({
		height: await chain.height(),
		inputs: await boxesOf(main),
		to: main.address,
		amount: 1_000_000_000n,
		name: 'LITLOCK position (testnet)',
		description: 'MewLock x Lithos position marker',
		decimals: 0
	});
	const markerId = markerTx.inputs[0].boxId;
	await submit('mint markers', markerTx, [main]);

	log('Minting the campaign NFT...');
	const nftTx = buildMintTx({
		height: await chain.height(),
		inputs: await boxesOf(main),
		to: main.address,
		amount: 1n,
		name: 'LITLOCK campaign (testnet)',
		description: 'MewLock x Lithos campaign',
		decimals: 0
	});
	const campaignNftId = nftTx.inputs[0].boxId;
	await submit('mint campaign NFT', nftTx, [main]);

	// --demo: the mainnet tiers (30/90/180/365 days at 1.0/1.25/1.5/2.0x) scaled to
	// one testnet block per day, open for about a week, for clicking through the
	// page with Nautilus Testnet. Default: a 30-block campaign for the scripted
	// scenario (testnet blocks come every ~30-60 s).
	const demo = process.argv.includes('--demo');
	const h = await chain.height();
	const params: CampaignParams = {
		network: 'testnet',
		litId,
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
		minLock: UNIT
	};
	const positionTree = compilePosition('testnet');
	const campaignTree = compileCampaign(params, positionTree);
	const budget = 1_000_000n * UNIT;
	const v0 = initialVirtualWeight(budget, 5_000);

	log('Creating the campaign box...');
	const createTx = buildCampaignCreateTx({
		height: h,
		inputs: await boxesOf(main),
		changeAddress: main.address,
		campaignTree,
		campaignNftId,
		markerId,
		markerSupply: 1_000_000_000n,
		litId,
		budget,
		v0
	});
	const genesis = await submit('create campaign', createTx, [main]);

	const deployment: LithosDeployment = {
		network: 'testnet',
		label: demo ? 'Lithos Lock, testnet demo' : 'Lithos Lock, testnet dry run',
		params: pinParams(params),
		positionTree,
		campaignTree,
		campaignNftId,
		markerId,
		genesisTxId: genesis.txId,
		genesisHeight: genesis.height,
		initialBudget: budget.toString(),
		initialV: v0.toString()
	};
	mkdirSync(dirname(DEPLOYMENT_FILE), { recursive: true });
	writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, '\t') + '\n');
	log(`Deployed. Locks open until block ${params.end}; sweep opens after ${params.end + params.grace}.`);
}

/** Expect sigma-rust to refuse signing; returns its reason. */
async function expectRefused(label: string, tx: EIP12UnsignedTransaction, signers: TestKey[]) {
	try {
		await chain.sign(tx, signers.map((s) => s.key));
	} catch (e) {
		log(`  refused as expected: ${label} (${String(e).split('\n')[0].slice(0, 110)})`);
		return;
	}
	throw new Error(`FAIL: sigma-rust signed "${label}"`);
}

const clone = (tx: ErgoUnsignedTransaction) => structuredClone(tx.toEIP12Object());

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
		`lock ${fmt(principal)} tLIT, tier ${tier}${owner ? ` for ${owner.role}` : ''} -> reward ${fmt(plan.quote.reward)} (${(
			lockAprBps(principal, plan.quote.reward, d.params.tiers[tier].blocks) / 100
		).toFixed(2)}% APR)`,
		plan.tx,
		[who]
	);
	return plan;
}

async function scenario() {
	const d = loadDeployment();
	const { main, other } = keys;

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

	log('\n1. Locks');
	await lock(d, main, 100_000n * UNIT, 0);
	await lock(d, main, 50_000n * UNIT, 1, other);
	await lock(d, main, 500_000_000n * UNIT, 0);

	log('\n2. Top-up (anyone can fund)');
	const before = await campaignOf(d);
	await submit(
		'top-up 10,000 tLIT',
		buildTopUpTx({
			deployment: d,
			campaign: before,
			inputs: await boxesOf(main),
			changeAddress: main.address,
			amount: 10_000n * UNIT,
			height: await chain.height()
		}),
		[main]
	);
	const after = await campaignOf(d);
	if (after.budget !== before.budget + 10_000n * UNIT || after.v !== before.v) throw new Error('FAIL: top-up state');

	log('\n3. Refusals (nothing here reaches the chain)');
	const probe = buildLockTx({
		deployment: d,
		campaign: after,
		inputs: await boxesOf(main),
		changeAddress: main.address,
		principal: 1_000n * UNIT,
		tier: 0,
		height: await chain.height(),
		unlockBuffer: TESTNET_UNLOCK_BUFFER
	});
	const greedy = clone(probe.tx);
	greedy.outputs[1].assets[1].amount = (BigInt(greedy.outputs[1].assets[1].amount) + 1n).toString();
	greedy.outputs[1].additionalRegisters.R7 = SLong(probe.quote.reward + 1n).toHex();
	greedy.outputs[0].assets[2].amount = (BigInt(greedy.outputs[0].assets[2].amount) - 1n).toString();
	await expectRefused('lock taking 1 raw unit more than the curve allows', greedy, [main]);

	const mistyped = clone(probe.tx);
	mistyped.outputs[1].additionalRegisters.R4 = SColl(SByte, main.key.publicKey).toHex();
	const signedMistyped = await chain.sign(mistyped, [main.key]);
	const nodeSays = await chain.check(signedMistyped);
	if (!nodeSays) throw new Error('FAIL: node accepted a position with a mistyped owner register');
	log(`  node rejects the lock sigma-rust signs (mistyped owner R4): ${nodeSays.slice(0, 140)}`);

	const pa = (await positionsOf(d)).find((p) => p.owner === main.address && p.principal === 100_000n * UNIT)!;
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

/** LIT `address` gained in a mined tx: what its outputs got minus what its inputs spent. */
async function litGained(txId: string, address: string, litId: string): Promise<bigint> {
	const tx = await chain.minedTx(txId);
	const sum = (boxes: any[]) =>
		boxes
			.filter((b) => b.address === address)
			.flatMap((b) => b.assets as { tokenId: string; amount: bigint }[])
			.filter((a) => a.tokenId === litId)
			.reduce((acc, a) => acc + BigInt(a.amount), 0n);
	return sum(tx.outputs) - sum(tx.inputs);
}

/**
 * Unlock every open position we own (after one theft attempt), then sweep.
 * Safe to re-run: it starts from whatever is still on chain.
 */
async function finish() {
	const d = loadDeployment();
	const lit = d.params.litId;
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
			`unlock ${fmt(p.principal)} tLIT position (owner: ${owner.role})`,
			buildUnlockTx({ deployment: d, position: p, inputs: await boxesOf(owner), height: await chain.height() }),
			[owner]
		);
		const gained = await litGained(step.txId, owner.address, lit);
		if (gained !== p.principal + p.reward) throw new Error(`FAIL: unlock paid ${gained}, expected ${p.principal + p.reward}`);
		log(`  ${owner.role} got back ${fmt(gained)} tLIT = principal ${fmt(p.principal)} + reward ${fmt(p.reward)}`);
	}

	const sweepAt = d.params.end + d.params.grace + 1;
	log(`\n5. Sweep (opens at block ${sweepAt}; now ${await chain.height()})`);
	await chain.waitForHeight(sweepAt + 1);
	const last = await campaignOf(d);
	const step = await submit(
		'sweep by a third party (other)',
		buildSweepTx({
			deployment: d,
			campaign: last,
			inputs: await boxesOf(keys.other),
			changeAddress: keys.other.address,
			height: await chain.height()
		}),
		[keys.other]
	);
	const feeGot = await litGained(step.txId, keys.fee.address, lit);
	if (feeGot !== last.budget) throw new Error(`FAIL: fee address got ${feeGot}, expected ${last.budget}`);
	if ((await chain.unspentByTokenId(d.campaignNftId)).length !== 0) throw new Error('FAIL: campaign NFT survived');
	if ((await chain.unspentByTokenId(d.markerId)).length !== 0) throw new Error('FAIL: markers survived');
	log(`  fee address received the leftover ${fmt(feeGot)} tLIT; campaign NFT and every marker burned`);
	log('\nAll testnet checks passed.');
}

/** Give a tester tLIT and/or tERG: send <address> <tLIT> [tERG] */
async function send() {
	const [, to, litArg = '0', ergArg = '0.1'] = process.argv.slice(2);
	if (!to) throw new Error('usage: send <testnet address> <tLIT> [tERG]');
	const litId = loadState().litId;
	if (!litId) throw new Error('no tLIT minted yet: run deploy first');
	const lit = BigInt(Math.round(Number(litArg))) * UNIT;
	const nanoErg = BigInt(Math.round(Number(ergArg) * 1e9));
	const out = new OutputBuilder(nanoErg, to);
	if (lit > 0n) out.addTokens({ tokenId: litId, amount: lit });
	const tx = new TransactionBuilder(await chain.height())
		.from(await boxesOf(keys.main))
		.to(out)
		.sendChangeTo(keys.main.address)
		.payFee(TX_FEE)
		.build();
	await submit(`send ${fmt(lit)} tLIT + ${Number(nanoErg) / 1e9} tERG to ${to}`, tx, [keys.main]);
}

/** Fill the page's test faucet: faucet [boxes], each 20 tERG + 2,000,000 tLIT. */
async function faucet() {
	const { FAUCET_ADDRESS } = await import('../../src/lib/lithos/testWallet.ts');
	const litId = loadState().litId;
	if (!litId) throw new Error('no tLIT minted yet: run deploy first');
	const count = Number(process.argv[3] ?? 20);
	const outputs = Array.from({ length: count }, () =>
		new OutputBuilder(20n * UNIT, FAUCET_ADDRESS).addTokens({ tokenId: litId, amount: 2_000_000n * UNIT })
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
	log(`height ${h}; locks ${d.params.start}..${d.params.end}; sweep after ${d.params.end + d.params.grace}`);
	try {
		const c = await campaignOf(d);
		log(`campaign budget ${fmt(c.budget)} tLIT, V ${c.v}, markers left ${c.markersLeft}`);
	} catch (e) {
		log(String(e));
	}
	for (const p of await positionsOf(d)) {
		log(`position ${p.box.boxId.slice(0, 10)} owner ${p.owner.slice(0, 10)} ${fmt(p.principal)} + ${fmt(p.reward)} unlocks ${p.unlockAt}`);
	}
}

const commands: Record<string, () => Promise<void>> = { wallet, deploy, scenario, finish, send, faucet, status };
const [command = 'wallet'] = process.argv.slice(2);
const run = commands[command];
if (!run) {
	console.error(`unknown command: ${command} (${Object.keys(commands).join(', ')})`);
	process.exit(1);
}
run().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
