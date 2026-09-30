// Contract tests for the MewLock x Lithos campaign on Fleet's mock chain
// (sigmastate interpreter). Every attack is a real transaction from the
// builders with one thing tampered; each is also run untampered to prove the
// rejection comes from the contract and not from a broken harness.
import type { EIP12UnsignedTransaction } from '@fleet-sdk/common';
import type { ErgoUnsignedTransaction } from '@fleet-sdk/core';
import { type KeyedMockChainParty, MockChain } from '@fleet-sdk/mock-chain';
import { SBigInt, SByte, SColl, SGroupElement, SInt, SLong } from '@fleet-sdk/serializer';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseCampaignBox, type PositionState } from './boxes.ts';
import { compileCampaign } from './compile.ts';
import { type LithosDeployment, pinParams } from './deployment.ts';
import { BLOCKS_PER_YEAR, initialVirtualWeight, lockAprBps, marginalAprBps, maxReward, quoteLock } from './math.ts';
import { type CampaignParams, validateParams } from './params.ts';
import {
	add,
	BUDGET,
	changeOf,
	type Ctx,
	END,
	ERG,
	GRACE,
	LIT,
	LIT_UNIT,
	lock,
	MARKER,
	MARKER_SUPPLY,
	NFT,
	positionsOf,
	positionTree,
	run,
	setup,
	START,
	state,
	tamper,
	TIERS
} from './testkit.ts';
import {
	buildCampaignCreateTx,
	buildLockTx,
	buildMintTx,
	buildSweepTx,
	buildTopUpTx,
	buildUnlockTx,
	CAMPAIGN_BOX_VALUE
} from './txs.ts';

/** The attack must be rejected by a contract and the honest original must then pass. */
function expectOnlyTamperFails(
	c: Ctx,
	tx: ErgoUnsignedTransaction,
	signers: KeyedMockChainParty[],
	edit: (t: EIP12UnsignedTransaction) => void,
	reason = /Script reduced to false/
) {
	const attack = tamper(tx, edit);
	expect(() => c.chain.execute(attack, { signers })).toThrow(reason);
	expect(run(c, tx, signers)).toBe(true);
}

