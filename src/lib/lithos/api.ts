// Chain reads for the Lithos Lock page, through the explorer API of the selected
// network (on mainnet, chain-gateway: see api-explorer/chain.ts). Everything
// returned is authenticated against the deployment by boxes.ts before the page
// uses it.
import type { Box } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { parse as parseBig } from 'json-bigint-native';
import { type CampaignState, parseCampaignBox, parsePositionBox, type PositionState } from './boxes.ts';
import type { LithosDeployment } from './deployment.ts';
import type { NetworkConfig } from './network.ts';
import { fleetNetwork } from './params.ts';
import { chainFetch } from '../api-explorer/chain.ts';

export async function getJson(url: string): Promise<any> {
	// No custom headers: they trigger a CORS preflight some of our APIs reject.
	const res = await chainFetch(url, { cache: 'no-store' });
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
 * Every open, genuine position of the campaign. A box at the position address
 * holding a marker and what its registers declare is not proof enough: the
 * contract does not force the marker's burn at unlock (the app burns it), so
 * whoever keeps one can dress up a look-alike. A genuine position is the
 * second output of a lock of this campaign, so that is what is checked.
 */
export async function getPositions(net: NetworkConfig, d: LithosDeployment): Promise<PositionState[]> {
	const positions: PositionState[] = [];
	const limit = 100;
	for (let offset = 0; ; offset += limit) {
		const page = await getJson(
			`${net.explorerApi}/boxes/unspent/byTokenId/${d.markerId}?limit=${limit}&offset=${offset}`
		);
		for (const raw of page.items as any[]) {
			const p = parsePositionBox(normalizeBox(raw), d);
			if (p) positions.push(p);
		}
		if ((page.items as any[]).length < limit) break;
	}

	let fromHistory: Map<string, boolean>;
	try {
		fromHistory = locksIn(await campaignHistory(net, d));
	} catch {
		return positions; // Without the history, show everything rather than hide real locks.
	}
	const genuine: PositionState[] = [];
	for (const p of positions) {
		if (p.box.index !== 1) continue;
		const txId = p.box.transactionId;
		let ok = fromHistory.get(txId) ?? checkedTxs.get(txId);
		if (ok === undefined) {
			// Not in the history we read: some other transaction, or a lock newer
			// than it (another backend may lag a block). Ask the transaction itself.
			try {
				ok = await isLockTx(net, d, txId);
				checkedTxs.set(txId, ok);
			} catch {
				ok = true; // A failed read must not hide a real lock; it is checked again next time.
			}
		}
		if (ok) genuine.push(p);
	}
	return genuine;
}

type HistoryBox = { transactionId: string; spentTransactionId: string | null; markers: bigint };

// Per campaign NFT: how many explorer items were read, and the campaign boxes among them.
const histories = new Map<string, { seen: number; boxes: Map<string, HistoryBox> }>();
// Transactions already checked one by one; a transaction never changes.
const checkedTxs = new Map<string, boolean>();

const markersIn = (raw: any, d: LithosDeployment): bigint =>
	BigInt((raw?.assets ?? []).find((a: any) => a.tokenId === d.markerId)?.amount ?? 0);

const isCampaignBox = (raw: any, d: LithosDeployment) =>
	raw?.ergoTree === d.campaignTree && raw.assets?.[0]?.tokenId === d.campaignNftId;

/** Every box that ever held the campaign NFT at the campaign contract. */
async function campaignHistory(net: NetworkConfig, d: LithosDeployment): Promise<HistoryBox[]> {
	const h = histories.get(d.campaignNftId) ?? { seen: 0, boxes: new Map<string, HistoryBox>() };
	const limit = 100;
	// Listed oldest first, so only the tail is new; the last box read may have been spent since.
	for (let offset = Math.max(0, h.seen - 1); ; offset += limit) {
		const items = (
			await getJson(`${net.explorerApi}/boxes/byTokenId/${d.campaignNftId}?limit=${limit}&offset=${offset}`)
		).items as any[];
		for (const raw of items) {
			if (!isCampaignBox(raw, d)) continue;
			h.boxes.set(raw.boxId, {
				transactionId: raw.transactionId,
				spentTransactionId: raw.spentTransactionId ?? null,
				markers: markersIn(raw, d)
			});
		}
		h.seen = Math.max(h.seen, offset + items.length);
		if (items.length < limit) break;
	}
	histories.set(d.campaignNftId, h);
	return [...h.boxes.values()];
}

/**
 * Every campaign transaction the history can place, and whether it was a lock:
 * its new campaign box holds one marker fewer than the one it spent (a top-up
 * holds the same number).
 */
function locksIn(history: HistoryBox[]): Map<string, boolean> {
	const createdBy = new Map(history.map((b) => [b.transactionId, b]));
	const verdicts = new Map<string, boolean>();
	for (const b of history) {
		const next = b.spentTransactionId ? createdBy.get(b.spentTransactionId) : undefined;
		if (next) verdicts.set(next.transactionId, next.markers === b.markers - 1n);
	}
	return verdicts;
}

/** The same test on one transaction: it spends the campaign and releases exactly one marker. */
async function isLockTx(net: NetworkConfig, d: LithosDeployment, txId: string): Promise<boolean> {
	const tx = await getJson(`${net.explorerApi}/transactions/${txId}`);
	const before = (tx.inputs as any[])?.find((b) => isCampaignBox(b, d));
	const after = tx.outputs?.[0];
	return !!before && isCampaignBox(after, d) && markersIn(after, d) === markersIn(before, d) - 1n;
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
