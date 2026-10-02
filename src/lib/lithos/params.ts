// Campaign parameters. Everything here is compiled into the campaign contract
// and can never change after deploy; a different value means a new campaign.
import { AddressType, Network as FleetNetwork } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { BLOCKS_PER_YEAR } from './math.ts';

export type Network = 'mainnet' | 'testnet';

export type Tier = { blocks: number; boostBps: number; label: string };

/** A token id, or null for ERG. */
export type AssetId = string | null;

export type CampaignParams = {
	network: Network;
	/** What users lock (A). */
	stakeId: AssetId;
	/** What the campaign pays (B). May be the same asset as A. */
	rewardId: AssetId;
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
	/** Smallest principal, raw units of A. */
	minLock: bigint;
	/** nanoERG each position carries besides any ERG it locks or earns; back to the owner at unlock. */
	deposit: bigint;
	/** nanoERG the campaign box keeps outside the budget (only meaningful when B is ERG). */
	reserve: bigint;
};

/**
 * The campaign contract new deployments get (contracts/campaign.es). v3 is Season 1
 * (campaign-v3.es), v2 the deployed test contract (campaign-v2.es); v1 was LIT-only.
 */
export const CAMPAIGN_VERSION = 4;

/** Extra blocks the UI adds to each lock so it stays valid while it waits for a block. */
export const UNLOCK_BUFFER = 20;

/** Longest allowed lock on mainnet: one year keeps positions far from the 4-year storage-rent age. */
export const MAX_LOCK_BLOCKS = BLOCKS_PER_YEAR;

/** Defaults for `deposit` and `reserve` (0.001 and 0.01 ERG). */
export const POSITION_DEPOSIT = 1_000_000n;
export const CAMPAIGN_RESERVE = 10_000_000n;

const HEX32 = /^[0-9a-f]{64}$/;

export function fleetNetwork(network: Network): FleetNetwork {
	return network === 'mainnet' ? FleetNetwork.Mainnet : FleetNetwork.Testnet;
}

export function validateParams(p: CampaignParams): void {
	const fail = (msg: string) => {
		throw new Error(`invalid campaign params: ${msg}`);
	};
	for (const [name, id] of [
		['stakeId', p.stakeId],
		['rewardId', p.rewardId]
	] as const) {
		if (id !== null && !HEX32.test(id)) fail(`${name} must be null (ERG) or a 32-byte hex token id`);
	}
	let fee: ErgoAddress;
	try {
		fee = ErgoAddress.fromBase58(p.feeAddress);
	} catch {
		return fail('feeAddress is not a valid address');
	}
	if (fee.network !== fleetNetwork(p.network)) fail('feeAddress is on the wrong network');
	// The sweep only checks that OUTPUTS(0) pays the fee address at least this
	// campaign's leftover. A contract there, if one of its own boxes is spent in
	// the same transaction, could accept that same output as its successor and
	// let the builder keep the leftover, so the fee address must be a wallet.
	if (fee.type !== AddressType.P2PK) fail('feeAddress must be a wallet (P2PK) address');
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
	if (p.deposit < 100_000n) fail('deposit must cover a box (>= 100000 nanoERG)');
	if (p.reserve < 1_000_000n) fail('reserve must cover the campaign box (>= 1000000 nanoERG)');
}