describe('lock', () => {
	let c: Ctx;
	beforeEach(() => {
		c = setup();
	});

	it('harness control: an untouched copy and a harmless edit both pass', () => {
		expect(run(c, tamper(lock(c, c.alice, 1_000n * LIT_UNIT, 3).tx, () => {}), [c.alice])).toBe(true);
		// Paying 1 nanoERG more fee out of change touches no contract rule.
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		const harmless = tamper(plan.tx, (t) => {
			const change = changeOf(t, c.mallory);
			change.value = add(change.value, -1n);
			t.outputs[2].value = add(t.outputs[2].value, 1n);
		});
		expect(run(c, harmless, [c.mallory])).toBe(true);
	});

	it('rejections come from the contract, not the harness', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		const attack = tamper(plan.tx, (t) => {
			t.outputs[1].additionalRegisters.R6 = SLong(1_000_000n * LIT_UNIT).toHex();
		});
		expect(() => c.chain.execute(attack, { signers: [c.mallory] })).toThrow(/Script reduced to false/);
	});

	it('pays the exact curve reward into a position and updates the campaign', () => {
		const before = state(c);
		const principal = 10_000n * LIT_UNIT;
		const plan = lock(c, c.alice, principal, 3);
		expect(run(c, plan.tx, [c.alice])).toBe(true);

		const expected = quoteLock(before.budget, before.v, principal, TIERS[3].blocks, TIERS[3].boostBps);
		expect(plan.quote).toEqual(expected);
		const after = state(c);
		expect(after.budget).toBe(before.budget - expected.reward);
		expect(after.v).toBe(before.v + expected.weight);
		expect(after.markersLeft).toBe(MARKER_SUPPLY - 1n);

		const [p] = positionsOf(c);
		expect(p.owner).toBe(c.alice.address.encode());
		expect(p.principal).toBe(principal);
		expect(p.reward).toBe(expected.reward);
		expect(p.locked).toBe(principal + expected.reward);
		expect(p.tier).toBe(3);
		// ~100% APR on the 1-year tier at the start (50% base x 2.0 boost), less
		// ~1% because this lock's own weight is 1% of V0 and moves the curve.
		expect(lockAprBps(principal, p.reward, TIERS[3].blocks)).toBeGreaterThanOrEqual(9_890);
		expect(lockAprBps(principal, p.reward, TIERS[3].blocks)).toBeLessThanOrEqual(10_000);
	});

	it('longer tiers earn a higher APR, and each lock lowers the rate for the next', () => {
		const principal = 1_000n * LIT_UNIT;
		const s = state(c);
		const aprs = TIERS.map((t) =>
			lockAprBps(principal, quoteLock(s.budget, s.v, principal, t.blocks, t.boostBps).reward, t.blocks)
		);
		expect(aprs).toEqual([...aprs].sort((a, b) => a - b));
		expect(aprs[0]).toBeGreaterThanOrEqual(4_990);
		expect(aprs[0]).toBeLessThanOrEqual(5_000);
		expect(aprs[3]).toBeGreaterThanOrEqual(9_980);
		expect(aprs[3]).toBeLessThanOrEqual(10_000);

		const rewards: bigint[] = [];
		for (let i = 0; i < 3; i++) {
			const plan = lock(c, c.alice, 50_000n * LIT_UNIT, 3);
			expect(run(c, plan.tx, [c.alice])).toBe(true);
			rewards.push(plan.quote.reward);
		}
		expect(rewards[1]).toBeLessThan(rewards[0]);
		expect(rewards[2]).toBeLessThan(rewards[1]);
		expect(marginalAprBps(state(c).budget, state(c).v, 10_000)).toBeLessThan(5_000);
	});

	it('handles whale sizes with BigInt maths (p * blocks * boost overflows Long)', () => {
		const principal = 500_000_000n * LIT_UNIT; // half of LIT's supply
		expect(principal * BigInt(BLOCKS_PER_YEAR) * 20_000n).toBeGreaterThan(9_223_372_036_854_775_807n);
		const before = state(c);
		const plan = lock(c, c.alice, principal, 3);
		expect(run(c, plan.tx, [c.alice])).toBe(true);
		expect(plan.quote.reward).toBe(maxReward(before.budget, before.v, plan.quote.weight));
		expect(plan.quote.reward).toBeLessThan(before.budget);
		expect(state(c).budget).toBe(before.budget - plan.quote.reward);
	});

	it('splitting a lock never earns more than locking it in one go', () => {
		const s = state(c);
		const one = quoteLock(s.budget, s.v, 200_000n * LIT_UNIT, TIERS[2].blocks, TIERS[2].boostBps);
		const a = quoteLock(s.budget, s.v, 100_000n * LIT_UNIT, TIERS[2].blocks, TIERS[2].boostBps);
		const b = quoteLock(a.budgetAfter, a.vAfter, 100_000n * LIT_UNIT, TIERS[2].blocks, TIERS[2].boostBps);
		expect(a.reward + b.reward).toBeLessThanOrEqual(one.reward);
		expect(one.reward - (a.reward + b.reward)).toBeLessThanOrEqual(1n);
	});

	it('lets anyone lock for someone else; only that owner can unlock', () => {
		const plan = lock(c, c.alice, 100n * LIT_UNIT, 0, c.bob.address.encode());
		expect(run(c, plan.tx, [c.alice])).toBe(true);
		const [p] = positionsOf(c);
		expect(p.owner).toBe(c.bob.address.encode());
		c.chain.jumpTo(p.unlockAt);
		const byAlice = buildUnlockTx({ deployment: c.d, position: p, inputs: c.alice.utxos.toArray(), height: c.chain.height });
		expect(run(c, byAlice, [c.alice])).toBe(false);
		const byBob = buildUnlockTx({ deployment: c.d, position: p, inputs: c.bob.utxos.toArray(), height: c.chain.height });
		expect(run(c, byBob, [c.bob])).toBe(true);
	});

	it('rejects a reward above the curve, even by one raw unit', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].assets[1].amount = add(t.outputs[1].assets[1].amount, 1n);
			t.outputs[1].additionalRegisters.R7 = SLong(plan.quote.reward + 1n).toHex();
			t.outputs[0].assets[2].amount = add(t.outputs[0].assets[2].amount, -1n);
		});
	});

	it('rejects extra LIT slipped into the position without declaring it', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].assets[1].amount = add(t.outputs[1].assets[1].amount, 5n * LIT_UNIT);
			t.outputs[0].assets[2].amount = add(t.outputs[0].assets[2].amount, -5n * LIT_UNIT);
		});
	});

	it('rejects a lying principal register (claiming more weight than LIT locked)', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].additionalRegisters.R6 = SLong(1_000_000n * LIT_UNIT).toHex();
		});
	});

	it('rejects a successor that does not add the full weight to V', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[0].additionalRegisters.R4 = SBigInt(plan.quote.vAfter - 1n).toHex();
		});
		c = setup();
		const plan2 = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan2.tx, [c.mallory], (t) => {
			t.outputs[0].additionalRegisters.R4 = SBigInt(state(c).v).toHex();
		});
	});

	it('rejects a position under any other script', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].ergoTree = c.mallory.ergoTree;
		});
	});

	it('rejects a position without its marker, or with two', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			const marker = t.outputs[1].assets.shift()!;
			changeOf(t, c.mallory).assets.push(marker); // into mallory's change
		});
		c = setup();
		const plan2 = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan2.tx, [c.mallory], (t) => {
			t.outputs[1].assets[0].amount = '2';
			t.outputs[0].assets[1].amount = add(t.outputs[0].assets[1].amount, -1n);
		});
	});

	it('rejects an unlock height shorter than the tier or beyond the slack', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		const inclusion = c.chain.height + 1;
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].additionalRegisters.R5 = SInt(inclusion + TIERS[3].blocks - 1).toHex();
		});
		c = setup();
		const plan2 = lock(c, c.mallory, 1_000n * LIT_UNIT, 3);
		expectOnlyTamperFails(c, plan2.tx, [c.mallory], (t) => {
			t.outputs[1].additionalRegisters.R5 = SInt(c.chain.height + 1 + TIERS[3].blocks + 61).toHex();
		});
	});

	it('rejects claiming the 1-year boost on a 30-day lock, and unknown tiers', () => {
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 0);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].additionalRegisters.R8 = SInt(3).toHex();
		});
		c = setup();
		const plan2 = lock(c, c.mallory, 1_000n * LIT_UNIT, 0);
		expectOnlyTamperFails(c, plan2.tx, [c.mallory], (t) => {
			t.outputs[1].additionalRegisters.R8 = SInt(99).toHex();
		});
	});

	it('rejects a position whose owner register is not a GroupElement', () => {
		// (A missing R4 cannot reach the contract: registers must be contiguous.)
		const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 1);
		// Reading a register as the wrong type throws inside the campaign script,
		// which rejects the lock just like a false result.
		const wrongType = /Script reduced to false|Cannot getReg\[GroupElement\]/;
		expectOnlyTamperFails(
			c,
			plan.tx,
			[c.mallory],
			(t) => {
				t.outputs[1].additionalRegisters.R4 = SColl(SByte, c.mallory.key.publicKey).toHex();
			},
			wrongType
		);
		c = setup();
		const plan2 = lock(c, c.mallory, 1_000n * LIT_UNIT, 1);
		expectOnlyTamperFails(
			c,
			plan2.tx,
			[c.mallory],
			(t) => {
				t.outputs[1].additionalRegisters.R4 = SLong(1n).toHex();
			},
			wrongType
		);
	});

	it('rejects locks below the minimum', () => {
		const plan = lock(c, c.mallory, 10n * LIT_UNIT, 0);
		expectOnlyTamperFails(c, plan.tx, [c.mallory], (t) => {
			t.outputs[1].additionalRegisters.R6 = SLong(10n * LIT_UNIT - 1n).toHex();
			t.outputs[1].assets[1].amount = add(t.outputs[1].assets[1].amount, -1n);
		});
		expect(() => lock(c, c.mallory, 10n * LIT_UNIT - 1n, 0)).toThrow(/minimum/);
	});

	it('rejects a successor that loses nanoERG, the NFT, its script, or gains a token', () => {
		const edits: ((t: EIP12UnsignedTransaction) => void)[] = [
			(t) => {
				t.outputs[0].value = add(t.outputs[0].value, -1n);
				changeOf(t, c.mallory).value = add(changeOf(t, c.mallory).value, 1n);
			},
			(t) => {
				changeOf(t, c.mallory).assets.push(t.outputs[0].assets.shift()!);
			},
			(t) => {
				t.outputs[0].ergoTree = c.mallory.ergoTree;
			},
			(t) => {
				const lit = changeOf(t, c.mallory).assets.find((a) => a.tokenId === LIT)!;
				lit.amount = add(lit.amount, -1n);
				t.outputs[0].assets.push({ tokenId: LIT, amount: '1' });
			}
		];
		for (const edit of edits) {
			c = setup();
			const plan = lock(c, c.mallory, 1_000n * LIT_UNIT, 0);
			expectOnlyTamperFails(c, plan.tx, [c.mallory], edit);
		}
	});

	it('only accepts locks inside the campaign window', () => {
		const plan = lock(c, c.alice, 100n * LIT_UNIT, 0);
		c.chain.jumpTo(START - 2); // HEIGHT = START - 1
		expect(run(c, plan.tx, [c.alice])).toBe(false);
		c.chain.jumpTo(END); // HEIGHT = END + 1
		expect(run(c, plan.tx, [c.alice])).toBe(false);
		c.chain.jumpTo(END - 1); // HEIGHT = END, the last block that accepts locks
		expect(
			run(
				c,
				tamper(plan.tx, (t) => {
					t.outputs[1].additionalRegisters.R5 = SInt(END + TIERS[0].blocks + 5).toHex();
				}),
				[c.alice]
			)
		).toBe(true);
	});
});

