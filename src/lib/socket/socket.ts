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

		// const mempoolOrderBoxes = txs
		//     .flatMap(tx => tx.outputs)
		//     .filter(o => o.ergoTree === CONTRACT_ERGOTREE);

		const mempoolInputBoxIds = txs.flatMap((tx) => tx.inputs).map((i) => i.boxId);

		const mempoolOrderBoxes = JSON.parse(`[{
    "boxId": "d29bd180132db0012fa6f1125a8fa81e6d454f068b6cab45e5af163da2a6fd8a",
    "value": 1000000,
    "ergoTree": "19a3030e05a01f05a01f05c09a0c040008cd02593abf7a55bd30ecb0d9cc89284f577db9c673bd6dba3642d5ec2eba1b131a02040202010400040204000400020204000100d80ed601e4e30002d602e4c6a70406d603e4c6a70605d60495917203730072037301d6057302d6069d9c72027e9ae4c6a709057204067e720506d607e4c6a70508d608e4c6a7070ed60993b172087303d60a9d9c72027e7204067e720506d60b7304d60cc2a7d60d93b1b5a4d9010d6393c2720d720c7305d60eafa5d9010e6394c2720e720c959372017306d802d60fb2a5730700d610b2a5730800d19683040195720996830201927ec1720f06997202720693c2720fd07207d801d611b2db6308720f73090096830301938c7211017208927e8c72110206997202720693c2720fd0720795720996830201927ec1721006720a93c27210d0720bd801d611b2db63087210730a009683030193c27210d0720b938c7211017208927e8c72110206720a720d720e95937201730bd801d60fb2a5730c00ea02d1968303019683030193c1720fc1a793c2720fd0720793db6308720fdb6308a7720d720e7207d1730d",
    "assets": [
        {
            "tokenId": "477f169f3797e04077dff6ab2712669c0d191c2baff7ff73838484e334f2687b",
            "amount": 1
        }
    ],
    "creationHeight": 1480465,
    "additionalRegisters": {
        "R4": "060502540be400",
        "R5": "08cd03c59160fe57f73399d829835398712bfa5681d8708e8e3b29a197205808af8548",
        "R6": "05a01f",
        "R7": "0e00",
        "R8": "0e104d65774d6172742c4e46542c53656c6c",
        "R9": "05e0d403"
    },
    "transactionId": "54ab2f3cbbb07af3c1b87aa9ddb16529c3a04d7b94aec511ba8c359e927daa0a",
    "index": 0
        }]`);

		unconfirmedOrderBoxes.set(mempoolOrderBoxes);
		unconfirmedInputBoxIds.set(mempoolInputBoxIds);
	});

	newSocket?.onAny(() => {
		socket.set(newSocket);
	});

	socket.set(newSocket);
}
