// TESTNET ONLY. A throwaway in-browser wallet so anyone can try Lithos Lock
// without installing the separate Nautilus Testnet build, plus a faucet that
// hands out test tokens from a wallet we fund.
//
// Signing is local and minimal: a Schnorr proof for every input the key owns
// (its own boxes, and positions it owns, whose script reduces to that key once
// unlockable) and an empty proof for the campaign box, whose script alone
// decides. Nodes re-check everything, so a wrong guess can only get a tx
// rejected, never accepted.
import { type Box, type EIP12UnsignedTransaction, Network } from '@fleet-sdk/common';
import { ErgoAddress, OutputBuilder, RECOMMENDED_MIN_FEE_VALUE, TransactionBuilder } from '@fleet-sdk/core';
import { blake2b256, hex, utf8 } from '@fleet-sdk/crypto';
import { serializeBox, serializeTransaction } from '@fleet-sdk/serializer';
import { ErgoHDKey, generateProof } from '@fleet-sdk/wallet';
import { secp256k1 } from '@noble/curves/secp256k1';
import { parse as parseBig, stringify as stringifyBig } from 'json-bigint-native';
import { getHeight, getJson, normalizeBox } from './api.ts';
import type { LithosDeployment } from './deployment.ts';
import type { NetworkConfig } from './network.ts';

const STORAGE_KEY = 'lithos_test_wallet_v1';

// PUBLIC BY DESIGN. The faucet key is the hash of this string, so anyone can
// compute it and spend from it. It only ever holds testnet tokens.
const FAUCET_KEY = new ErgoHDKey({ privateKey: blake2b256(utf8.decode('mewlock lithos testnet faucet v1')) });
export const FAUCET_ADDRESS = FAUCET_KEY.address.encode(Network.Testnet);
export const FAUCET_DRIP = { nanoErg: 2_000_000_000n, tokens: 100_000n * 1_000_000_000n };

export type TestWallet = { key: ErgoHDKey; address: string; ergoTree: string };

function fromSecret(secret: Uint8Array): TestWallet {
	const key = new ErgoHDKey({ privateKey: secret });
	const address = key.address.encode(Network.Testnet);
	return { key, address, ergoTree: ErgoAddress.fromBase58(address).ergoTree };
}

export function loadTestWallet(): TestWallet | null {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		return saved ? fromSecret(hex.decode(saved)) : null;
	} catch {
		return null;
	}
}

export function createTestWallet(): TestWallet {
	const secret = secp256k1.utils.randomPrivateKey();
	try {
		localStorage.setItem(STORAGE_KEY, hex.encode(secret));
	} catch {
		// Private mode: the wallet lives until the tab closes.
	}
	return fromSecret(secret);
}

export function forgetTestWallet() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// nothing stored
	}
}

// Our own unconfirmed txs, so a quick second action does not reuse a spent box.
const spent = new Set<string>();
let pending: Box<bigint>[] = [];

/** Unspent boxes at `address`, including outputs of our own pending txs. */
export async function testBoxes(net: NetworkConfig, address: string): Promise<Box<bigint>[]> {
	const confirmed = ((await getJson(`${net.explorerApi}/boxes/unspent/byAddress/${address}?limit=200`)).items as unknown[]).map(
		normalizeBox
	);
	const seen = new Set(confirmed.map((b) => b.boxId));
	pending = pending.filter((b) => !seen.has(b.boxId));
	const tree = ErgoAddress.fromBase58(address).ergoTree;
	return [...confirmed, ...pending.filter((b) => b.ergoTree === tree)].filter((b) => !spent.has(b.boxId));
}

type SignedTx = {
	id: string;
	inputs: { boxId: string; spendingProof: { proofBytes: string; extension: Record<string, string> } }[];
	dataInputs: { boxId: string }[];
	outputs: Box<string>[];
};

