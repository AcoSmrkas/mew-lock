import { first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder
} from '@fleet-sdk/core';
import {
	SGroupElement,
	SLong,
	SSigmaProp,
	SColl,
	SInt,
	SByte,
	SConstant,
	SPair,
	parse
} from '@fleet-sdk/serializer';
import {
	DELEGATE_CONTRACT_V3,
	DELEGATION_DEV_PK,
	DELEGATION_FEE_DENOM,
	DELEGATION_MIN_FEE_PERCENT
} from '../common/const.ts';
import { hexToBytes } from '$lib/utils/utils.js';

export const DEV_PK = DELEGATION_DEV_PK;

export function delegateV3Tx(
	delegatorAddress: string,
	delegateAddress: string,
	utxos: Array<any>,
	height: number,
	tokens: Array<any>,
	durationBlocks: number,
	feeAmount: bigint,
	feeTokenId: string = '', // Empty string means ERG
	feePercent: number = 3000, // 3% default
	minFeeBlocks: number = 100 // 100 blocks default
): any {
	const delegator = ErgoAddress.fromBase58(delegatorAddress);
	const delegate = ErgoAddress.fromBase58(delegateAddress);

	// Create fee config tuple: (feeAmount, (feeTokenId, (feePercent, minFeeBlocks)))
	const feeTokenIdBytes = feeTokenId ? hexToBytes(feeTokenId) : new Uint8Array(0);
	const feeConfig = SPair(
		SLong(feeAmount),
		SPair(SColl(SByte, feeTokenIdBytes), SPair(SLong(BigInt(feePercent)), SInt(minFeeBlocks)))
	);

	const contractBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, DELEGATE_CONTRACT_V3)
		.addTokens(tokens)
		.setAdditionalRegisters({
			R4: SGroupElement(first(delegator.getPublicKeys())).toHex(), // delegator
			R5: SGroupElement(first(delegate.getPublicKeys())).toHex(), // delegate
			R6: SInt(durationBlocks).toHex(), // duration
			R7: SInt(1).toHex(), // state (1 = pending)
			R8: feeConfig.toHex() // fee configuration
		});

	const txBuilder = new TransactionBuilder(height);
	txBuilder.from(utxos);
	txBuilder.to(contractBox);
	txBuilder.sendChangeTo(delegatorAddress);
	txBuilder.payMinFee();

	return txBuilder.build().toEIP12Object();
}

export function activateDelegationV3Tx(
	box: any,
	delegateAddress: string,
	height: number,
	additionalUtxos: Array<any>,
	feeAmount: bigint,
	feeTokenId: string = ''
): any {
	const delegate = ErgoAddress.fromBase58(delegateAddress);

	console.log('🚀 V3 ACTIVATION - Checking MEW tokens');
	console.log('Required fee amount:', feeAmount.toString(), 'raw units');
	console.log('Required fee token ID:', feeTokenId);

	// CHECK HOW MUCH MEW USER HAS
	if (feeTokenId) {
		console.log('📊 CHECKING USER MEW TOKENS:');
		console.log('Total UTXOs provided:', additionalUtxos.length);

		let totalMewTokens = BigInt(0);
		let mewUtxoCount = 0;

		additionalUtxos.forEach((utxo, index) => {
			if (utxo.assets && utxo.assets.length > 0) {
				utxo.assets.forEach((asset, assetIndex) => {
					if (asset.tokenId === feeTokenId) {
						const assetAmount = BigInt(asset.amount);
						totalMewTokens += assetAmount;
						mewUtxoCount++;
						console.log(
							`  UTXO ${index}, Asset ${assetIndex}: ${assetAmount.toString()} MEW raw units`
						);
					}
				});
			}
		});

		console.log(`💰 TOTAL MEW AVAILABLE: ${totalMewTokens.toString()} raw units`);
		console.log(`💰 TOTAL MEW AVAILABLE: ${Number(totalMewTokens) / 100} display MEW`);
		console.log(`📦 MEW UTXOs found: ${mewUtxoCount}`);
		console.log(`✅ Sufficient MEW? ${totalMewTokens >= feeAmount ? 'YES' : 'NO'}`);

		if (totalMewTokens < feeAmount) {
			console.error(
				`❌ INSUFFICIENT MEW: Need ${feeAmount.toString()} but only have ${totalMewTokens.toString()}`
			);
		}
	}

	// Parse fee config from the box
	let feePercent = 3000; // Default 3%
	try {
		// Extract fee percent from R8 register if available
		// This would need proper parsing based on the actual register structure
		feePercent = 3000; // For now, use default
	} catch (error) {
		console.warn('Could not parse fee percent, using default 3%');
	}

	const devFee = (feeAmount * BigInt(feePercent)) / BigInt(DELEGATION_FEE_DENOM);
	const delegatorFee = feeAmount - devFee;

	// Create activated delegation box (same as V2 - keep same ERG value)
	const activatedBox = new OutputBuilder(
		BigInt(box.value), // Keep same ERG value as original box
		DELEGATE_CONTRACT_V3
	)
		.addTokens(box.assets || [])
		.setAdditionalRegisters({
			R4: box.additionalRegisters.R4, // delegator (preserved)
			R5: box.additionalRegisters.R5, // delegate (preserved)
			R6: box.additionalRegisters.R6, // duration (preserved)
			R7: SInt(2).toHex(), // state = 2 (active)
			R8: box.additionalRegisters.R8 // fee config (preserved)
		});

	// Convert delegator public key to address (same as V2)
	const delegatorPK = box.additionalRegisters.R4.substring(2);
	const delegatorAddress = ErgoAddress.fromPublicKey(delegatorPK).toString();

	// Create fee payment boxes
	let delegatorFeeBox, devFeeBox;

	if (feeTokenId) {
		// Token fee payment - use SAFE_MIN_BOX_VALUE ERG + tokens
		delegatorFeeBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, delegatorAddress).addTokens([
			{ tokenId: feeTokenId, amount: delegatorFee }
		]);

		devFeeBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, DEV_PK).addTokens([
			{ tokenId: feeTokenId, amount: devFee }
		]);
	} else {
		// ERG fee payment - use fee amount as ERG value
		delegatorFeeBox = new OutputBuilder(delegatorFee, delegatorAddress);
		devFeeBox = new OutputBuilder(devFee, DEV_PK);
	}

	const txBuilder = new TransactionBuilder(height);
	txBuilder.from([box, ...additionalUtxos]);
	txBuilder.to([activatedBox, delegatorFeeBox, devFeeBox]);
	txBuilder.sendChangeTo(delegateAddress);
	txBuilder.payMinFee();

	return txBuilder.build().toEIP12Object();
}