describe('top-up', () => {
	let c: Ctx;
	beforeEach(() => {
		c = setup();
	});

	const topUp = (who: KeyedMockChainParty, amount: bigint) =>
		buildTopUpTx({
			deployment: c.d,
			campaign: state(c),
			inputs: who.utxos.toArray(),
			changeAddress: who.address.encode(),
			amount,
			height: c.chain.height
		});

	it('anyone can add LIT; the rate for new locks goes up', () => {
		const before = state(c);
		expect(run(c, topUp(c.mallory, 500_000n * LIT_UNIT), [c.mallory])).toBe(true);
		const after = state(c);
		expect(after.budget).toBe(before.budget + 500_000n * LIT_UNIT);
		expect(after.v).toBe(before.v);
		expect(marginalAprBps(after.budget, after.v, 10_000)).toBeGreaterThan(
			marginalAprBps(before.budget, before.v, 10_000)
		);
	});

	it('rejects a "top-up" that changes V, takes a marker, or takes LIT out', () => {
		const edits: ((t: EIP12UnsignedTransaction) => void)[] = [
			(t) => {
				t.outputs[0].additionalRegisters.R4 = SBigInt(1n).toHex();
			},
			(t) => {
				t.outputs[0].assets[1].amount = add(t.outputs[0].assets[1].amount, -1n);
				changeOf(t, c.mallory).assets.push({ tokenId: MARKER, amount: '1' });
			},
			(t) => {
				// Net effect: 1 LIT added on paper, 2 LIT walked out of the budget.
				t.outputs[0].assets[2].amount = add(t.outputs[0].assets[2].amount, -2n * LIT_UNIT);
				const lit = changeOf(t, c.mallory).assets.find((a) => a.tokenId === LIT)!;
				lit.amount = add(lit.amount, 2n * LIT_UNIT);
			}
		];
		for (const edit of edits) {
			c = setup();
			expectOnlyTamperFails(c, topUp(c.mallory, LIT_UNIT), [c.mallory], edit);
		}
	});

	it('never reads OUTPUTS(1): a box with oddly typed registers there does not break a top-up', () => {
		const tx = tamper(topUp(c.mallory, LIT_UNIT), (t) => {
			const change = changeOf(t, c.mallory);
			change.value = add(change.value, -1_000_000n);
			t.outputs.splice(1, 0, {
				value: '1000000',
				ergoTree: c.mallory.ergoTree,
				creationHeight: c.chain.height,
				assets: [],
				additionalRegisters: {
					R4: SColl(SByte, [1, 2, 3]).toHex(),
					R5: SLong(7n).toHex(),
					R6: SColl(SByte, [4]).toHex()
				}
			});
		});
		expect(run(c, tx, [c.mallory])).toBe(true);
	});

	it('is closed after the end', () => {
		const tx = topUp(c.mallory, LIT_UNIT);
		c.chain.jumpTo(END);
		expect(run(c, tx, [c.mallory])).toBe(false);
		expect(() => topUp(c.mallory, LIT_UNIT)).toThrow(/ended/);
	});
});

