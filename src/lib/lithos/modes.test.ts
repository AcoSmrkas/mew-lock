// The generic campaign across every asset mode: lock A, earn B, where each is
// LIT, a second token (MEOW) or ERG. Honest lifecycle plus the attacks that
// differ per mode, each run tampered and untampered.
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import type { ErgoUnsignedTransaction } from '@fleet-sdk/core';
import type { KeyedMockChainParty } from '@fleet-sdk/mock-chain';
import { SLong } from '@fleet-sdk/serializer';
import { describe, expect, it } from 'vitest';
import { positionContents } from './boxes.ts';
import { quoteLock } from './math.ts';
import { CAMPAIGN_RESERVE, POSITION_DEPOSIT } from './params.ts';
import {
	add,
	balanceOf,
	BUDGET,
	changeOf,
	type Ctx,
	END,
	GRACE,
	idOf,
	LIT_UNIT,
	lock,
	MARKER,
	MODES,
	NFT,
	positionsOf,
	run,
	setup,
	state,
	tamper,
	TIERS
} from './testkit.ts';
import { buildSweepTx, buildTopUpTx, buildUnlockTx, TX_FEE } from './txs.ts';

type Out = EIP12UnsignedTransaction['outputs'][number];

/** Move `delta` of an asset (token id, or null = nanoERG) into/out of a box. */
function shift(box: Out, id: string | null, delta: bigint) {
	if (id === null) {
		box.value = add(box.value, delta);
		return;
	}
	const entry = box.assets.find((a) => a.tokenId === id);
	if (entry) entry.amount = add(entry.amount, delta);
	else box.assets.push({ tokenId: id, amount: delta.toString() });
}

function expectOnlyTamperFails(
	c: Ctx,
	tx: ErgoUnsignedTransaction,
	signers: KeyedMockChainParty[],
	edit: (t: EIP12UnsignedTransaction) => void
) {
	const attack = tamper(tx, edit);
	expect(() => c.chain.execute(attack, { signers })).toThrow(/Script reduced to false|Cannot getReg/);
	expect(run(c, tx, signers)).toBe(true);
}

const PRINCIPAL = 10_000n * LIT_UNIT;

