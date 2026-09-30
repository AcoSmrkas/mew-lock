// Parse and authenticate campaign and position boxes against a deployment.
// Never trust a box because of its address alone: anyone can create a box at
// a contract address with arbitrary tokens and registers.
import type { Amount, Box } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { hex } from '@fleet-sdk/crypto';
import { decode } from '@fleet-sdk/serializer';
import type { LithosDeployment } from './deployment.ts';
import { fleetNetwork } from './params.ts';

export type CampaignState = {
	box: Box<Amount>;
	budget: bigint;
	markersLeft: bigint;
	v: bigint;
};

export type PositionState = {
	box: Box<Amount>;
	ownerPk: string;
	owner: string;
	unlockAt: number;
	principal: bigint;
	reward: bigint;
	tier: number;
	/** LIT actually in the box (principal + reward for a genuine position). */
	locked: bigint;
};

function register(box: Box<Amount>, id: string, type: string): unknown {
	const raw = (box.additionalRegisters as Record<string, string | undefined>)[id];
	const c = raw ? decode(raw) : undefined;
	if (!c || c.type.toString() !== type) return undefined;
	return c.data;
}

/** Throws unless `box` is this deployment's genuine campaign box. */
export function parseCampaignBox(box: Box<Amount>, d: LithosDeployment): CampaignState {
	const fail = (why: string): never => {
		throw new Error(`not the campaign box: ${why}`);
	};
	if (box.ergoTree !== d.campaignTree) fail('wrong contract');
	const [nft, markers, lit] = box.assets;
	if (box.assets.length !== 3) fail('expected exactly 3 tokens');
	if (nft.tokenId !== d.campaignNftId || BigInt(nft.amount) !== 1n) fail('missing campaign NFT');
	if (markers.tokenId !== d.markerId) fail('wrong marker token');
	if (lit.tokenId !== d.params.litId) fail('wrong budget token');
	const v = register(box, 'R4', 'SBigInt');
	if (typeof v !== 'bigint' || v <= 0n) fail('bad R4');
	return { box, budget: BigInt(lit.amount), markersLeft: BigInt(markers.amount), v: v as bigint };
}

/** The position, or null if `box` is not a genuine position of this deployment. */
export function parsePositionBox(box: Box<Amount>, d: LithosDeployment): PositionState | null {
	if (box.ergoTree !== d.positionTree || box.assets.length !== 2) return null;
	const [marker, lit] = box.assets;
	if (marker.tokenId !== d.markerId || BigInt(marker.amount) !== 1n) return null;
	if (lit.tokenId !== d.params.litId) return null;
	const ownerPk = register(box, 'R4', 'SGroupElement');
	const unlockAt = register(box, 'R5', 'SInt');
	const principal = register(box, 'R6', 'SLong');
	const reward = register(box, 'R7', 'SLong');
	const tier = register(box, 'R8', 'SInt');
	if (!(ownerPk instanceof Uint8Array) || typeof unlockAt !== 'number') return null;
	if (typeof principal !== 'bigint' || typeof reward !== 'bigint' || typeof tier !== 'number') return null;
	return {
		box,
		ownerPk: hex.encode(ownerPk),
		owner: ErgoAddress.fromPublicKey(ownerPk, fleetNetwork(d.network)).encode(fleetNetwork(d.network)),
		unlockAt,
		principal,
		reward,
		tier,
		locked: BigInt(lit.amount)
	};
}
