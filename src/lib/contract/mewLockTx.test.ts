// The withdrawal builder against every Mew Lock contract that still holds locks,
// executed by the real interpreter on @fleet-sdk/mock-chain. The builder reads the
// lock box from the explorer, so only that fetch is mocked.
import { describe, expect, it, vi } from 'vitest';
import { ErgoAddress } from '@fleet-sdk/core';
import { MockChain } from '@fleet-sdk/mock-chain';
import { SGroupElement, SInt } from '@fleet-sdk/serializer';

const box = vi.hoisted(() => ({ current: null as any }));
vi.mock('$lib/api-explorer/chain', () => ({
	EXPLORER_URL: 'https://explorer.invalid',
	chainFetch: async () => ({ json: async () => box.current })
}));

import {
	MEWLOCK_CONTRACT_ADDRESS,
	MEWLOCK_LEGACY_CONTRACT_ADDRESSES,
	STORAGE_RENT_PERIOD,
	createMewLockDepositTx,
	createMewLockWithdrawalTx,
	estimateLockRentReserve,
	exceedsLegacyLimit,
	withdrawalSplit
} from './mewLockTx';
import { estimateBoxSize } from '@fleet-sdk/serializer';

const HEIGHT = 1_890_000;
const TOKEN = 'ab'.repeat(32);

async function withdraw(contractAddress: string, nanoergs: bigint, tokenAmount: bigint) {
	const chain = new MockChain({ height: HEIGHT });
	const owner = chain.newParty('owner').addBalance({ nanoergs: 10_000_000_000n });
	const locks = chain.addParty(ErgoAddress.fromBase58(contractAddress).ergoTree, 'locks');
	locks.addBalance(
		{ nanoergs, tokens: tokenAmount > 0n ? [{ tokenId: TOKEN, amount: tokenAmount }] : [] },
		{
			R4: SGroupElement(owner.key.publicKey).toHex(),
			R5: SInt(HEIGHT - 10).toHex()
		}
	);
	const lock = locks.utxos.toArray()[0];
	// The explorer's shape for that box.
	box.current = {
		...lock,
		value: lock.value.toString(),
		assets: lock.assets.map((a) => ({ tokenId: a.tokenId, amount: a.amount.toString() })),
		additionalRegisters: Object.fromEntries(
			Object.entries(lock.additionalRegisters).map(([k, v]) => [k, { serializedValue: v }])
		)
	};
	const unsigned = await createMewLockWithdrawalTx(
		owner.address.encode(),
		owner.utxos.toArray(),
		HEIGHT,
		{ boxId: lock.boxId }
	);
	return chain.execute(unsigned, { signers: [owner], throw: false });
}

describe('createMewLockWithdrawalTx', () => {
	const [preJune, june] = MEWLOCK_LEGACY_CONTRACT_ADDRESSES;

	it('withdraws a pre-June lock (it pays the old dev key)', async () => {
		expect(await withdraw(preJune, 100_000_000_000n, 0n)).toBe(true);
		expect(await withdraw(preJune, 1_000_000_000n, 1_000_000_000n)).toBe(true);
	});

	it('withdraws a June 2026 lock', async () => {
		expect(await withdraw(june, 1_000_000_000n, 1_000_000_000n)).toBe(true);
	});

	it('withdraws a v2 lock, including amounts v1 could never release', async () => {
		expect(await withdraw(MEWLOCK_CONTRACT_ADDRESS, 1_000_000_000n, 0n)).toBe(true);
		expect(await withdraw(MEWLOCK_CONTRACT_ADDRESS, 1_000_000_000n, 4_000_000_000_000_000n)).toBe(true);
	});

	it('cannot release, on an old contract, the token amounts exceedsLegacyLimit flags', async () => {
		const tree = (address: string) => ErgoAddress.fromBase58(address).ergoTree;
		const big = 4_000_000_000_000_000n;
		expect(exceedsLegacyLimit({ ergoTree: tree(preJune), assets: [{ amount: big }] })).toBe(true);
		expect(exceedsLegacyLimit({ ergoTree: tree(june), assets: [{ amount: big }] })).toBe(true);
		expect(exceedsLegacyLimit({ ergoTree: tree(MEWLOCK_CONTRACT_ADDRESS), assets: [{ amount: big }] })).toBe(false);
		expect(exceedsLegacyLimit({ ergoTree: tree(june), assets: [{ amount: 1_000_000n }] })).toBe(false);
		// The premise: the old contract really does refuse it.
		expect(await withdraw(june, 1_000_000_000n, big)).toBe(false);
	});

	it('charges no fee exactly at the thresholds, like every contract version', async () => {
		for (const address of [preJune, june, MEWLOCK_CONTRACT_ADDRESS]) {
			expect(await withdraw(address, 100_000n, 34n)).toBe(true);
		}
	});
});

describe('withdrawalSplit', () => {
	it('takes 3% of ERG and of each token above the thresholds', () => {
		const split = withdrawalSplit(10_000_000_000n, [
			{ tokenId: 'a', amount: '1000' },
			{ tokenId: 'b', amount: 34 }
		]);
		expect(split.ergFee).toBe(300_000_000n);
		expect(split.ergKeep).toBe(9_700_000_000n);
		expect(split.tokens).toEqual([
			{ tokenId: 'a', fee: 30n, keep: 970n },
			{ tokenId: 'b', fee: 0n, keep: 34n }
		]);
	});

	it('takes nothing at or below the ERG threshold', () => {
		expect(withdrawalSplit(100_000n, []).ergFee).toBe(0n);
	});
});

describe('createMewLockDepositTx and storage rent', () => {
	const deposit = (years: number) => {
		const chain = new MockChain({ height: HEIGHT });
		const owner = chain.newParty('owner').addBalance({ nanoergs: 10_000_000_000n, tokens: [{ tokenId: TOKEN, amount: 1_000_000n }] });
		const unlockHeight = HEIGHT + years * 262_800;
		const tx = createMewLockDepositTx(owner.address.encode(), owner.utxos.toArray(), HEIGHT, 1_000_000n, [{ tokenId: TOKEN, amount: 1_000_000 }], unlockHeight, 'name', null);
		const lock = tx.outputs.find((o: any) => ErgoAddress.fromErgoTree(o.ergoTree).encode() === MEWLOCK_CONTRACT_ADDRESS);
		const estimate = estimateLockRentReserve(HEIGHT, unlockHeight, owner.address.encode(), [{ tokenId: TOKEN, amount: 1_000_000 }], 'name', null);
		return { lock, estimate, unlockHeight };
	};

	it('leaves a lock under 4 years as entered', () => {
		const { lock, estimate } = deposit(1);
		expect(BigInt(lock.value)).toBe(1_000_000n);
		expect(estimate).toBe(0n);
	});

	it('raises a 10-year lock to the reserve, which survives every rent period before it opens', () => {
		const { lock, estimate, unlockHeight } = deposit(10);
		const value = BigInt(lock.value);
		expect(value).toBe(estimate);
		const periods = BigInt(Math.floor((unlockHeight - HEIGHT) / STORAGE_RENT_PERIOD));
		expect(periods).toBe(2n);
		const fee = 1_250_000n * BigInt(estimateBoxSize({ ...lock, creationHeight: unlockHeight } as any));
		expect(value - periods * fee).toBeGreaterThanOrEqual(1_000_000n);
	});
});
