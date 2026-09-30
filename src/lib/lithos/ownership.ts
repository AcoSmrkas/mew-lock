// A lock is owned by the public key stored in R4. Wallet UIs may expose a
// receiving address while Lithos uses the wallet's change address to create
// the lock, so compare public keys as well as address strings.
import { first } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { hex } from '@fleet-sdk/crypto';
import type { PositionState } from './boxes.ts';

function publicKeyOf(address: string): string | undefined {
	try {
		const key = first(ErgoAddress.fromBase58(address).getPublicKeys());
		return key ? hex.encode(key) : undefined;
	} catch {
		return undefined;
	}
}

export function positionsOwnedBy(positions: PositionState[], addresses: string[]): PositionState[] {
	const knownAddresses = new Set(addresses.filter(Boolean));
	const knownKeys = new Set(
		addresses.map(publicKeyOf).filter((key): key is string => key !== undefined)
	);
	return positions.filter(
		(position) => knownAddresses.has(position.owner) || knownKeys.has(position.ownerPk)
	);
}

/** Include wallet change/used addresses: EIP-12's selected address alone is not authoritative. */
export async function walletOwnerAddresses(known: string[]): Promise<string[]> {
	const addresses = new Set(known.filter(Boolean));
	if (typeof window !== 'undefined') {
		const wallet = (window as { ergo?: any }).ergo;
		if (wallet) {
			try {
				const change = await wallet.get_change_address();
				if (change) addresses.add(change);
			} catch {
				// A wallet can decline a method independently; the known addresses still work.
			}
			try {
				for (const address of (await wallet.get_used_addresses()) ?? []) addresses.add(address);
			} catch {
				// See above.
			}
		}
	}
	return [...addresses];
}