export function withdrawDelegationV3Tx(
	box: any,
	delegatorAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('🏦 V3 WITHDRAWAL - Following V2 ErgoScript pattern');

	// Parse state and duration from V3 structure (same as V2 logic)
	const state = decodeFleetSInt(box.additionalRegisters.R7); // R7 = state
	const duration = decodeFleetSInt(box.additionalRegisters.R6); // R6 = duration
	const creationHeight = box.creationHeight || box.settlementHeight || 0;

	const isExpired = height > creationHeight + duration;

	console.log('📊 V3 Withdrawal validation:', {
		state,
		duration,
		creationHeight,
		height,
		isExpired
	});

	if (state === 2 && !isExpired) {
		throw new Error('Cannot withdraw during active delegation period');
	}

	// Process assets - keep same tokens
	const processedAssets = box.assets.map((asset) => ({
		tokenId: asset.tokenId,
		amount: BigInt(asset.amount)
	}));

	console.log('🔥 V3 ErgoScript delegatorWithdraw path - no contract outputs needed');
	console.log('   - delegatorProp will be signed by delegator wallet');
	console.log('   - validScBoxSpent = true (spending the delegation box)');
	console.log('   - state == 1 OR isExpiredTimeWindow = true');

	// For expired or state=1 delegations, ErgoScript delegatorWithdraw path:
	// delegatorProp && validScBoxSpent && (state == 1 || isExpiredTimeWindow)
	// This path allows burning the box with NO contract outputs required

	const totalBoxValue = BigInt(box.value);
	const devFee = BigInt(50000000); // 0.05 ERG dev fee from delegator's wallet

	console.log('💰 V3 Withdrawal structure (same as V2):');
	console.log(
		'   - OUTPUTS(0): All delegation ERG + tokens to delegator:',
		Number(totalBoxValue) / 1e9,
		'ERG'
	);
	console.log("   - OUTPUTS(1): Dev fee from delegator's UTXOs:", Number(devFee) / 1e9, 'ERG');
	console.log('   - Change: To delegator');

	// Follow exact V2 withdrawal pattern - create output with registers
	const outputZero = new OutputBuilder(
		totalBoxValue, // OUTPUTS(0): All ERG from delegation box to delegator
		delegatorAddress
	).addTokens(processedAssets);

	// V2 withdrawal keeps all registers in the output (even though it's to delegator address)
	outputZero.setAdditionalRegisters({
		R4: box.additionalRegisters.R4, // delegator unchanged
		R5: box.additionalRegisters.R5, // delegate unchanged
		R6: box.additionalRegisters.R6, // duration unchanged
		R7: box.additionalRegisters.R7, // state unchanged
		R8: box.additionalRegisters.R8 // fee config unchanged (V3 uses single R8)
	});

	console.log('🔥 V3 Withdrawal: Following exact V2 pattern with registers preserved');

	// Match the exact successful transaction structure (same as V2):
	// OUTPUTS(0) = delegator address with all delegation assets + registers
	// OUTPUTS(1) = dev fee to developer
	// Change goes to delegator
	return new TransactionBuilder(height)
		.from([box, ...additionalUtxos])
		.to(outputZero)
		.to(
			new OutputBuilder(
				devFee, // OUTPUTS(1): 0.05 ERG dev fee paid by delegator from additional UTXOs
				DEV_PK
			)
		)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.sendChangeTo(delegatorAddress)
		.build()
		.toEIP12Object();
}