/** Sign `tx`: `keyFor` returns the key for an input, or null for an empty proof. */
export function signLocally(
	tx: EIP12UnsignedTransaction,
	keyFor: (input: EIP12UnsignedTransaction['inputs'][number], index: number) => ErgoHDKey | null
): SignedTx {
	const txBytes = serializeTransaction(tx).toBytes();
	const id = hex.encode(blake2b256(txBytes));
	return {
		id,
		inputs: tx.inputs.map((input, i) => {
			const key = keyFor(input, i);
			return {
				boxId: input.boxId,
				spendingProof: {
					proofBytes: key ? hex.encode(generateProof(txBytes, key)) : '',
					extension: (input.extension ?? {}) as Record<string, string>
				}
			};
		}),
		dataInputs: tx.dataInputs.map((d) => ({ boxId: d.boxId })),
		outputs: tx.outputs.map((o, index) => {
			const box = { ...o, boxId: '', transactionId: id, index } as Box<string>;
			box.boxId = hex.encode(blake2b256(serializeBox(box).toBytes()));
			return box;
		})
	};
}

/** Which key signs each input of a Lithos Lock tx built for the test wallet. */
export function lithosKeys(d: LithosDeployment, w: TestWallet) {
	return (input: { ergoTree: string }, index: number): ErgoHDKey | null => {
		if (input.ergoTree === w.ergoTree || input.ergoTree === d.positionTree) return w.key;
		if (input.ergoTree === d.campaignTree) return null;
		throw new Error(`The test wallet cannot sign input ${index}.`);
	};
}

/**
 * Submit through the explorer's GraphQL (what Nautilus uses), falling back to
 * its REST API. Testnet nodes are plain HTTP, which a page on HTTPS cannot call.
 */
export async function submitSigned(net: NetworkConfig, signed: SignedTx): Promise<string> {
	let id: string;
	try {
		id = await submitGraphql(net, signed);
	} catch (graphqlError) {
		try {
			id = await submitRest(net, signed);
		} catch {
			throw graphqlError;
		}
	}
	for (const input of signed.inputs) spent.add(input.boxId);
	pending.push(...signed.outputs.map(normalizeBox));
	return id;
}

async function submitGraphql(net: NetworkConfig, signed: SignedTx): Promise<string> {
	const res = await fetch(net.graphqlApi, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: 'mutation ($tx: SignedTransaction!) { submitTransaction(signedTransaction: $tx) }',
			variables: { tx: signed }
		}),
		signal: AbortSignal.timeout(30_000)
	});
	const body = await res.json();
	if (body.errors?.length) throw new Error(`The network rejected the transaction: ${body.errors[0].message}`);
	return body.data.submitTransaction as string;
}

async function submitRest(net: NetworkConfig, signed: SignedTx): Promise<string> {
	const toNode = {
		...signed,
		outputs: signed.outputs.map((o) => ({
			...o,
			value: BigInt(o.value),
			assets: o.assets.map((a) => ({ tokenId: a.tokenId, amount: BigInt(a.amount) }))
		}))
	};
	const res = await fetch(`${net.explorerApi}/mempool/transactions/submit`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: stringifyBig(toNode),
		signal: AbortSignal.timeout(30_000)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`The network rejected the transaction: ${text.slice(0, 300)}`);
	return (parseBig(text) as { id?: string }).id ?? signed.id;
}

/** Send test ERG, plus the campaign's staked token when it is one, from the faucet to `to`. */
export async function drip(net: NetworkConfig, d: LithosDeployment, to: string): Promise<string> {
	const boxes = await testBoxes(net, FAUCET_ADDRESS);
	if (boxes.length === 0) throw new Error('The test faucet is empty. Ask the Mew team to refill it.');
	// Start from a random box so two testers rarely collide on the same one.
	const start = Math.floor(Math.random() * boxes.length);
	const ordered = [...boxes.slice(start), ...boxes.slice(0, start)];
	const tx = new TransactionBuilder(await getHeight(net))
		.from(ordered)
		.to(
			d.params.stakeId === null
				? new OutputBuilder(FAUCET_DRIP.nanoErg, to)
				: new OutputBuilder(FAUCET_DRIP.nanoErg, to).addTokens({
						tokenId: d.params.stakeId,
						amount: FAUCET_DRIP.tokens
				  })
		)
		.sendChangeTo(FAUCET_ADDRESS)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();
	return submitSigned(net, signLocally(tx, () => FAUCET_KEY));
}
