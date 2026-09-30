// Which positions belong to the connected wallet. A position's owner is the
// address of the key in its R4, encoded for the deployment's network, so plain
// address comparison is exact and never matches across networks. Nautilus locks
// for its change address, which need not be the address the page shows as
// connected, so the wallet's change and used addresses count too.
import type { PositionState } from './boxes.ts';
import { usingErgoPay } from './wallet.ts';

export function positionsOwnedBy(positions: PositionState[], addresses: string[]): PositionState[] {
	const known = new Set(addresses.filter(Boolean));
	return positions.filter((position) => known.has(position.owner));
}

/**
 * `known` plus Nautilus's change and used addresses. Not in an ErgoPay session:
 * that wallet cannot sign for a Nautilus left connected in the same tab.
 */
export async function walletOwnerAddresses(known: string[]): Promise<string[]> {
	const addresses = new Set(known.filter(Boolean));
	const wallet =
		typeof window === 'undefined' || usingErgoPay() ? undefined : (window as { ergo?: any }).ergo;
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
	return [...addresses];
}
