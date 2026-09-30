// Checks a deployment file against the chain before it is pinned, and any time
// after. It reads only; nothing is signed or sent.
//   npx vite-node scripts/lithos/verify-deployment.ts src/lib/lithos/deployments/mainnet.json
// Exit code 1 when any check fails.
import { readFileSync } from 'node:fs';
import { AddressType } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { SBigInt } from '@fleet-sdk/serializer';
import { getJson, getPositions, normalizeBox, statsOf } from '../../src/lib/lithos/api.ts';
import { parseCampaignBox } from '../../src/lib/lithos/boxes.ts';
import { compileCampaign, compilePosition } from '../../src/lib/lithos/compile.ts';
import { paramsOf, readDeployment } from '../../src/lib/lithos/deployment.ts';
import { fmtAmount } from '../../src/lib/lithos/format.ts';
import { networkConfig } from '../../src/lib/lithos/network.ts';

const file = process.argv[2];
if (!file) throw new Error('usage: verify-deployment.ts <deployment.json>');
const d = readDeployment(JSON.parse(readFileSync(file, 'utf8')));
if (!d) throw new Error(`${file} holds no deployment`);
const net = networkConfig(d.network);
const api = net.explorerApi;

let failed = 0;
function check(ok: boolean, what: string, detail = '') {
	if (!ok) failed++;
	console.log(`${ok ? '✓' : '✗'} ${what}${detail ? `: ${detail}` : ''}`);
}
const amountOf = (box: any, tokenId: string | null): bigint =>
	tokenId === null
		? BigInt(box.value)
		: BigInt((box.assets ?? []).find((a: any) => a.tokenId === tokenId)?.amount ?? 0);

console.log(`${d.label} (${d.network}, contract v${d.contract})`);

// 1. The pinned trees are exactly what this source compiles from the pinned params.
const positionTree = compilePosition(d.network);
check(d.positionTree === positionTree, 'position tree recompiles byte for byte');
let campaignTree = '';
try {
	campaignTree = compileCampaign(paramsOf(d), positionTree, d.contract);
} catch (e) {
	check(false, 'params are valid', String(e));
}
check(d.campaignTree === campaignTree, 'campaign tree recompiles byte for byte');
const fee = ErgoAddress.fromBase58(d.params.feeAddress);
check(fee.type === AddressType.P2PK, 'leftover goes to a wallet (P2PK)', d.params.feeAddress);

// 2. One campaign NFT exists, and at genesis the campaign box held every marker.
const nft = await getJson(`${api}/tokens/${d.campaignNftId}`);
check(BigInt(nft.emissionAmount) === 1n, 'campaign NFT supply is exactly 1', String(nft.emissionAmount));
const marker = await getJson(`${api}/tokens/${d.markerId}`);
const supply = BigInt(marker.emissionAmount);

const genesis = await getJson(`${api}/transactions/${d.genesisTxId}`);
check(Number(genesis.inclusionHeight) === d.genesisHeight, 'genesis confirmed at the pinned height', String(genesis.inclusionHeight));
const box = (genesis.outputs as any[]).find((o) => o.ergoTree === d.campaignTree);
check(!!box, 'genesis created a box at the campaign tree');
if (box) {
	check(box.assets?.[0]?.tokenId === d.campaignNftId && BigInt(box.assets[0].amount) === 1n, 'it holds the NFT first');
	check(
		box.assets?.[1]?.tokenId === d.markerId && BigInt(box.assets[1].amount) === supply,
		'it holds every marker ever minted',
		`${supply}`
	);
	const budget =
		d.params.rewardId === null
			? BigInt(box.value) - BigInt(d.params.reserve)
			: amountOf(box, d.params.rewardId);
	check(budget === BigInt(d.initialBudget), 'it holds the pinned starting budget', fmtAmount(budget, d.assets.reward.decimals));
	check(
		box.additionalRegisters?.R4?.serializedValue === SBigInt(BigInt(d.initialV)).toHex(),
		'its R4 is the pinned starting V',
		d.initialV
	);
	const funders = new Set((genesis.inputs as any[]).map((i) => i.address));
	console.log(`  funded by ${[...funders].join(', ')}${funders.has(d.params.feeAddress) ? ' (the leftover address)' : ''}`);
}

// 3. Where it stands now.
const live = ((await getJson(`${api}/boxes/unspent/byTokenId/${d.campaignNftId}`)).items as any[]).filter(
	(b) => b.ergoTree === d.campaignTree
);
if (live.length === 0) {
	console.log('  now: swept (no campaign box left)');
} else {
	check(live.length === 1, 'exactly one live campaign box');
	try {
		const c = parseCampaignBox(normalizeBox(live[0]), d);
		const positions = await getPositions(net, d);
		const s = statsOf(positions);
		console.log(
			`  now: ${supply - c.markersLeft} lock(s) so far, ${s.positions} open by ${s.lockers} locker(s); budget left ${fmtAmount(
				c.budget,
				d.assets.reward.decimals
			)} ${d.assets.reward.ticker}`
		);
	} catch (e) {
		check(false, 'the live campaign box parses', String(e));
	}
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
