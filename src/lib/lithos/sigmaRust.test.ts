// The same transactions, reduced and signed by sigma-rust (ergo-lib-wasm-nodejs
// 0.28), the interpreter inside Nautilus and our ErgoPay relay. The mock chain
// runs sigmastate, which is what nodes run; if the two disagreed, a wallet
// could refuse a valid lock or sign one the network rejects.
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import type { ErgoUnsignedTransaction } from '@fleet-sdk/core';
import { type KeyedMockChainParty, mockHeaders } from '@fleet-sdk/mock-chain';
import { SBigInt, SByte, SColl, SInt, SLong } from '@fleet-sdk/serializer';
import * as wasm from 'ergo-lib-wasm-nodejs';
import { describe, expect, it } from 'vitest';
import {
	add,
	changeOf,
	END,
	GRACE,
	LIT_UNIT,
	lock,
	MODES,
	positionsOf,
	run,
	setup,
	START,
	state,
	tamper,
	TIERS
} from './testkit.ts';
import { buildSweepTx, buildTopUpTx, buildUnlockTx } from './txs.ts';

/** Sign at HEIGHT = `height`. Returns true, or the prover's error. */
function rustSign(
	tx: ErgoUnsignedTransaction | EIP12UnsignedTransaction,
	signers: KeyedMockChainParty[],
	height: number
): true | string {
	const eip12 = 'toEIP12Object' in tx ? tx.toEIP12Object() : tx;
	// Newest header first; the pre-header (and so HEIGHT) is built from it.
	const headers = wasm.BlockHeaders.from_json(mockHeaders(10, { fromHeight: height - 10 }).reverse());
	const preHeader = wasm.PreHeader.from_block_header(headers.get(0));
	const context = new wasm.ErgoStateContext(preHeader, headers, wasm.Parameters.default_parameters());
	const secrets = new wasm.SecretKeys();
	for (const s of signers) secrets.add(wasm.SecretKey.dlog_from_bytes(s.key.privateKey as Uint8Array));
	try {
		wasm.Wallet.from_secrets(secrets).sign_transaction(
			context,
			wasm.UnsignedTransaction.from_json(JSON.stringify(eip12)),
			wasm.ErgoBoxes.from_boxes_json(eip12.inputs as unknown[]),
			wasm.ErgoBoxes.from_boxes_json(eip12.dataInputs as unknown[])
		);
		return true;
	} catch (e) {
		return String(e);
	}
}

