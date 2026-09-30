// Shared fixtures for the MewLock campaign contract tests: a mock chain with a
// deployed campaign, three users and a fee address, plus tamper helpers.
// A mode picks what is locked and what is paid: LIT, MEOW (a second token) or ERG.
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import type { ErgoUnsignedTransaction } from '@fleet-sdk/core';
import { OutputBuilder, TransactionBuilder } from '@fleet-sdk/core';
import { KeyedMockChainParty, MockChain, type NonKeyedMockChainParty } from '@fleet-sdk/mock-chain';
import { SBigInt } from '@fleet-sdk/serializer';
import { parseCampaignBox, parsePositionBox, type PositionState } from './boxes.ts';
import { compileCampaign, compilePosition } from './compile.ts';
import { type AssetInfo, type LithosDeployment, paramsOf, pinParams } from './deployment.ts';
import { initialVirtualWeight } from './math.ts';
import {
	type AssetId,
	CAMPAIGN_RESERVE,
	CAMPAIGN_VERSION,
	type CampaignParams,
	POSITION_DEPOSIT
} from './params.ts';
import { buildLockTx, TX_FEE } from './txs.ts';

export const LIT = 'c1980d829988229516430a47a5eca376060b6ce859616db0936e78ab25cb6de7';
export const MEOW = 'ee'.repeat(32);
export const NFT = 'aa'.repeat(32);
export const MARKER = 'bb'.repeat(32);
export const ERG = 1_000_000_000n;
export const LIT_UNIT = 1_000_000_000n; // 9 decimals
export const START = 1_000_000;
export const END = START + 30 * 720;
export const GRACE = 720;
export const BUDGET = 1_000_000n * LIT_UNIT;
export const MARKER_SUPPLY = 1_000_000_000n;
export const TIERS = [
	{ blocks: 21_600, boostBps: 10_000, label: '30 days' },
	{ blocks: 64_800, boostBps: 12_500, label: '90 days' },
	{ blocks: 129_600, boostBps: 15_000, label: '180 days' },
	{ blocks: 262_800, boostBps: 20_000, label: '1 year' }
];

export type Asset = 'LIT' | 'MEOW' | 'ERG';
export type Mode = { stake: Asset; reward: Asset };
export const MODES: Mode[] = [
	{ stake: 'LIT', reward: 'LIT' },
	{ stake: 'LIT', reward: 'MEOW' },
	{ stake: 'ERG', reward: 'LIT' },
	{ stake: 'LIT', reward: 'ERG' },
	{ stake: 'ERG', reward: 'ERG' }
];
export const idOf = (a: Asset): AssetId => (a === 'LIT' ? LIT : a === 'MEOW' ? MEOW : null);
const infoOf = (a: Asset): AssetInfo => ({ ticker: a, decimals: 9 });

export const positionTree = compilePosition('mainnet');

export type Ctx = {
	mode: Mode;
	chain: MockChain;
	d: LithosDeployment;
	alice: KeyedMockChainParty;
	bob: KeyedMockChainParty;
	mallory: KeyedMockChainParty;
	fee: KeyedMockChainParty;
	campaign: NonKeyedMockChainParty;
	positions: NonKeyedMockChainParty;
};

/** `contract` picks the campaign contract version (default: the one new deployments get). */
export function setup(mode: Mode = { stake: 'LIT', reward: 'LIT' }, contract = CAMPAIGN_VERSION): Ctx {
	const chain = new MockChain({ height: START + 10 });
	const alice = chain.newParty('alice');
	const bob = chain.newParty('bob');
	const mallory = chain.newParty('mallory');
	const fee = chain.newParty('fee');
	const params: CampaignParams = {
		network: 'mainnet',
		stakeId: idOf(mode.stake),
		rewardId: idOf(mode.reward),
		feeAddress: fee.address.encode(),
		start: START,
		end: END,
		grace: GRACE,
		slack: 60,
		tiers: TIERS,
		minLock: 10n * LIT_UNIT,
		deposit: POSITION_DEPOSIT,
		reserve: CAMPAIGN_RESERVE
	};
	const campaignTree = compileCampaign(params, positionTree, contract);
	const v0 = initialVirtualWeight(BUDGET, 5_000);
	const d: LithosDeployment = {
		network: 'mainnet',
		contract,
		label: 'mock',
		params: pinParams(params),
		assets: { stake: infoOf(mode.stake), reward: infoOf(mode.reward) },
		positionTree,
		campaignTree,
		campaignNftId: NFT,
		markerId: MARKER,
		genesisTxId: '',
		genesisHeight: START,
		initialBudget: BUDGET.toString(),
		initialV: v0.toString()
	};
	const campaign = chain.addParty(campaignTree, 'campaign') as unknown as NonKeyedMockChainParty;
	const tokens = [
		{ tokenId: NFT, amount: 1n },
		{ tokenId: MARKER, amount: MARKER_SUPPLY }
	];
	if (params.rewardId) tokens.push({ tokenId: params.rewardId, amount: BUDGET });
	campaign.addBalance(
		{ nanoergs: params.rewardId ? CAMPAIGN_RESERVE : CAMPAIGN_RESERVE + BUDGET, tokens },
		{ R4: SBigInt(v0).toHex() }
	);
	const positions = chain.addParty(positionTree, 'positions') as unknown as NonKeyedMockChainParty;
	for (const p of [alice, bob, mallory]) {
		p.addBalance({
			nanoergs: 1_000_000_000n * ERG,
			tokens: [
				{ tokenId: LIT, amount: 1_000_000_000n * LIT_UNIT },
				{ tokenId: MEOW, amount: 1_000_000_000n * LIT_UNIT }
			]
		});
	}
	fee.addBalance({ nanoergs: 10n * ERG });
	return { mode, chain, d, alice, bob, mallory, fee, campaign, positions };
}

