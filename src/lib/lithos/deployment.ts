// A deployed campaign, as pinned in deployments/<network>.json after genesis.
// The UI trusts only these values: a campaign box is genuine when it sits at
// `campaignTree` and holds `campaignNftId`; a position is genuine when it sits
// at `positionTree` and holds exactly one `markerId`.
import type { CampaignParams, Network, Tier } from './params.ts';

export type LithosDeployment = {
	network: Network;
	label: string;
	params: {
		litId: string;
		feeAddress: string;
		start: number;
		end: number;
		grace: number;
		slack: number;
		tiers: Tier[];
		minLock: string;
	};
	positionTree: string;
	campaignTree: string;
	campaignNftId: string;
	markerId: string;
	genesisTxId: string;
	genesisHeight: number;
	initialBudget: string;
	initialV: string;
};

export function paramsOf(d: LithosDeployment): CampaignParams {
	return { ...d.params, network: d.network, minLock: BigInt(d.params.minLock) };
}

/** The JSON-safe `params` block of a deployment (network lives on the deployment itself). */
export function pinParams(p: CampaignParams): LithosDeployment['params'] {
	const { network: _network, minLock, ...rest } = p;
	return { ...rest, minLock: minLock.toString() };
}
