// getPositions against a fake explorer: only the second output of a lock of this
// campaign counts as a position (audit P-1), whatever else sits at the position
// address with a marker and matching contents.
import type { Amount, Box } from '@fleet-sdk/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkConfig } from './network.ts';
import { LIT_UNIT, lock, run, setup, state } from './testkit.ts';
import { buildTopUpTx } from './txs.ts';

const API = 'https://explorer.test/api/v1';
const net = { network: 'mainnet', explorerApi: API } as NetworkConfig;

/**
 * A box as the explorer lists it. The mock chain gives every box its own
 * transaction id and index 0, so pass the real ones: the id of the transaction
 * that made it, and its output index (a lock makes the campaign box at 0 and
 * the position at 1).
 */
const json = (b: Box<Amount>, transactionId: string, index: number, spentTransactionId: string | null = null) => ({
	boxId: b.boxId,
	transactionId,
	index,
	value: String(b.value),
	ergoTree: b.ergoTree,
	creationHeight: b.creationHeight,
	assets: b.assets.map((a) => ({ tokenId: a.tokenId, amount: String(a.amount) })),
	additionalRegisters: b.additionalRegisters,
	spentTransactionId
});

/** A campaign with two locks and a top-up between them, as the explorer would show it. */
function campaignWithTwoLocks() {
	const c = setup();
	const genesis = state(c).box;
	const steps: { tx: string; campaign: Box<Amount> }[] = [{ tx: genesis.transactionId, campaign: genesis }];
	const step = (tx: { id: string }, signer: typeof c.alice) => {
		expect(run(c, tx as never, [signer])).toBe(true);
		steps.push({ tx: tx.id, campaign: state(c).box });
	};
	step(lock(c, c.alice, 1_000n * LIT_UNIT, 0).tx, c.alice);
	step(
		buildTopUpTx({
			deployment: c.d,
			campaign: state(c),
			inputs: c.bob.utxos.toArray(),
			changeAddress: c.bob.address.encode(),
			amount: LIT_UNIT,
			height: c.chain.height
		}),
		c.bob
	);
	step(lock(c, c.bob, 2_000n * LIT_UNIT, 1).tx, c.bob);

	const boxes = steps.map((s, i) => json(s.campaign, s.tx, 0, steps[i + 1]?.tx ?? null));
	// Oldest first, like the explorer: the NFT's mint output, then every campaign box.
	const mint = { ...boxes[0], boxId: 'ab'.repeat(32), transactionId: 'cd'.repeat(32), ergoTree: c.alice.ergoTree };
	const history = [mint, ...boxes];
	const [alicePos, bobPos] = c.positions.utxos.toArray();
	return {
		c,
		boxes,
		history,
		topUpTx: steps[2].tx,
		alice: json(alicePos, steps[1].tx, 1),
		bob: json(bobPos, steps[3].tx, 1)
	};
}

type Routes = { unspent: unknown[]; history: unknown[]; txs?: Record<string, unknown | 'fail'> };

function serve(d: { markerId: string; campaignNftId: string }, routes: Routes) {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (url: string) => {
		calls.push(url);
		const u = new URL(url);
		const offset = Number(u.searchParams.get('offset') ?? 0);
		const limit = Number(u.searchParams.get('limit') ?? 100);
		const page = (items: unknown[]) => Response.json({ items: items.slice(offset, offset + limit), total: items.length });
		if (u.pathname.endsWith(`/boxes/unspent/byTokenId/${d.markerId}`)) return page(routes.unspent);
		if (u.pathname.endsWith(`/boxes/byTokenId/${d.campaignNftId}`)) return page(routes.history);
		const tx = routes.txs?.[u.pathname.split('/').pop()!];
		if (tx === 'fail') return new Response('busy', { status: 503 });
		if (tx) return Response.json(tx);
		return new Response('not found', { status: 404 });
	});
	return calls;
}

describe('getPositions keeps only positions a lock of this campaign created (audit P-1)', () => {
	// Fresh module state (its caches) for every case.
	let getPositions: typeof import('./api.ts').getPositions;
	beforeEach(async () => {
		vi.resetModules();
		({ getPositions } = await import('./api.ts'));
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('drops look-alikes made with a kept marker, keeps both real locks', async () => {
		const { c, boxes, history, topUpTx, alice, bob } = campaignWithTwoLocks();
		const lookAlike = (boxId: string, transactionId: string, index: number) => ({
			...alice,
			boxId: boxId.repeat(32),
			transactionId,
			index
		});
		const unspent = [
			boxes[3], // the campaign box holds markers too
			alice,
			bob,
			lookAlike('f1', topUpTx, 1), // made inside the top-up
			lookAlike('f2', 'e0'.repeat(32), 1), // made by some other transaction
			lookAlike('f3', alice.transactionId, 2) // right lock, wrong output
		];
		const other = { inputs: [], outputs: [{ ergoTree: c.alice.ergoTree, assets: [] }] };
		serve(c.d, { unspent, history, txs: { ['e0'.repeat(32)]: other } });

		const got = await getPositions(net, c.d);
		expect(got.map((p) => p.box.boxId).sort()).toEqual([alice.boxId, bob.boxId].sort());
	});

	it('accepts a lock the history has not caught up with, from the transaction itself', async () => {
		const { c, boxes, history, alice, bob } = campaignWithTwoLocks();
		const lagging = history.slice(0, -1); // the backend has not indexed the second lock yet
		const bobsLock = { inputs: [boxes[2]], outputs: [boxes[3]] };
		serve(c.d, { unspent: [alice, bob], history: lagging, txs: { [bob.transactionId]: bobsLock } });

		expect((await getPositions(net, c.d)).map((p) => p.box.boxId).sort()).toEqual([alice.boxId, bob.boxId].sort());
	});

	it('never hides a position because a read failed', async () => {
		const { c, history, alice, bob } = campaignWithTwoLocks();
		const unknown = { ...bob, boxId: 'f4'.repeat(32), transactionId: 'e1'.repeat(32) };
		serve(c.d, { unspent: [alice, unknown], history, txs: { ['e1'.repeat(32)]: 'fail' } });
		expect(await getPositions(net, c.d)).toHaveLength(2);

		vi.resetModules();
		({ getPositions } = await import('./api.ts'));
		vi.stubGlobal('fetch', async (url: string) =>
			url.includes('/boxes/byTokenId/')
				? new Response('down', { status: 502 })
				: Response.json({ items: [alice, bob], total: 2 })
		);
		expect(await getPositions(net, c.d)).toHaveLength(2);
	});

	it('reads the campaign history once, then only its tail', async () => {
		const { c, history, alice, bob } = campaignWithTwoLocks();
		const calls = serve(c.d, { unspent: [alice, bob], history });
		await getPositions(net, c.d);
		await getPositions(net, c.d);
		const reads = calls.filter((u) => u.includes('/boxes/byTokenId/')).map((u) => new URL(u).searchParams.get('offset'));
		expect(reads).toEqual(['0', String(history.length - 1)]);
	});
});
