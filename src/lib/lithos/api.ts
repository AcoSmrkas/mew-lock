// Chain reads for the Lithos Lock page, through the public explorer API of the
// selected network. Everything returned is authenticated against the
// deployment by boxes.ts before the page uses it.
import type { Box } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { parse as parseBig } from 'json-bigint-native';
import { type CampaignState, parseCampaignBox, parsePositionBox, type PositionState } from './boxes.ts';
import type { LithosDeployment } from './deployment.ts';
import type { NetworkConfig } from './network.ts';
import { fleetNetwork } from './params.ts';

export async function getJson(url: string): Promise<any> {
	// No custom headers: they trigger a CORS preflight some of our APIs reject.
	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	// Token amounts go past 2^53, so never JSON.parse chain data directly.
	return parseBig(await res.text());
}

/** Explorer, node or wallet box JSON -> Box<bigint> with hex registers. */
export function normalizeBox(raw: any): Box<bigint> {
	return {
		boxId: raw.boxId,
		transactionId: raw.transactionId,
		index: Number(raw.index),
		value: BigInt(raw.value),
		ergoTree: raw.ergoTree,
		creationHeight: Number(raw.creationHeight),
		assets: (raw.assets ?? []).map((a: any) => ({ tokenId: a.tokenId, amount: BigInt(a.amount) })),
		additionalRegisters: Object.fromEntries(
			Object.entries(raw.additionalRegisters ?? {}).map(([k, v]: [string, any]) => [
				k,
				typeof v === 'string' ? v : v.serializedValue
			])
		)
	};
}

export async function getHeight(net: NetworkConfig): Promise<number> {
	const info = await getJson(`${net.explorerApi}/info`);
	return Number(info.height);
}

export function campaignAddress(d: LithosDeployment): string {
	const network = fleetNetwork(d.network);
	return ErgoAddress.fromErgoTree(d.campaignTree, network).encode(network);
}

/**
 * The campaign as a new lock should see it: the confirmed box, then followed
 * through unconfirmed spends so we build on the newest state rather than
 * double-spend a box someone else's lock already consumed. The mempool view is
 * best effort; if it is stale the wallet rejects the tx and the page re-quotes.
 */
export async function getCampaign(net: NetworkConfig, d: LithosDeployment): Promise<CampaignState> {
	const confirmed = ((await getJson(`${net.explorerApi}/boxes/unspent/byTokenId/${d.campaignNftId}`)).items as any[])
		.map(normalizeBox)
		.filter((b) => b.ergoTree === d.campaignTree);
	let box = confirmed[0];
	if (!box) throw new Error('The campaign has ended and been swept.');

	try {
		const pool = ((await getJson(`${net.explorerApi}/mempool/transactions/byAddress/${campaignAddress(d)}`)).items ??
			[]) as any[];
		for (let hops = 0; hops < pool.length; hops++) {
			const spend = pool.find((tx) => tx.inputs?.some((i: any) => i.boxId === box.boxId));
			const next = spend?.outputs?.find(
				(o: any) => o.ergoTree === d.campaignTree && o.assets?.[0]?.tokenId === d.campaignNftId
			);
			if (!next) break;
			box = normalizeBox({ ...next, transactionId: spend.id });
		}
	} catch {
		// Fall back to the confirmed box.
	}
	return parseCampaignBox(box, d);
}

/**
 * A marker by itself is not provenance: after an unlock a marker can be held
 * by anyone, who could send a look-alike box to the position tree. A genuine
 * position is output 1 of a transaction that spent this campaign's NFT box.
 */
async function wasCreatedByCampaign(net: NetworkConfig, d: LithosDeployment, position: PositionState) {
	if (position.box.index !== 1 || !position.box.transactionId) return false;
	try {
		const tx = await getJson(`${net.explorerApi}/transactions/${position.box.transactionId}`);
		return (tx.inputs ?? []).some(
			(input: any) =>
				input.ergoTree === d.campaignTree &&
				(input.assets ?? []).some(
					(asset: any) => asset.tokenId === d.campaignNftId && BigInt(asset.amount) === 1n
				)
		);
	} catch {
		// Fail closed. The next refresh can show the position once the explorer
		// exposes its creation transaction.
		return false;
	}
}

/** Every open, genuine position of the campaign, authenticated by provenance. */
export async function getPositions(net: NetworkConfig, d: LithosDeployment): Promise<PositionState[]> {
	const candidates: PositionState[] = [];
	const limit = 100;
	for (let offset = 0; ; offset += limit) {
		const page = await getJson(
			`${net.explorerApi}/boxes/unspent/byTokenId/${d.markerId}?limit=${limit}&offset=${offset}`
		);
		for (const raw of page.items as any[]) {
			const p = parsePositionBox(normalizeBox(raw), d);
			if (p) candidates.push(p);
		}
		if ((page.items as any[]).length < limit) break;
	}
	const proven = await Promise.all(
		candidates.map(async (position) => ((await wasCreatedByCampaign(net, d, position)) ? position : null))
	);
	return proven.filter((position): position is PositionState => position !== null);
}

export type CampaignStats = {
	totalLocked: bigint;
	rewardsCommitted: bigint;
	lockers: number;
	positions: number;
};

export function statsOf(positions: PositionState[]): CampaignStats {
	return {
		totalLocked: positions.reduce((s, p) => s + p.principal, 0n),
		rewardsCommitted: positions.reduce((s, p) => s + p.reward, 0n),
		lockers: new Set(positions.map((p) => p.owner)).size,
		positions: positions.length
	};
}

/** Sum of one token across boxes. */
export function tokenTotal(boxes: Box<bigint>[], tokenId: string): bigint {
	let total = 0n;
	for (const b of boxes) for (const a of b.assets) if (a.tokenId === tokenId) total += BigInt(a.amount);
	return total;
}
