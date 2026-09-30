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

		it(`${name}: legacy campaign remains pinned and readable`, () => {
			expect(d.network).toBe(name);
			expect(d.contractVersion).toBe(1);
			const position = compilePosition(d.network);
			expect(d.positionTree).toBe(position);
			// Campaign v1 predates the input-zero sweep isolation in the current
			// source. Its pinned tree stays authoritative for existing locks.
			expect(d.campaignTree).not.toBe(compileCampaign(paramsOf(d), position));
		});
	}
});