describe('unlock', () => {
	let c: Ctx;
	let p: PositionState;
	beforeEach(() => {
		c = setup();
		expect(run(c, lock(c, c.alice, 5_000n * LIT_UNIT, 0).tx, [c.alice])).toBe(true);
		[p] = positionsOf(c);
	});

	const unlockBy = (who: KeyedMockChainParty, height = p.unlockAt) =>
		buildUnlockTx({ deployment: c.d, position: p, inputs: who.utxos.toArray(), height });

	it('returns principal + reward to the owner at the unlock height and burns the marker', () => {
		const litBefore = c.alice.balance.tokens.find((t) => t.tokenId === LIT)!.amount;
		c.chain.jumpTo(p.unlockAt - 1); // HEIGHT = unlockAt
		expect(run(c, unlockBy(c.alice), [c.alice])).toBe(true);
		const litAfter = c.alice.balance.tokens.find((t) => t.tokenId === LIT)!.amount;
		expect(litAfter - litBefore).toBe(p.principal + p.reward);
		expect(c.alice.balance.tokens.some((t) => t.tokenId === MARKER)).toBe(false);
		expect(positionsOf(c)).toHaveLength(0);
	});

	it('cannot unlock one block early', () => {
		const tx = unlockBy(c.alice);
		c.chain.jumpTo(p.unlockAt - 2); // HEIGHT = unlockAt - 1
		expect(run(c, tx, [c.alice])).toBe(false);
		c.chain.jumpTo(p.unlockAt - 1);
		expect(run(c, tx, [c.alice])).toBe(true);
	});

	it('nobody else can take a position, even after it unlocks', () => {
		c.chain.jumpTo(p.unlockAt + 1_000);
		const theft = unlockBy(c.mallory, c.chain.height);
		expect(run(c, theft, [c.mallory])).toBe(false);
		expect(run(c, unlockBy(c.alice, c.chain.height), [c.alice])).toBe(true);
	});

	it('does not depend on the campaign: unlock works after the sweep', () => {
		const payer = c.mallory;
		c.chain.jumpTo(Math.max(END + GRACE + 1, p.unlockAt));
		const sweep = buildSweepTx({
			deployment: c.d,
			campaign: state(c),
			inputs: payer.utxos.toArray(),
			changeAddress: payer.address.encode(),
			height: c.chain.height
		});
		expect(run(c, sweep, [payer])).toBe(true);
		expect(run(c, unlockBy(c.alice, c.chain.height), [c.alice])).toBe(true);
	});
});

