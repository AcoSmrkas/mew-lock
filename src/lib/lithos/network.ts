// Which chain the Lithos Lock page talks to. Always mainnet, except on a URL
// with `?network=testnet`, where the flow can be tried with Nautilus Testnet.
// `deployment` is the campaign the page offers; `retired` holds earlier ones
// whose lockers can still unlock (`?campaign=<slug>` shows one of them).
import { type LithosDeployment, readDeployment } from './deployment.ts';
import mainnetDeployment from './deployments/mainnet.json';
import mainnetTestDeployment from './deployments/mainnet-test.json';
import testnetDeployment from './deployments/testnet.json';
import type { Network } from './params.ts';
import { EXPLORER_URL } from '../api-explorer/chain.ts';

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
	retired: LithosDeployment[];
};

const pinned = (...raw: unknown[]) => raw.map(readDeployment).filter((d): d is LithosDeployment => d !== null);

const NETWORKS: Record<Network, NetworkConfig> = {
	mainnet: {
		network: 'mainnet',
		explorerApi: `${EXPLORER_URL}/api/v1`,
		graphqlApi: 'https://gql.ergoplatform.com/',
		txUrl: (id) => `https://ergexplorer.com/transactions/${id}`,
		addressUrl: (a) => `https://ergexplorer.com/addresses/${a}`,
		blockSeconds: 120,
		ergoPay: true,
		deployment: readDeployment(mainnetDeployment),
		retired: pinned(mainnetTestDeployment)
	},
	testnet: {
		network: 'testnet',
		explorerApi: 'https://api-testnet.ergoplatform.com/api/v1',
		graphqlApi: 'https://gql-testnet.ergoplatform.com/',
		txUrl: (id) => `https://testnet.ergoplatform.com/en/transactions/${id}`,
		addressUrl: (a) => `https://testnet.ergoplatform.com/en/addresses/${a}`,
		blockSeconds: 60,
		ergoPay: false,
		deployment: readDeployment(testnetDeployment),
		retired: []
	}
};

/** The pinned configuration for a specific chain, for dashboard-style views. */
export function networkConfig(network: Network): NetworkConfig {
	return NETWORKS[network];
}

/**
 * Mainnet unless this URL itself asks for testnet: a visit never inherits
 * testnet from an earlier one. `?campaign=<slug>` swaps in a retired campaign.
 */
export function pickNetwork(url: URL): NetworkConfig {
	const net = NETWORKS[url.searchParams.get('network') === 'testnet' ? 'testnet' : 'mainnet'];
	const slug = url.searchParams.get('campaign');
	const earlier = slug ? net.retired.find((d) => d.slug === slug) : undefined;
	return earlier ? { ...net, deployment: earlier } : net;
}

/** Every pinned campaign of a network, the current one first: where someone's locks can be. */
export function campaignsOf(net: NetworkConfig): LithosDeployment[] {
	const all = [net.deployment, ...net.retired].filter((d): d is LithosDeployment => d !== null);
	return all.filter((d, i) => all.findIndex((x) => x.campaignNftId === d.campaignNftId) === i);
}

/**
 * A pinned v2 campaign that already pays `address` its leftover. v2 never
 * checks its input index, so a newer campaign paying the same address could be
 * swept together with it and pay that address only once (audit V3-1).
 */
export function leftoverClash(net: NetworkConfig, address: string): LithosDeployment | undefined {
	return campaignsOf(net).find((d) => d.contract < 3 && d.params.feeAddress === address.trim());
}
