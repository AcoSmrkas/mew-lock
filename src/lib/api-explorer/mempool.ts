import JSONbig from 'json-bigint-native';
import { FEE_CONTRACT } from '@fleet-sdk/core';

/*
 * Pending txs are read from our own node's mempool and from api.ergoplatform.com's, then
 * merged. The explorer's mempool misses txs that entered the network through other nodes
 * (Nautilus broadcasts via sigmaspace) and lags by minutes; ours also pulls in what other
 * public nodes hold. Both serve the same shape, and both are mainnet.
 */
const MEMPOOL_HOSTS = [
	'https://socket.ergexplorer.com/api/v1/mempool/',
	'https://api.ergoplatform.com/api/v1/mempool/'
];

const MEMPOOL_TIMEOUT_MS = 15000;

type Parse = (text: string) => any;

/**
 * Pending txs involving `address`, as { items, total } like the explorer's endpoint.
 * A source that fails or hangs is skipped; this rejects only if every source fails.
 */
export async function fetchMempoolTxs(address: string, parse: Parse = JSONbig.parse) {
	const results = await Promise.allSettled(
		MEMPOOL_HOSTS.map((host) => fetchItems(`${host}transactions/byAddress/${address}`, parse))
	);

	const lists = [];
	for (const result of results) {
		if (result.status === 'fulfilled') {
			lists.push(result.value);
		} else {
			console.warn('Mempool source failed:', result.reason);
		}
	}

	if (lists.length === 0) {
		throw new Error(`Mempool fetch failed for ${address}`);
	}

	return mergeMempoolItems(lists);
}

async function fetchItems(url: string, parse: Parse) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), MEMPOOL_TIMEOUT_MS);

	try {
		// No custom headers: one (e.g. Cache-Control) makes the browser send a CORS
		// preflight, which socket.ergexplorer.com doesn't answer.
		const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
		if (!response.ok) {
			throw new Error(`${response.status} from ${url}`);
		}

		const data = parse(await response.text());
		if (!Array.isArray(data?.items)) {
			throw new Error(`No items from ${url}`);
		}

		return data.items;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Merges pending-tx lists by tx id; the first list wins a tie. Sources can hold different
 * sides of a double-spend (e.g. a fee-bumped replacement only one node has seen), so one tx
 * is kept per spent box: the best fee per byte, as nodes do.
 */
export function mergeMempoolItems(lists: any[][]) {
	const byId = new Map();

	for (const items of lists) {
		for (const tx of items || []) {
			if (tx && tx.id && !byId.has(tx.id)) {
				byId.set(tx.id, tx);
			}
		}
	}

	const spent = new Set();
	const kept = [];

	for (const tx of [...byId.values()].sort((a, b) => feePerByte(b) - feePerByte(a))) {
		const inputIds = (tx.inputs || []).map((input) => input.boxId);
		if (inputIds.some((id) => spent.has(id))) continue;

		inputIds.forEach((id) => spent.add(id));
		kept.push(tx);
	}

	const items = kept.sort((a, b) => (b.creationTimestamp || 0) - (a.creationTimestamp || 0));

	return { items, total: items.length };
}

function feePerByte(tx) {
	let fee = 0;

	for (const output of tx.outputs || []) {
		if (output.ergoTree === FEE_CONTRACT) {
			fee += Number(output.value);
		}
	}

	return tx.size ? fee / tx.size : fee;
}
