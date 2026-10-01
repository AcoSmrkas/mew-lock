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
	/** Campaign contract version (see CAMPAIGN_VERSION); files pinned before it was recorded are v2. */
	contract: number;
	label: string;
	/** Shown as a banner on the page (e.g. for a test campaign). */
	note?: string;
	/** A campaign kept only so its lockers can finish: `/lithos?campaign=<slug>` shows it. */
	slug?: string;
	/** The page offers no new locks or top-ups; unlocks and the sweep still work. */
	retired?: boolean;
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
 * Read a deployment file. Files pinned before `contract` was recorded are v2
 * (generic), or v1 when they carry a single `litId`: the first testnet
 * campaigns were LIT-only, the lock-LIT-earn-LIT case of the same design with
 * identical positions, so they map onto the same shape.
 */
export function readDeployment(raw: any): LithosDeployment | null {
	if (!raw?.campaignNftId) return null;
	if (raw.params.stakeId !== undefined) return { contract: 2, ...raw } as LithosDeployment;
	const lit = raw.params.litId as string;
	const info: AssetInfo = { ticker: raw.network === 'testnet' ? 'tLIT' : 'LIT', decimals: 9 };
	const { litId: _lit, ...params } = raw.params;
	return {
		...raw,
		contract: 1,
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
