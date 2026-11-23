import { afterEach, describe, expect, it, vi } from 'vitest';

const MEOW = 'd4f0192622b440afc09711aa0545eacd04d78ad3f8a063523f451e10d3d0e6ef';
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function stubFetch(answers: Record<string, unknown>) {
	const calls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			calls.push(url);
			const key = Object.keys(answers).find((k) => url.includes(k));
			if (!key || answers[key] instanceof Error) throw answers[key] ?? new TypeError('offline');
			return new Response(JSON.stringify(answers[key]));
		})
	);
	return calls;
}

async function freshService() {
	vi.resetModules();
	return (await import('./priceService')).priceService;
}

afterEach(() => vi.unstubAllGlobals());

describe('priceService', () => {
	it('prices tokens from one getTokenPrices call and getErgPrice', async () => {
		const calls = stubFetch({
			getErgPrice: { items: [{ value: '0.2', timestamp: now() }] },
			getTokenPrices: {
				items: [
					{ id: MEOW, ticker: 'MEOW', price_erg: 0.004 },
					{ id: 'zero', ticker: 'Z', price_erg: 0 }
				]
			}
		});
		const prices = await freshService();

		const meow = await prices.getTokenPrice(MEOW);
		expect(meow?.ergPrice).toBe(0.004);
		expect(meow?.usdPrice).toBeCloseTo(0.0008);
		expect(await prices.getTokenPrice('zero')).toBeNull();
		expect(await prices.getErgPrice()).toBe(0.2);
		expect(calls.filter((u) => u.includes('getTokenPrices'))).toHaveLength(1);
		expect(calls.some((u) => u.includes('spectrum'))).toBe(false);
	});

	it('leaves tokens unpriced when there is no ERG/USD rate', async () => {
		stubFetch({
			getErgPrice: { items: [{ value: '0.2', timestamp: '2020-01-01 00:00:00' }] },
			coingecko: new TypeError('offline'),
			getTokenPrices: { items: [{ id: MEOW, ticker: 'MEOW', price_erg: 0.004 }] }
		});
		const prices = await freshService();

		expect(await prices.getTokenPrice(MEOW)).toBeNull();
	});
});
