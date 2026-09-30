import axios from 'axios';

// chain-gateway (repo AcoSmrkas/chain-gateway) serves the node and explorer APIs and
// answers only from sources at the chain tip. A read it can't serve (no answer, a
// server error or a rate limit) is sent again to a public source, so a gateway restart
// doesn't blank the page.
export const CHAIN_URL = 'https://chain.mewfinance.com';
export const EXPLORER_URL = `${CHAIN_URL}/explorer`;

const FALLBACKS: [string, string][] = [
	[EXPLORER_URL, 'https://api.ergoplatform.com'],
	[CHAIN_URL, 'https://node.sigmaspace.io']
];

export function fallbackUrl(url: string): string | null {
	for (const [prefix, to] of FALLBACKS) {
		if (url.startsWith(`${prefix}/`)) return to + url.slice(prefix.length);
	}
	return null;
}

const shouldFallBack = (status?: number) =>
	status === undefined || status === 429 || status >= 500;

export async function chainFetch(url: string, init?: RequestInit): Promise<Response> {
	const alt = fallbackUrl(url);
	if (!alt) return fetch(url, init);
	try {
		const response = await fetch(url, init);
		if (!shouldFallBack(response.status)) return response;
	} catch {
		// The gateway can't be reached: fall back below.
	}
	return fetch(alt, init);
}

// The same for axios, which the explorer helpers use.
axios.interceptors.response.use(undefined, (error) => {
	const config = error?.config;
	const alt = config?.url && !config.chainFallback ? fallbackUrl(config.url) : null;
	if (!alt || !shouldFallBack(error.response?.status)) return Promise.reject(error);
	return axios.request({ ...config, url: alt, chainFallback: true });
});
