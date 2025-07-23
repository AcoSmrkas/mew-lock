import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	TransactionBuilder,
	TokensCollection,
	ErgoUnsignedInput,
	SAFE_MIN_BOX_VALUE
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

export async function buyOfferTx(
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
	let feeBoxErgValue;
	let isMewVip = get(mewTier) == VIP_MEW_TIER;

	if (contractBox.value > 1000000) {
		isErgPayment = true;
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

			let royaltyErgValue = MIN_ERG_VAL;
			if (isErgPayment) {
				royaltyErgValue = Math.ceil(
					new BigNumber(contractBox.value)
						.minus(SAFE_MIN_BOX_VALUE)
						.times(r[1])
						.dividedBy(ROYALTY_DENOM)
				);
			}

			rBox = new OutputBuilder(royaltyErgValue, rAddress);

			let rTokens = [];
			for (const t of contractBox.assets) {
				const rBoxTokenAmount = Math.ceil(
					new BigNumber(t.amount).times(r[1]).dividedBy(ROYALTY_DENOM)
				);

				rTokens.push({
					tokenId: t.tokenId,
					amount: rBoxTokenAmount
				});
			}

			if (rTokens.length > 0) {
				rBox.addTokens(new TokensCollection(rTokens));
			}

			royaltyBoxes.push(rBox);
		}
	}

	if (isErgPayment) {
		feeBoxErgValue = Math.ceil(
			new BigNumber(contractBox.value)
				.minus(SAFE_MIN_BOX_VALUE)
				.times(devFee)
				.dividedBy(DEV_FEE_DENOM)
				.plus(isMewVip ? 0 : ERG_DEV_SELL_FEE)
		);
	} else {
		feeBoxErgValue = isMewVip ? SAFE_MIN_BOX_VALUE : ERG_DEV_SELL_FEE;
	}

	if (feeBoxErgValue < SAFE_MIN_BOX_VALUE) {
		feeBoxErgValue = SAFE_MIN_BOX_VALUE;
	}

	const sellerBox = new OutputBuilder(MIN_ERG_VAL, sellerBase58PK);

	const feeBox = new OutputBuilder(feeBoxErgValue, devBase58PK);

	let feeTokens = [];
	for (const t of contractBox.assets) {
		let feeBoxTokenAmount = Math.ceil(
			new BigNumber(t.amount).times(devFee).dividedBy(DEV_FEE_DENOM)
		);

		feeTokens.push({
			tokenId: t.tokenId,
			amount: feeBoxTokenAmount
		});
	}

	sellerBox.addTokens(
		new TokensCollection([
			{
				tokenId: assetTokenId,
				amount: orderPrice
			}
		])
	);

	if (feeTokens.length > 0) {
		feeBox.addTokens(new TokensCollection(feeTokens));
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
