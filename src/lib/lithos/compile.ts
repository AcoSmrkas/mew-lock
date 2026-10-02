// Compiles the MewLock campaign contracts. Used by tests, the testnet runner
// and the deploy page (as a lazy chunk): the lock page reads the pinned trees
// from a deployment file and never loads the ErgoScript compiler.
import { compile } from '@fleet-sdk/compiler';
import { ErgoAddress } from '@fleet-sdk/core';
import { hex } from '@fleet-sdk/crypto';
import { SByte, SColl, SInt, SLong } from '@fleet-sdk/serializer';
import campaignV2Source from './contracts/campaign-v2.es?raw';
import campaignV3Source from './contracts/campaign-v3.es?raw';
import campaignSource from './contracts/campaign.es?raw';
import positionSource from './contracts/position.es?raw';
import { type AssetId, CAMPAIGN_VERSION, type CampaignParams, type Network, validateParams } from './params.ts';

// ErgoTree v1 (header 0x19): Nautilus (sigma-rust 0.28) and the ErgoPay
// Android wallet cannot handle v3 trees, which is what blocks Lithos's own
// resize/claim/join flows in our UIs.
const TREE_VERSION = 1;

// Every campaign contract a pinned deployment may use. v2 (the mainnet test) and
// v3 (Season 1) are kept only so the campaigns deployed with them recompile.
const CAMPAIGN_SOURCES: Record<number, string> = { 2: campaignV2Source, 3: campaignV3Source, 4: campaignSource };

/** An asset id as contract bytes: the token id, or empty for ERG. */
const assetBytes = (id: AssetId) => SColl(SByte, id === null ? new Uint8Array() : hex.decode(id));

export function compilePosition(network: Network): string {
	return compile(positionSource, { version: TREE_VERSION, network }).toHex();
}

export function compileCampaign(
	params: CampaignParams,
	positionTree: string,
	version = CAMPAIGN_VERSION
): string {
	const source = CAMPAIGN_SOURCES[version];
	if (!source) throw new Error(`no campaign contract v${version}`);
	validateParams(params);
	const feeTree = ErgoAddress.fromBase58(params.feeAddress).ergoTree;
	return compile(source, {
		version: TREE_VERSION,
		network: params.network,
		map: {
			_stakeId: assetBytes(params.stakeId),
			_rewardId: assetBytes(params.rewardId),
			_positionTree: SColl(SByte, hex.decode(positionTree)),
			_feeTree: SColl(SByte, hex.decode(feeTree)),
			_start: SInt(params.start),
			_end: SInt(params.end),
			_grace: SInt(params.grace),
			_slack: SInt(params.slack),
			_tierBlocks: SColl(
				SInt,
				params.tiers.map((t) => t.blocks)
			),
			_tierBoost: SColl(
				SLong,
				params.tiers.map((t) => BigInt(t.boostBps))
			),
			_minLock: SLong(params.minLock),
			_deposit: SLong(params.deposit),
			_reserve: SLong(params.reserve)
		}
	}).toHex();
}