for (const mode of MODES) {
	const name = `lock ${mode.stake}, earn ${mode.reward}`;
	const A = idOf(mode.stake);
	const B = idOf(mode.reward);

	describe(name, () => {
		it('lock pays the exact curve reward and the position holds exactly A + B + deposit', () => {
			const c = setup(mode);
			const before = state(c);
			const plan = lock(c, c.alice, PRINCIPAL, 3);
			expect(run(c, plan.tx, [c.alice])).toBe(true);

			const q = quoteLock(before.budget, before.v, PRINCIPAL, TIERS[3].blocks, TIERS[3].boostBps);
			expect(plan.quote).toEqual(q);
			const after = state(c);
			expect(after.budget).toBe(before.budget - q.reward);
			expect(after.v).toBe(before.v + q.weight);
			// An ERG budget rides in the box value: it must drop by exactly the reward.
			if (B === null) expect(BigInt(after.box.value)).toBe(CAMPAIGN_RESERVE + BUDGET - q.reward);

			const [p] = positionsOf(c);
			const want = positionContents(c.d, PRINCIPAL, q.reward);
			expect(BigInt(p.box.value)).toBe(want.nanoErg);
			expect(p.box.assets.length).toBe(1 + want.tokens.length);
			expect(p.principal).toBe(PRINCIPAL);
			expect(p.reward).toBe(q.reward);
		});

		it('unlock gives the owner principal + reward + deposit', () => {
			const c = setup(mode);
			const plan = lock(c, c.alice, PRINCIPAL, 0);
			expect(run(c, plan.tx, [c.alice])).toBe(true);
			const [p] = positionsOf(c);
			c.chain.jumpTo(p.unlockAt);
			const before = { A: balanceOf(c.alice, mode.stake), B: balanceOf(c.alice, mode.reward), E: balanceOf(c.alice, 'ERG') };
			const tx = buildUnlockTx({ deployment: c.d, position: p, inputs: c.alice.utxos.toArray(), height: c.chain.height });
			expect(run(c, tx, [c.alice])).toBe(true);

			const ergIn = POSITION_DEPOSIT + (A === null ? PRINCIPAL : 0n) + (B === null ? p.reward : 0n) - TX_FEE;
			expect(balanceOf(c.alice, 'ERG') - before.E).toBe(ergIn);
			if (A !== null && A === B) expect(balanceOf(c.alice, mode.stake) - before.A).toBe(PRINCIPAL + p.reward);
			else {
				if (A !== null) expect(balanceOf(c.alice, mode.stake) - before.A).toBe(PRINCIPAL);
				if (B !== null) expect(balanceOf(c.alice, mode.reward) - before.B).toBe(p.reward);
			}
			expect(c.alice.balance.tokens.some((t) => t.tokenId === MARKER)).toBe(false);
		});

		it('anyone can top up the budget in B, and nothing else moves', () => {
			const c = setup(mode);
			const before = state(c);
			const amount = 500n * LIT_UNIT;
			const tx = buildTopUpTx({
				deployment: c.d,
				campaign: before,
				inputs: c.mallory.utxos.toArray(),
				changeAddress: c.mallory.address.encode(),
				amount,
				height: c.chain.height
			});
			expect(run(c, tx, [c.mallory])).toBe(true);
			expect(state(c).budget).toBe(before.budget + amount);
			expect(state(c).v).toBe(before.v);
		});

		it('sweep sends the whole leftover and the reserve to the fee address and burns the NFT', () => {
			const c = setup(mode);
			expect(run(c, lock(c, c.alice, PRINCIPAL, 2).tx, [c.alice])).toBe(true);
			const left = state(c);
			c.chain.jumpTo(END + GRACE);
			const tx = buildSweepTx({
				deployment: c.d,
				campaign: left,
				inputs: c.mallory.utxos.toArray(),
				changeAddress: c.mallory.address.encode(),
				height: c.chain.height
			});
			expect(run(c, tx, [c.mallory])).toBe(true);
			expect(balanceOf(c.fee, 'ERG') - 10n * 1_000_000_000n).toBe(BigInt(left.box.value));
			if (B !== null) expect(balanceOf(c.fee, mode.reward)).toBe(left.budget);
			expect(c.campaign.utxos.toArray()).toHaveLength(0);
			expect(c.fee.balance.tokens.some((t) => t.tokenId === NFT || t.tokenId === MARKER)).toBe(false);
		});

		it('rejects a reward of one raw unit over the curve', () => {
			const c = setup(mode);
			const plan = lock(c, c.mallory, PRINCIPAL, 3);
			expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
				shift(t.outputs[1], B, 1n);
				shift(t.outputs[0], B, -1n);
				t.outputs[1].additionalRegisters.R7 = SLong(plan.quote.reward + 1n).toHex();
			});
		});

		it('rejects a position that holds less A than its principal register claims', () => {
			const c = setup(mode);
			const plan = lock(c, c.mallory, PRINCIPAL, 3);
			expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
				shift(t.outputs[1], A, -LIT_UNIT);
				shift(changeOf(t, c.mallory), A, LIT_UNIT);
			});
		});

		it('rejects a successor that loses budget beyond the reward', () => {
			const c = setup(mode);
			const plan = lock(c, c.mallory, PRINCIPAL, 3);
			expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
				shift(t.outputs[0], B, -1n);
				shift(changeOf(t, c.mallory), B, 1n);
			});
		});

		it('rejects an extra token slipped into the position', () => {
			const c = setup(mode);
			const plan = lock(c, c.mallory, PRINCIPAL, 3);
			const junk = idOf(mode.stake === 'MEOW' || mode.reward === 'MEOW' ? 'LIT' : 'MEOW') ?? 'dd'.repeat(32);
			expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
				shift(t.outputs[1], junk, 1n);
				shift(changeOf(t, c.mallory), junk, -1n);
			});
		});

		it('rejects a top-up that takes budget out', () => {
			const c = setup(mode);
			const tx = buildTopUpTx({
				deployment: c.d,
				campaign: state(c),
				inputs: c.mallory.utxos.toArray(),
				changeAddress: c.mallory.address.encode(),
				amount: LIT_UNIT,
				height: c.chain.height
			});
			expectOnlyTamperFails(c, tx, [c.mallory], (t) => {
				shift(t.outputs[0], B, -2n * LIT_UNIT);
				shift(changeOf(t, c.mallory), B, 2n * LIT_UNIT);
			});
		});
	});
}
