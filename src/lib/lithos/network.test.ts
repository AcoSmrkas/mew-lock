import { describe, expect, it } from 'vitest';
import { campaignsOf, leftoverClash, networkConfig, pickNetwork } from './network.ts';

describe('campaign selection', () => {
	const mainnet = networkConfig('mainnet');
	const test = mainnet.retired.find((d) => d.slug === 'test')!;

	it('keeps the v2 test campaign as a retired campaign reachable by its slug', () => {
		expect(test.retired).toBe(true);
		expect(test.contract).toBe(2);
		expect(pickNetwork(new URL('https://lock.mewfinance.com/lithos?campaign=test')).deployment).toBe(test);
		expect(pickNetwork(new URL('https://lock.mewfinance.com/lithos')).deployment).toBe(mainnet.deployment);
		expect(pickNetwork(new URL('https://lock.mewfinance.com/lithos?campaign=nope')).deployment).toBe(mainnet.deployment);
		expect(campaignsOf(mainnet)).toContain(test);
		expect(pickNetwork(new URL('https://lock.mewfinance.com/lithos?network=testnet&campaign=test')).network).toBe('testnet');
	});

	it('refuses a new leftover address that a v2 campaign already pays (audit V3-1)', () => {
		expect(leftoverClash(mainnet, ` ${test.params.feeAddress} `)).toBe(test);
		expect(leftoverClash(mainnet, '9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED')).toBeUndefined();
	});
});
