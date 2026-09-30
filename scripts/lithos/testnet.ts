// Lithos lock testnet runner. Real transactions on the Ergo testnet, signed
// with sigma-rust (Nautilus's engine) and validated by public testnet nodes.
//
//   npx vite-node scripts/lithos/testnet.ts wallet     addresses and balances
//   npx vite-node scripts/lithos/testnet.ts deploy     mint test LIT (once), markers, NFT, short campaign
//   npx vite-node scripts/lithos/testnet.ts scenario   locks, top-up, refusals, unlocks, sweep
//   npx vite-node scripts/lithos/testnet.ts status     campaign and positions
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import { type ErgoUnsignedTransaction, OutputBuilder, TransactionBuilder } from '@fleet-sdk/core';
import { SByte, SColl, SLong } from '@fleet-sdk/serializer';
import { type CampaignState, parseCampaignBox, parsePositionBox, type PositionState } from '../../src/lib/lithos/boxes.ts';
import { compileCampaign, compilePosition } from '../../src/lib/lithos/compile.ts';
import type { LithosDeployment } from '../../src/lib/lithos/deployment.ts';
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

type Step = { label: string; txId: string; height: number };
type RunnerState = { litId?: string; steps: Step[] };

const { keys } = loadOrCreateWallet();
const log = (...a: unknown[]) => console.log(...a);
const fmt = (raw: bigint) => (Number(raw) / 1e9).toLocaleString('en-US', { maximumFractionDigits: 9 });

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

async function tokenBalance(k: TestKey, tokenId: string): Promise<bigint> {
	return chain.balanceOf(await boxesOf(k)).tokens.get(tokenId) ?? 0n;
}

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

	// Testnet makes blocks every ~20-40 s, so tiers are 10 and 20 blocks and the
	// whole campaign runs ~45 blocks; mainnet tiers would be days to a year.
	const h = await chain.height();
	const params: CampaignParams = {
		network: 'testnet',
		litId,
		feeAddress: keys.fee.address,
		start: h,
		end: h + 45,
		grace: 5,
		slack: 60,
		tiers: [
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
		label: 'MewLock x Lithos, testnet dry run',
		params: { ...params, minLock: params.minLock.toString() },
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
		height: await chain.height()
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
	const { main, other, fee } = keys;
	const lit = d.params.litId;

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
		height: await chain.height()
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

	log(`\n4. Unlocks (position A unlocks at ${pa.unlockAt}; now ${await chain.height()})`);
	await chain.waitForHeight(pa.unlockAt);
	await expectRefused(
		'someone else unlocking A after its unlock height',
		buildUnlockTx({ deployment: d, position: pa, inputs: await boxesOf(other), height: await chain.height() }).toEIP12Object(),
		[other]
	);
	const litBefore = await tokenBalance(main, lit);
	await submit(
		'unlock A (owner)',
		buildUnlockTx({ deployment: d, position: pa, inputs: await boxesOf(main), height: await chain.height() }),
		[main]
	);
	const gained = (await tokenBalance(main, lit)) - litBefore;
	if (gained !== pa.principal + pa.reward) throw new Error(`FAIL: unlock paid ${gained}, expected ${pa.principal + pa.reward}`);
	log(`  owner got back ${fmt(gained)} tLIT = principal ${fmt(pa.principal)} + reward ${fmt(pa.reward)}`);

	const pb = (await positionsOf(d)).find((p) => p.owner === other.address)!;
	await chain.waitForHeight(pb.unlockAt);
	await submit(
		'unlock B (locked for other; other unlocks)',
		buildUnlockTx({ deployment: d, position: pb, inputs: await boxesOf(other), height: await chain.height() }),
		[other]
	);
	const pw = (await positionsOf(d)).find((p) => p.principal === 500_000_000n * UNIT)!;
	await chain.waitForHeight(pw.unlockAt);
	await submit(
		'unlock whale',
		buildUnlockTx({ deployment: d, position: pw, inputs: await boxesOf(main), height: await chain.height() }),
		[main]
	);

	const sweepAt = d.params.end + d.params.grace + 1;
	log(`\n5. Sweep (opens at block ${sweepAt}; now ${await chain.height()})`);
	await chain.waitForHeight(sweepAt + 1);
	const last = await campaignOf(d);
	const feeLitBefore = await tokenBalance(fee, lit);
	await submit(
		'sweep by a third party (other)',
		buildSweepTx({
			deployment: d,
			campaign: last,
			inputs: await boxesOf(other),
			changeAddress: other.address,
			height: await chain.height()
		}),
		[other]
	);
	const feeGot = (await tokenBalance(fee, lit)) - feeLitBefore;
	if (feeGot !== last.budget) throw new Error(`FAIL: fee address got ${feeGot}, expected ${last.budget}`);
	if ((await chain.unspentByTokenId(d.campaignNftId)).length !== 0) throw new Error('FAIL: campaign NFT survived');
	log(`  fee address received the leftover ${fmt(feeGot)} tLIT; NFT and markers burned`);
	log(`\nAll testnet checks passed. Rewards paid: A ${fmt(pa.reward)}, B ${fmt(pb.reward)}, whale ${fmt(pw.reward)} tLIT.`);
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

const commands: Record<string, () => Promise<void>> = { wallet, deploy, scenario, status };
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
