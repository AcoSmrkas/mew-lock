// Which chain the Lithos Lock page talks to. Always mainnet, except on a URL
// with `?network=testnet`, where the flow can be tried with Nautilus Testnet.
import { type LithosDeployment, readDeployment } from './deployment.ts';
import mainnetDeployment from './deployments/mainnet.json';
import testnetDeployment from './deployments/testnet.json';
import type { Network } from './params.ts';

const DEPLOYMENTS_KEY = 'lithos_deployments';
const CAMPAIGN_KEY = 'lithos_campaign';

export type NetworkConfig = {
	network: Network;
	/** Explorer API v1 base, HTTPS so it works from the deployed site. */
	explorerApi: string;
	/** Explorer GraphQL, used to submit test-wallet txs (what Nautilus uses too). */
	graphqlApi: string;
	txUrl: (txId: string) => string;
	addressUrl: (address: string) => string;
	/** Rough block time used only to turn block counts into dates. */
	blockSeconds: number;
	/** ErgoPay goes through our mainnet relay only. */
	ergoPay: boolean;
	/** All deployments known to this browser for the selected network. */
	deployments: LithosDeployment[];
	/** The campaign selected by `?campaign=<campaign NFT>` or local choice. */
	deployment: LithosDeployment | null;
};

function bundled(raw: unknown): LithosDeployment[] {
	const deployment = readDeployment(raw);
	return deployment ? [deployment] : [];
}

const NETWORKS: Record<Network, NetworkConfig> = {
	mainnet: {
		network: 'mainnet',
		explorerApi: 'https://api.ergoplatform.com/api/v1',
		graphqlApi: 'https://gql.ergoplatform.com/',
		txUrl: (id) => `https://ergexplorer.com/transactions/${id}`,
		addressUrl: (a) => `https://ergexplorer.com/addresses/${a}`,
		blockSeconds: 120,
		ergoPay: true,
		deployments: bundled(mainnetDeployment),
		deployment: bundled(mainnetDeployment)[0] ?? null
	},
	testnet: {
		network: 'testnet',
		explorerApi: 'https://api-testnet.ergoplatform.com/api/v1',
		graphqlApi: 'https://gql-testnet.ergoplatform.com/',
		txUrl: (id) => `https://testnet.ergoplatform.com/en/transactions/${id}`,
		addressUrl: (a) => `https://testnet.ergoplatform.com/en/addresses/${a}`,
		blockSeconds: 60,
		ergoPay: false,
		deployments: bundled(testnetDeployment),
		deployment: bundled(testnetDeployment)[0] ?? null
	}
};

/** The pinned configuration for a specific chain, for dashboard-style views. */
export function networkConfig(network: Network): NetworkConfig {
	return NETWORKS[network];
}

/** Mainnet unless this URL itself asks for testnet: a visit never inherits testnet from an earlier one. */
export function pickNetwork(url: URL): NetworkConfig {
	const network: Network = url.searchParams.get('network') === 'testnet' ? 'testnet' : 'mainnet';
	const base = NETWORKS[network];
	let imported: LithosDeployment[] = [];
	let selected = url.searchParams.get('campaign') ?? '';
	try {
		const parsed = JSON.parse(localStorage.getItem(`${DEPLOYMENTS_KEY}:${network}`) ?? '[]');
		if (Array.isArray(parsed)) {
			imported = parsed
				.map(readDeployment)
				.filter((deployment): deployment is LithosDeployment => deployment?.network === network);
		}
		if (!selected) selected = localStorage.getItem(`${CAMPAIGN_KEY}:${network}`) ?? '';
		if (url.searchParams.get('campaign')) localStorage.setItem(`${CAMPAIGN_KEY}:${network}`, selected);
	} catch {
		// Storage is only a convenience. The bundled (including v1) campaign remains available.
	}
	const deployments = [...base.deployments, ...imported.filter((candidate) => !base.deployments.some((d) => d.campaignNftId === candidate.campaignNftId))];
	const deployment = deployments.find((candidate) => candidate.campaignNftId === selected) ?? deployments[0] ?? null;
	return { ...base, deployments, deployment };
}

/** Register a completed deployment locally so the same UI can use v1 and v2 campaigns side by side. */
export function rememberDeployment(deployment: LithosDeployment) {
	try {
		const key = `${DEPLOYMENTS_KEY}:${deployment.network}`;
		const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
		const deployments = (Array.isArray(saved) ? saved : []).filter(
			(candidate) => candidate?.campaignNftId !== deployment.campaignNftId
		);
		deployments.push(deployment);
		localStorage.setItem(key, JSON.stringify(deployments));
		localStorage.setItem(`${CAMPAIGN_KEY}:${deployment.network}`, deployment.campaignNftId);
	} catch {
		// The deployment JSON is still rendered and can be pinned in source control.
	}
}
