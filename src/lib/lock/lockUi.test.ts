import { ErgoAddress, FEE_CONTRACT } from '@fleet-sdk/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	PENDING_TTL_MS,
	describeWalletError,
	durationOfBlocks,
	isUsableHeight,
	parseBlocks,
	readPendingLocks,
	recipientProblem,
	rememberPendingLock,
	settlePendingLocks
} from './lockUi';

describe('isUsableHeight', () => {
	it('refuses the 0 a failed read used to leave', () => {
		expect(isUsableHeight(0)).toBe(false);
		expect(isUsableHeight(undefined)).toBe(false);
		expect(isUsableHeight(NaN)).toBe(false);
		expect(isUsableHeight(1_890_000)).toBe(true);
	});
});

describe('parseBlocks', () => {
	it('takes whole positive numbers only', () => {
		expect(parseBlocks('720')).toBe(720);
		expect(parseBlocks(262800)).toBe(262800);
		expect(parseBlocks('')).toBeNull();
		expect(parseBlocks('0')).toBeNull();
		expect(parseBlocks('-5')).toBeNull();
		expect(parseBlocks('1.5')).toBeNull();
		expect(parseBlocks('abc')).toBeNull();
	});
});

describe('durationOfBlocks', () => {
	it('reads in the unit a person would use', () => {
		expect(durationOfBlocks(15)).toBe('≈ 30 min');
		expect(durationOfBlocks(720)).toBe('≈ 24 h');
		expect(durationOfBlocks(5040)).toBe('≈ 7 days');
		expect(durationOfBlocks(129600)).toBe('≈ 6 months');
		expect(durationOfBlocks(262800)).toBe('≈ 1 year');
		expect(durationOfBlocks(1314000)).toBe('≈ 5 years');
		expect(durationOfBlocks(400000)).toBe('≈ 1.5 years');
	});
});

describe('recipientProblem', () => {
	it('accepts a mainnet wallet address', () => {
		expect(recipientProblem('9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED')).toBeNull();
	});

	it('explains what is wrong otherwise', () => {
		expect(recipientProblem('')).toMatch(/Enter the address/);
		expect(recipientProblem('9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paEX')).toMatch(/valid/);
		expect(recipientProblem('3WvsT2Gm4EpsM9Pg18PdY6XyhNNMqXDsvJTbbf6ihLvAmSb7u5RN')).toMatch(/testnet/);
		// The miner fee contract: a valid mainnet address that no key owns.
		expect(recipientProblem(ErgoAddress.fromErgoTree(FEE_CONTRACT).encode())).toMatch(/Contract addresses/);
	});
});

describe('describeWalletError', () => {
	it('treats a wallet cancel as a cancel, not "undefined"', () => {
		expect(describeWalletError({ code: 2, info: 'User rejected' })).toEqual({
			cancelled: true,
			message: 'Cancelled in your wallet. Nothing was sent.'
		});
	});

	it('reads the info field and names common failures', () => {
		expect(describeWalletError({ code: 1, info: 'Double spending attempt' }).message).toMatch(/spent a moment ago/);
		expect(describeWalletError(new Error('Insufficient inputs')).message).toMatch(/doesn't hold enough/);
		expect(describeWalletError(new Error('boom')).message).toBe('Something went wrong: boom');
	});
});

describe('pending locks', () => {
	beforeEach(() => {
		const store = new Map<string, string>();
		globalThis.localStorage = {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => void store.set(k, v)
		} as Storage;
	});

	const lock = (txId: string, sentAt: number) => ({ txId, owner: '9x', summary: '1 ERG', unlockHeight: 2_000_000, sentAt });

	it('keeps a lock until its transaction shows up as a lock box', () => {
		rememberPendingLock(lock('a', 1000));
		rememberPendingLock(lock('b', 1000));
		expect(settlePendingLocks(new Set(['a']), 2000).map((p) => p.txId)).toEqual(['b']);
		expect(readPendingLocks().map((p) => p.txId)).toEqual(['b']);
	});

	it('forgets a lock that never confirmed', () => {
		rememberPendingLock(lock('c', 0));
		expect(settlePendingLocks(new Set(), PENDING_TTL_MS + 1)).toEqual([]);
	});
});
