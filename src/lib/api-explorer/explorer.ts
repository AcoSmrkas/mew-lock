import JSONbig from 'json-bigint-native';
import { totalBoxes } from '$lib/store/store';
import { ITEMS_PER_PAGE } from '$lib/common//const.ts';
import axios from 'axios';

var lastOutputBoxes = {};
var lastInputBoxes = {};

export function updateTempBoxes(address, usedInputs, newOutputs) {
	if (!lastInputBoxes[address]) {
		lastInputBoxes[address] = [];
	}

	if (!lastOutputBoxes[address]) {
		lastOutputBoxes[address] = [];
	}

	for (let boxId of usedInputs) {
		if (!lastInputBoxes[address].includes(boxId)) {
			console.log(`Saving used box ${boxId}`);
			lastInputBoxes[address].push(boxId);
		}
	}

	for (let output of newOutputs) {
		if (!lastOutputBoxes[address].some((item) => item.boxId === output.boxId)) {
			console.log(`Saving unconfirmed box ${output.boxId}`);
			lastOutputBoxes[address].push(output);
		}
	}
}

async function checkTempOutBoxes(address) {
	if (!lastOutputBoxes[address]) {
		return;
	}

	let newBoxes = undefined;
	for (let i = lastOutputBoxes[address].length - 1; i >= 0; i--) {
		let boxId = lastOutputBoxes[address][i].boxId;

		let boxStatus = null;
		try {
			boxStatus = await axios.get('https://api.ergoplatform.com/api/v1/boxes/' + boxId);
		} catch {
			// its ok
		}

		let boxSpent = false;
		if (boxStatus && boxStatus.data && boxStatus.data.spentTransactionId) {
			boxSpent = true;
		}

		if (!boxSpent) {
			if (newBoxes) {
				newBoxes.push(lastOutputBoxes[address][i]);
			} else {
				newBoxes = [lastOutputBoxes[address][i]];
			}
		}
	}

	lastOutputBoxes[address] = newBoxes;
}

function nautilusfFriendlyBox(box) {
	let newBox = JSON.parse(JSON.stringify(box));
	newBox.value = newBox.value.toString();

	if (newBox.assets === undefined) newBox.assets = [];

	for (let i = 0; i < newBox.assets.length; i++) {
		newBox.assets[i].amount = newBox.assets[i].amount.toString();
	}

	return newBox;
}

export async function fetchContractBoxFromTx(txid) {
	const url = `https://api.ergoplatform.com/api/v1/transactions/${txid}`;
	const response = await fetch(url);

	if (response.status == 200) {
		const data = await response.arrayBuffer();
		const buffer = new TextDecoder('utf-8').decode(data);
		const stringFromBuffer = buffer.toString('utf8');
		const parsed = JSONbig.parse(stringFromBuffer);

		return parsed.outputs[0];
	} else {
		return null;
	}
}

export async function fetchContractBoxes(contract: string, offset: number): Promise<Array<any>> {
	const url = `https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/${contract}?offset=${offset}&limit=${ITEMS_PER_PAGE}`;
	const response = await fetch(url);

	if (response.status == 200) {
		const data = await response.arrayBuffer();
		const buffer = new TextDecoder('utf-8').decode(data);
		const stringFromBuffer = buffer.toString('utf8');
		const parsed = JSONbig.parse(stringFromBuffer);

		totalBoxes.set(parsed.total);

		return parsed.items.map(nautilusfFriendlyBox);
	} else {
		return [];
	}
}

export async function fetchConfirmedBalance(address) {
	const url = `https://api.ergoplatform.com/api/v1/addresses/${address}/balance/confirmed`;
	const response = await fetch(url);

	if (response.status == 200) {
		const data = await response.arrayBuffer();
		const buffer = new TextDecoder('utf-8').decode(data);
		const stringFromBuffer = buffer.toString('utf8');
		const parsed = JSONbig.parse(stringFromBuffer);

		return parsed;
	} else {
		return 0;
	}
}

export async function fetchBoxes(address) {
	try {
		await checkTempOutBoxes(address);

		let response = await axios.get(
			'https://api.ergoplatform.com/api/v1/boxes/unspent/byAddress/' +
				address +
				'?limit=500&offset=0&includeUnconfirmed=true',
			{
				headers: {
					'Cache-Control': 'no-cache' // or 'no-store'
				},
				responseType: 'arraybuffer'
			}
		);

		let buffer = new TextDecoder('utf-8').decode(response.data);
		let stringFromBuffer = buffer.toString('utf8');
		let boxes = JSONbig.parse(stringFromBuffer).items;

		let mempool = await axios.get(
			`https://api.ergoplatform.com/api/v1/mempool/transactions/byAddress/${address}`,
			{
				headers: {
					'Cache-Control': 'no-cache' // or 'no-store'
				},
				responseType: 'arraybuffer'
			}
		);

		buffer = new TextDecoder('utf-8').decode(mempool.data);
		stringFromBuffer = buffer.toString('utf8');
		let parsedMempoolTxs = JSONbig.parse(stringFromBuffer).items;

		for (const tx of parsedMempoolTxs) {
			for (let output of tx.outputs) {
				if (output.address != address) continue;
				let found = false;
				for (const box of boxes) {
					if (box.boxId == output.boxId) {
						found = true;
					}
				}

				if (!found) {
					console.log('Pushing mempool box', output.boxId);
					boxes.push(output);
				}
			}
		}

		for (const tx of parsedMempoolTxs) {
			for (let input of tx.inputs) {
				if (input.address != address) continue;

				for (let i = 0; i < boxes.length; i++) {
					let box = boxes[i];
					if (box.boxId == input.boxId) {
						console.log('Removing mempool box', input.boxId);
						boxes.splice(i, 1);
						break;
					}
				}
			}
		}

		if (lastOutputBoxes[address]) {
			for (let i = 0; i < lastOutputBoxes[address].length; i++) {
				let box = lastOutputBoxes[address][i];

				let found = false;
				for (let j = 0; j < boxes.length; j++) {
					if (boxes[j].boxId == box.boxId) {
						found = true;
						break;
					}
				}

				if (!found) {
					console.log(`Adding unconfirmed from temp ${box.boxId}`);
					boxes.push(box);
				}
			}
		}

		if (lastInputBoxes[address]) {
			for (let i = boxes.length - 1; i >= 0; i--) {
				for (let j = 0; j < lastInputBoxes[address].length; j++) {
					if (boxes[i].boxId == lastInputBoxes[address][j]) {
						console.log(`Removing from temp ${boxes[i].boxId}`);
						boxes.splice(i, 1);
						break;
					}
				}
			}
		}

		for (let box of boxes) {
			for (const [k, v] of Object.entries(box.additionalRegisters)) {
				if (v.serializedValue) {
					box.additionalRegisters[k] = v.serializedValue;
				}
			}
		}

		return boxes;
	} catch (error) {
		console.error('Error fetching boxes for address: ', address);
		throw error;
	}
}

export async function getBlockHeight() {
	try {
		const response = await axios.get(`https://ergo-node.zoomout.io/info`);

		return response.data.fullHeight;
	} catch (error) {
		console.error('Error getting block height');
		throw error;
	}
}
