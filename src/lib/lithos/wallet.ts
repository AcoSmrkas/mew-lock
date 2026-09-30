// Wallet access for the Lithos Lock page: Nautilus (EIP-12) in the browser, or
// ErgoPay through our mainnet relay (the page hands ErgoPay txs to its modal).
import type { Box } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { get } from 'svelte/store';
import { fetchBoxes } from '$lib/api-explorer/explorer.ts';
import { connected_wallet_address, selected_wallet_ergo } from '$lib/store/store.ts';
import { getHeight, normalizeBox } from './api.ts';
import type { NetworkConfig } from './network.ts';

declare const ergo: any;

export const usingErgoPay = () => get(selected_wallet_ergo) === 'ergopay';

/** Spendable boxes of the connected wallet (all its addresses for Nautilus). */
export async function walletBoxes(net: NetworkConfig): Promise<Box<bigint>[]> {
	if (usingErgoPay()) {
		if (!net.ergoPay) return [];
		return ((await fetchBoxes(get(connected_wallet_address))) as unknown[]).map(normalizeBox);
	}
	return (((await ergo.get_utxos()) ?? []) as unknown[]).map(normalizeBox);
}

/**
 * Wallet boxes for an unlock, the position owner's first. Nautilus signs with the
 * keys of the boxes a transaction spends, so without one from the owner's address
 * it could not open the position: say so instead of letting signing fail.
 */
export function ownerBoxesFirst(boxes: Box<bigint>[], owner: string): Box<bigint>[] {
	const ownerTree = ErgoAddress.fromBase58(owner).ergoTree;
	if (!boxes.some((b) => b.ergoTree === ownerTree)) {
		throw new Error(
			`This lock belongs to ${owner.slice(0, 8)}…${owner.slice(-6)}, which holds no ERG in this wallet. Send a little ERG to that address, then unlock.`
		);
	}
	return [...boxes].sort(
		(a, b) => Number(b.ergoTree === ownerTree) - Number(a.ergoTree === ownerTree)
	);
}

export async function changeAddress(): Promise<string> {
	return usingErgoPay() ? get(connected_wallet_address) : await ergo.get_change_address();
}

export async function currentHeight(net: NetworkConfig): Promise<number> {
	if (!usingErgoPay()) {
		try {
			return Number(await ergo.get_current_height());
		} catch {
			// fall through to the explorer
		}
	}
	return getHeight(net);
}

/** Nautilus sign + submit. Returns the tx id. */
export async function signAndSubmit(eip12: unknown): Promise<string> {
	const signed = await ergo.sign_tx(eip12);
	return ergo.submit_tx(signed);
}

/** Human message for a wallet/builder/node error. */
export function describeError(e: unknown): string {
	const info = (e as { info?: string })?.info;
	const message = info ?? (e instanceof Error ? e.message : String(e));
	if (/reject|cancel/i.test(message)) return 'Cancelled in the wallet.';
	if (/Insufficient inputs/i.test(message)) return 'Not enough ERG or LIT in the wallet for this.';
	if (/double.?spen|already spent|not found in UTXO|input.*spent/i.test(message)) {
		return 'Someone else locked at the same moment, so the campaign moved. The page has refreshed. Check the new numbers and try again.';
	}
	return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}
