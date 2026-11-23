import axios from 'axios';

// chain-gateway (repo AcoSmrkas/chain-gateway) serves the node and explorer APIs and
// answers only from sources at the chain tip. A read it can't serve (no answer, a
// server error or a rate limit) is sent again to public sources, in order, so a gateway
// restart doesn't blank the page.
export const CHAIN_URL = 'https://chain.mewfinance.com';
export const EXPLORER_URL = `${CHAIN_URL}/explorer`;

const FALLBACKS: [string, string[]][] = [
	[EXPLORER_URL, ['https://api.ergoplatform.com']],
	[CHAIN_URL, ['https://node.ergopool.io', 'https://node.sigmaspace.io']]
];

export function fallbackUrls(url: string): string[] {
	for (const [prefix, hosts] of FALLBACKS) {
		if (url.startsWith(`${prefix}/`)) return hosts.map((to) => to + url.slice(prefix.length));
	}
	return [];
}

export function fallbackUrl(url: string): string | null {
	return fallbackUrls(url)[0] ?? null;
}

const shouldFallBack = (status?: number) =>
	status === undefined || status === 429 || status >= 500;

export async function chainFetch(url: string, init?: RequestInit): Promise<Response> {
	const alts = fallbackUrls(url);
	if (!alts.length) return fetch(url, init);
	const urls = [url, ...alts];
	for (let i = 0; i < urls.length - 1; i++) {
		try {
			const response = await fetch(urls[i], init);
			if (!shouldFallBack(response.status)) return response;
		} catch {
			// This source can't be reached: try the next one.
		}
	}
	return fetch(urls[urls.length - 1], init);
}

// The same for axios, which the explorer helpers use.
axios.interceptors.response.use(undefined, (error) => {
	const config = error?.config;
	const alts = config?.url ? fallbackUrls(config.chainOrigin ?? config.url) : [];
	const next = config?.chainFallback ?? 0;
	if (next >= alts.length || !shouldFallBack(error.response?.status)) return Promise.reject(error);
	return axios.request({
		...config,
		url: alts[next],
		chainOrigin: config.chainOrigin ?? config.url,
		chainFallback: next + 1
	});
});
