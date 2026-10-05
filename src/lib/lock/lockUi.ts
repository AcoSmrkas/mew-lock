// Pieces of the Mew Lock screens that are easy to get wrong and cheap to test:
// reading a block height and a duration, saying what went wrong in a wallet, and
// remembering a lock between signing it and seeing it confirmed.
import { AddressType, ErgoAddress, Network } from '@fleet-sdk/core';

/** Ergo's target block interval. Good for estimates, not promises. */
export const BLOCK_SECONDS = 120;

/**
 * A block height worth building a lock on. A failed read used to leave 0, and a
 * "1 year" lock then unlocked at block 262,800, which mainnet passed in 2020.
 */
export function isUsableHeight(height: unknown): height is number {
	return Number.isInteger(height) && (height as number) >= 1_000_000;
}

/** A whole number of blocks, at least 1, or null. */
export function parseBlocks(input: unknown): number | null {
	const text = String(input ?? '').trim();
	if (!/^\d+$/.test(text)) return null;
	const blocks = Number(text);
	return Number.isSafeInteger(blocks) && blocks >= 1 ? blocks : null;
}

/** "Mar 4, 2027" for a block `blocks` from now. */
export function dateAfterBlocks(blocks: number, now = Date.now()): string {
	return new Date(now + blocks * BLOCK_SECONDS * 1000).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

/** "≈ 5 h", "≈ 3 days", "≈ 2.1 years" for a number of blocks. */
export function durationOfBlocks(blocks: number): string {
	const hours = (Math.max(0, blocks) * BLOCK_SECONDS) / 3600;
	if (hours < 1) return `≈ ${Math.max(1, Math.round(hours * 60))} min`;
	if (hours < 48) return `≈ ${Math.round(hours)} h`;
	const days = hours / 24;
	if (days < 120) return `≈ ${Math.round(days)} days`;
	if (days < 360) return `≈ ${Math.round(days / 30.44)} months`;
	const years = days / 365.25;
	const whole = Math.round(years);
	if (Math.abs(years - whole) < 0.05) return `≈ ${whole} year${whole === 1 ? '' : 's'}`;
	return `≈ ${years.toFixed(1)} years`;
}

/** Why an address can't own a lock, or null if it can. */
export function recipientProblem(address: string): string | null {
	const text = address.trim();
	if (!text) return 'Enter the address that will own this lock.';
	try {
		if (!ErgoAddress.validate(text)) return "That isn't a valid Ergo address.";
		const decoded = ErgoAddress.fromBase58(text);
		if (decoded.network !== Network.Mainnet) return "That's a testnet address.";
		if (decoded.type !== AddressType.P2PK) {
			return 'Use a wallet address (starts with 9). Contract addresses cannot own a lock.';
		}
	} catch {
		return "That isn't a valid Ergo address.";
	}
	return null;
}

/**
 * Wallets reject with `{ code, info }` rather than an Error, so `error.message`
 * printed "Lock failed: undefined" when someone simply pressed Cancel.
 */
export function describeWalletError(error: unknown): { cancelled: boolean; message: string } {
	const e = error as { code?: unknown; info?: unknown; message?: unknown } | undefined;
	const raw = String(
		(typeof e?.message === 'string' && e.message) ||
			(typeof e?.info === 'string' && e.info) ||
			(typeof error === 'string' ? error : '')
	);
	if (e?.code === 2 || /user rejected|declined|cancel/i.test(raw)) {
		return { cancelled: true, message: 'Cancelled in your wallet. Nothing was sent.' };
	}
	if (/insufficient|not enough/i.test(raw)) {
		return {
			cancelled: false,
			message: "Your wallet doesn't hold enough for this, including the network fee. Nothing was sent."
		};
	}
	if (/double.?spend|already spent|not found/i.test(raw)) {
		return {
			cancelled: false,
			message:
				'A box this needed was spent a moment ago. Nothing was sent. Wait for the next block and try again.'
		};
	}
	return { cancelled: false, message: raw ? `Something went wrong: ${raw}` : 'Something went wrong.' };
}

/** A lock that has been sent but not yet seen in a block. */
export interface PendingLock {
	readonly txId: string;
	readonly owner: string;
	readonly summary: string;
	readonly unlockHeight: number;
	readonly sentAt: number;
}

const PENDING_KEY = 'mewlock:pending';
// A lock not seen after this long most likely never made it into a block.
export const PENDING_TTL_MS = 30 * 60 * 1000;

export function readPendingLocks(): PendingLock[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writePendingLocks(locks: PendingLock[]): void {
	try {
		localStorage.setItem(PENDING_KEY, JSON.stringify(locks));
	} catch {
		// Storage can be full or blocked; the lock itself is unaffected.
	}
}

export function rememberPendingLock(lock: PendingLock): void {
	writePendingLocks([...readPendingLocks().filter((p) => p.txId !== lock.txId), lock]);
}

/** Drops pending locks that have confirmed (their tx made a lock box) or aged out. */
export function settlePendingLocks(confirmedTxIds: Set<string>, now = Date.now()): PendingLock[] {
	const left = readPendingLocks().filter(
		(p) => !confirmedTxIds.has(p.txId) && now - p.sentAt < PENDING_TTL_MS
	);
	writePendingLocks(left);
	return left;
}
