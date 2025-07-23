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
import { stringToBytes } from '@scure/base';
import { get } from 'svelte/store';
import { mewTier, merchantSaleFee, authorizedMerchant } from '$lib/store/store.ts';
import { BigNumber } from 'bignumber.js';

export function sellTx(
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
	martName: string,
	category: string,
	royaltyPercent: number,
	orderType: string
): any {
	const sellerAddress = ErgoAddress.fromBase58(sellerBase58PK);

	const priceInTokens = priceInNanoToken;
	const assetTokenIdBytes =
		assetTokenId == '' ? [] : assetTokenId.match(/.{1,2}/g).map((byte) => parseInt(byte, 16));

	const martPlusCategory = `${martName},${category},${orderType}`;
	const martPlusCategoryBytes = stringToBytes('utf8', martPlusCategory);

	const currentMewTier = get(mewTier);
	let discount = MEW_TIER_DISCOUNT * currentMewTier;
	if (discount > MEW_TIER_MAX_DISCOUNT) {
		discount = MEW_TIER_MAX_DISCOUNT;
	}

	let saleFee = DEV_FEE_NUM - discount;

	if (category && category.toLowerCase().substr(0, 8) == 'phygital') {
		const mSaleFee = get(merchantSaleFee);
		const merchantAuthorized = get(authorizedMerchant);
		if (merchantAuthorized && mSaleFee > 0) {
			saleFee = mSaleFee * 1000;
		}
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
		R6: SLong(saleFee).toHex(),
		R7: SColl(SByte, assetTokenIdBytes).toHex(),
		R8: SColl(SByte, martPlusCategoryBytes).toHex(),
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
