import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	TransactionBuilder,
	TokensCollection,
	ErgoUnsignedInput
} from '@fleet-sdk/core';
import { SByte } from '@fleet-sdk/serializer';
import {
	ERG_DEV_SELL_FEE,
	MIN_ERG_VAL,
	DEV_FEE_DENOM,
	ROYALTY_DENOM,
	VIP_MEW_TIER
} from '../common//const.ts';
import { BigNumber } from 'bignumber.js';
import { get } from 'svelte/store';
import { mewTier } from '$lib/store/store.ts';

export async function buyTx(
	contractBox: any,
	buyerBase58PK: string,
	buyerUtxos: Array<any>,
	height: number,
	orderPrice: bigint,
	sellerBase58PK: string,
	devBase58PK: string,
	isErgPayment: boolean,
	assetTokenId: any,
	devFee: number,
	royaltyPercent: number,
	royalties: Array<any>
): any {
	const buyerAddress = ErgoAddress.fromBase58(buyerBase58PK);
	const totalFee = new BigNumber(devFee).plus(royaltyPercent);
	let sellerBoxErgValue, feeBoxErgValue;
	let isMewVip = get(mewTier) == VIP_MEW_TIER;

	if (isErgPayment && new BigNumber(orderPrice).isLessThan(MIN_ERG_VAL)) {
		orderPrice = new BigNumber(MIN_ERG_VAL);
	} else {
		orderPrice = new BigNumber(orderPrice);
	}

	let royaltyBoxes = [];
	if (royalties.length > 0) {
		for (const r of royalties) {
			let rBox;
			let rAddress = '';

			try {
				rAddress = ergoTreeToAddress(r[0]);
			} catch {
				try {
					rAddress = ErgoAddress.fromBase58(r[0]).encode(0);
				} catch {}
			}

			if (rAddress == '') continue;

			if (isErgPayment) {
				let rErgValue = Math.ceil(new BigNumber(orderPrice).times(r[1]).dividedBy(ROYALTY_DENOM));
				if (rErgValue < MIN_ERG_VAL) {
					rErgValue = MIN_ERG_VAL;
				}

				rBox = new OutputBuilder(rErgValue, rAddress);
			} else {
				rBox = new OutputBuilder(MIN_ERG_VAL, rAddress);

				const rBoxTokenAmount = Math.ceil(
					new BigNumber(orderPrice).times(r[1]).dividedBy(ROYALTY_DENOM)
				);

				rBox.addTokens(
					new TokensCollection([
						{
							tokenId: assetTokenId,
							amount: rBoxTokenAmount
						}
					])
				);
			}

			royaltyBoxes.push(rBox);
		}
	}

	if (isErgPayment) {
		sellerBoxErgValue = Math.ceil(
			new BigNumber(orderPrice).minus(orderPrice.times(totalFee).dividedBy(DEV_FEE_DENOM))
		);
		feeBoxErgValue = Math.ceil(
			new BigNumber(orderPrice)
				.times(devFee)
				.dividedBy(DEV_FEE_DENOM)
				.plus(isMewVip ? 0 : ERG_DEV_SELL_FEE)
		);
	} else {
		sellerBoxErgValue = MIN_ERG_VAL;
		feeBoxErgValue = isMewVip ? MIN_ERG_VAL : ERG_DEV_SELL_FEE;
	}

	if (sellerBoxErgValue < MIN_ERG_VAL) {
		sellerBoxErgValue = MIN_ERG_VAL;
	}
	if (feeBoxErgValue < MIN_ERG_VAL) {
		feeBoxErgValue = MIN_ERG_VAL;
	}

	const sellerBox = new OutputBuilder(sellerBoxErgValue, sellerBase58PK);
	const feeBox = new OutputBuilder(feeBoxErgValue, devBase58PK);

	if (!isErgPayment) {
		let sellerBoxTokenAmount = Math.ceil(
			new BigNumber(orderPrice).minus(orderPrice.times(totalFee).dividedBy(DEV_FEE_DENOM))
		);
		let feeBoxTokenAmount = Math.ceil(
			new BigNumber(orderPrice).times(devFee).dividedBy(DEV_FEE_DENOM)
		);

		sellerBox.addTokens(
			new TokensCollection([
				{
					tokenId: assetTokenId,
					amount: sellerBoxTokenAmount
				}
			])
		);

		feeBox.addTokens(
			new TokensCollection([
				{
					tokenId: assetTokenId,
					amount: feeBoxTokenAmount
				}
			])
		);
	}

	const dataInputs = new ErgoUnsignedInput(contractBox).setContextVars({
		0: SByte(1).toHex()
	});

	const unsignedMintTransaction = new TransactionBuilder(height)
		.configure((s) => s.setMaxTokensPerChangeBox(100))
		.configureSelector((selector) => selector.ensureInclusion(contractBox.boxId))
		.from([dataInputs, ...buyerUtxos])
		.to([sellerBox, feeBox, ...royaltyBoxes])
		.sendChangeTo(buyerAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();

	return unsignedMintTransaction;
}

function ergoTreeToAddress(ergoTree) {
	// Create an Address object from the base58 string
	const address = ErgoAddress.fromErgoTree(ergoTree);

	return address.toString();
}
