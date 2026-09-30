// Which chain the Lithos Lock page talks to. Mainnet by default; `?network=testnet`
// switches (and sticks for the tab) so the flow can be tried with Nautilus Testnet.
import type { LithosDeployment } from './deployment.ts';
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
		blockSeconds: 120,
		ergoPay: true,
		deployment: (mainnetDeployment as { campaignNftId?: string }).campaignNftId
			? (mainnetDeployment as LithosDeployment)
			: null
	},
	testnet: {
		network: 'testnet',
		explorerApi: 'https://api-testnet.ergoplatform.com/api/v1',
		graphqlApi: 'https://gql-testnet.ergoplatform.com/',
		txUrl: (id) => `https://testnet.ergoplatform.com/en/transactions/${id}`,
		blockSeconds: 60,
		ergoPay: false,
		deployment: (testnetDeployment as { campaignNftId?: string }).campaignNftId
			? (testnetDeployment as LithosDeployment)
			: null
	}
};

const SESSION_KEY = 'lithos_network';

export function pickNetwork(url: URL): NetworkConfig {
	const asked = url.searchParams.get('network');
	let network: Network = 'mainnet';
	try {
		if (asked === 'testnet' || asked === 'mainnet') sessionStorage.setItem(SESSION_KEY, asked);
		if (sessionStorage.getItem(SESSION_KEY) === 'testnet') network = 'testnet';
	} catch {
		if (asked === 'testnet') network = 'testnet';
	}
	return NETWORKS[network];
}
