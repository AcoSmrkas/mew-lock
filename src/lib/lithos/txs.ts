// Transaction builders for MewLock campaigns (lock asset A, earn asset B; each
// a token or ERG). They return Fleet unsigned transactions; call
// .toEIP12Object() to hand one to a wallet.
import { type Amount, type Box, first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	type ErgoUnsignedTransaction,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder
} from '@fleet-sdk/core';
import { SBigInt, SGroupElement, SInt, SLong } from '@fleet-sdk/serializer';
import { type CampaignState, type PositionState, positionContents } from './boxes.ts';
import type { LithosDeployment } from './deployment.ts';
import { type LockQuote, quoteLock } from './math.ts';
import { type AssetId, UNLOCK_BUFFER } from './params.ts';

export const TX_FEE = RECOMMENDED_MIN_FEE_VALUE;

type Inputs = Box<Amount>[];

function pkOf(address: string): Uint8Array {
	const pk = first(ErgoAddress.fromBase58(address).getPublicKeys());
	if (!pk) throw new Error(`${address} is not a P2PK address`);
	return pk;
}

/** EIP-4 mint of `amount` new tokens to `to`. */
export function buildMintTx(o: {
	height: number;
	inputs: Inputs;
	to: string;
	amount: bigint;
	name: string;
	description: string;
	decimals: number;
}): ErgoUnsignedTransaction {
	return new TransactionBuilder(o.height)
		.from(o.inputs)
		.to(
			new OutputBuilder(SAFE_MIN_BOX_VALUE, o.to).mintToken({
				amount: o.amount,
				name: o.name,
				description: o.description,
				decimals: o.decimals
			})
		)
		.sendChangeTo(o.to)
		.payFee(TX_FEE)
		.build();
}

/** A campaign box: NFT, markers and, when the reward is a token, the budget; ERG budgets ride in the value. */
function campaignOutput(o: {
	tree: string;
	nftId: string;
	markerId: string;
	markers: bigint;
	rewardId: AssetId;
	budget: bigint;
	reserve: bigint;
	v: bigint;
	/** nanoERG when the reward is a token (defaults to the reserve). */
	value?: bigint;
}) {
	const tokens = [
		{ tokenId: o.nftId, amount: 1n },
		{ tokenId: o.markerId, amount: o.markers }
	];
	if (o.rewardId !== null) tokens.push({ tokenId: o.rewardId, amount: o.budget });
	const value = o.rewardId === null ? o.reserve + o.budget : (o.value ?? o.reserve);
	return new OutputBuilder(value, o.tree).addTokens(tokens).setAdditionalRegisters({ R4: SBigInt(o.v).toHex() });
}

/** Creates the campaign box. `inputs` must hold the NFT, every marker and the starting budget. */
export function buildCampaignCreateTx(o: {
	height: number;
	inputs: Inputs;
	changeAddress: string;
	campaignTree: string;
	campaignNftId: string;
	markerId: string;
	markerSupply: bigint;
	rewardId: AssetId;
	reserve: bigint;
	budget: bigint;
	v0: bigint;
}): ErgoUnsignedTransaction {
	if (o.v0 <= 0n || o.budget <= 0n || o.markerSupply < 2n) throw new Error('bad genesis state');
	const campaign = campaignOutput({
		tree: o.campaignTree,
		nftId: o.campaignNftId,
		markerId: o.markerId,
		markers: o.markerSupply,
		rewardId: o.rewardId,
		budget: o.budget,
		reserve: o.reserve,
		v: o.v0
	});
	return new TransactionBuilder(o.height)
		.from(o.inputs)
		.to(campaign)
		.sendChangeTo(o.changeAddress)
		.payFee(TX_FEE)
		.build();
}

function successor(d: LithosDeployment, c: CampaignState, markers: bigint, budget: bigint, v: bigint) {
	return campaignOutput({
		tree: d.campaignTree,
		nftId: d.campaignNftId,
		markerId: d.markerId,
		markers,
		rewardId: d.params.rewardId,
		budget,
		reserve: BigInt(d.params.reserve),
		v,
		value: BigInt(c.box.value)
	});
}

export type LockPlan = { tx: ErgoUnsignedTransaction; quote: LockQuote; unlockAt: number };

/**
 * Lock `principal` (raw units of the staked asset) for tier `tier`. The reward
 * is the most the contract allows at the campaign's current state, fixed now
 * and paid out at unlock. `owner` defaults to `changeAddress` (lock-for when it
 * differs).
 */
