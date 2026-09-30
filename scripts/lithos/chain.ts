// Minimal Ergo TESTNET client for the Lithos lock runner: public node REST +
// sigma-rust (ergo-lib-wasm-nodejs 0.28, the same prover Nautilus ships) for
// signing, so every transaction here also proves the contracts reduce under
// the wallet-side interpreter, not just the node's.
import * as wasm from 'ergo-lib-wasm-nodejs';
import { parse as parseBig } from 'json-bigint-native';
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import type { ErgoHDKey } from '@fleet-sdk/wallet';

// Public testnet nodes found synced on 2026-09-30. The first has extra
// indexing (address/token lookups); the second is a broadcast fallback.
export const NODES = ['http://176.9.15.237:9052', 'http://128.253.41.110:9052'];
const INDEXED_NODE = NODES[0];

export type ChainBox = {
	boxId: string;
	transactionId: string;
	index: number;
	value: bigint;
	ergoTree: string;
	creationHeight: number;
	assets: { tokenId: string; amount: bigint }[];
	additionalRegisters: Record<string, string>;
};

async function request(url: string, init?: RequestInit): Promise<any> {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
	const text = await res.text();
	if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 400)}`);
	// Token amounts go past 2^53, so never JSON.parse node output directly.
	return parseBig(text);
}

function toChainBox(raw: any): ChainBox {
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

export async function height(): Promise<number> {
	const info = await request(`${INDEXED_NODE}/info`);
	return Number(info.fullHeight);
}

export async function unspentByAddress(address: string): Promise<ChainBox[]> {
	const items = await request(
		`${INDEXED_NODE}/blockchain/box/unspent/byAddress?offset=0&limit=200&includeUnconfirmed=false&excludeMempoolSpent=true`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(address) }
	);
	return (items as any[]).map(toChainBox);
}

export async function unspentByTokenId(tokenId: string): Promise<ChainBox[]> {
	const items = await request(
		`${INDEXED_NODE}/blockchain/box/unspent/byTokenId/${tokenId}?offset=0&limit=200&includeUnconfirmed=false&excludeMempoolSpent=true`
	);
	return (items as any[]).map(toChainBox);
}

/** Box from the UTXO set, or null once it is spent or before it confirms. */
export async function unspentBox(boxId: string): Promise<ChainBox | null> {
	try {
		return toChainBox(await request(`${INDEXED_NODE}/utxo/byId/${boxId}`));
	} catch (e) {
		if (String(e).startsWith('Error: 404')) return null;
		throw e;
	}
}

export function balanceOf(boxes: ChainBox[]): { nanoErg: bigint; tokens: Map<string, bigint> } {
	const tokens = new Map<string, bigint>();
	let nanoErg = 0n;
	for (const b of boxes) {
		nanoErg += b.value;
		for (const a of b.assets) tokens.set(a.tokenId, (tokens.get(a.tokenId) ?? 0n) + a.amount);
	}
	return { nanoErg, tokens };
}

async function stateContext(): Promise<wasm.ErgoStateContext> {
	const headers = (await request(`${INDEXED_NODE}/blocks/lastHeaders/10`)) as any[];
	// Newest first, as the explorer-based signer in Crooks-bot does. Our
	// contracts only read HEIGHT, which comes from the pre-header.
	headers.sort((a, b) => Number(b.height) - Number(a.height));
	const blockHeaders = wasm.BlockHeaders.from_json(
		headers.map((h) => JSON.parse(JSON.stringify(h, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))))
	);
	const preHeader = wasm.PreHeader.from_block_header(blockHeaders.get(0));
	return new wasm.ErgoStateContext(preHeader, blockHeaders, wasm.Parameters.default_parameters());
}

/** Sign with sigma-rust. Throws if any input's script does not reduce to something the keys can prove. */
export async function sign(tx: EIP12UnsignedTransaction, keys: ErgoHDKey[]): Promise<wasm.Transaction> {
	const secrets = new wasm.SecretKeys();
	for (const key of keys) {
		if (!key.privateKey) throw new Error('signing key has no private key');
		secrets.add(wasm.SecretKey.dlog_from_bytes(key.privateKey));
	}
	const wallet = wasm.Wallet.from_secrets(secrets);
	const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify(tx));
	return wallet.sign_transaction(
		await stateContext(),
		unsigned,
		wasm.ErgoBoxes.from_boxes_json(tx.inputs as any[]),
		wasm.ErgoBoxes.from_boxes_json(tx.dataInputs as any[])
	);
}

/** Ask a node to validate a signed tx without broadcasting it. Returns the rejection reason, or null if valid. */
export async function check(signed: wasm.Transaction): Promise<string | null> {
	try {
		await request(`${INDEXED_NODE}/transactions/check`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: signed.to_json()
		});
		return null;
	} catch (e) {
		return String(e);
	}
}

export async function broadcast(signed: wasm.Transaction): Promise<string> {
	let lastError: unknown;
	for (const node of NODES) {
		try {
			const id = await request(`${node}/transactions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: signed.to_json()
			});
			return String(id);
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError;
}

/** Wait until the tx's first output is in the UTXO set (i.e. the tx is in a block). */
export async function waitForConfirmation(signed: wasm.Transaction, timeoutMs = 15 * 60_000): Promise<number> {
	const firstOutput = signed.outputs().get(0).box_id().to_str();
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await unspentBox(firstOutput)) return height();
		await new Promise((r) => setTimeout(r, 5_000));
	}
	throw new Error(`tx ${signed.id().to_str()} not confirmed after ${timeoutMs / 1000}s`);
}

/** Wait until the node's extra index has caught up to `h`, so address/token lookups see a block. */
export async function waitIndexed(h: number): Promise<void> {
	for (;;) {
		const s = await request(`${INDEXED_NODE}/blockchain/indexedHeight`);
		if (Number(s.indexedHeight) >= h) return;
		await new Promise((r) => setTimeout(r, 3_000));
	}
}

export async function waitForHeight(target: number): Promise<number> {
	for (;;) {
		const h = await height();
		if (h >= target) return h;
		await new Promise((r) => setTimeout(r, 10_000));
	}
}

/** Outputs of a signed tx as spendable boxes, for chaining before confirmation. */
export function outputsOf(signed: wasm.Transaction): ChainBox[] {
	const eip12 = signed.to_js_eip12();
	return (eip12.outputs as any[]).map(toChainBox);
}
