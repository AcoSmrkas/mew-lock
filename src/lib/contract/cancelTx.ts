import {
	ErgoAddress,
	OutputBuilder,
	TransactionBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	ErgoUnsignedInput
} from '@fleet-sdk/core';
import { SByte } from '@fleet-sdk/serializer';
import { ERG_CANCEL_FEE, VIP_MEW_TIER } from '../common//const.ts';
import { get } from 'svelte/store';
import { mewTier } from '$lib/store/store.ts';

export async function cancelTx(
	contractBox: any,
	buyerBase58PK: string,
	buyerUtxos: Array<any>,
	height: number,
	tokenPrice: bigint,
	sellerBase58PK: string,
	devBase58PK: string,
	isErgPayment: boolean,
	assetTokenId: any,
	devFee: number
): any {
	const buyerAddress = ErgoAddress.fromBase58(buyerBase58PK);

	const sellerBox = new OutputBuilder(contractBox.value, sellerBase58PK).addTokens(
		contractBox.assets
	);

	let feeBox;

	if (get(mewTier) < VIP_MEW_TIER && ERG_CANCEL_FEE > 0) {
		feeBox = new OutputBuilder(ERG_CANCEL_FEE, devBase58PK);
	}

	const dataInputs = new ErgoUnsignedInput(contractBox).setContextVars({
		0: SByte(2).toHex()
	});

	const unsignedMintTransaction = new TransactionBuilder(height)
		.configure((s) => s.setMaxTokensPerChangeBox(100))
		.configureSelector((selector) => selector.ensureInclusion(contractBox.boxId))
		.from([dataInputs, ...buyerUtxos])
		.to([sellerBox, ...(feeBox ? [feeBox] : [])])
		.sendChangeTo(buyerAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();

	return unsignedMintTransaction;
}
