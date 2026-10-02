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
	createMewLockWithdrawalTx
} from './mewLockTx';

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

	it('charges no fee exactly at the thresholds, like every contract version', async () => {
		for (const address of [preJune, june, MEWLOCK_CONTRACT_ADDRESS]) {
			expect(await withdraw(address, 100_000n, 34n)).toBe(true);
		}
	});
});
