// A deployed campaign, as pinned in deployments/<network>.json after genesis.
// The UI trusts only these values: a campaign box is genuine when it sits at
// `campaignTree` and holds `campaignNftId`; a position is genuine when it sits
// at `positionTree`, holds exactly one `markerId` and the assets its registers
// declare.
import {
	type AssetId,
	CAMPAIGN_RESERVE,
	type CampaignParams,
	type Network,
	POSITION_DEPOSIT,
	type Tier
} from './params.ts';

/** How to show an asset: ERG is { ticker: 'ERG', decimals: 9 }. */
export type AssetInfo = { ticker: string; decimals: number };

export type LithosDeployment = {
	network: Network;
	label: string;
	/** Shown as a banner on the page (e.g. for a test campaign). */
	note?: string;
	params: {
		stakeId: AssetId;
		rewardId: AssetId;
		feeAddress: string;
		start: number;
		end: number;
		grace: number;
		slack: number;
		tiers: Tier[];
		minLock: string;
		deposit: string;
		reserve: string;
	};
	assets: { stake: AssetInfo; reward: AssetInfo };
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
	return {
		...d.params,
		network: d.network,
		minLock: BigInt(d.params.minLock),
		deposit: BigInt(d.params.deposit),
		reserve: BigInt(d.params.reserve)
	};
}

/** The JSON-safe `params` block of a deployment (network lives on the deployment itself). */
export function pinParams(p: CampaignParams): LithosDeployment['params'] {
	const { network: _network, minLock, deposit, reserve, ...rest } = p;
	return { ...rest, minLock: minLock.toString(), deposit: deposit.toString(), reserve: reserve.toString() };
}

/**
 * Read a deployment file. The first testnet campaigns were LIT-only (a single
 * `litId`); their contract is the lock-LIT-earn-LIT case of this one and their
 * positions are identical, so they map onto the same shape.
 */
export function readDeployment(raw: any): LithosDeployment | null {
	if (!raw?.campaignNftId) return null;
	if (raw.params.stakeId !== undefined) return raw as LithosDeployment;
	const lit = raw.params.litId as string;
	const info: AssetInfo = { ticker: raw.network === 'testnet' ? 'tLIT' : 'LIT', decimals: 9 };
	const { litId: _lit, ...params } = raw.params;
	return {
		...raw,
		params: {
			...params,
			stakeId: lit,
			rewardId: lit,
			deposit: POSITION_DEPOSIT.toString(),
			reserve: CAMPAIGN_RESERVE.toString()
		},
		assets: { stake: info, reward: info }
	};
}
