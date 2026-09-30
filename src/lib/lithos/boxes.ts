// Parse and authenticate campaign and position boxes against a deployment.
// Never trust a box because of its address alone: anyone can create a box at
// a contract address with arbitrary tokens and registers.
import type { Amount, Box } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { hex } from '@fleet-sdk/crypto';
import { decode } from '@fleet-sdk/serializer';
import type { LithosDeployment } from './deployment.ts';
import { type AssetId, fleetNetwork } from './params.ts';

export type CampaignState = {
	box: Box<Amount>;
	/** Budget left, raw units of the reward asset. */
	budget: bigint;
	markersLeft: bigint;
	v: bigint;
};

export type PositionState = {
	box: Box<Amount>;
	ownerPk: string;
	owner: string;
	unlockAt: number;
	/** Raw units of the staked asset. */
	principal: bigint;
	/** Raw units of the reward asset. */
	reward: bigint;
	tier: number;
};

function register(box: Box<Amount>, id: string, type: string): unknown {
	const raw = (box.additionalRegisters as Record<string, string | undefined>)[id];
	const c = raw ? decode(raw) : undefined;
	if (!c || c.type.toString() !== type) return undefined;
	return c.data;
}

/** Raw amount of token `id` in a box; null (ERG) never matches a token. */
function tokenAmount(box: Box<Amount>, id: AssetId): bigint {
	if (id === null) return 0n;
	return box.assets.filter((a) => a.tokenId === id).reduce((s, a) => s + BigInt(a.amount), 0n);
}

/** Throws unless `box` is this deployment's genuine campaign box. */
export function parseCampaignBox(box: Box<Amount>, d: LithosDeployment): CampaignState {
	const fail = (why: string): never => {
		throw new Error(`not the campaign box: ${why}`);
	};
	const rewardId = d.params.rewardId;
	if (box.ergoTree !== d.campaignTree) fail('wrong contract');
	const [nft, markers, budgetToken] = box.assets;
	if (box.assets.length !== (rewardId === null ? 2 : 3)) fail('unexpected tokens');
	if (nft.tokenId !== d.campaignNftId || BigInt(nft.amount) !== 1n) fail('missing campaign NFT');
	if (markers.tokenId !== d.markerId) fail('wrong marker token');
	if (rewardId !== null && budgetToken.tokenId !== rewardId) fail('wrong budget token');
	const v = register(box, 'R4', 'SBigInt');
	if (typeof v !== 'bigint' || v <= 0n) fail('bad R4');
	const budget =
		rewardId === null ? BigInt(box.value) - BigInt(d.params.reserve) : BigInt(budgetToken.amount);
	return { box, budget, markersLeft: BigInt(markers.amount), v: v as bigint };
}

/**
 * What a position must hold for a given principal and reward, exactly as the
 * campaign contract checks it: nanoERG, plus token amounts (marker excluded).
 */
export function positionContents(d: LithosDeployment, principal: bigint, reward: bigint) {
	const { stakeId, rewardId } = d.params;
	const same = stakeId === rewardId;
	const tokens: { tokenId: string; amount: bigint }[] = [];
	if (stakeId !== null) tokens.push({ tokenId: stakeId, amount: principal + (same ? reward : 0n) });
	// A reward that rounds to zero has no token slot (Ergo disallows a zero
	// amount). This matches the v2 campaign contract. Existing v1 campaigns
	// never create this edge case because they reject it on-chain.
	if (rewardId !== null && !same && reward > 0n) tokens.push({ tokenId: rewardId, amount: reward });
	const nanoErg =
		BigInt(d.params.deposit) + (stakeId === null ? principal : 0n) + (rewardId === null ? reward : 0n);
	return { nanoErg, tokens };
}

/** The position, or null if `box` is not a genuine position of this deployment. */
export function parsePositionBox(box: Box<Amount>, d: LithosDeployment): PositionState | null {
	if (box.ergoTree !== d.positionTree) return null;
	const [marker] = box.assets;
	if (!marker || marker.tokenId !== d.markerId || BigInt(marker.amount) !== 1n) return null;
	const ownerPk = register(box, 'R4', 'SGroupElement');
	const unlockAt = register(box, 'R5', 'SInt');
	const principal = register(box, 'R6', 'SLong');
	const reward = register(box, 'R7', 'SLong');
	const tier = register(box, 'R8', 'SInt');
	if (!(ownerPk instanceof Uint8Array) || typeof unlockAt !== 'number') return null;
	if (typeof principal !== 'bigint' || typeof reward !== 'bigint' || typeof tier !== 'number') return null;

	// The box must actually hold what its registers claim.
	const want = positionContents(d, principal, reward);
	if (BigInt(box.value) !== want.nanoErg) return null;
	if (box.assets.length !== 1 + want.tokens.length) return null;
	for (const t of want.tokens) if (tokenAmount(box, t.tokenId) !== t.amount) return null;

	const network = fleetNetwork(d.network);
	return {
		box,
		ownerPk: hex.encode(ownerPk),
		owner: ErgoAddress.fromPublicKey(ownerPk, network).encode(network),
		unlockAt,
		principal,
		reward,
		tier
	};
}
