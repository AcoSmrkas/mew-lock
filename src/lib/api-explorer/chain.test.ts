import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { chainFetch, CHAIN_URL, EXPLORER_URL, fallbackUrl } from './chain';

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
	it('maps explorer reads to api.ergoplatform.com and node reads to a public node', () => {
		expect(fallbackUrl(`${EXPLORER_URL}${PATH}`)).toBe(`https://api.ergoplatform.com${PATH}`);
		expect(fallbackUrl(`${CHAIN_URL}/info`)).toBe('https://node.sigmaspace.io/info');
	});

	it('leaves every other URL alone', () => {
		expect(fallbackUrl(`https://socket.ergexplorer.com${PATH}`)).toBeNull();
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

describe('axios fallback', () => {
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