export function buildLockTx(o: {
	deployment: LithosDeployment;
	campaign: CampaignState;
	inputs: Inputs;
	changeAddress: string;
	owner?: string;
	principal: bigint;
	tier: number;
	height: number;
	/** Blocks added so the lock stays valid while it waits for a block (default UNLOCK_BUFFER). */
	unlockBuffer?: number;
}): LockPlan {
	const d = o.deployment;
	const t = d.params.tiers[o.tier];
	if (!t) throw new Error(`no tier ${o.tier}`);
	const buffer = o.unlockBuffer ?? UNLOCK_BUFFER;
	if (!Number.isInteger(buffer) || buffer < 1 || buffer > d.params.slack) {
		throw new Error(`unlock buffer must be 1..${d.params.slack} blocks`);
	}
	if (o.principal < BigInt(d.params.minLock)) throw new Error('below the minimum lock');
	if (o.height + 1 < d.params.start) throw new Error('campaign has not started');
	if (o.height + 1 > d.params.end) throw new Error('campaign has ended');

	const quote = quoteLock(o.campaign.budget, o.campaign.v, o.principal, t.blocks, t.boostBps);
	const unlockAt = o.height + t.blocks + buffer;
	const holds = positionContents(d, o.principal, quote.reward);
	const position = new OutputBuilder(holds.nanoErg, d.positionTree)
		.addTokens([{ tokenId: d.markerId, amount: 1n }, ...holds.tokens.filter((x) => x.amount > 0n)])
		.setAdditionalRegisters({
			R4: SGroupElement(pkOf(o.owner ?? o.changeAddress)).toHex(),
			R5: SInt(unlockAt).toHex(),
			R6: SLong(o.principal).toHex(),
			R7: SLong(quote.reward).toHex(),
			R8: SInt(o.tier).toHex()
		});

	const tx = new TransactionBuilder(o.height)
		.from([o.campaign.box, ...o.inputs])
		.configureSelector((s) => s.ensureInclusion(o.campaign.box.boxId))
		.to([
			successor(d, o.campaign, o.campaign.markersLeft - 1n, quote.budgetAfter, quote.vAfter),
			position
		])
		.sendChangeTo(o.changeAddress)
		.payFee(TX_FEE)
		.build();
	return { tx, quote, unlockAt };
}

/**
 * Unlock a position: principal, reward and the deposit go to the owner and the
 * marker is burned. `inputs` must include at least one box from the owner's
 * address so Nautilus knows which key signs; it also pays the fee.
 */
export function buildUnlockTx(o: {
	deployment: LithosDeployment;
	position: PositionState;
	inputs: Inputs;
	height: number;
}): ErgoUnsignedTransaction {
	const ownerBox = o.inputs[0];
	if (!ownerBox) throw new Error('need at least one box from the owner address');
	if (o.height < o.position.unlockAt) throw new Error(`locked until block ${o.position.unlockAt}`);
	return new TransactionBuilder(o.height)
		.from([o.position.box, ...o.inputs])
		.configureSelector((s) => s.ensureInclusion([o.position.box.boxId, ownerBox.boxId]))
		.burnTokens({ tokenId: o.deployment.markerId, amount: 1n })
		.sendChangeTo(o.position.owner)
		.payFee(TX_FEE)
		.build();
}

/** Add `amount` (raw units of the reward asset) to the budget. Anyone can do it until the end. */
export function buildTopUpTx(o: {
	deployment: LithosDeployment;
	campaign: CampaignState;
	inputs: Inputs;
	changeAddress: string;
	amount: bigint;
	height: number;
}): ErgoUnsignedTransaction {
	if (o.amount <= 0n) throw new Error('top-up must be positive');
	if (o.height + 1 > o.deployment.params.end) throw new Error('campaign has ended');
	return new TransactionBuilder(o.height)
		.from([o.campaign.box, ...o.inputs])
		.configureSelector((s) => s.ensureInclusion(o.campaign.box.boxId))
		.to(
			successor(
				o.deployment,
				o.campaign,
				o.campaign.markersLeft,
				o.campaign.budget + o.amount,
				o.campaign.v
			)
		)
		.sendChangeTo(o.changeAddress)
		.payFee(TX_FEE)
		.build();
}

/**
 * After end + grace, send everything left in the campaign to the fee address
 * and burn the NFT and markers. Anyone can run it; `inputs` pay the fee.
 */
export function buildSweepTx(o: {
	deployment: LithosDeployment;
	campaign: CampaignState;
	inputs: Inputs;
	changeAddress: string;
	height: number;
}): ErgoUnsignedTransaction {
	const d = o.deployment;
	if (o.height + 1 <= d.params.end + d.params.grace) {
		throw new Error(`sweep opens after block ${d.params.end + d.params.grace}`);
	}
	const toFee = new OutputBuilder(BigInt(o.campaign.box.value), d.params.feeAddress);
	if (d.params.rewardId !== null && o.campaign.budget > 0n) {
		toFee.addTokens({ tokenId: d.params.rewardId, amount: o.campaign.budget });
	}
	return new TransactionBuilder(o.height)
		.from([o.campaign.box, ...o.inputs])
		.configureSelector((s) => s.ensureInclusion(o.campaign.box.boxId))
		.to(toFee)
		.burnTokens([
			{ tokenId: d.campaignNftId, amount: 1n },
			{ tokenId: d.markerId, amount: o.campaign.markersLeft }
		])
		.sendChangeTo(o.changeAddress)
		.payFee(TX_FEE)
		.build();
}
