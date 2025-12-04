import { first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder,
	TokensCollection
} from '@fleet-sdk/core';
import { SGroupElement, SBigInt, SSigmaProp, SByte, SColl } from '@fleet-sdk/serializer';
import { ERG_BURN_FEE, BURN_ADDRESS } from '../common/const';
import { stringToBytes } from '@scure/base';

export function burnTx(
	userBase58PK: string,
	userUtxos: Array<any>,
	height: number,
	burnTokens: Array<any>
): any {
	const userAddress = ErgoAddress.fromBase58(userBase58PK);

	const feeBox = new OutputBuilder(ERG_BURN_FEE, BURN_ADDRESS).setAdditionalRegisters({
		R4: SColl(SByte, stringToBytes('utf8', 'burn')).toHex()
	});

	const unsignedMintTransaction = new TransactionBuilder(height)
		.configure((s) => s.setMaxTokensPerChangeBox(100))
		.from(userUtxos)
		.to([feeBox])
		.sendChangeTo(userAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.burnTokens(burnTokens)
		.build()
		.toEIP12Object();

	return unsignedMintTransaction;
}
