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
	SConstant,
	parse
} from '@fleet-sdk/serializer';
import {
	DELEGATE_CONTRACT,
	DELEGATION_DEV_PK,
	DELEGATION_FEE_DENOM,
	DELEGATION_MIN_FEE_PERCENT
} from '../common/const.ts';
import { hexToBytes } from '$lib/utils/utils.js';

export const DEV_PK = DELEGATION_DEV_PK;

export function delegateTx(
	delegatorAddress: string,
	delegateAddress: string,
	utxos: Array<any>,
	height: number,
	tokens: Array<any>,
	durationBlocks: number,
	feeInNanoErg: bigint
): any {
	const delegator = ErgoAddress.fromBase58(delegatorAddress);
	const delegate = ErgoAddress.fromBase58(delegateAddress);

	const contractBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, DELEGATE_CONTRACT)
		.addTokens(tokens)
		.setAdditionalRegisters({
			R4: SGroupElement(first(delegator.getPublicKeys())).toHex(), // delegator
			R5: SGroupElement(first(delegate.getPublicKeys())).toHex(), // delegate
			R6: SInt(durationBlocks).toHex(), // duration
			R7: SInt(1).toHex(), // state (1 = created)
			R8: SLong(feeInNanoErg).toHex(), // required fee (Long)
			R9: SLong(BigInt(3000)).toHex() // fee percent (Long) - 3%
		});

	return new TransactionBuilder(height)
		.from(utxos)
		.to(contractBox)
		.sendChangeTo(delegatorAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();
}

export function activateDelegationTx(
	box: any,
	delegateAddress: string,
	height: number,
	additionalUtxos: Array<any>,
	fee: bigint
): any {
	console.log('🔧 ACTUAL ERGOSCRIPT - Delegate Activation');
	console.log('📋 Input box:', box);
	console.log('💰 Fee:', fee.toString(), 'nanoERG');

	const delegatorPK = box.additionalRegisters.R4.substring(2);
	const delegatorAddress = ErgoAddress.fromPublicKey(delegatorPK).toString();

	console.log('👤 Delegator address:', delegatorAddress);
	console.log('🤝 Delegate address:', delegateAddress);

	// Calculate fees exactly like ErgoScript
	const feePercent = BigInt(3000); // 3%
	const devFee = (fee * feePercent) / BigInt(100000);
	const activationFee = fee - devFee;

	console.log('💸 Fee breakdown:');
	console.log('   - Total fee:', Number(fee) / 1e9, 'ERG');
	console.log('   - Dev fee (3%):', Number(devFee) / 1e9, 'ERG');
	console.log('   - Activation fee (97%):', Number(activationFee) / 1e9, 'ERG');

	// ErgoScript activate requirements:
	// - delegateProp (signed by delegate)
	// - state == 1
	// - activationBox.propositionBytes == SELF.propositionBytes (contract output)
	// - activationBox.tokens == SELF.tokens
	// - activationBox.value >= SELF.value
	// - All registers same except R7 changed to 2 (activated)
	// - OUTPUTS(1) = activation fee to delegator
	// - OUTPUTS(2) = dev fee to developer

	const activationBox = new OutputBuilder(
		BigInt(box.value), // Keep same ERG value as original box
		DELEGATE_CONTRACT
	)
		.addTokens(box.assets)
		.setAdditionalRegisters({
			R4: box.additionalRegisters.R4, // delegator unchanged
			R5: box.additionalRegisters.R5, // delegate unchanged
			R6: box.additionalRegisters.R6, // duration unchanged
			R7: SInt(2).toHex(), // state = 2 (activated) - KEY CHANGE
			R8: box.additionalRegisters.R8, // required fee unchanged (Long)
			R9: box.additionalRegisters.R9 // fee percent unchanged (Long)
		});

	console.log('🎯 Building activation transaction per ErgoScript:');
	console.log('   - delegateProp: Will be signed by delegate wallet');
	console.log('   - state: 1 → 2 (Pending → Active)');
	console.log('   - OUTPUTS(0): activationBox (contract with state=2)');
	console.log('   - OUTPUTS(1): activation fee to delegator');
	console.log('   - OUTPUTS(2): dev fee to developer');

	const transaction = new TransactionBuilder(height)
		.from(box)
		.from(additionalUtxos)
		.to(activationBox) // OUTPUTS(0) = activationBox
		.to(
			new OutputBuilder(
				activationFee, // OUTPUTS(1) = activation fee to delegator
				delegatorAddress
			)
		)
		.to(
			new OutputBuilder(
				devFee, // OUTPUTS(2) = dev fee to developer
				DEV_PK
			)
		)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.sendChangeTo(delegateAddress)
		.build()
		.toEIP12Object();

	console.log('✅ Activation transaction built:', transaction);
	console.log('📊 Transaction summary:');
	console.log('   - Inputs: delegation box + UTXOs');
	console.log('   - Output 0: Updated delegation box (state=2)');
	console.log('   - Output 1: Activation fee to delegator');
	console.log('   - Output 2: Dev fee');
	console.log('   - Change: To delegate address');

	return transaction;
}