describe('sweep', () => {
	let c: Ctx;
	beforeEach(() => {
		c = setup();
		expect(run(c, lock(c, c.alice, 5_000n * LIT_UNIT, 2).tx, [c.alice])).toBe(true);
	});

	const sweepBy = (who: KeyedMockChainParty) =>
		buildSweepTx({
			deployment: c.d,
			campaign: state(c),
			inputs: who.utxos.toArray(),
			changeAddress: who.address.encode(),
			height: c.chain.height
		});

	it('anyone can sweep after end + grace; everything goes to the fee address, NFT and markers burn', () => {
		const left = state(c).budget;
		c.chain.jumpTo(END + GRACE); // HEIGHT = END + GRACE + 1
		const feeBefore = c.fee.balance.nanoergs;
		expect(run(c, sweepBy(c.mallory), [c.mallory])).toBe(true);
		expect(c.campaign.utxos.toArray()).toHaveLength(0);
		expect(c.fee.balance.tokens.find((t) => t.tokenId === LIT)?.amount).toBe(left);
		expect(c.fee.balance.nanoergs - feeBefore).toBe(CAMPAIGN_BOX_VALUE);
		for (const party of [c.alice, c.bob, c.mallory, c.fee]) {
			expect(party.balance.tokens.some((t) => t.tokenId === NFT || t.tokenId === MARKER)).toBe(false);
		}
	});

	it('never evaluates the lock/top-up branch: a fee output with an odd R4 still sweeps', () => {
		c.chain.jumpTo(END + GRACE);
		const tx = tamper(sweepBy(c.mallory), (t) => {
			t.outputs[0].additionalRegisters = { R4: SColl(SByte, [9, 9]).toHex() };
		});
		expect(run(c, tx, [c.mallory])).toBe(true);
	});

	it('is closed until end + grace, and locks and top-ups are closed during the grace', () => {
		c.chain.jumpTo(END + GRACE); // builder refuses at END+GRACE-1..., so build at a legal height
		const tx = sweepBy(c.mallory);
		c.chain.jumpTo(END + GRACE - 1); // HEIGHT = END + GRACE
		expect(run(c, tx, [c.mallory])).toBe(false);
		c.chain.jumpTo(END + GRACE);
		expect(run(c, tx, [c.mallory])).toBe(true);
	});

	it('rejects a sweep to anyone but the fee address, a partial sweep, or one that keeps the NFT', () => {
		const edits: ((t: EIP12UnsignedTransaction) => void)[] = [
			(t) => {
				t.outputs[0].ergoTree = c.mallory.ergoTree;
			},
			(t) => {
				t.outputs[0].assets[0].amount = add(t.outputs[0].assets[0].amount, -1n);
				changeOf(t, c.mallory).assets.push({ tokenId: LIT, amount: '1' });
			},
			(t) => {
				changeOf(t, c.mallory).assets.push({ tokenId: NFT, amount: '1' });
			},
			(t) => {
				t.outputs[0].value = add(t.outputs[0].value, -1n);
				changeOf(t, c.mallory).value = add(changeOf(t, c.mallory).value, 1n);
			}
		];
		for (const edit of edits) {
			c = setup();
			c.chain.jumpTo(END + GRACE);
			expectOnlyTamperFails(c, sweepBy(c.mallory), [c.mallory], edit);
		}
	});
});

