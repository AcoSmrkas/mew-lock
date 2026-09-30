// Which chain the Lithos Lock page talks to. Always mainnet, except on a URL
// with `?network=testnet`, where the flow can be tried with Nautilus Testnet.
import { type LithosDeployment, readDeployment } from './deployment.ts';
import mainnetDeployment from './deployments/mainnet.json';
import testnetDeployment from './deployments/testnet.json';
import type { Network } from './params.ts';

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
	deployment: LithosDeployment | null;
};

const NETWORKS: Record<Network, NetworkConfig> = {
	mainnet: {
		network: 'mainnet',
		explorerApi: 'https://api.ergoplatform.com/api/v1',
		graphqlApi: 'https://gql.ergoplatform.com/',
		txUrl: (id) => `https://ergexplorer.com/transactions/${id}`,
		addressUrl: (a) => `https://ergexplorer.com/addresses/${a}`,
		blockSeconds: 120,
		ergoPay: true,
		deployment: readDeployment(mainnetDeployment)
	},
	testnet: {
		network: 'testnet',
		explorerApi: 'https://api-testnet.ergoplatform.com/api/v1',
		graphqlApi: 'https://gql-testnet.ergoplatform.com/',
		txUrl: (id) => `https://testnet.ergoplatform.com/en/transactions/${id}`,
		addressUrl: (a) => `https://testnet.ergoplatform.com/en/addresses/${a}`,
		blockSeconds: 60,
		ergoPay: false,
		deployment: readDeployment(testnetDeployment)
	}
};

/** The pinned configuration for a specific chain, for dashboard-style views. */
export function networkConfig(network: Network): NetworkConfig {
	return NETWORKS[network];
}

/** Mainnet unless this URL itself asks for testnet: a visit never inherits testnet from an earlier one. */
export function pickNetwork(url: URL): NetworkConfig {
	return NETWORKS[url.searchParams.get('network') === 'testnet' ? 'testnet' : 'mainnet'];
}
