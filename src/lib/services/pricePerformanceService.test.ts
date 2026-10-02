import { afterEach, describe, expect, it, vi } from 'vitest';
import { PricePerformanceService } from './pricePerformanceService.js';

const ERG = '0000000000000000000000000000000000000000000000000000000000000000';
const TOKEN = 'aa'.repeat(32);
const HOUR = 3600 * 1000;
const PRICE_AT = 'https://api.ergexplorer.com/tokens/getTokenPriceAt';
const CURRENT = { ergUsd: 4, tokens: { [TOKEN]: { usdPrice: 3 } } };

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// Block `height` was mined at height hours plus ten minutes.
const blockTime = (height: number) => height * HOUR + 10 * 60 * 1000;

const lock = (height: number, tokens: string[] = []) => ({
	boxId: `box-${height}-${tokens.length}`,
	value: 1e9,
	creationHeight: height,
	assets: tokens.map((tokenId) => ({ tokenId, amount: 100, decimals: 2 }))
});

// Answers like ergo.watch and getTokenPriceAt: prices are logged on the hour, ERG at
// $2 and every token at $1, for every asked-for id at every snapped timestamp.
function stubApis(priceStatus = 200) {
	const posts: { ids: string[]; timestamps: number[] }[] = [];
	const heights: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			if (url.startsWith('https://api.ergo.watch/utils/height2timestamp/')) {
				const height = url.split('/').pop()!;
				heights.push(height);
				return new Response(String(blockTime(Number(height))));
			}
			expect(url).toBe(PRICE_AT);
			const body = init!.body as URLSearchParams;
			const ids = body.getAll('ids[]');
			const timestamps = body.getAll('timestamps[]').map(Number);
			posts.push({ ids, timestamps });
			if (priceStatus !== 200) return new Response('', { status: priceStatus });

			const snapped = [...new Set(timestamps.map((t) => Math.round(t / HOUR) * HOUR))];
			const items = snapped.flatMap((at) =>
				[...new Set(ids)].map((id) => ({
					tokenid: id === 'ERG' ? null : id,
					ticker: id === 'ERG' ? 'ERG' : 'TKN',
					price: id === 'ERG' ? '2' : '1',
					timestamp: String(at)
				}))
			);
			return new Response(JSON.stringify({ items, total: items.length }));
		})
	);
	return { posts, heights };
}

describe('calculateLocksPerformance', () => {
	it('prices a whole lock list in one sorted getTokenPriceAt call', async () => {
		const { posts, heights } = stubApis();
		const service = new PricePerformanceService();
		const locks = [lock(30, [TOKEN]), lock(10), lock(20), lock(10, [TOKEN])];

		const results = await service.calculateLocksPerformance(locks, CURRENT);

		expect(heights.sort()).toEqual(['10', '20', '30']);
		expect(posts).toHaveLength(1);
		const { ids, timestamps } = posts[0];
		expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
		expect(ids).toEqual(['ERG', TOKEN, 'ERG', 'ERG', TOKEN]);

		// 1 ERG bought at $2, now $4; 1 token bought at $1, now $3.
		const ergOnly = results.get(lock(10).boxId);
		expect(ergOnly.overallPerformance.priceChangePercent).toBe(100);
		const withToken = results.get(lock(30, [TOKEN]).boxId);
		expect(withToken.overallPerformance.historicalValue).toBe(3);
		expect(withToken.overallPerformance.currentValue).toBe(7);
		expect(withToken.lockTimestamp).toBe(blockTime(30));
	});

	it('keeps the crux price shape', async () => {
		stubApis();
		const service = new PricePerformanceService();

		expect(await service.getHistoricalPrice(TOKEN, blockTime(5))).toEqual({
			erg_price_usd: 2,
			asset_price_erg: 0.5
		});
		expect(await service.getHistoricalPrice(ERG, blockTime(5))).toEqual({
			erg_price_usd: 2,
			asset_price_erg: 1
		});
	});

	it('shares in-flight requests and caches the answers', async () => {
		const { posts, heights } = stubApis();
		const service = new PricePerformanceService();
		const locks = [lock(10), lock(20, [TOKEN])];

		await Promise.all([
			service.calculateLocksPerformance(locks, CURRENT),
			service.calculateLocksPerformance(locks, CURRENT)
		]);
		await service.calculateLocksPerformance(locks, CURRENT);

		expect(heights).toHaveLength(2);
		expect(posts).toHaveLength(1);
	});

	it('remembers a failed price lookup for a minute instead of retrying it', async () => {
		const { posts } = stubApis(504);
		const service = new PricePerformanceService();
		const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
		const locks = [lock(10)];

		const first = await service.calculateLocksPerformance(locks, CURRENT);
		expect(first.get(locks[0].boxId).overallPerformance.historicalValue).toBe(0);
		await service.calculateLocksPerformance(locks, CURRENT);
		expect(posts).toHaveLength(1);

		now.mockReturnValue(1_000_000 + 61 * 1000);
		await service.calculateLocksPerformance(locks, CURRENT);
		expect(posts).toHaveLength(2);
	});

	it('splits a long list into requests of at most 50 pairs, each with ERG', async () => {
		const { posts } = stubApis();
		const service = new PricePerformanceService();
		const locks = Array.from({ length: 40 }, (_, i) => lock(100 + i, [TOKEN]));

		const results = await service.calculateLocksPerformance(locks, CURRENT);

		expect(posts.length).toBeGreaterThan(1);
		for (const { ids, timestamps } of posts) {
			expect(ids.length).toBeLessThanOrEqual(50);
			for (const t of new Set(timestamps)) {
				expect(ids.some((id, i) => id === 'ERG' && timestamps[i] === t)).toBe(true);
			}
		}
		expect([...results.values()].every((r) => r.overallPerformance.historicalValue === 3)).toBe(true);
	});
});
