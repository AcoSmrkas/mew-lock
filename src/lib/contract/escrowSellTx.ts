import { first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder
} from '@fleet-sdk/core';
import { SGroupElement, SBigInt, SSigmaProp, SByte, SLong, SColl } from '@fleet-sdk/serializer';
import {
	ERG_LIST_FEE,
	DEV_FEE_NUM,
	VIP_MEW_TIER,
	MEW_TIER_DISCOUNT,
	MEW_TIER_MAX_DISCOUNT
} from '../common//const.ts';
import { get } from 'svelte/store';
import { mewTier } from '$lib/store/store.ts';

export function escrowSellTx(
	contract: string,
	sellerBase58PK: string,
	sellerUtxos: Array<any>,
	height: number,
	devBase58PK: string,
	tokensForSale: Array<any>,
	paymentInErg: boolean,
	priceInNanoErg: bigint | undefined,
	assetTokenId: string,
	priceInNanoToken: bigint | undefined,
	buyerBase58PK: string,
	royaltyPercent: number
): any {
	const sellerAddress = ErgoAddress.fromBase58(sellerBase58PK);
	const buyerAddress = ErgoAddress.fromBase58(buyerBase58PK);

	const priceInTokens = priceInNanoToken;
	const assetTokenIdBytes =
		assetTokenId == '' ? [] : assetTokenId.match(/.{1,2}/g).map((byte) => parseInt(byte, 16));

	const currentMewTier = get(mewTier);
	let discount = MEW_TIER_DISCOUNT * currentMewTier;
	if (discount > MEW_TIER_MAX_DISCOUNT) {
		discount = MEW_TIER_MAX_DISCOUNT;
	}

	let ergValue = SAFE_MIN_BOX_VALUE;
	let ergAsset = tokensForSale.find((t) => t.tokenId == 'erg');
	if (ergAsset) {
		ergValue = new BigNumber(ergAsset.amount).plus(SAFE_MIN_BOX_VALUE);
		tokensForSale = tokensForSale.filter((t) => t.tokenId != 'erg');
	}

	const contractBox = new OutputBuilder(ergValue, contract).setAdditionalRegisters({
		R4: SBigInt(priceInTokens).toHex(),
		R5: SSigmaProp(SGroupElement(first(sellerAddress.getPublicKeys()))).toHex(),
		R6: SLong(DEV_FEE_NUM - discount).toHex(),
		R7: SColl(SByte, assetTokenIdBytes).toHex(),
		R8: SSigmaProp(SGroupElement(first(buyerAddress.getPublicKeys()))).toHex(),
		R9: SLong(royaltyPercent).toHex()
	});

	if (tokensForSale.length > 0) {
		contractBox.addTokens(tokensForSale);
	}

	let feeBox;
	if (currentMewTier < VIP_MEW_TIER && ERG_LIST_FEE > 0) {
		feeBox = new OutputBuilder(ERG_LIST_FEE, devBase58PK);
	}

	const unsignedMintTransaction = new TransactionBuilder(height)
		.configure((s) => s.setMaxTokensPerChangeBox(100))
		.from(sellerUtxos)
		.to([contractBox, ...(feeBox ? [feeBox] : [])])
		.sendChangeTo(sellerAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();

	return unsignedMintTransaction;
}
