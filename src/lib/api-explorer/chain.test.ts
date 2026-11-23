import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { chainFetch, CHAIN_URL, EXPLORER_URL, fallbackUrl, fallbackUrls } from './chain';

const PATH = '/api/v1/networkState';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function stubFetch(answer: (url: string) => Response | Promise<Response>) {
	const calls: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string) => {
			calls.push(url);
			return answer(url);
		})
	);
	return calls;
}

describe('fallbackUrl', () => {
	it('maps explorer reads to api.ergoplatform.com and node reads to public nodes', () => {
		expect(fallbackUrl(`${EXPLORER_URL}${PATH}`)).toBe(`https://api.ergoplatform.com${PATH}`);
		expect(fallbackUrls(`${CHAIN_URL}/info`)).toEqual([
			'https://node.ergopool.io/info',
			'https://node.sigmaspace.io/info'
		]);
	});

	it('leaves every other URL alone', () => {
		expect(fallbackUrl(`https://socket.ergexplorer.com${PATH}`)).toBeNull();
		expect(fallbackUrls(`https://socket.ergexplorer.com${PATH}`)).toEqual([]);
	});
});

describe('chainFetch', () => {
	it('uses the gateway answer when there is one, including a 404', async () => {
		const calls = stubFetch(() => new Response('{}', { status: 404 }));

		expect((await chainFetch(`${EXPLORER_URL}${PATH}`)).status).toBe(404);
		expect(calls).toEqual([`${EXPLORER_URL}${PATH}`]);
	});

	it('falls back when the gateway is unreachable, fails or rate limits', async () => {
		for (const gateway of [() => Promise.reject(new TypeError('offline')), 503, 429]) {
			const calls = stubFetch((url) => {
				if (url.startsWith('https://api.ergoplatform.com')) return new Response('{}');
				return typeof gateway === 'number' ? new Response('', { status: gateway }) : gateway();
			});

			expect((await chainFetch(`${EXPLORER_URL}${PATH}`)).status).toBe(200);
			expect(calls).toEqual([`${EXPLORER_URL}${PATH}`, `https://api.ergoplatform.com${PATH}`]);
		}
	});
});

describe('node fallbacks', () => {
	it('tries each public node in order', async () => {
		const calls = stubFetch((url) => {
			if (url.startsWith('https://node.sigmaspace.io')) return new Response('{}');
			if (url.startsWith('https://node.ergopool.io')) return Promise.reject(new TypeError('offline'));
			return new Response('', { status: 502 });
		});

		expect((await chainFetch(`${CHAIN_URL}/info`)).status).toBe(200);
		expect(calls).toEqual([
			`${CHAIN_URL}/info`,
			'https://node.ergopool.io/info',
			'https://node.sigmaspace.io/info'
		]);
	});

	it('stops at the first public node that answers', async () => {
		const calls = stubFetch((url) =>
			url.startsWith(CHAIN_URL) ? new Response('', { status: 503 }) : new Response('{}')
		);

		expect((await chainFetch(`${CHAIN_URL}/info`)).status).toBe(200);
		expect(calls).toEqual([`${CHAIN_URL}/info`, 'https://node.ergopool.io/info']);
	});

	it('returns the last answer when every source fails', async () => {
		stubFetch(() => new Response('', { status: 503 }));

		expect((await chainFetch(`${CHAIN_URL}/info`)).status).toBe(503);
	});
});

describe('axios fallback', () => {
	it('walks the node fallbacks in order', async () => {
		const urls: string[] = [];
		vi.spyOn(axios.defaults, 'adapter', 'get').mockReturnValue(async (config) => {
			urls.push(config.url!);
			if (!config.url!.startsWith('https://node.sigmaspace.io')) {
				throw new axios.AxiosError('down', 'ERR', config, null, {
					status: 503,
					statusText: '',
					headers: {},
					config,
					data: ''
				});
			}
			return { status: 200, statusText: 'OK', headers: {}, config, data: { fullHeight: 1 } };
		});

		expect((await axios.get(`${CHAIN_URL}/info`)).data.fullHeight).toBe(1);
		expect(urls).toEqual([
			`${CHAIN_URL}/info`,
			'https://node.ergopool.io/info',
			'https://node.sigmaspace.io/info'
		]);
	});

	it('retries a failed gateway read against the fallback once', async () => {
		const urls: string[] = [];
		vi.spyOn(axios.defaults, 'adapter', 'get').mockReturnValue(async (config) => {
			urls.push(config.url!);
			if (config.url!.startsWith(EXPLORER_URL)) {
				throw new axios.AxiosError('down', 'ERR', config, null, {
					status: 502,
					statusText: '',
					headers: {},
					config,
					data: ''
				});
			}
			return { status: 200, statusText: 'OK', headers: {}, config, data: { height: 1 } };
		});

		expect((await axios.get(`${EXPLORER_URL}${PATH}`)).data.height).toBe(1);
		expect(urls).toEqual([`${EXPLORER_URL}${PATH}`, `https://api.ergoplatform.com${PATH}`]);
	});
});
