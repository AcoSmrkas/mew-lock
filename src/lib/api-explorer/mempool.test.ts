import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEE_CONTRACT } from '@fleet-sdk/core';
import { fetchMempoolTxs, mergeMempoolItems } from './mempool.ts';

const ADDRESS = '9fakeAddress';
const OURS = `https://socket.ergexplorer.com/api/v1/mempool/transactions/byAddress/${ADDRESS}`;
const EXPLORER = `https://api.ergoplatform.com/api/v1/mempool/transactions/byAddress/${ADDRESS}`;

function tx(id: string, inputs: string[], fee: number, size = 1000, creationTimestamp = 0) {
	return {
		id,
		creationTimestamp,
		size,
		inputs: inputs.map((boxId) => ({ boxId })),
		outputs: [
			{ boxId: `${id}-out`, value: 1000000000, ergoTree: '0008cd' },
			{ boxId: `${id}-fee`, value: fee, ergoTree: FEE_CONTRACT }
		]
	};
}

const ids = (result) => result.items.map((item) => item.id);

describe('mergeMempoolItems', () => {
	it('keeps one copy of a tx both sources hold, the first source’s', () => {
		const ours = tx('a', ['box1'], 1100000, 1000, 2);
		const theirs = tx('a', ['box1'], 1100000, 1000, 1);

		const result = mergeMempoolItems([[ours], [theirs]]);

		expect(result.total).toBe(1);
		expect(result.items[0]).toBe(ours);
	});

	it('keeps the better fee per byte when two txs spend the same box', () => {
		const original = tx('original', ['box1', 'box2'], 1100000);
		const bumped = tx('bumped', ['box1'], 5000000);

		expect(ids(mergeMempoolItems([[original], [bumped]]))).toEqual(['bumped']);
		expect(ids(mergeMempoolItems([[bumped], [original]]))).toEqual(['bumped']);
	});

	it('compares fee per byte, not the total fee', () => {
		const big = tx('big', ['box1'], 2000000, 2000);
		const dense = tx('dense', ['box1'], 1500000, 1000);

		expect(ids(mergeMempoolItems([[big], [dense]]))).toEqual(['dense']);
	});

	it('keeps chained txs, which spend different boxes', () => {
		const parent = tx('parent', ['box1'], 1100000, 1000, 1);
		const child = tx('child', ['parent-out'], 1100000, 1000, 2);

		expect(ids(mergeMempoolItems([[parent], [child]]))).toEqual(['child', 'parent']);
	});

	it('lists the newest first', () => {
		const older = tx('older', ['box1'], 1100000, 1000, 100);
		const newer = tx('newer', ['box2'], 1100000, 1000, 200);

		expect(ids(mergeMempoolItems([[older, newer], []]))).toEqual(['newer', 'older']);
	});
});

describe('fetchMempoolTxs', () => {
	let fetchMock;

	const respond = (routes) =>
		fetchMock.mockImplementation(async (url) => {
			const route = routes[url];
			if (route instanceof Error) throw route;
			return new Response(route.body, { status: route.status ?? 200 });
		});

	const page = (...items) => ({ body: JSON.stringify({ items, total: items.length }) });

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('reads both sources with plain GETs and merges them', async () => {
		respond({ [OURS]: page(tx('a', ['box1'], 1100000)), [EXPLORER]: page(tx('b', ['box2'], 1100000)) });

		const result = await fetchMempoolTxs(ADDRESS);

		expect(ids(result).sort()).toEqual(['a', 'b']);
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([OURS, EXPLORER]);
		for (const [, init] of fetchMock.mock.calls) {
			expect(init.headers).toBeUndefined();
			expect(init.cache).toBe('no-store');
		}
	});

	it('uses the other source when one errors', async () => {
		respond({ [OURS]: { status: 502, body: 'Bad Gateway' }, [EXPLORER]: page(tx('b', ['box2'], 1100000)) });
		expect(ids(await fetchMempoolTxs(ADDRESS))).toEqual(['b']);

		respond({ [OURS]: page(tx('a', ['box1'], 1100000)), [EXPLORER]: new TypeError('Failed to fetch') });
		expect(ids(await fetchMempoolTxs(ADDRESS))).toEqual(['a']);

		respond({ [OURS]: page(tx('a', ['box1'], 1100000)), [EXPLORER]: { body: '{"status":500}' } });
		expect(ids(await fetchMempoolTxs(ADDRESS))).toEqual(['a']);
	});

	it('uses the other source when one hangs', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation((url, init) => {
			if (url === EXPLORER) return Promise.resolve(new Response(page(tx('b', ['box2'], 1)).body));
			return new Promise((_, reject) =>
				init.signal.addEventListener('abort', () => reject(new Error('aborted')))
			);
		});

		const pending = fetchMempoolTxs(ADDRESS);
		await vi.advanceTimersByTimeAsync(15000);

		expect(ids(await pending)).toEqual(['b']);
	});

	it('rejects only when every source fails', async () => {
		respond({ [OURS]: new TypeError('Failed to fetch'), [EXPLORER]: { status: 500, body: '' } });

		await expect(fetchMempoolTxs(ADDRESS)).rejects.toThrow('Mempool fetch failed');
	});

	it('keeps values above 2^53 exact', async () => {
		const body = `{"items":[{"id":"a","size":100,"inputs":[],"outputs":[{"boxId":"b","value":97739924000000001,"ergoTree":"00"}]}],"total":1}`;
		respond({ [OURS]: { body }, [EXPLORER]: page() });

		const result = await fetchMempoolTxs(ADDRESS);

		expect(String(result.items[0].outputs[0].value)).toBe('97739924000000001');
	});
});
