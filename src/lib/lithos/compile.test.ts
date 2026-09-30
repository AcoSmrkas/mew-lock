import { describe, expect, it } from 'vitest';
import { compileCampaign, compilePosition } from './compile.ts';
import { CAMPAIGN_RESERVE, type CampaignParams, POSITION_DEPOSIT } from './params.ts';

const params: CampaignParams = {
	network: 'testnet',
	stakeId: 'c1980d829988229516430a47a5eca376060b6ce859616db0936e78ab25cb6de7',
	rewardId: 'c1980d829988229516430a47a5eca376060b6ce859616db0936e78ab25cb6de7',
	feeAddress: '3WxwwSHMbvtFfZBbve1ScBsg3J18dx55tQht3AGraHxP6FX7FzcW',
	start: 100,
	end: 1_000,
	grace: 50,
	slack: 60,
	tiers: [
		{ blocks: 21_600, boostBps: 10_000, label: '30d' },
		{ blocks: 262_800, boostBps: 20_000, label: '1y' }
	],
	minLock: 1_000_000_000n,
	deposit: POSITION_DEPOSIT,
	reserve: CAMPAIGN_RESERVE
};

describe('compile', () => {
	it('produces ErgoTree v1 trees (0x19 header) that Nautilus can parse', () => {
		const position = compilePosition('testnet');
		const campaign = compileCampaign(params, position);
		expect(position.slice(0, 2)).toBe('19');
		expect(campaign.slice(0, 2)).toBe('19');
	});

	it('bakes every parameter into the campaign tree', () => {
		const position = compilePosition('testnet');
		const a = compileCampaign(params, position);
		expect(compileCampaign({ ...params, end: 1_001 }, position)).not.toBe(a);
		expect(compileCampaign({ ...params, minLock: 2n }, position)).not.toBe(a);
		expect(compileCampaign({ ...params, rewardId: null }, position)).not.toBe(a);
		expect(compileCampaign({ ...params, stakeId: null }, position)).not.toBe(a);
		expect(
			compileCampaign({ ...params, tiers: [{ blocks: 21_600, boostBps: 10_001, label: '30d' }] }, position)
		).not.toBe(a);
		expect(a).toContain(position.slice(2));
	});
});
