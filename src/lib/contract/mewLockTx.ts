import { first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder,
	ErgoUnsignedInput
} from '@fleet-sdk/core';
import { SGroupElement, SInt, SSigmaProp, SByte } from '@fleet-sdk/serializer';

// MewLockV2 smart contract address
const MEWLOCK_CONTRACT_ADDRESS =
	'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

// Dev fee configuration (matching smart contract)
const FEE_NUM = 3000; // feeNum from smart contract
const FEE_DENOM = 100000; // feeDenom from smart contract
const DEV_PUBLIC_KEY = '9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY'; // Dev address from smart contract
const MIN_ERG_FEE_THRESHOLD = 100000; // 0.1 ERG minimum for fee calculation
const MIN_TOKEN_FEE_THRESHOLD = 34; // 34 tokens minimum for fee calculation

export function createMewLockDepositTx(
	depositorBase58PK: string,
	depositorUtxos: Array<any>,
	height: number,
	amountToLock: bigint,
	tokensToLock: Array<any>,
	unlockHeight: number
): any {
	const depositorAddress = ErgoAddress.fromBase58(depositorBase58PK);

	// Calculate token fees (3% if >= 34 tokens each) - matching smart contract logic
	const tokenFees = tokensToLock.map((token) => {
		const tokenAmount = BigInt(token.amount);
		return {
			tokenId: token.tokenId,
			remainingAmount: tokenAmount
		};
	});

	// Create the MewLock contract box with remaining amounts after fees
	const lockBoxValue = amountToLock;
	const mewLockBox = new OutputBuilder(
		lockBoxValue,
		MEWLOCK_CONTRACT_ADDRESS
	).setAdditionalRegisters({
		R4: SGroupElement(first(depositorAddress.getPublicKeys())).toHex(), // depositor public key as GroupElement
		R5: SInt(unlockHeight).toHex() // unlock height
	});

	// Add remaining tokens to lock box
	const remainingTokens = tokenFees
		.filter((token) => token.remainingAmount > BigInt(0))
		.map((token) => ({
			tokenId: token.tokenId,
			amount: token.remainingAmount
		}));

	if (remainingTokens.length > 0) {
		mewLockBox.addTokens(remainingTokens);
	}

	// const devFeeValue = 0.2 * (10 ** 9);
	// const devFeeBox = new OutputBuilder(devFeeValue.toString(), devAddress);

	const outputs = [mewLockBox]; //, devFeeBox];

	const unsignedTransaction = new TransactionBuilder(height)
		.from(depositorUtxos)
		.to(outputs)
		.sendChangeTo(depositorAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();

	return unsignedTransaction;
}

export async function createMewLockWithdrawalTx(
	depositorBase58PK: string,
	depositorUtxos: Array<any>,
	height: number,
	mewLockBox: any
): Promise<any> {
	console.log('=== MewLock Withdrawal Debug ===');
	console.log('depositorBase58PK:', depositorBase58PK);
	console.log('height:', height);
	console.log('mewLockBox:', mewLockBox);

	const depositorAddress = ErgoAddress.fromBase58(depositorBase58PK);
	const devAddress = ErgoAddress.fromBase58(DEV_PUBLIC_KEY);
	console.log('depositorAddress:', depositorAddress);

	// Fetch the complete box data from the API
	try {
		const response = await fetch(`https://api.ergoplatform.com/api/v1/boxes/${mewLockBox.boxId}`);
		const fullBoxData = await response.json();
		console.log('Full box data from API:', fullBoxData);

		// Convert additionalRegisters to hex format for Fleet SDK
		const additionalRegisters = {};
		if (fullBoxData.additionalRegisters) {
			Object.keys(fullBoxData.additionalRegisters).forEach((key) => {
				const register = fullBoxData.additionalRegisters[key];
				additionalRegisters[key] = register.serializedValue || register;
			});
		}

		console.log('Converted additionalRegisters:', additionalRegisters);

		// Create a proper box structure for Fleet SDK using the full API data
		const normalizedLockBox = {
			boxId: fullBoxData.boxId,
			value: BigInt(fullBoxData.value),
			ergoTree: fullBoxData.ergoTree,
			assets: fullBoxData.assets || [],
			additionalRegisters: additionalRegisters,
			creationHeight: fullBoxData.creationHeight,
			transactionId: fullBoxData.transactionId,
			index: fullBoxData.index
		};

		console.log('normalizedLockBox:', normalizedLockBox);

		// Calculate ERG fee (3% if >= 0.1 ERG) - matching smart contract logic
		const ergFee =
			normalizedLockBox.value >= BigInt(MIN_ERG_FEE_THRESHOLD)
				? (normalizedLockBox.value * BigInt(FEE_NUM)) / BigInt(FEE_DENOM)
				: BigInt(0);

		// Calculate token fees (3% if >= 34 tokens each) - matching smart contract logic
		const tokenFees = normalizedLockBox.assets.map((token) => {
			const tokenAmount = BigInt(token.amount);
			const feeAmount =
				tokenAmount >= BigInt(MIN_TOKEN_FEE_THRESHOLD)
					? (tokenAmount * BigInt(FEE_NUM)) / BigInt(FEE_DENOM)
					: BigInt(0);
			return {
				tokenId: token.tokenId,
				feeAmount: feeAmount,
				remainingAmount: tokenAmount - feeAmount
			};
		});

		// Create the MewLock contract box with remaining amounts after fees
		const lockBoxValue = normalizedLockBox.value - ergFee;
		const widthrawBox = new OutputBuilder(lockBoxValue, depositorAddress);

		// Add remaining tokens to widthdrawal box
		const remainingTokens = tokenFees
			.filter((token) => token.remainingAmount > BigInt(0))
			.map((token) => ({
				tokenId: token.tokenId,
				amount: token.remainingAmount
			}));

		if (remainingTokens.length > 0) {
			widthrawBox.addTokens(remainingTokens);
		}

		const outputs = [widthrawBox];

		// Create dev fee box if there are any fees
		const hasErgFee = ergFee > BigInt(0);
		const hasTokenFees = tokenFees.some((token) => token.feeAmount > BigInt(0));

		if (hasErgFee || hasTokenFees) {
			const devFeeValue = hasErgFee ? ergFee : SAFE_MIN_BOX_VALUE;
			const devFeeBox = new OutputBuilder(devFeeValue, devAddress);

			// Add token fees to dev box
			const devTokens = tokenFees
				.filter((token) => token.feeAmount > BigInt(0))
				.map((token) => ({
					tokenId: token.tokenId,
					amount: token.feeAmount
				}));

			if (devTokens.length > 0) {
				devFeeBox.addTokens(devTokens);
			}

			outputs.push(devFeeBox);
		}

		// For withdrawal, we consume the lock box directly as an input
		// The smart contract will validate the spending conditions
		const unsignedTransaction = new TransactionBuilder(height)
			.configure((s) => s.setMaxTokensPerChangeBox(100))
			.configureSelector((selector) => selector.ensureInclusion(normalizedLockBox.boxId))
			.from([normalizedLockBox, ...depositorUtxos]) // Contract box + user UTXOs for fee
			.to(outputs)
			.sendChangeTo(depositorAddress)
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();

		console.log('Transaction built successfully');
		return unsignedTransaction;
	} catch (error) {
		console.error('Error building transaction:', error);
		throw error;
	}
}
