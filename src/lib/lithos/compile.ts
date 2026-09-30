// Compiles the MewLock x Lithos contracts. Used by tests and the deploy
// scripts only: the app reads the pinned trees from a deployment file, so the
// ErgoScript compiler never ships to the browser.
import { compile } from '@fleet-sdk/compiler';
import { ErgoAddress } from '@fleet-sdk/core';
import { hex } from '@fleet-sdk/crypto';
import { SByte, SColl, SInt, SLong } from '@fleet-sdk/serializer';
import campaignSource from './contracts/campaign.es?raw';
import positionSource from './contracts/position.es?raw';
import { type CampaignParams, type Network, validateParams } from './params.ts';

// ErgoTree v1 (header 0x19): Nautilus (sigma-rust 0.28) and the ErgoPay
// Android wallet cannot handle v3 trees, which is what blocks Lithos's own
// resize/claim/join flows in our UIs.
const TREE_VERSION = 1;

export function compilePosition(network: Network): string {
	return compile(positionSource, { version: TREE_VERSION, network }).toHex();
}

export function compileCampaign(params: CampaignParams, positionTree: string): string {
	validateParams(params);
	const feeTree = ErgoAddress.fromBase58(params.feeAddress).ergoTree;
	return compile(campaignSource, {
		version: TREE_VERSION,
		network: params.network,
		map: {
			_litId: SColl(SByte, hex.decode(params.litId)),
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
			_minLock: SLong(params.minLock)
		}
	}).toHex();
}