describe('authenticity', () => {
	it('a counterfeit campaign box with a fake NFT is never parsed as the campaign, nor its positions', () => {
		const c = setup();
		const fakeNft = 'cc'.repeat(32);
		const fakeMarker = 'dd'.repeat(32);
		c.campaign.addBalance(
			{
				nanoergs: CAMPAIGN_BOX_VALUE,
				tokens: [
					{ tokenId: fakeNft, amount: 1n },
					{ tokenId: fakeMarker, amount: 1_000n },
					{ tokenId: LIT, amount: 10n * LIT_UNIT }
				]
			},
			{ R4: SBigInt(1n).toHex() }
		);
		const fake = c.campaign.utxos.toArray().find((b) => b.assets[0].tokenId === fakeNft)!;
		expect(() => parseCampaignBox(fake, c.d)).toThrow(/campaign NFT/);

		// Locking against the fake works on-chain (it is the same script), but the
		// position carries the fake marker and is not recognised as genuine.
		const plan = buildLockTx({
			deployment: { ...c.d, campaignNftId: fakeNft, markerId: fakeMarker },
			campaign: { box: fake, budget: 10n * LIT_UNIT, markersLeft: 1_000n, v: 1n },
			inputs: c.mallory.utxos.toArray(),
			changeAddress: c.mallory.address.encode(),
			principal: 1_000n * LIT_UNIT,
			tier: 3,
			height: c.chain.height
		});
		expect(run(c, plan.tx, [c.mallory])).toBe(true);
		expect(c.positions.utxos.toArray()).toHaveLength(1);
		expect(positionsOf(c)).toHaveLength(0);
		expect(state(c).budget).toBe(BUDGET);
	});

	it('refuses boxes at the position address that were not made by the campaign', () => {
		const c = setup();
		c.positions.addBalance(
			{ nanoergs: ERG, tokens: [{ tokenId: LIT, amount: 1_000n * LIT_UNIT }] },
			{
				R4: SGroupElement(c.mallory.key.publicKey).toHex(),
				R5: SInt(START).toHex(),
				R6: SLong(1n).toHex(),
				R7: SLong(999n * LIT_UNIT).toHex(),
				R8: SInt(3).toHex()
			}
		);
		expect(positionsOf(c)).toHaveLength(0);
	});
});