export function delegatorDeactivateTx(
	box: any,
	delegatorAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('🔓 ACTUAL ERGOSCRIPT - Delegator Deactivate Expired');

	try {
		console.log('🔍 DEBUGGING - Full box object:', box);
		console.log('🔍 DEBUGGING - additionalRegisters:', box.additionalRegisters);
		console.log('🔍 DEBUGGING - R6:', box.additionalRegisters.R6);
		console.log('🔍 DEBUGGING - R7:', box.additionalRegisters.R7);
		console.log('🔍 DEBUGGING - R8:', box.additionalRegisters.R8);

		let state, duration;

		try {
			state = decodeFleetSInt(box.additionalRegisters.R7);
			console.log('✅ Decoded state:', state);
		} catch (error) {
			console.log('❌ Failed to decode state:', error);
			throw new Error(`Cannot decode state from R7: ${box.additionalRegisters.R7}`);
		}

		try {
			duration = decodeFleetSInt(box.additionalRegisters.R6);
			console.log('✅ Decoded duration:', duration);
		} catch (error) {
			console.log('❌ Failed to decode duration:', error);
			throw new Error(`Cannot decode duration from R6: ${box.additionalRegisters.R6}`);
		}

		const creationHeight = box.creationHeight || box.settlementHeight || 0;
		const isExpiredTimeWindow = height > creationHeight + duration; // HEIGHT > (SELF.creationInfo._1 + duration)

		console.log('📊 Delegator deactivation validation:', {
			state,
			duration,
			creationHeight,
			currentHeight: height,
			isExpiredTimeWindow
		});

		if (state !== 2) {
			throw new Error(`Can only deactivate from state 2 (Active), current state: ${state}`);
		}

		if (!isExpiredTimeWindow) {
			throw new Error(`Delegation not expired yet. Expires at block: ${creationHeight + duration}`);
		}

		// Process assets - keep same tokens
		const processedAssets = box.assets.map((asset) => ({
			tokenId: asset.tokenId,
			amount: BigInt(asset.amount)
		}));

		// ErgoScript delegatorDeactivate requirements:
		// - delegatorProp (signed by delegator)
		// - state == 2
		// - isExpiredTimeWindow = true
		// - deactivationBox.propositionBytes == SELF.propositionBytes (contract output)
		// - deactivationBox.tokens == SELF.tokens
		// - deactivationBox.value >= SELF.value
		// - All registers same except R7 changed to 1 (back to created)

		console.log('🎯 Building delegator deactivation per ErgoScript:');
		console.log('   - delegatorProp: Will be signed by delegator wallet');
		console.log('   - state: 2 → 1 (Active → Created, expired)');
		console.log('   - isExpiredTimeWindow: TRUE');
		console.log('   - For expired delegations, delegator can withdraw without fees');

		// ErgoScript expects OUTPUTS(0) to be a contract box even for expired delegations
		// The error shows it's trying to read registers from v6 (OUTPUTS(0))
		// So we need a contract box, but what state should it have?

		console.log('   - ErgoScript expects contract box as OUTPUTS(0) even for expired');
		console.log('   - The script checks: v6.getReg(7).get == 2 (expects state=2 in output!)');

		console.log("   - SIMPLE: Change state 2 → 1, that's it!");
		console.log('   - No fees, just state change in the contract box');

		// Change state from 2 to 1 in the contract box
		const deactivationBox = new OutputBuilder(
			BigInt(box.value), // Keep same ERG value
			DELEGATE_CONTRACT
		)
			.addTokens(processedAssets) // Keep same tokens
			.setAdditionalRegisters({
				R4: box.additionalRegisters.R4, // delegator unchanged
				R5: box.additionalRegisters.R5, // delegate unchanged
				R6: box.additionalRegisters.R6, // duration unchanged
				R7: SInt(1).toHex(), // state = 1 (back to created) - ONLY CHANGE
				R8: box.additionalRegisters.R8, // required fee unchanged
				R9: box.additionalRegisters.R9 // fee percent unchanged
			});

		return new TransactionBuilder(height)
			.from([box, ...additionalUtxos])
			.to(deactivationBox) // Contract box with state=1
			.sendChangeTo(delegatorAddress)
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch (error) {
		console.error('❌ Error building delegator deactivation transaction:', error);
		throw error;
	}
}

export function withdrawTx(
	box: any,
	withdrawerAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	const state = decodeFleetSInt(box.additionalRegisters.R7); // R7 = state
	const duration = decodeFleetSInt(box.additionalRegisters.R6); // R6 = duration
	const creationHeight = box.creationHeight || box.settlementHeight || 0;

	const isExpired = height > creationHeight + duration;

	console.log('🏦 Withdrawal check:', { state, duration, creationHeight, height, isExpired });

	if (state === 2 && !isExpired) {
		throw new Error('Cannot withdraw during active delegation period');
	}

	// Process assets - keep same tokens
	const processedAssets = box.assets.map((asset) => ({
		tokenId: asset.tokenId,
		amount: BigInt(asset.amount)
	}));

	console.log('🔥 ErgoScript requires delegatorWithdraw path - no contract outputs needed');
	console.log('   - delegatorProp will be signed by delegator wallet');
	console.log('   - validScBoxSpent = true (spending the delegation box)');
	console.log('   - state == 1 OR isExpiredTimeWindow = true');

	// For expired or state=1 delegations, ErgoScript delegatorWithdraw path:
	// delegatorProp && validScBoxSpent && (state == 1 || isExpiredTimeWindow)
	// This path allows burning the box with NO contract outputs required

	const totalBoxValue = BigInt(box.value);
	const devFee = BigInt(50000000); // 0.05 ERG dev fee from delegator's wallet

	console.log('💰 Matching successful withdrawal structure:');
	console.log(
		'   - OUTPUTS(0): All delegation ERG + tokens to delegator:',
		Number(totalBoxValue) / 1e9,
		'ERG'
	);
	console.log("   - OUTPUTS(1): Dev fee from delegator's UTXOs:", Number(devFee) / 1e9, 'ERG');
	console.log('   - Change: To delegator');
	console.log(
		'   - ErgoScript delegatorWithdraw path: delegatorProp && validScBoxSpent && (state == 1 || isExpiredTimeWindow)'
	);

    const outputZero = new OutputBuilder(
				totalBoxValue, // OUTPUTS(0): All ERG from delegation box to delegator
				withdrawerAddress
			).addTokens(processedAssets);

    outputZero.setAdditionalRegisters({
        R4: box.additionalRegisters.R4, // delegator unchanged
        R5: box.additionalRegisters.R5, // delegate unchanged
        R6: box.additionalRegisters.R6, // duration unchanged
        R7: box.additionalRegisters.R7, // state unchanged
        R8: box.additionalRegisters.R8, // required fee unchanged
        R9: box.additionalRegisters.R9 // fee percent unchanged
    })

	// Match the exact successful transaction structure:
	// OUTPUTS(0) = delegator address with all delegation assets
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
		.sendChangeTo(withdrawerAddress)
		.build()
		.toEIP12Object();
}
export function deactivateDelegationTx(
	box: any,
	delegateAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('🔧 ACTUAL ERGOSCRIPT - Delegate Deactivate/Cancel');
	console.log('📋 Full input box:', box);
	console.log('📋 Box additionalRegisters:', box.additionalRegisters);

	try {
		// Debug all register values
		console.log('🔍 Register debugging:');
		console.log('   R4 (delegator):', box.additionalRegisters.R4);
		console.log('   R5 (delegate):', box.additionalRegisters.R5);
		console.log('   R6 (duration):', box.additionalRegisters.R6);
		console.log('   R7 (state):', box.additionalRegisters.R7);
		console.log('   R8 (fee):', box.additionalRegisters.R8);
		console.log('   R9 (feePercent):', box.additionalRegisters.R9);

		// Try different ways to get the state
		const stateFromRendered = box.additionalRegisters.R7?.renderedValue;
		const stateFromSerialized = box.additionalRegisters.R7?.serializedValue;
		const stateFromDirect = box.additionalRegisters.R7;

		console.log('🔍 State value attempts:');
		console.log(
			'   From renderedValue:',
			stateFromRendered,
			'parsed:',
			parseInt(stateFromRendered)
		);
		console.log(
			'   From serializedValue:',
			stateFromSerialized,
			'parsed:',
			parseInt(stateFromSerialized)
		);
		console.log('   From direct access:', stateFromDirect, 'parsed:', parseInt(stateFromDirect));

		let currentState = decodeFleetSInt(stateFromDirect);
		console.log('✅ Final parsed state:', currentState);

		if (isNaN(currentState)) {
			throw new Error(`State is NaN. R7 raw: ${JSON.stringify(box.additionalRegisters.R7)}`);
		}

		if (currentState !== 2) {
			throw new Error(`Cannot cancel: state must be 2 (Active), current state: ${currentState}`);
		}

		// Process assets - keep same tokens
		const processedAssets = box.assets.map((asset) => ({
			tokenId: asset.tokenId,
			amount: BigInt(asset.amount)
		}));

		// ErgoScript delegateDeactivate requirements:
		// - delegateProp (signed by delegate)
		// - state == 2
		// - deactivationBox.propositionBytes == SELF.propositionBytes (contract output)
		// - deactivationBox.tokens == SELF.tokens
		// - deactivationBox.value >= SELF.value
		// - All registers same except R7 changed to 3 (cancelled)

		// OUTPUTS(0) = deactivationBox (state 2 → 3)
		const deactivationBox = new OutputBuilder(
			BigInt(box.value), // Keep same ERG value
			DELEGATE_CONTRACT
		)
			.addTokens(processedAssets) // tokens == SELF.tokens
			.setAdditionalRegisters({
				R4: box.additionalRegisters.R4, // delegator unchanged (already serialized)
				R5: box.additionalRegisters.R5, // delegate unchanged (already serialized)
				R6: box.additionalRegisters.R6, // duration unchanged (already serialized)
				R7: SInt(3).toHex(), // state = 3 (cancelled) - KEY CHANGE
				R8: box.additionalRegisters.R8, // required fee unchanged (already serialized)
				R9: box.additionalRegisters.R9 // fee percent unchanged (already serialized)
			});

		// Clean input box (registers already in serialized format)
		const cleanBox = {
			...box,
			additionalRegisters: {
				R4: box.additionalRegisters.R4,
				R5: box.additionalRegisters.R5,
				R6: box.additionalRegisters.R6,
				R7: box.additionalRegisters.R7,
				R8: box.additionalRegisters.R8,
				R9: box.additionalRegisters.R9
			}
		};

		console.log('🎯 Building delegate cancel transaction per ErgoScript:');
		console.log('   - delegateProp: Will be signed by delegate wallet');
		console.log('   - state: 2 → 3 (Active → Cancelled)');
		console.log('   - OUTPUTS(0): deactivationBox (contract with state=3)');
		console.log('   - Additional outputs: change to delegate (allowed)');

		// Build transaction exactly as ErgoScript expects
		return new TransactionBuilder(height)
			.configureSelector((selector) => selector.ensureInclusion(cleanBox.boxId))
			.from([cleanBox, ...additionalUtxos])
			.to([deactivationBox]) // OUTPUTS(0) = deactivationBox
			.sendChangeTo(delegateAddress) // Change is fine - ErgoScript doesn't restrict it
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch (error) {
		console.error('❌ Error building delegate deactivation transaction:', error);
		throw error;
	}
}

// Use proper Fleet SDK decoding
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

// Role detection functions
export function checkIsDelegator(box: any, userAddress: string): boolean {
	try {
		const delegatorPK = box.additionalRegisters.R4.serializedValue || box.additionalRegisters.R4;
		if (!delegatorPK) return false;

		let publicKey = delegatorPK;
		// Remove GroupElement prefix if present
		if (publicKey.startsWith('07')) {
			publicKey = publicKey.substring(2);
		}

		const delegatorAddr = ErgoAddress.fromPublicKey(publicKey).toString();
		return delegatorAddr === userAddress;
	} catch (error) {
		console.error('Error checking delegator role:', error);
		return false;
	}
}

export function checkIsDelegate(box: any, userAddress: string): boolean {
	try {
		const delegatePK = box.additionalRegisters.R5.serializedValue || box.additionalRegisters.R5;
		if (!delegatePK) return false;

		let publicKey = delegatePK;
		// Remove GroupElement prefix if present
		if (publicKey.startsWith('07')) {
			publicKey = publicKey.substring(2);
		}

		const delegateAddr = ErgoAddress.fromPublicKey(publicKey).toString();
		return delegateAddr === userAddress;
	} catch (error) {
		console.error('Error checking delegate role:', error);
		return false;
	}
}

// Address conversion helper functions
export function publicKeyToAddress(registerValue: any): string {
	try {
		// Handle both object and string register formats
		let serializedValue: string;

		if (typeof registerValue === 'string') {
			serializedValue = registerValue;
		} else if (registerValue?.serializedValue) {
			serializedValue = registerValue.serializedValue;
		} else {
			throw new Error('Invalid register format');
		}

		// Remove the '07' prefix if present (GroupElement prefix)
		const publicKey = serializedValue.startsWith('07')
			? serializedValue.substring(2)
			: serializedValue;

		// Convert to Ergo address
		const address = ErgoAddress.fromPublicKey(publicKey);
		return address.toString();
	} catch (error) {
		console.error('Error converting public key to address:', error);
		return 'Invalid Address';
	}
}

export function getDelegatorAddress(delegationBox: any): string {
	return publicKeyToAddress(delegationBox.additionalRegisters.R4);
}

export function getDelegateAddress(delegationBox: any): string {
	return publicKeyToAddress(delegationBox.additionalRegisters.R5);
}

export function formatAddress(address: string, chars: number = 4): string {
	if (!address || address === 'Invalid Address') {
		return 'Invalid Address';
	}

	if (address.length <= chars * 2) {
		return address;
	}

	return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Utility function to parse delegation data
export function parseDelegation(box: any) {
	// Convert public keys to addresses
	const delegatorAddress = getDelegatorAddress(box);
	const delegateAddress = getDelegateAddress(box);

	return {
		boxId: box.boxId,

		// Store both full addresses and formatted versions
		delegatorAddress: delegatorAddress,
		delegateAddress: delegateAddress,
		delegatorFormatted: formatAddress(delegatorAddress),
		delegateFormatted: formatAddress(delegateAddress),

		// Original public keys (if needed for transactions)
		delegatorPK: box.additionalRegisters.R4.serializedValue || box.additionalRegisters.R4,
		delegatePK: box.additionalRegisters.R5.serializedValue || box.additionalRegisters.R5,

		// Legacy fields for compatibility
		delegator: box.additionalRegisters.R4.renderedValue,
		delegate: box.additionalRegisters.R5.renderedValue,

		// Other delegation data
		duration: parseInt(box.additionalRegisters.R6.renderedValue),
		state: parseInt(box.additionalRegisters.R7.renderedValue),
		requiredFee: BigInt(box.additionalRegisters.R8.renderedValue),
		feePercent: parseInt(box.additionalRegisters.R9.renderedValue),
		tokens: box.assets || [],
		creationHeight: box.creationInfo?.height || 0,
		transactionId: box.transactionId,
		value: BigInt(box.value)
	};
}

// Function to get available actions for a delegation
export function getAvailableActions(delegation: any, userAddress: string, currentHeight: number) {
	const isDelegator = checkIsDelegator(delegation, userAddress);
	const isDelegate = checkIsDelegate(delegation, userAddress);
	const isExpired = currentHeight > delegation.creationHeight + delegation.duration;

	if (isDelegator) {
		if (delegation.state === 1) {
			return [{ action: 'withdraw', label: 'Withdraw (Not Activated)' }];
		}
		if (delegation.state === 2 && isExpired) {
			return [{ action: 'deactivate', label: 'Deactivate (Expired)' }];
		}
		if (delegation.state === 2 && !isExpired) {
			const remainingBlocks = delegation.creationHeight + delegation.duration - currentHeight;
			return [{ action: 'none', label: `Available in ${remainingBlocks} blocks` }];
		}
		if (delegation.state === 3) {
			return [{ action: 'withdrawCancelled', label: 'Withdraw (Cancelled)' }];
		}
	}

	if (isDelegate) {
		if (delegation.state === 1 && !isExpired) {
			return [
				{ action: 'activate', label: `Activate (${delegation.requiredFee / 1000000000n} ERG)` }
			];
		}
		if (delegation.state === 2) {
			return [{ action: 'cancel', label: 'Cancel Delegation' }];
		}
	}

	return [{ action: 'none', label: 'No actions available' }];
}

// Simple cancel function - just changes state 2 → 1, keeps everything else
export function cancelTx(
	box: any,
	delegatorAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('🔄 SIMPLE CANCEL - Change state 2 → 1');

	// Process assets - keep same tokens
	const processedAssets = box.assets.map((asset) => ({
		tokenId: asset.tokenId,
		amount: BigInt(asset.amount)
	}));

	// ErgoScript requires NO contract outputs for delegator actions
	// So we burn the delegation box and send everything to delegator
	const withdrawBox = new OutputBuilder(
		BigInt(box.value), // All ERG to delegator
		delegatorAddress
	).addTokens(processedAssets); // All tokens to delegator

	console.log('✅ Cancel: Burn delegation box, send all assets to delegator');
	console.log('   - ErgoScript validScBoxSpent requires no contract outputs');

	return new TransactionBuilder(height)
		.from([box, ...additionalUtxos])
		.to(withdrawBox) // All assets to delegator, no contract box
		.sendChangeTo(delegatorAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();
}

// 6. Withdraw from Cancelled Delegation (uses same logic as regular withdrawTx)
export function withdrawFromCancelledTx(
	box: any,
	delegatorAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('🏦 ACTUAL ERGOSCRIPT - Withdraw from Cancelled (state 3)');

	// State 3 (cancelled) allows delegator withdrawal using same logic as state 1
	// ErgoScript: delegatorProp && validScBoxSpent && (state == 1 || isExpiredTimeWindow)
	// For state 3, we don't need to check expiration - cancelled delegations are always withdrawable

	return withdrawTx(box, delegatorAddress, height, additionalUtxos);
}
