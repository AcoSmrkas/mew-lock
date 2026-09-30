// The page trusts the pinned trees. Each must be exactly what this source
// compiles from the pinned params, or the page would quote and build for a
// contract other than the one holding the funds.
import { describe, expect, it } from 'vitest';
import { compileCampaign, compilePosition } from './compile.ts';
import { paramsOf, readDeployment } from './deployment.ts';
import mainnet from './deployments/mainnet.json';
import testnet from './deployments/testnet.json';

describe('pinned deployments', () => {
	for (const [name, raw] of Object.entries({ mainnet, testnet })) {
		const d = readDeployment(raw);
		if (!d) continue;

		it(`${name}: trees recompile from the pinned params`, () => {
			expect(d.network).toBe(name);
			const position = compilePosition(d.network);
			expect(d.positionTree).toBe(position);
			expect(d.campaignTree).toBe(compileCampaign(paramsOf(d), position));
		});
	}
});
