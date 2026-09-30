// Shared fixtures for the MewLock x Lithos contract tests: a mock chain with a
// deployed campaign, three users and a fee address, plus tamper helpers.
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import type { ErgoUnsignedTransaction } from '@fleet-sdk/core';
import { KeyedMockChainParty, MockChain, type NonKeyedMockChainParty } from '@fleet-sdk/mock-chain';
import { SBigInt } from '@fleet-sdk/serializer';
import { parseCampaignBox, parsePositionBox, type PositionState } from './boxes.ts';
import { compileCampaign, compilePosition } from './compile.ts';
import type { LithosDeployment } from './deployment.ts';
import { initialVirtualWeight } from './math.ts';
import type { CampaignParams } from './params.ts';
import { buildLockTx, CAMPAIGN_BOX_VALUE } from './txs.ts';

export const LIT = 'c1980d829988229516430a47a5eca376060b6ce859616db0936e78ab25cb6de7';
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

export const positionTree = compilePosition('mainnet');

export type Ctx = {
	chain: MockChain;
	d: LithosDeployment;
	alice: KeyedMockChainParty;
	bob: KeyedMockChainParty;
	mallory: KeyedMockChainParty;
	fee: KeyedMockChainParty;
	campaign: NonKeyedMockChainParty;
	positions: NonKeyedMockChainParty;
};

export function setup(): Ctx {
	const chain = new MockChain({ height: START + 10 });
	const alice = chain.newParty('alice');
	const bob = chain.newParty('bob');
	const mallory = chain.newParty('mallory');
	const fee = chain.newParty('fee');
	const params: CampaignParams = {
		network: 'mainnet',
		litId: LIT,
		feeAddress: fee.address.encode(),
		start: START,
		end: END,
		grace: GRACE,
		slack: 60,
		tiers: TIERS,
		minLock: 10n * LIT_UNIT
	};
	const campaignTree = compileCampaign(params, positionTree);
	const v0 = initialVirtualWeight(BUDGET, 5_000);
	const d: LithosDeployment = {
		network: 'mainnet',
		label: 'mock',
		params: { ...params, minLock: params.minLock.toString() },
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
	campaign.addBalance(
		{
			nanoergs: CAMPAIGN_BOX_VALUE,
			tokens: [
				{ tokenId: NFT, amount: 1n },
				{ tokenId: MARKER, amount: MARKER_SUPPLY },
				{ tokenId: LIT, amount: BUDGET }
			]
		},
		{ R4: SBigInt(v0).toHex() }
	);
	const positions = chain.addParty(positionTree, 'positions') as unknown as NonKeyedMockChainParty;
	for (const p of [alice, bob, mallory]) {
		p.addBalance({ nanoergs: 100n * ERG, tokens: [{ tokenId: LIT, amount: 1_000_000_000n * LIT_UNIT }] });
	}
	fee.addBalance({ nanoergs: 10n * ERG });
	return { chain, d, alice, bob, mallory, fee, campaign, positions };
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