export const state = (c: Ctx) => parseCampaignBox(c.campaign.utxos.toArray()[0], c.d);

export function lock(c: Ctx, who: KeyedMockChainParty, principal: bigint, tier: number, owner?: string) {
	return buildLockTx({
		deployment: c.d,
		campaign: state(c),
		inputs: who.utxos.toArray(),
		changeAddress: who.address.encode(),
		owner,
		principal,
		tier,
		height: c.chain.height
	});
}

export function positionsOf(c: Ctx): PositionState[] {
	return c.positions.utxos
		.toArray()
		.map((b) => parsePositionBox(b, c.d))
		.filter((p): p is PositionState => p !== null);
}

/** A party's balance of an asset (nanoERG for ERG). */
export function balanceOf(p: KeyedMockChainParty, a: Asset): bigint {
	if (a === 'ERG') return p.balance.nanoergs;
	return p.balance.tokens.find((t) => t.tokenId === idOf(a))?.amount ?? 0n;
}

export const run = (c: Ctx, tx: ErgoUnsignedTransaction | EIP12UnsignedTransaction, signers: KeyedMockChainParty[]) =>
	c.chain.execute(tx, { signers, throw: false });

/** Deep copy of the EIP-12 form so a test can tamper with it. */
export const tamper = (tx: ErgoUnsignedTransaction, edit: (t: EIP12UnsignedTransaction) => void) => {
	const t = structuredClone(tx.toEIP12Object());
	edit(t);
	return t;
};

export const add = (amount: string, delta: bigint) => (BigInt(amount) + delta).toString();

/** The attacker's change box (Fleet orders outputs as [...to, fee, change]). */
export const changeOf = (t: EIP12UnsignedTransaction, who: KeyedMockChainParty) => {
	const box = t.outputs.find((o) => o.ergoTree === who.ergoTree);
	if (!box) throw new Error(`no change box for ${who.name}`);
	return box;
};

export const SMALL_BUDGET = 400_000n * LIT_UNIT;

/**
 * Audit F-1 (LIT/LIT only): a second, smaller campaign with its own contract
 * (an earlier end) and the same fee address, both past end + grace, swept in
 * one transaction. The fee address gets only the larger budget and the
 * builder's change keeps the smaller one, unless `payBoth`.
 */
export function coSweep(c: Ctx, payBoth = false) {
	const tree = compileCampaign({ ...paramsOf(c.d), end: END - 10 }, positionTree, c.d.contract);
	const nft = 'a2'.repeat(32);
	const marker = 'b2'.repeat(32);
	const second = c.chain.addParty(tree, 'campaign 2');
	second.addBalance(
		{
			nanoergs: CAMPAIGN_RESERVE,
			tokens: [
				{ tokenId: nft, amount: 1n },
				{ tokenId: marker, amount: 1_000n },
				{ tokenId: LIT, amount: SMALL_BUDGET }
			]
		},
		{ R4: SBigInt(initialVirtualWeight(SMALL_BUDGET, 5_000)).toHex() }
	);
	c.chain.jumpTo(END + GRACE);
	const big = state(c);
	const small = second.utxos.toArray()[0];
	return new TransactionBuilder(c.chain.height)
		.from([big.box, small, ...c.mallory.utxos.toArray()])
		.configureSelector((s) => s.ensureInclusion([big.box.boxId, small.boxId]))
		.to(
			new OutputBuilder(payBoth ? 2n * CAMPAIGN_RESERVE : CAMPAIGN_RESERVE, c.fee.address.encode()).addTokens({
				tokenId: LIT,
				amount: big.budget + (payBoth ? SMALL_BUDGET : 0n)
			})
		)
		.burnTokens([
			{ tokenId: NFT, amount: 1n },
			{ tokenId: MARKER, amount: big.markersLeft },
			{ tokenId: nft, amount: 1n },
			{ tokenId: marker, amount: 1_000n }
		])
		.sendChangeTo(c.mallory.address.encode())
		.payFee(TX_FEE)
		.build();
}
