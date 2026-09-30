// One-off: find testnet ERG in wallets the user supplied and move some into the
// runner's throwaway wallet. Usage:
//   npx vite-node scripts/lithos/fund.ts <funders-file> [ergToSend] [--send]
// The funders file ("name: mnemonic" per line) must live outside the repo.
// Without --send it only reports balances.
import { readFileSync } from 'node:fs';
import { Network } from '@fleet-sdk/common';
import { OutputBuilder, RECOMMENDED_MIN_FEE_VALUE, TransactionBuilder } from '@fleet-sdk/core';
import { ErgoHDKey } from '@fleet-sdk/wallet';
import { balanceOf, broadcast, height, sign, unspentByAddress, waitForConfirmation } from './chain.ts';
import { loadOrCreateWallet } from './wallet.ts';

const [file, ergArg = '5', ...flags] = process.argv.slice(2);
if (!file) throw new Error('usage: fund.ts <funders-file> [ergToSend] [--send]');
const wantNanoErg = BigInt(Math.round(Number(ergArg) * 1e9));

const funders = readFileSync(file, 'utf8')
	.split('\n')
	.map((l) => l.trim())
	.filter(Boolean)
	.map((l) => {
		const i = l.indexOf(':');
		return { name: l.slice(0, i).trim(), mnemonic: l.slice(i + 1).trim() };
	});

const target = loadOrCreateWallet().keys.main.address;
let best: { name: string; key: ErgoHDKey; address: string; nanoErg: bigint } | undefined;

for (const f of funders) {
	const root = ErgoHDKey.fromMnemonicSync(f.mnemonic);
	const candidates: [string, ErgoHDKey][] = [['m', root]];
	for (let i = 0; i < 5; i++) candidates.push([`m/44'/429'/0'/0/${i}`, root.derive(`m/44'/429'/0'/0/${i}`)]);
	for (const [path, key] of candidates) {
		const address = key.address.encode(Network.Testnet);
		const boxes = await unspentByAddress(address);
		const { nanoErg, tokens } = balanceOf(boxes);
		console.log(`${f.name.padEnd(8)} ${path.padEnd(18)} ${address}  ${Number(nanoErg) / 1e9} tERG, ${tokens.size} tokens`);
		if (nanoErg > 0n && (!best || nanoErg > best.nanoErg)) best = { name: f.name, key, address, nanoErg };
	}
}

if (!best) {
	console.log('No testnet ERG found in any supplied wallet.');
	process.exit(0);
}
console.log(`\nRichest: ${best.name} ${best.address} with ${Number(best.nanoErg) / 1e9} tERG`);
if (!flags.includes('--send')) process.exit(0);

const amount = best.nanoErg - RECOMMENDED_MIN_FEE_VALUE - 1_000_000n < wantNanoErg
	? best.nanoErg - RECOMMENDED_MIN_FEE_VALUE - 1_000_000n
	: wantNanoErg;
const boxes = await unspentByAddress(best.address);
const unsigned = new TransactionBuilder(await height())
	.from(boxes)
	.to(new OutputBuilder(amount, target))
	.sendChangeTo(best.address)
	.payFee(RECOMMENDED_MIN_FEE_VALUE)
	.build()
	.toEIP12Object();
const signed = await sign(unsigned, [best.key]);
const id = await broadcast(signed);
console.log(`Sent ${Number(amount) / 1e9} tERG to ${target} in ${id}; waiting for a block...`);
console.log(`Confirmed at height ${await waitForConfirmation(signed)}`);
