// Proves the page's in-browser test wallet against the real testnet: a faucet
// drip, then a lock chained on it, both signed by signLocally (Fleet Schnorr,
// empty proof for the campaign box) and submitted through the explorer.
//   npx vite-node scripts/lithos/testwallet-check.ts [secret-file]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hex } from '@fleet-sdk/crypto';
import { ErgoHDKey } from '@fleet-sdk/wallet';
import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { getCampaign, getHeight, getJson, getPositions } from '../../src/lib/lithos/api.ts';
import type { LithosDeployment } from '../../src/lib/lithos/deployment.ts';
import type { NetworkConfig } from '../../src/lib/lithos/network.ts';
import { drip, lithosKeys, signLocally, submitSigned, testBoxes, type TestWallet } from '../../src/lib/lithos/testWallet.ts';
import { buildLockTx, buildUnlockTx } from '../../src/lib/lithos/txs.ts';

const d: LithosDeployment = JSON.parse(readFileSync('src/lib/lithos/deployments/testnet.json', 'utf8'));
const net: NetworkConfig = {
	network: 'testnet',
	explorerApi: 'https://api-testnet.ergoplatform.com/api/v1',
	graphqlApi: 'https://gql-testnet.ergoplatform.com/',
	txUrl: (id) => `https://testnet.ergoplatform.com/en/transactions/${id}`,
	blockSeconds: 60,
	ergoPay: false,
	deployment: d
};
const secretFile = process.argv[2];
if (!secretFile) throw new Error('usage: testwallet-check.ts <secret-file outside the repo>');

function wallet(): TestWallet {
	if (!existsSync(secretFile)) writeFileSync(secretFile, hex.encode(crypto.getRandomValues(new Uint8Array(32))), { mode: 0o600 });
	const key = new ErgoHDKey({ privateKey: hex.decode(readFileSync(secretFile, 'utf8').trim()) });
	const address = key.address.encode(Network.Testnet);
	return { key, address, ergoTree: ErgoAddress.fromBase58(address).ergoTree };
}
const confirmed = async (txId: string) => {
	try {
		await getJson(`${net.explorerApi}/transactions/${txId}`);
		return true;
	} catch {
		return false;
	}
};

const w = wallet();
console.log('test wallet', w.address);
const mine = (await getPositions(net, d)).filter((p) => p.owner === w.address);

if (mine.length === 0) {
	const dripId = await drip(net, d, w.address);
	console.log('drip (signed locally):', net.txUrl(dripId));
	const campaign = await getCampaign(net, d);
	const plan = buildLockTx({
		deployment: d,
		campaign,
		inputs: await testBoxes(net, w.address),
		changeAddress: w.address,
		principal: 1_000n * 1_000_000_000n,
		tier: 0,
		height: await getHeight(net),
		unlockBuffer: 5
	});
	const lockId = await submitSigned(net, signLocally(plan.tx.toEIP12Object(), lithosKeys(d, w)));
	console.log(`lock chained on the unconfirmed drip (signed locally): ${net.txUrl(lockId)}  unlocks at ${plan.unlockAt}`);
	for (let i = 0; i < 120 && !(await confirmed(lockId)); i++) await new Promise((r) => setTimeout(r, 10_000));
	console.log('lock confirmed:', await confirmed(lockId));
} else {
	const p = mine[0];
	const h = await getHeight(net);
	if (h < p.unlockAt) {
		console.log(`position unlocks at ${p.unlockAt}; now ${h}`);
	} else {
		const tx = buildUnlockTx({ deployment: d, position: p, inputs: await testBoxes(net, w.address), height: h });
		const id = await submitSigned(net, signLocally(tx.toEIP12Object(), lithosKeys(d, w)));
		console.log('unlock (signed locally):', net.txUrl(id));
	}
}