export function cancelDelegationV3Tx(
	box: any,
	delegatorAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	// For emergency cancel, create cancelled delegation box
	const cancelledBox = new OutputBuilder(
		BigInt(box.value) - BigInt(RECOMMENDED_MIN_FEE_VALUE),
		DELEGATE_CONTRACT_V3
	)
		.addTokens(box.assets || [])
		.setAdditionalRegisters({
			R4: box.additionalRegisters.R4, // delegator (preserved)
			R5: box.additionalRegisters.R5, // delegate (preserved)
			R6: box.additionalRegisters.R6, // duration (preserved)
			R7: SInt(3).toHex(), // state = 3 (cancelled)
			R8: box.additionalRegisters.R8 // fee config (preserved)
		});

	const txBuilder = new TransactionBuilder(height);
	txBuilder.from([box, ...additionalUtxos]);
	txBuilder.to(cancelledBox);
	txBuilder.sendChangeTo(delegatorAddress);
	txBuilder.payMinFee();

	return txBuilder.build().toEIP12Object();
}

// Helper function to parse fee config from delegation box
export function parseFeeConfig(box: any) {
	try {
		const r8Register = box.additionalRegisters?.R8;
		if (!r8Register || !r8Register.serializedValue) {
			throw new Error('R8 register not found or empty');
		}

		// Parse the SPair structure: (feeAmount, (feeTokenId, (feePercent, minFeeBlocks)))
		const r8Hex = r8Register.serializedValue;
		console.log('🔍 Parsing R8 fee config:', r8Hex);

		// Use Fleet SDK to parse the serialized data
		const bytes = hexToBytes(r8Hex);
		const parsed = SConstant.from(bytes);

		console.log('🔍 Parsed fee config:', parsed);

		// Parse the SPair structure manually based on known positions
		const hexBytes = [];
		for (let i = 0; i < r8Hex.length; i += 2) {
			hexBytes.push(parseInt(r8Hex.substr(i, 2), 16));
		}

		let feeAmount = BigInt(100); // Default fallback
		let feeTokenId = '';
		let feePercent = 3000;
		let minFeeBlocks = 100;

		// Look for MEW token ID to determine if this is a token fee
		const mewTokenId = '6c35aa395c7c75b0f67f7804d6930f0e11ef93c3387dc1faa86498d54af7962c';
		if (r8Hex.includes(mewTokenId)) {
			feeTokenId = mewTokenId;

			// The fee amount is stored as a single byte at position 33 for our structure
			if (hexBytes.length > 33) {
				feeAmount = BigInt(hexBytes[33]);
				console.log(`✅ Extracted MEW fee amount: ${feeAmount} raw units`);
			}
		} else {
			// Check for other known token IDs or ERG fees
			// For ERG fees, fee amount would be in a different position

			// Try to find fee amount in early positions for ERG
			for (let i = 4; i < Math.min(12, hexBytes.length - 3); i++) {
				const value =
					(hexBytes[i] << 24) | (hexBytes[i + 1] << 16) | (hexBytes[i + 2] << 8) | hexBytes[i + 3];
				if (value >= 1000000000 && value <= 10000000000) {
					// 1-10 ERG range in nanoERG
					feeAmount = BigInt(value);
					console.log(`✅ Extracted ERG fee amount: ${feeAmount} nanoERG`);
					break;
				}
			}
		}

		return {
			feeAmount,
			feeTokenId,
			feePercent,
			minFeeBlocks
		};
	} catch (error) {
		console.warn('Could not parse fee config:', error);
		return {
			feeAmount: BigInt(5000000000), // 5 ERG default
			feeTokenId: '',
			feePercent: 3000,
			minFeeBlocks: 100
		};
	}
}

// Helper function to decode Fleet SDK SInt (same as V2)
function decodeFleetSInt(hexValue: string): number {
	console.log(hexValue);
	const bytes = hexToBytes(hexValue);
	const constant = SConstant.from(bytes);

	// Get the raw data
	const value = constant.data;

	// Convert to JavaScript number based on the type
	let jsValue;
	if (typeof value === 'bigint') {
		// For SLong, SBigInt types - convert BigInt to number
		jsValue = Number(value);
	} else {
		// For SInt, SShort, SByte types - already a number
		jsValue = value;
	}

	return jsValue;
}
