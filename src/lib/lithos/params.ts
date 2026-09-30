// Campaign parameters. Everything here is compiled into the campaign contract
// and can never change after deploy; a different value means a new campaign.
import { Network as FleetNetwork } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { BLOCKS_PER_YEAR } from './math.ts';

export type Network = 'mainnet' | 'testnet';

export type Tier = { blocks: number; boostBps: number; label: string };

export type CampaignParams = {
	network: Network;
	/** Token that is locked and paid out (LIT on mainnet). */
	litId: string;
	/** Where leftover budget goes after end + grace (the Mew fee address). */
	feeAddress: string;
	/** Locks accepted while start <= HEIGHT <= end. */
	start: number;
	end: number;
	/** Blocks after `end` before anyone can sweep the leftover. */
	grace: number;
	/** Most blocks a position may add on top of its tier length. */
	slack: number;
	tiers: Tier[];
	/** Smallest principal, raw token units. */
	minLock: bigint;
};

/** Extra blocks the UI adds to each lock so it stays valid while it waits for a block. */
export const UNLOCK_BUFFER = 20;

/** Longest allowed lock on mainnet: one year keeps positions far from the 4-year storage-rent age. */
export const MAX_LOCK_BLOCKS = BLOCKS_PER_YEAR;

const HEX32 = /^[0-9a-f]{64}$/;

export function fleetNetwork(network: Network): FleetNetwork {
	return network === 'mainnet' ? FleetNetwork.Mainnet : FleetNetwork.Testnet;
}

export function validateParams(p: CampaignParams): void {
	const fail = (msg: string) => {
		throw new Error(`invalid campaign params: ${msg}`);
	};
	if (!HEX32.test(p.litId)) fail('litId must be a 32-byte hex token id');
	let fee: ErgoAddress;
	try {
		fee = ErgoAddress.fromBase58(p.feeAddress);
	} catch {
		return fail('feeAddress is not a valid address');
	}
	if (fee.network !== fleetNetwork(p.network)) fail('feeAddress is on the wrong network');
	if (!Number.isInteger(p.start) || !Number.isInteger(p.end) || p.start < 0 || p.end <= p.start)
		fail('need 0 <= start < end');
	if (!Number.isInteger(p.grace) || p.grace < 0) fail('grace must be >= 0');
	if (!Number.isInteger(p.slack) || p.slack < UNLOCK_BUFFER) fail(`slack must be >= ${UNLOCK_BUFFER}`);
	if (p.tiers.length === 0) fail('need at least one tier');
	for (const t of p.tiers) {
		if (!Number.isInteger(t.blocks) || t.blocks <= 0) fail('tier blocks must be positive integers');
		if (p.network === 'mainnet' && t.blocks > MAX_LOCK_BLOCKS) fail('mainnet tiers are capped at one year');
		if (!Number.isInteger(t.boostBps) || t.boostBps <= 0) fail('tier boost must be a positive integer (bps)');
	}
	if (p.minLock <= 0n) fail('minLock must be positive');
}