describe('sigma-rust (Nautilus) agrees with sigmastate', () => {
	it('lock: signs the honest one, refuses every tampered one', () => {
		const c = setup();
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		const h = c.chain.height + 1;
		expect(rustSign(plan.tx, [c.mallory], h)).toBe(true);

		const attacks: ((t: EIP12UnsignedTransaction) => void)[] = [
			(t) => {
				t.outputs[1].assets[1].amount = add(t.outputs[1].assets[1].amount, 1n);
				t.outputs[1].additionalRegisters.R7 = SLong(plan.quote.reward + 1n).toHex();
				t.outputs[0].assets[2].amount = add(t.outputs[0].assets[2].amount, -1n);
			},
			(t) => {
				t.outputs[1].additionalRegisters.R6 = SLong(1_000_000n * LIT_UNIT).toHex();
			},
			(t) => {
				t.outputs[1].ergoTree = c.mallory.ergoTree;
			},
			(t) => {
				t.outputs[1].additionalRegisters.R5 = SInt(h + TIERS[3].blocks - 1).toHex();
			},
			(t) => {
				t.outputs[0].additionalRegisters.R4 = SBigInt(plan.quote.vAfter - 1n).toHex();
			}
		];
		for (const attack of attacks) expect(rustSign(tamper(plan.tx, attack), [c.mallory], h)).not.toBe(true);

		expect(rustSign(plan.tx, [c.mallory], START - 1)).not.toBe(true);
		expect(rustSign(plan.tx, [c.mallory], END + 1)).not.toBe(true);
	});

	it('KNOWN DIVERGENCE: sigma-rust signs a position whose R4 is not a GroupElement; nodes reject it', () => {
		// sigmastate (nodes) throws "Cannot getReg[GroupElement](4): invalid type"
		// on this lock, asserted in lithos.test.ts; sigma-rust 0.28 reads the
		// mistyped register as if it were fine. So a wallet could sign this, and
		// the network refuses it: nothing reaches the chain. Kept as a test so a
		// sigma-rust upgrade that changes either side gets noticed.
		const c = setup();
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		const mistyped = tamper(plan.tx, (t) => {
			t.outputs[1].additionalRegisters.R4 = SColl(SByte, c.mallory.key.publicKey).toHex();
		});
		expect(rustSign(mistyped, [c.mallory], c.chain.height + 1)).toBe(true);
		expect(() => c.chain.execute(mistyped, { signers: [c.mallory] })).toThrow(/Cannot getReg\[GroupElement\]/);
	});

	it('lock: whale sizes reduce the same way (BigInt maths)', () => {
		const c = setup();
		const plan = lock(c, c.alice, 500_000_000n * LIT_UNIT, 3);
		expect(rustSign(plan.tx, [c.alice], c.chain.height + 1)).toBe(true);
	});

	it('top-up: signs honest and odd-register cases, refuses a V change and a late one', () => {
		const c = setup();
		const tx = buildTopUpTx({
			deployment: c.d,
			campaign: state(c),
			inputs: c.mallory.utxos.toArray(),
			changeAddress: c.mallory.address.encode(),
			amount: LIT_UNIT,
			height: c.chain.height
		});
		const h = c.chain.height + 1;
		expect(rustSign(tx, [c.mallory], h)).toBe(true);
		expect(
			rustSign(
				tamper(tx, (t) => {
					const change = changeOf(t, c.mallory);
					change.value = add(change.value, -1_000_000n);
					t.outputs.splice(1, 0, {
						value: '1000000',
						ergoTree: c.mallory.ergoTree,
						creationHeight: c.chain.height,
						assets: [],
						additionalRegisters: { R4: SColl(SByte, [1, 2, 3]).toHex(), R5: SLong(7n).toHex() }
					});
				}),
				[c.mallory],
				h
			)
		).toBe(true);
		expect(
			rustSign(
				tamper(tx, (t) => {
					t.outputs[0].additionalRegisters.R4 = SBigInt(1n).toHex();
				}),
				[c.mallory],
				h
			)
		).not.toBe(true);
		expect(rustSign(tx, [c.mallory], END + 1)).not.toBe(true);
	});

	it('unlock: owner at the unlock height only; never anyone else', () => {
		const c = setup();
		expect(run(c, lock(c, c.alice, 5_000n * LIT_UNIT, 0).tx, [c.alice])).toBe(true);
		const [p] = positionsOf(c);
		const byAlice = buildUnlockTx({ deployment: c.d, position: p, inputs: c.alice.utxos.toArray(), height: p.unlockAt });
		expect(rustSign(byAlice, [c.alice], p.unlockAt)).toBe(true);
		expect(rustSign(byAlice, [c.alice], p.unlockAt - 1)).not.toBe(true);
		const byMallory = buildUnlockTx({
			deployment: c.d,
			position: p,
			inputs: c.mallory.utxos.toArray(),
			height: p.unlockAt
		});
		expect(rustSign(byMallory, [c.mallory], p.unlockAt + 1_000)).not.toBe(true);
	});

	it('sweep: after end + grace, to the fee address only, burning the NFT', () => {
		const c = setup();
		c.chain.jumpTo(END + GRACE);
		const tx = buildSweepTx({
			deployment: c.d,
			campaign: state(c),
			inputs: c.mallory.utxos.toArray(),
			changeAddress: c.mallory.address.encode(),
			height: c.chain.height
		});
		const h = END + GRACE + 1;
		expect(rustSign(tx, [c.mallory], h)).toBe(true);
		expect(rustSign(tx, [c.mallory], h - 1)).not.toBe(true);
		const attacks: ((t: EIP12UnsignedTransaction) => void)[] = [
			(t) => {
				t.outputs[0].ergoTree = c.mallory.ergoTree;
			},
			(t) => {
				changeOf(t, c.mallory).assets.push({ tokenId: c.d.campaignNftId, amount: '1' });
			}
		];
		for (const attack of attacks) expect(rustSign(tamper(tx, attack), [c.mallory], h)).not.toBe(true);
		// The lock/top-up branch is never evaluated during a sweep.
		expect(
			rustSign(
				tamper(tx, (t) => {
					t.outputs[0].additionalRegisters = { R4: SColl(SByte, [9, 9]).toHex() };
				}),
				[c.mallory],
				h
			)
		).toBe(true);
	});

	it('every asset mode: lock, top-up, unlock and sweep all sign under sigma-rust', () => {
		for (const mode of MODES) {
			const c = setup(mode);
			const plan = lock(c, c.alice, 10_000n * LIT_UNIT, 0);
			expect(rustSign(plan.tx, [c.alice], c.chain.height + 1), `${mode.stake}/${mode.reward} lock`).toBe(true);
			expect(run(c, plan.tx, [c.alice])).toBe(true);

			const topUp = buildTopUpTx({
				deployment: c.d,
				campaign: state(c),
				inputs: c.bob.utxos.toArray(),
				changeAddress: c.bob.address.encode(),
				amount: LIT_UNIT,
				height: c.chain.height
			});
			expect(rustSign(topUp, [c.bob], c.chain.height + 1), `${mode.stake}/${mode.reward} top-up`).toBe(true);

			const [p] = positionsOf(c);
			const unlock = buildUnlockTx({ deployment: c.d, position: p, inputs: c.alice.utxos.toArray(), height: p.unlockAt });
			expect(rustSign(unlock, [c.alice], p.unlockAt), `${mode.stake}/${mode.reward} unlock`).toBe(true);

			c.chain.jumpTo(END + GRACE);
			const sweep = buildSweepTx({
				deployment: c.d,
				campaign: state(c),
				inputs: c.bob.utxos.toArray(),
				changeAddress: c.bob.address.encode(),
				height: c.chain.height
			});
			expect(rustSign(sweep, [c.bob], END + GRACE + 1), `${mode.stake}/${mode.reward} sweep`).toBe(true);
		}
	});
});