describe('genesis', () => {
	it('mints the markers and the NFT, then creates a campaign the parser accepts', () => {
		const chain = new MockChain({ height: START - 100 });
		const deployer = chain.newParty('deployer');
		const fee = chain.newParty('fee');
		deployer.addBalance({ nanoergs: 10n * ERG, tokens: [{ tokenId: LIT, amount: BUDGET }] });
		const addr = deployer.address.encode();

		const markerTx = buildMintTx({
			height: chain.height,
			inputs: deployer.utxos.toArray(),
			to: addr,
			amount: MARKER_SUPPLY,
			name: 'LITLOCK position',
			description: 'MewLock x Lithos position marker',
			decimals: 0
		});
		const markerId = markerTx.inputs[0].boxId;
		expect(chain.execute(markerTx, { signers: [deployer] })).toBe(true);

		const nftTx = buildMintTx({
			height: chain.height,
			inputs: deployer.utxos.toArray(),
			to: addr,
			amount: 1n,
			name: 'LITLOCK campaign',
			description: 'MewLock x Lithos campaign',
			decimals: 0
		});
		const nftId = nftTx.inputs[0].boxId;
		expect(chain.execute(nftTx, { signers: [deployer] })).toBe(true);

		const params: CampaignParams = {
			network: 'mainnet',
			litId: LIT,
			feeAddress: fee.address.encode(),
			start: START,
			end: END,
			grace: GRACE,
			slack: 60,
			tiers: TIERS,
			minLock: LIT_UNIT
		};
		const campaignTree = compileCampaign(params, positionTree);
		const campaignParty = chain.addParty(campaignTree, 'campaign');
		const v0 = initialVirtualWeight(BUDGET, 5_000);
		const createTx = buildCampaignCreateTx({
			height: chain.height,
			inputs: deployer.utxos.toArray(),
			changeAddress: addr,
			campaignTree,
			campaignNftId: nftId,
			markerId,
			markerSupply: MARKER_SUPPLY,
			litId: LIT,
			budget: BUDGET,
			v0
		});
		expect(chain.execute(createTx, { signers: [deployer] })).toBe(true);

		const d: LithosDeployment = {
			network: 'mainnet',
			label: 'genesis',
			params: pinParams(params),
			positionTree,
			campaignTree,
			campaignNftId: nftId,
			markerId,
			genesisTxId: '',
			genesisHeight: chain.height,
			initialBudget: BUDGET.toString(),
			initialV: v0.toString()
		};
		const s = parseCampaignBox(campaignParty.utxos.toArray()[0], d);
		expect(s.budget).toBe(BUDGET);
		expect(s.v).toBe(v0);
		expect(s.markersLeft).toBe(MARKER_SUPPLY);
	});
});

describe('params', () => {
	const base: CampaignParams = {
		network: 'mainnet',
		litId: LIT,
		feeAddress: '9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED',
		start: 1,
		end: 2,
		grace: 0,
		slack: 60,
		tiers: TIERS,
		minLock: 1n
	};

	it('refuses mainnet tiers over one year, fee addresses on the wrong network, and a slack below the UI buffer', () => {
		expect(() => validateParams(base)).not.toThrow();
		expect(() => validateParams({ ...base, tiers: [{ blocks: BLOCKS_PER_YEAR + 1, boostBps: 1, label: '' }] })).toThrow(/one year/);
		expect(() => validateParams({ ...base, network: 'testnet' })).toThrow(/wrong network/);
		expect(() => validateParams({ ...base, slack: 5 })).toThrow(/slack/);
	});
});
