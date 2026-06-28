import { get } from 'svelte/store';
import { io } from 'socket.io-client';
import {
	socket,
	mempoolTxs,
	unconfirmedOrderBoxes,
	unconfirmedInputBoxIds
} from '$lib/store/store';
import { SOCKET_URL, CONTRACT_ERGOTREE } from '$lib/common/const';

export function initSocket() {
	if (get(socket) !== undefined) return;

	const newSocket = io(SOCKET_URL);

	newSocket?.on('connect', () => {
		console.log('Connected to server at', SOCKET_URL);
	});

	newSocket?.on('connect_error', (error) => {
		console.error('Connection error:', error);
	});

	newSocket?.on('mempoolTxs', async (txs) => {
		mempoolTxs.set(txs);

		const mempoolInputBoxIds = txs.flatMap((tx) => tx.inputs).map((i) => i.boxId);

		// A hardcoded sample order box used to be injected here (dev-stub leftover);
		// removed. Optimistic new-listing insertion from real mempool outputs is a
		// future enhancement (parse marketplace contract outputs and merge into the
		// offers grid).
		unconfirmedOrderBoxes.set([]);
		unconfirmedInputBoxIds.set(mempoolInputBoxIds);
	});

	newSocket?.onAny(() => {
		socket.set(newSocket);
	});

	socket.set(newSocket);
}
