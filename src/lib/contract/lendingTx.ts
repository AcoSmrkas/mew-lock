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
	parse,
	decode,
	SPair,
	SBigInt
} from '@fleet-sdk/serializer';
import {
	LENDING_CONTRACT,
	LENDING_DEV_PK,
	LENDING_FEE_DENOM,
	LENDING_MIN_FEE_PERCENT
} from '../common/const.ts';
import { hexToBytes } from '$lib/utils/utils.js';
import { fetchBoxes } from '$lib/api-explorer/explorer.ts';

export const DEV_PK = LENDING_DEV_PK;

// NEW SECURE CONTRACT Register Layout (v4 - ACTUALLY LOCKS LOAN TOKENS):
// R4: GroupElement - lender's public key
// R5: (Coll[Byte], Long) - (collateral token ID, required amount)
// R6: (Coll[Byte], Long) - (loan token ID, loan amount)
// R7: (Long, Int) - (fee percent, loan duration in blocks)
// R8: Long - lending fee in nanoERG
// R9: Int - state (1=created, 2=borrowed)
//
// KEY SECURITY IMPROVEMENTS:
// - Loan tokens are PHYSICALLY LOCKED in the contract box during creation
// - Contract validates hasLoanTokensLocked() before allowing borrow
// - Borrower gets loan tokens directly FROM the contract box
// - No external token transfers needed - all handled by smart contract
// - Borrower identity tracked via transaction history, not registers

export function createLoanTx(
	lenderAddress: string,
	loanTokens: Array<any>, // Loan tokens to be offered
	collateralTokenId: string, // Token ID for collateral (empty for ERG)
	collateralAmount: bigint, // Required collateral amount
	feePercent: number, // Fee percentage (basis points)
	durationBlocks: number, // Loan duration in blocks
	lendingFeeNanoErg: bigint, // Fee to be paid for borrowing
	utxos: Array<any>,
	height: number
): any {
	const lender = ErgoAddress.fromBase58(lenderAddress);

	console.log('🏦 Creating loan offer:', {
		lenderAddress,
		loanTokens,
		collateralTokenId,
		collateralAmount: collateralAmount.toString(),
		feePercent,
		durationBlocks,
		lendingFeeNanoErg: lendingFeeNanoErg.toString()
	});

	// Ensure minimum fee percent
	const safeFeePercent = Math.max(feePercent, LENDING_MIN_FEE_PERCENT);

	// Debug collateral token ID conversion
	if (collateralTokenId) {
		const tokenBytes = Array.from(hexToBytes(collateralTokenId));
		console.log('🔍 Collateral token ID debug:', {
			original: collateralTokenId,
			hexBytes: hexToBytes(collateralTokenId),
			hexBytesType: typeof hexToBytes(collateralTokenId),
			asArray: tokenBytes,
			joinedString: tokenBytes.join(',')
		});
	}

	// Debug what we're trying to parse
	const r5String = `(Coll[Byte](${
		collateralTokenId ? Array.from(hexToBytes(collateralTokenId)).join(',') : ''
	}), ${collateralAmount}L)`;
	const r6String = `(${safeFeePercent}L, ${durationBlocks})`;

	console.log('🔍 Register parsing debug:', {
		r5String,
		r6String,
		safeFeePercent,
		durationBlocks,
		collateralAmount: collateralAmount.toString()
	});

	// Try to parse and see what happens
	try {
		const r5Parsed = parse(r5String);
		console.log('✅ R5 parsed successfully:', r5Parsed);
	} catch (e) {
		console.error('❌ R5 parsing failed:', e.message);
	}

	try {
		const r6Parsed = parse(r6String);
		console.log('✅ R6 parsed successfully:', r6Parsed);
	} catch (e) {
		console.error('❌ R6 parsing failed:', e.message);
	}

	// Create tuples using proper Fleet SDK approach (similar to your reference code)
	console.log('🔧 Creating tuples using Fleet SDK approach...');

	// R5: (Coll[Byte], Long) - collateral token ID and amount
	const collateralTuple = {
		_1: collateralTokenId ? hexToBytes(collateralTokenId) : new Uint8Array(0), // Coll[Byte] as Uint8Array
		_2: collateralAmount // Long (as BigInt)
	};

	// R6: (Coll[Byte], Long) - loan token ID and amount (NEW!)
	if (!loanTokens || loanTokens.length === 0) {
		throw new Error('At least one loan token is required for the new secure contract');
	}
	const loanTokenTuple = {
		_1: hexToBytes(loanTokens[0].tokenId), // Coll[Byte] as Uint8Array
		_2: BigInt(loanTokens[0].amount) // Long (as BigInt)
	};

	// R7: (Long, Int) - fee percent and duration
	const feeAndDurationTuple = {
		_1: BigInt(safeFeePercent), // Long
		_2: durationBlocks // Int
	};

	console.log('🔍 Tuple debug:', {
		collateralTuple,
		loanTokenTuple,
		feeAndDurationTuple
	});

	// Create tuples using direct SConstant approach (STuple not available in this version)
	console.log('🔧 Creating tuples using direct SConstant tuple approach...');

	let r5Register, r6Register, r7Register;

	try {
		// Create individual sigma values first, then combine
		console.log('🔧 Creating individual sigma values...');

		const r5CollBytes = SColl(SByte, collateralTuple._1);
		const r5LongValue = SLong(collateralTuple._2);
		const r6CollBytes = SColl(SByte, loanTokenTuple._1);
		const r6LongValue = SLong(loanTokenTuple._2);
		const r7LongValue = SLong(feeAndDurationTuple._1);
		const r7IntValue = SInt(feeAndDurationTuple._2);

		console.log('🔍 Individual sigma values created:', {
			r5CollBytes: r5CollBytes.toHex(),
			r5LongValue: r5LongValue.toHex(),
			r6CollBytes: r6CollBytes.toHex(),
			r6LongValue: r6LongValue.toHex(),
			r7LongValue: r7LongValue.toHex(),
			r7IntValue: r7IntValue.toHex()
		});

		// Now create proper tuples by manually encoding them
		// Based on Ergo serialization format, tuples are encoded with type info + data
		console.log('🔧 Creating actual tuples...');

		// Use SPair instead of STuple (STuple not exported, but SPair is)
		// SPair creates tuple/pair types in Fleet SDK
		console.log('🔧 Using SPair for tuple creation...');

		// R5: (Coll[Byte], Long) - using SPair
		const r5Tuple = SPair(
			SColl(SByte, collateralTuple._1), // Coll[Byte] with Uint8Array data
			SLong(collateralTuple._2) // Long with BigInt
		);

		// R6: (Coll[Byte], Long) - using SPair (NEW!)
		const r6Tuple = SPair(
			SColl(SByte, loanTokenTuple._1), // Coll[Byte] with Uint8Array data
			SLong(loanTokenTuple._2) // Long with BigInt
		);

		// R7: (Long, Int) - using SPair
		const r7Tuple = SPair(
			SLong(feeAndDurationTuple._1), // Long with BigInt
			SInt(feeAndDurationTuple._2) // Int with number
		);

		console.log('🔍 STuple objects created:', {
			r5Tuple: r5Tuple.toHex(),
			r6Tuple: r6Tuple.toHex(),
			r7Tuple: r7Tuple.toHex()
		});

		// Create the registers using the exact pattern from Fleet SDK test
		r5Register = SConstant.from(r5Tuple.toHex()).toHex();
		r6Register = SConstant.from(r6Tuple.toHex()).toHex();
		r7Register = SConstant.from(r7Tuple.toHex()).toHex();

		console.log('✅ Fleet SDK example pattern registers:', {
			r5Register,
			r6Register,
			r7Register
		});

		console.log("🔧 Temporary registers (will test friend's parsing):", {
			r5Register,
			r6Register,
			r7Register
		});

		console.log('✅ STuple approach succeeded:', {
			r5Register,
			r6Register,
			r7Register,
			r5_tokenId: collateralTuple._1,
			r5_amount: collateralTuple._2.toString(),
			r6_tokenId: loanTokenTuple._1,
			r6_amount: loanTokenTuple._2.toString(),
			r7_fee: feeAndDurationTuple._1.toString(),
			r7_duration: feeAndDurationTuple._2
		});

		// 🧪 TEST FRIEND'S SUGGESTIONS: SConstant.from<[]>() vs decode<[]>()
		console.log("🧪 Testing friend's suggested syntaxes...");

		// Test the string versions for debugging
		const r5String = `(Coll[Byte](${
			collateralTuple._1 ? Array.from(collateralTuple._1).join(',') : ''
		}), ${collateralTuple._2}L)`;
		const r6String = `(${feeAndDurationTuple._1}L, ${feeAndDurationTuple._2})`;

		console.log('🔍 Test strings:', {
			r5String,
			r6String
		});

		try {
			// Test 1: SConstant.from<[]>() with type parameter - Friend's EXACT suggestion
			console.log("🔬 Testing SConstant.from<[]>() - Friend's EXACT suggestion:");
			console.log('Testing: const r5Parsed = SConstant.from<[]>(r5Register).data');
			console.log('Testing: const r6Parsed = SConstant.from<[]>(r6Register).data');

			const r5Parsed = SConstant.from<[]>(r5Register).data;
			const r6Parsed = SConstant.from<[]>(r6Register).data;

			console.log('✅ SConstant.from<[]>() results:', {
				r5_type: typeof r5Parsed,
				r5_data: r5Parsed,
				r5_isArray: Array.isArray(r5Parsed),
				r6_type: typeof r6Parsed,
				r6_data: r6Parsed,
				r6_isArray: Array.isArray(r6Parsed)
			});

			// If arrays, show elements
			if (Array.isArray(r5Parsed)) {
				console.log('🔍 R5 tuple elements:', {
					element0: r5Parsed[0],
					element1: r5Parsed[1],
					length: r5Parsed.length
				});
			}

			if (Array.isArray(r6Parsed)) {
				console.log('🔍 R6 tuple elements:', {
					element0: r6Parsed[0],
					element1: r6Parsed[1],
					length: r6Parsed.length
				});
			}
		} catch (typedError) {
			console.error('❌ SConstant.from<[]>() failed:', typedError);
		}

		try {
			// Test 2: decode<[]>() syntax - Friend's EXACT alternative suggestion
			console.log("🔬 Testing decode<[]>() - Friend's EXACT alternative:");
			console.log('Testing: const r5ParsedDecode = decode<[]>(r5Register).data');
			console.log('Testing: const r6ParsedDecode = decode<[]>(r6Register).data');

			const r5ParsedDecode = decode<[]>(r5Register).data;
			const r6ParsedDecode = decode<[]>(r6Register).data;

			console.log('✅ decode<[]>() results:', {
				r5_type: typeof r5ParsedDecode,
				r5_data: r5ParsedDecode,
				r5_isArray: Array.isArray(r5ParsedDecode),
				r6_type: typeof r6ParsedDecode,
				r6_data: r6ParsedDecode,
				r6_isArray: Array.isArray(r6ParsedDecode)
			});

			// If arrays, show elements
			if (Array.isArray(r5ParsedDecode)) {
				console.log('🔍 R5 decode tuple elements:', {
					element0: r5ParsedDecode[0],
					element1: r5ParsedDecode[1],
					length: r5ParsedDecode.length
				});
			}

			if (Array.isArray(r6ParsedDecode)) {
				console.log('🔍 R6 decode tuple elements:', {
					element0: r6ParsedDecode[0],
					element1: r6ParsedDecode[1],
					length: r6ParsedDecode.length
				});
			}
		} catch (decodeError) {
			console.error('❌ decode<[]>() failed:', decodeError);
		}

		// Test 3: Compare both methods
		try {
			console.log("🔬 Comparing both friend's suggested methods:");
			const sConstantResult = SConstant.from<[]>(r5Register).data;
			const decodeResult = decode<[]>(r5Register).data;

			console.log('🔍 Method comparison for R5:', {
				sConstant_isArray: Array.isArray(sConstantResult),
				decode_isArray: Array.isArray(decodeResult),
				results_equal: JSON.stringify(sConstantResult) === JSON.stringify(decodeResult)
			});
		} catch (compareError) {
			console.error('❌ Method comparison failed:', compareError);
		}
	} catch (error) {
		console.error('❌ STuple approach failed:', error);
		throw error;
	}

	// NEW SECURE CONTRACT: Lock loan tokens in the contract box for guaranteed availability
	console.log('🔐 NEW SECURE CONTRACT: Locking loan tokens in contract box:', loanTokens);
	const contractBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, LENDING_CONTRACT)
		.addTokens(loanTokens) // LOCK loan tokens in contract for security
		.setAdditionalRegisters({
			R4: SGroupElement(first(lender.getPublicKeys())).toHex(), // Lender PK
			R5: r5Register, // Collateral info (Coll[Byte], Long)
			R6: r6Register, // Loan token info (Coll[Byte], Long)
			R7: r7Register, // Setup info (Long, Int)
			R8: SLong(lendingFeeNanoErg).toHex(), // Lending fee (Long)
			R9: SInt(1).toHex() // State = 1 (created) (Int)
		});

	return new TransactionBuilder(height)
		.from(utxos)
		.to(contractBox)
		.sendChangeTo(lenderAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();
}

export function borrowLoanTx(
	box: any,
	borrowerAddress: string,
	collateralUtxos: Array<any>, // UTXOs providing collateral
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('💰 ACTUAL ERGOSCRIPT - Borrow Loan');
	console.log('📋 Input box:', box);

	try {
		// Extract register values for NEW contract layout:
		// R4: GroupElement - lender's public key
		// R5: (Coll[Byte], Long) - (collateral token ID, required amount)
		// R6: (Coll[Byte], Long) - (loan token ID, loan amount)
		// R7: (Long, Int) - (fee percent, loan duration in blocks)
		// R8: Long - lending fee in nanoERG
		// R9: Int - state (1=created, 2=borrowed)

		const r4Value = box.additionalRegisters.R4?.serializedValue || box.additionalRegisters.R4;
		const r5Value = box.additionalRegisters.R5?.serializedValue || box.additionalRegisters.R5;
		const r6Value = box.additionalRegisters.R6?.serializedValue || box.additionalRegisters.R6;
		const r7Value = box.additionalRegisters.R7?.serializedValue || box.additionalRegisters.R7;
		const r8Value = box.additionalRegisters.R8?.serializedValue || box.additionalRegisters.R8;
		const r9Value = box.additionalRegisters.R9?.serializedValue || box.additionalRegisters.R9;

		// Parse lender public key
		const lenderPK = r4Value.startsWith('07') ? r4Value.substring(2) : r4Value;
		const lenderAddress = ErgoAddress.fromPublicKey(lenderPK).toString();

		// Parse NEW contract registers
		const collateralInfo = decodeTuple(r5Value); // (Coll[Byte], Long)
		const loanTokenInfo = decodeTuple(r6Value); // (Coll[Byte], Long) - NEW!
		const setupInfo = decodeTuple(r7Value); // (Long, Int)

		const collateralTokenId = collateralInfo[0]; // Coll[Byte]
		const collateralAmount = BigInt(collateralInfo[1]); // Long

		const loanTokenId = loanTokenInfo[0]; // Coll[Byte] - NEW!
		const loanAmount = BigInt(loanTokenInfo[1]); // Long - NEW!

		const feePercent = BigInt(setupInfo[0]); // Long
		const duration = parseInt(setupInfo[1]); // Int

		const lendingFee = BigInt(decodeFleetType(r8Value)); // Long
		const state = parseInt(decodeFleetType(r9Value)); // Int

		// Process collateral token ID
		let collateralTokenIdHex = null;
		if (collateralTokenId && collateralTokenId.length > 0) {
			if (collateralTokenId instanceof Uint8Array) {
				collateralTokenIdHex = Array.from(collateralTokenId)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (Array.isArray(collateralTokenId)) {
				collateralTokenIdHex = collateralTokenId
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (typeof collateralTokenId === 'string') {
				collateralTokenIdHex = collateralTokenId;
			}
		}

		// Process loan token ID (NEW!)
		let loanTokenIdHex = null;
		if (loanTokenId && loanTokenId.length > 0) {
			if (loanTokenId instanceof Uint8Array) {
				loanTokenIdHex = Array.from(loanTokenId)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (Array.isArray(loanTokenId)) {
				loanTokenIdHex = loanTokenId.map((b) => b.toString(16).padStart(2, '0')).join('');
			} else if (typeof loanTokenId === 'string') {
				loanTokenIdHex = loanTokenId;
			}
		}

		console.log('📊 NEW CONTRACT Loan details:', {
			lenderAddress,
			loanTokenIdHex,
			loanAmount: loanAmount.toString(),
			collateralTokenIdHex: collateralTokenIdHex || 'ERG',
			collateralAmount: collateralAmount.toString(),
			feePercent: feePercent.toString(),
			duration,
			lendingFee: lendingFee.toString(),
			state
		});

		if (state !== 1) {
			throw new Error(`Can only borrow from state 1 (Created), current state: ${state}`);
		}

		// Calculate fees exactly as in smart contract
		const feeDenom = BigInt(100000); // feeDenom = 100000L
		const devFee = (lendingFee * feePercent) / feeDenom;
		const activationFee = lendingFee - devFee;

		console.log('💸 NEW CONTRACT Fee breakdown:');
		console.log('   - Total fee:', Number(lendingFee) / 1e9, 'ERG');
		console.log('   - Dev fee:', Number(devFee) / 1e9, 'ERG');
		console.log('   - Activation fee:', Number(activationFee) / 1e9, 'ERG');

		// OUTPUTS exactly as smart contract expects:

		// OUTPUTS(0): Borrower gets the loan tokens from the contract box
		const borrowerBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, borrowerAddress);

		// NEW SECURE CONTRACT: Transfer loan tokens from contract box to borrower
		// The contract now ACTUALLY holds the loan tokens, so we transfer them
		const loanTokensToTransfer =
			box.assets?.filter((asset) => {
				// Find tokens that match the loan token ID from register
				return loanTokenIdHex && asset.tokenId === loanTokenIdHex;
			}) || [];

		if (loanTokensToTransfer.length > 0) {
			// Transfer the exact amount specified in register R6
			const transferAmount = loanTokensToTransfer.reduce(
				(sum, token) => sum + BigInt(token.amount),
				BigInt(0)
			);
			if (transferAmount >= loanAmount) {
				// Transfer exact loan amount to borrower
				borrowerBox.addTokens([
					{
						tokenId: loanTokenIdHex,
						amount: loanAmount
					}
				]);
				console.log(
					`✅ OUTPUTS(0): Borrower gets ${loanAmount.toString()} of ${loanTokenIdHex} from contract`
				);
			} else {
				throw new Error(`Contract has insufficient loan tokens: ${transferAmount} < ${loanAmount}`);
			}
		} else {
			console.error(`❌ No loan tokens found in contract box for ${loanTokenIdHex}`);
			throw new Error(`Loan tokens not found in contract box: ${loanTokenIdHex}`);
		}

		// OUTPUTS(1): Activation fee to lender (correctActivationFeePayment check)
		const lenderBox = new OutputBuilder(activationFee, lenderAddress);
		console.log(`✅ OUTPUTS(1): Lender gets ${Number(activationFee) / 1e9} ERG activation fee`);

		// OUTPUTS(2): Dev fee (correctDevFeePayment check)
		const devBox = new OutputBuilder(devFee, DEV_PK);
		console.log(`✅ OUTPUTS(2): Dev gets ${Number(devFee) / 1e9} ERG dev fee`);

		// OUTPUTS(3): New contract box with collateral (hasCorrectCollateral + correctNewContractBoxData checks)
		const newContractBox = new OutputBuilder(
			BigInt(box.value), // Keep same ERG value initially
			LENDING_CONTRACT
		).setAdditionalRegisters({
			R4: r4Value, // lender unchanged
			R5: r5Value, // collateralInfo unchanged
			R6: r6Value, // loanTokenInfo unchanged
			R7: r7Value, // setupInfo unchanged
			R8: r8Value, // lendingFee unchanged
			R9: SInt(2).toHex() // state = 2 (borrowed)
		});
		console.log(`✅ OUTPUTS(3): New contract box with state=2`);

		// NEW SECURE CONTRACT: Add ONLY collateral to contract box (loan tokens are transferred out)
		if (collateralTokenIdHex && collateralAmount > 0) {
			console.log('🔍 NEW CONTRACT - Token collateral validation:');
			console.log('Required collateral token ID:', collateralTokenIdHex);
			console.log('Required collateral amount:', collateralAmount.toString(), 'raw units');
			console.log('Total UTXOs provided:', collateralUtxos.length);

			// Check if user has enough of the required collateral tokens
			let totalCollateralTokens = BigInt(0);
			let tokenUtxoCount = 0;

			collateralUtxos.forEach((utxo, index) => {
				if (utxo.assets && utxo.assets.length > 0) {
					utxo.assets.forEach((asset, assetIndex) => {
						if (asset.tokenId === collateralTokenIdHex) {
							const assetAmount = BigInt(asset.amount);
							totalCollateralTokens += assetAmount;
							tokenUtxoCount++;
							console.log(
								`  UTXO ${index}, Asset ${assetIndex}: ${assetAmount.toString()} collateral token units`
							);
						}
					});
				}
			});

			console.log(
				`💰 TOTAL COLLATERAL TOKENS AVAILABLE: ${totalCollateralTokens.toString()} raw units`
			);
			console.log(`📦 Collateral token UTXOs found: ${tokenUtxoCount}`);
			console.log(
				`✅ Sufficient collateral tokens? ${
					totalCollateralTokens >= collateralAmount ? 'YES' : 'NO'
				}`
			);

			if (totalCollateralTokens < collateralAmount) {
				console.error(
					`❌ INSUFFICIENT COLLATERAL TOKENS: Need ${collateralAmount.toString()} but only have ${totalCollateralTokens.toString()}`
				);
				throw new Error(
					`Insufficient token collateral: need ${collateralAmount.toString()} ${collateralTokenIdHex} but only have ${totalCollateralTokens.toString()}`
				);
			}

			// NEW SECURE CONTRACT: Only add collateral tokens (borrower's locked assets)
			console.log('🔧 NEW SECURE CONTRACT - Adding ONLY collateral tokens to contract box:');
			newContractBox.addTokens([
				{
					tokenId: collateralTokenIdHex,
					amount: collateralAmount
				}
			]);
			console.log(
				`  - Collateral token (locked): ${collateralTokenIdHex}, amount: ${collateralAmount.toString()}`
			);
		} else if (collateralAmount > 0) {
			// ERG collateral - add to contract box value
			console.log('🔧 NEW SECURE CONTRACT - ERG collateral validation:');
			const totalCollateralValue = collateralUtxos.reduce(
				(sum, utxo) => sum + BigInt(utxo.value),
				BigInt(0)
			);

			if (totalCollateralValue < collateralAmount) {
				throw new Error(
					`Insufficient ERG collateral: ${totalCollateralValue} < ${collateralAmount}`
				);
			}

			newContractBox.setValue(BigInt(box.value) + collateralAmount);
			console.log(
				`  - ERG collateral: ${collateralAmount.toString()} nanoERG added to contract value`
			);
		} else {
			console.log(
				`🔧 NEW SECURE CONTRACT - No collateral required (amount: 0) - contract tracks state only`
			);
		}

		// Remove duplicates from UTXO arrays to prevent "Box already included" error
		const allUtxos = [box, ...additionalUtxos, ...collateralUtxos];
		const uniqueUtxos = allUtxos.filter(
			(utxo, index, array) => array.findIndex((u) => u.boxId === utxo.boxId) === index
		);

		console.log(`🔧 UTXO deduplication: ${allUtxos.length} total -> ${uniqueUtxos.length} unique`);

		return new TransactionBuilder(height)
			.from(uniqueUtxos) // Use deduplicated UTXOs
			.to(borrowerBox) // OUTPUTS(0)
			.to(lenderBox) // OUTPUTS(1)
			.to(devBox) // OUTPUTS(2)
			.to(newContractBox) // OUTPUTS(3)
			.sendChangeTo(borrowerAddress)
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch (error) {
		console.error('❌ Error building borrow transaction:', error);
		throw error;
	}
}

export function repayLoanTx(
	box: any,
	borrowerAddress: string,
	repaymentUtxos: Array<any>, // UTXOs with loan tokens for repayment
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('💰 ACTUAL ERGOSCRIPT - Repay Loan');

	try {
		// Extract register values properly
		const r4Value = box.additionalRegisters.R4?.serializedValue || box.additionalRegisters.R4;
		const r5Value = box.additionalRegisters.R5?.serializedValue || box.additionalRegisters.R5;
		const r6Value = box.additionalRegisters.R6?.serializedValue || box.additionalRegisters.R6;
		const r7Value = box.additionalRegisters.R7?.serializedValue || box.additionalRegisters.R7;
		const r8Value = box.additionalRegisters.R8?.serializedValue || box.additionalRegisters.R8;
		const r9Value = box.additionalRegisters.R9?.serializedValue || box.additionalRegisters.R9;

		// Parse addresses
		const lenderPK = r4Value.startsWith('07') ? r4Value.substring(2) : r4Value;
		const lenderAddress = ErgoAddress.fromPublicKey(lenderPK).toString();

		// NEW SECURE CONTRACT: R9 is state (Int), not borrower PK
		const state = parseInt(decodeFleetType(r9Value));
		if (state !== 2) {
			throw new Error(`Can only repay borrowed loans, current state: ${state}`);
		}

		console.log('🔍 NEW SECURE CONTRACT repay - state check passed:', { state });

		// NEW SECURE CONTRACT: Parse register tuples
		const collateralInfo = decodeTuple(r5Value); // (Coll[Byte], Long)
		const loanTokenInfo = decodeTuple(r6Value); // (Coll[Byte], Long) - NEW!
		const setupInfo = decodeTuple(r7Value); // (Long, Int)

		console.log('🔍 NEW SECURE CONTRACT repay tuples:', {
			collateralInfo,
			loanTokenInfo,
			setupInfo
		});

		const collateralTokenId = collateralInfo[0];
		const collateralAmount = BigInt(collateralInfo[1]);
		const loanTokenId = loanTokenInfo[0]; // NEW!
		const loanAmount = BigInt(loanTokenInfo[1]); // NEW!
		const duration = parseInt(setupInfo[1]);
		const creationHeight = box.creationHeight || box.settlementHeight || 0;
		const isExpired = height > creationHeight + duration;

		if (isExpired) {
			throw new Error('Loan has expired and can only be liquidated by lender');
		}

		// Process token IDs for repayment
		let collateralTokenIdHex = null;
		if (collateralTokenId && collateralTokenId.length > 0) {
			if (collateralTokenId instanceof Uint8Array) {
				collateralTokenIdHex = Array.from(collateralTokenId)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (Array.isArray(collateralTokenId)) {
				collateralTokenIdHex = collateralTokenId
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (typeof collateralTokenId === 'string') {
				collateralTokenIdHex = collateralTokenId;
			}
		}

		// Process loan token ID for repayment
		let loanTokenIdHex = null;
		if (loanTokenId && loanTokenId.length > 0) {
			if (loanTokenId instanceof Uint8Array) {
				loanTokenIdHex = Array.from(loanTokenId)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (Array.isArray(loanTokenId)) {
				loanTokenIdHex = loanTokenId.map((b) => b.toString(16).padStart(2, '0')).join('');
			} else if (typeof loanTokenId === 'string') {
				loanTokenIdHex = loanTokenId;
			}
		}

		// REPAYMENT: Contract expects NO smart contract boxes in outputs (validScBoxSpent)
		// OUTPUTS(0): Lender gets loan tokens back (this is what the contract checks)
		// All collateral and remaining assets are implicitly returned via transaction structure

		// OUTPUTS(0): Lender gets loan tokens from borrower's repayment UTXOs
		const lenderBox = new OutputBuilder(SAFE_MIN_BOX_VALUE, lenderAddress);

		// Add loan tokens to lender box (contract validation: validateLoanRepayment)
		if (loanTokenIdHex) {
			// Find loan tokens in repayment UTXOs that match the required token ID
			const loanTokens = repaymentUtxos.flatMap((utxo) =>
				(utxo.assets || []).filter((asset) => asset.tokenId === loanTokenIdHex)
			);

			if (loanTokens.length > 0) {
				// Verify sufficient amount
				const totalAmount = loanTokens.reduce(
					(sum, token) => sum + BigInt(token.amount),
					BigInt(0)
				);
				if (totalAmount >= loanAmount) {
					lenderBox.addTokens([
						{
							tokenId: loanTokenIdHex,
							amount: loanAmount
						}
					]);
					console.log(`✅ Repaying ${loanAmount.toString()} of ${loanTokenIdHex} to lender`);
				} else {
					throw new Error(`Insufficient loan tokens for repayment: ${totalAmount} < ${loanAmount}`);
				}
			} else {
				throw new Error(`No loan tokens found for repayment: ${loanTokenIdHex}`);
			}
		} else {
			console.log('⚠️ No loan token ID specified - ERG only loan?');
		}

		// NOTE: Contract expects validScBoxSpent = true (no contract boxes in outputs)
		// All collateral is automatically returned to borrower via change output

		// Deduplicate UTXOs to prevent "Box is already included" error
		const allUtxos = [box, ...additionalUtxos, ...repaymentUtxos];
		const uniqueUtxos = [];
		const seenBoxIds = new Set();

		for (const utxo of allUtxos) {
			if (!seenBoxIds.has(utxo.boxId)) {
				seenBoxIds.add(utxo.boxId);
				uniqueUtxos.push(utxo);
			}
		}

		console.log('🔍 UTXO deduplication:', {
			originalCount: allUtxos.length,
			uniqueCount: uniqueUtxos.length,
			duplicatesRemoved: allUtxos.length - uniqueUtxos.length
		});

		console.log('🔍 Final transaction structure:', {
			inputs: uniqueUtxos.map((utxo) => ({
				boxId: utxo.boxId,
				address: utxo.address,
				value: utxo.value,
				assets: utxo.assets?.length || 0
			})),
			outputs: [
				{
					type: 'lender',
					address: lenderAddress,
					value: SAFE_MIN_BOX_VALUE,
					tokens: loanTokenIdHex ? `${loanAmount} of ${loanTokenIdHex}` : 'none'
				},
				{
					type: 'change',
					address: borrowerAddress,
					note: 'All remaining assets including collateral'
				}
			]
		});

		return new TransactionBuilder(height)
			.from(uniqueUtxos)
			.to(lenderBox) // OUTPUTS(0) - loan tokens to lender (as expected by contract)
			.sendChangeTo(borrowerAddress) // All collateral and remaining assets go to borrower
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch (error) {
		console.error('❌ Error building repay transaction:', error);
		throw error;
	}
}

export function cancelLoanTx(
	box: any,
	lenderAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('🚫 ACTUAL ERGOSCRIPT - Cancel Loan (Lender)');

	try {
		// Extract register values properly
		const r9Value = box.additionalRegisters.R9?.serializedValue || box.additionalRegisters.R9;
		const state = parseInt(decodeFleetType(r9Value)); // NEW: R9 is state

		console.log('🔍 Cancel loan state check:', {
			r9Value,
			state,
			canCancel: state === 1
		});

		if (state !== 1) {
			throw new Error(`Can only cancel unborrowed loans, current state: ${state}`);
		}

		// Simple cancellation - return loan tokens to lender
		const lenderBox = new OutputBuilder(BigInt(box.value), lenderAddress).addTokens(box.assets); // Return all loan tokens

		return new TransactionBuilder(height)
			.from([box, ...additionalUtxos])
			.to(lenderBox)
			.sendChangeTo(lenderAddress)
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch (error) {
		console.error('❌ Error building cancel transaction:', error);
		throw error;
	}
}

export function liquidateLoanTx(
	box: any,
	lenderAddress: string,
	height: number,
	additionalUtxos: Array<any>
): any {
	console.log('⚡ ACTUAL ERGOSCRIPT - Liquidate Loan (Lender)');

	try {
		// Extract register values properly
		const r7Value = box.additionalRegisters.R7?.serializedValue || box.additionalRegisters.R7;
		const r9Value = box.additionalRegisters.R9?.serializedValue || box.additionalRegisters.R9;

		const state = parseInt(decodeFleetType(r9Value)); // NEW: R9 is state
		if (state !== 2) {
			throw new Error(`Can only liquidate borrowed loans, current state: ${state}`);
		}

		// NEW SECURE CONTRACT: Parse setup info from R7
		const setupInfo = decodeTuple(r7Value); // (Long, Int)

		const duration = parseInt(setupInfo[1]);
		const creationHeight = box.creationHeight || box.settlementHeight || 0;
		const isExpired = height > creationHeight + duration;

		if (!isExpired) {
			throw new Error('Can only liquidate expired loans');
		}

		// Lender gets everything - collateral and any remaining loan tokens
		const lenderBox = new OutputBuilder(BigInt(box.value), lenderAddress).addTokens(
			box.assets || []
		); // Get all assets (collateral + any loan tokens)

		return new TransactionBuilder(height)
			.from([box, ...additionalUtxos])
			.to(lenderBox)
			.sendChangeTo(lenderAddress)
			.payFee(RECOMMENDED_MIN_FEE_VALUE)
			.build()
			.toEIP12Object();
	} catch (error) {
		console.error('❌ Error building liquidate transaction:', error);
		throw error;
	}
}

// Utility function to decode tuple from register using friend's suggested methods
function decodeTuple(hexValue: string): any[] {
	console.log('🔍 Decoding tuple from hex:', hexValue);

	if (!hexValue || typeof hexValue !== 'string') {
		throw new Error(`Invalid hex value: ${hexValue}`);
	}

	try {
		// Try friend's first suggestion: SConstant.from<[]>().data
		console.log('🔬 Using SConstant.from<[]>() method...');
		const parsed = SConstant.from<[]>(hexValue).data;

		console.log('✅ SConstant.from<[]>() result:', {
			type: typeof parsed,
			isArray: Array.isArray(parsed),
			data: parsed
		});

		if (Array.isArray(parsed)) {
			return parsed;
		}

		throw new Error('SConstant.from<[]>() did not return an array');
	} catch (sConstantError) {
		console.warn('❌ SConstant.from<[]>() failed, trying decode<[]>():', sConstantError);

		try {
			// Try friend's second suggestion: decode<[]>().data
			console.log('🔬 Using decode<[]>() method...');
			const decoded = decode<[]>(hexValue).data;

			console.log('✅ decode<[]>() result:', {
				type: typeof decoded,
				isArray: Array.isArray(decoded),
				data: decoded
			});

			if (Array.isArray(decoded)) {
				return decoded;
			}

			throw new Error('decode<[]>() did not return an array');
		} catch (decodeError) {
			console.error("❌ Both friend's methods failed:", { sConstantError, decodeError });

			// Check if this is a legacy format (not a tuple)
			console.log('🔄 Checking if this is legacy format (not a tuple)...');
			const bytes = hexToBytes(hexValue);
			const constant = SConstant.from(bytes);

			console.log('🔍 Legacy format check:', {
				dataType: typeof constant.data,
				isUint8Array: constant.data instanceof Uint8Array,
				isArray: Array.isArray(constant.data),
				data: constant.data
			});

			if (Array.isArray(constant.data)) {
				return constant.data;
			}

			// If it's not an array, this IS legacy format - don't return an array
			// The calling function should handle this case
			console.log('✅ Confirmed legacy format - single value not tuple');
			throw new Error(`legacy format`);
		}
	}
}

// Utility function to decode Fleet SDK types
function decodeFleetType(hexValue: string): any {
	console.log('🔍 Decoding Fleet type:', hexValue);
	const bytes = hexToBytes(hexValue);
	const constant = SConstant.from(bytes);

	let jsValue;
	if (typeof constant.data === 'bigint') {
		jsValue = Number(constant.data);
	} else {
		jsValue = constant.data;
	}

	return jsValue;
}

// Role detection functions
export function checkIsLender(box: any, userAddress: string): boolean {
	try {
		const lenderPK = box.additionalRegisters.R4;
		if (!lenderPK) return false;

		// Extract lender public key - handle both serializedValue and direct hex
		let lenderPKHex = '';
		if (typeof lenderPK === 'string') {
			lenderPKHex = lenderPK;
		} else if (lenderPK?.serializedValue) {
			lenderPKHex = lenderPK.serializedValue;
		} else if (lenderPK?.renderedValue) {
			lenderPKHex = lenderPK.renderedValue;
		}

		if (!lenderPKHex) {
			console.warn('⚠️ Could not extract lender PK hex from register R4:', lenderPK);
			return false;
		}

		// Remove GroupElement prefix if present
		let publicKey = lenderPKHex;
		if (publicKey.startsWith('07')) {
			publicKey = publicKey.substring(2);
		}

		const lenderAddr = ErgoAddress.fromPublicKey(publicKey).toString();
		const isLender = lenderAddr === userAddress;

		console.log('🔍 Lender role check:', {
			boxId: box.boxId,
			userAddress,
			lenderAddr,
			isLender,
			lenderPKHex: lenderPKHex.substring(0, 20) + '...'
		});

		return isLender;
	} catch (error) {
		console.error('Error checking lender role:', error);
		return false;
	}
}

export async function checkIsBorrower(box: any, userAddress: string): Promise<boolean> {
	// NEW SECURE CONTRACT: R9 is now state (Int), not borrower PK
	// We need to analyze transaction history to find the borrower
	try {
		const state = parseInt(
			decodeFleetType(box.additionalRegisters.R9?.serializedValue || box.additionalRegisters.R9)
		);

		console.log('🔍 BORROWER CHECK: Starting check for user:', {
			boxId: box.boxId,
			userAddress,
			state,
			stateIsBorrowed: state === 2
		});

		if (state !== 2) {
			// Not borrowed yet, so no borrower
			console.log('📝 BORROWER CHECK: Loan not borrowed (state !== 2)');
			return false;
		}

		// Find borrower from transaction history
		const borrowerAddress = await findBorrowerFromHistory(box.boxId);
		const isBorrower = borrowerAddress === userAddress;

		console.log('🔍 NEW SECURE CONTRACT: Borrower role check via transaction history:', {
			boxId: box.boxId,
			userAddress,
			borrowerAddress,
			isBorrower,
			state,
			addressesMatch: borrowerAddress === userAddress
		});

		return isBorrower;
	} catch (error) {
		console.error('Error checking borrower role via transaction history:', error);
		return false;
	}
}

// Helper function to find borrower from transaction history
export async function findBorrowerFromHistory(contractBoxId: string): Promise<string | null> {
	try {
		console.log('🔍 Analyzing transaction history to find borrower for box:', contractBoxId);

		// Get the transaction that created this contract box
		const boxInfo = await fetch(`https://api.ergoplatform.com/api/v1/boxes/${contractBoxId}`);
		if (!boxInfo.ok) {
			console.warn(`Failed to fetch box info: ${boxInfo.status}`);
			return null;
		}
		const boxData = await boxInfo.json();

		console.log('🔍 Box data structure:', {
			hasSpentTransactionId: !!boxData.spentTransactionId,
			spentTransactionId: boxData.spentTransactionId,
			boxDataKeys: Object.keys(boxData)
		});

		if (!boxData.spentTransactionId) {
			// Box hasn't been spent yet, so no borrower
			console.log('📝 Box not spent yet, no borrower');
			return null;
		}

		// Get the transaction that spent this box (the borrow transaction)
		const spendingTxResponse = await fetch(
			`https://api.ergoplatform.com/api/v1/transactions/${boxData.spentTransactionId}`
		);
		if (!spendingTxResponse.ok) {
			throw new Error(`Failed to fetch spending transaction: ${spendingTxResponse.status}`);
		}
		const spendingTx = await spendingTxResponse.json();

		console.log('🔍 Found spending transaction:', {
			txId: boxData.spentTransactionId,
			inputsCount: spendingTx.inputs?.length,
			outputsCount: spendingTx.outputs?.length
		});

		// Analyze the transaction to find the borrower
		// The borrower is the one who:
		// 1. Provided collateral (input UTXOs)
		// 2. Received loan tokens (output UTXO)
		// 3. Is NOT the lender or contract address

		// Get lender address from original box
		const lenderPK =
			boxData.additionalRegisters.R4?.serializedValue || boxData.additionalRegisters.R4;
		const lenderAddress = lenderPK
			? ErgoAddress.fromPublicKey(
					lenderPK.startsWith('07') ? lenderPK.substring(2) : lenderPK
			  ).toString()
			: null;

		// Find borrower from transaction outputs
		// OUTPUTS(0) should be borrower getting loan tokens
		if (spendingTx.outputs && spendingTx.outputs.length > 0) {
			const borrowerOutput = spendingTx.outputs[0]; // First output is borrower
			const borrowerAddress = borrowerOutput.address;

			console.log('🔍 Transaction output analysis:', {
				firstOutputAddress: borrowerAddress,
				lenderAddress,
				contractAddress: LENDING_CONTRACT,
				isLender: borrowerAddress === lenderAddress,
				isContract: borrowerAddress === LENDING_CONTRACT
			});

			// Verify this is not the lender or contract
			if (borrowerAddress !== lenderAddress && borrowerAddress !== LENDING_CONTRACT) {
				console.log('✅ Found borrower from transaction analysis:', {
					borrowerAddress,
					lenderAddress,
					txId: boxData.spentTransactionId,
					outputIndex: 0
				});
				return borrowerAddress;
			}
		}

		// Fallback: analyze inputs to find who provided collateral
		if (spendingTx.inputs && spendingTx.inputs.length > 1) {
			// Skip input[0] (the contract box itself)
			// Look for inputs that are NOT from lender (those are collateral/fee inputs)
			console.log('🔍 Analyzing transaction inputs for borrower:');
			for (let i = 1; i < spendingTx.inputs.length; i++) {
				const input = spendingTx.inputs[i];
				console.log(
					`  Input ${i}: ${input.address} (lender: ${input.address === lenderAddress}, contract: ${
						input.address === LENDING_CONTRACT
					})`
				);
				if (input.address !== lenderAddress && input.address !== LENDING_CONTRACT) {
					console.log('✅ Found borrower from input analysis:', {
						borrowerAddress: input.address,
						lenderAddress,
						txId: boxData.spentTransactionId,
						inputIndex: i
					});
					return input.address;
				}
			}
		}

		console.warn('⚠️ Could not determine borrower from transaction history');
		return null;
	} catch (error) {
		console.error('❌ Error finding borrower from transaction history:', error);
		return null;
	}
}

// Parse lending data
export async function parseLending(box: any) {
	try {
		// Extract lender public key - handle both serializedValue and direct hex
		const lenderPK = box.additionalRegisters.R4;
		let lenderPKHex = '';
		if (typeof lenderPK === 'string') {
			lenderPKHex = lenderPK;
		} else if (lenderPK?.serializedValue) {
			lenderPKHex = lenderPK.serializedValue;
		} else if (lenderPK?.renderedValue) {
			lenderPKHex = lenderPK.renderedValue;
		}

		const lenderAddress = lenderPKHex
			? ErgoAddress.fromPublicKey(
					lenderPKHex.startsWith('07') ? lenderPKHex.substring(2) : lenderPKHex
			  ).toString()
			: 'Invalid Address';

		// Parse tuples using improved decodeTuple function for NEW contract layout
		console.log('📋 Parsing NEW contract registers R5, R6, R7...');

		// Extract register values properly (NEW layout)
		const r5Value = box.additionalRegisters.R5?.serializedValue || box.additionalRegisters.R5;
		const r6Value = box.additionalRegisters.R6?.serializedValue || box.additionalRegisters.R6;
		const r7Value = box.additionalRegisters.R7?.serializedValue || box.additionalRegisters.R7;
		const r8Value = box.additionalRegisters.R8?.serializedValue || box.additionalRegisters.R8;
		const r9Value = box.additionalRegisters.R9?.serializedValue || box.additionalRegisters.R9;

		// NEW SECURE CONTRACT: R9 is state (Int), not borrower PK
		// Find borrower from transaction history if loan is borrowed
		const state = parseInt(decodeFleetType(r9Value));
		let borrowerAddress = null;
		if (state === 2) {
			// Loan is borrowed, find borrower from transaction history
			try {
				borrowerAddress = await findBorrowerFromHistory(box.boxId);
				console.log(`🔍 Borrower detection result for box ${box.boxId}:`, {
					state,
					borrowerAddress,
					boxId: box.boxId
				});
			} catch (error) {
				console.warn('Could not determine borrower from transaction history:', error);
			}

			// Additional debug: Check if we have spending transaction info in the box data
			if (!borrowerAddress && box.spentTransactionId) {
				console.log('🔍 Box has spentTransactionId, analyzing transaction...');
				try {
					const spendingTxResponse = await fetch(
						`https://api.ergoplatform.com/api/v1/transactions/${box.spentTransactionId}`
					);
					if (spendingTxResponse.ok) {
						const spendingTx = await spendingTxResponse.json();
						// First output should be borrower receiving loan tokens
						if (spendingTx.outputs && spendingTx.outputs.length > 0) {
							const potentialBorrower = spendingTx.outputs[0].address;
							if (potentialBorrower !== lenderAddress && potentialBorrower !== LENDING_CONTRACT) {
								borrowerAddress = potentialBorrower;
								console.log('✅ Found borrower from direct transaction analysis:', borrowerAddress);
							}
						}
					}
				} catch (error) {
					console.warn('Failed to analyze spending transaction directly:', error);
				}
			}

			// Final fallback: log if borrower still not found
			if (!borrowerAddress) {
				console.warn('⚠️ Unable to determine borrower from any method for box:', box.boxId);
			}
		}

		console.log('🔍 NEW contract register values:', {
			r5Value,
			r6Value,
			r7Value,
			r8Value,
			r9Value
		});

		// Parse NEW contract registers
		const collateralInfo = decodeTuple(r5Value); // (Coll[Byte], Long)
		const loanTokenInfo = decodeTuple(r6Value); // (Coll[Byte], Long) - NEW!
		const setupInfo = decodeTuple(r7Value); // (Long, Int)

		console.log('🔍 Parsed NEW contract tuple data:', {
			collateralInfo,
			loanTokenInfo,
			setupInfo,
			collateralInfo_length: collateralInfo.length,
			loanTokenInfo_length: loanTokenInfo.length,
			setupInfo_length: setupInfo.length
		});

		// Handle collateral token ID - it should be Coll[Byte] (Uint8Array)
		let collateralTokenId = null;
		if (collateralInfo[0] && collateralInfo[0].length > 0) {
			// Convert Uint8Array or array of bytes to hex string
			if (collateralInfo[0] instanceof Uint8Array) {
				collateralTokenId = Array.from(collateralInfo[0])
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (Array.isArray(collateralInfo[0])) {
				collateralTokenId = collateralInfo[0].map((b) => b.toString(16).padStart(2, '0')).join('');
			} else {
				// Might already be a string
				collateralTokenId = collateralInfo[0].toString();
			}
		}

		console.log('🔍 Processed collateral token ID:', {
			raw: collateralInfo[0],
			processed: collateralTokenId,
			type: typeof collateralInfo[0],
			isUint8Array: collateralInfo[0] instanceof Uint8Array
		});

		// Handle loan token ID - NEW! (Coll[Byte])
		let loanTokenId = null;
		if (loanTokenInfo[0] && loanTokenInfo[0].length > 0) {
			// Convert Uint8Array or array of bytes to hex string
			if (loanTokenInfo[0] instanceof Uint8Array) {
				loanTokenId = Array.from(loanTokenInfo[0])
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			} else if (Array.isArray(loanTokenInfo[0])) {
				loanTokenId = loanTokenInfo[0].map((b) => b.toString(16).padStart(2, '0')).join('');
			} else {
				// Might already be a string
				loanTokenId = loanTokenInfo[0].toString();
			}
		}

		console.log('🔍 Processed loan token ID (NEW!):', {
			raw: loanTokenInfo[0],
			processed: loanTokenId,
			type: typeof loanTokenInfo[0],
			isUint8Array: loanTokenInfo[0] instanceof Uint8Array
		});

		// Debug register decoding for NEW layout
		console.log('🔍 Decoding individual registers (NEW layout):');
		const decodedR8 = r8Value ? decodeFleetType(r8Value) : 0; // Lending fee
		const decodedR9 = r9Value ? decodeFleetType(r9Value) : 1; // State
		console.log('🔍 Decoded register values (NEW):', {
			r8Raw: r8Value,
			r8Decoded: decodedR8,
			r9Raw: r9Value,
			r9Decoded: decodedR9
		});

		return {
			boxId: box.boxId,
			lenderAddress,
			borrowerAddress,

			// Collateral info from R5 tuple: (Coll[Byte], Long)
			collateralTokenId,
			collateralAmount: BigInt(collateralInfo[1]),

			// Loan token info from R6 tuple: (Coll[Byte], Long) - NEW!
			loanTokenId,
			loanAmount: BigInt(loanTokenInfo[1]),

			// Setup info from R7 tuple: (Long, Int)
			feePercent: Number(setupInfo[0]),
			duration: parseInt(setupInfo[1]),

			// Other data from individual registers (NEW layout)
			lendingFee: BigInt(decodedR8), // R8: Long
			state, // R9: Int (already decoded above)

			// NEW SECURE CONTRACT: Loan tokens ARE in box.assets (locked in contract)
			// They are ALSO stored in register R6 for reference
			loanTokens: loanTokenId
				? [
						{
							tokenId: loanTokenId,
							amount: BigInt(loanTokenInfo[1]),
							name: 'Loan Token'
						}
				  ]
				: [],

			creationHeight: box.creationHeight || box.settlementHeight || 0,
			transactionId: box.transactionId,
			value: BigInt(box.value)
		};
	} catch (error) {
		console.error('Error parsing lending box:', error);
		throw error;
	}
}

// Get available actions for a lending box (with original box data for role checking)
export async function getAvailableActionsWithBox(
	lending: any,
	originalBox: any,
	userAddress: string,
	currentHeight: number
) {
	const isLender = checkIsLender(originalBox, userAddress);
	const isBorrower = await checkIsBorrower(originalBox, userAddress);
	const isExpired = currentHeight > lending.creationHeight + lending.duration;

	console.log('🔍 Checking available actions with original box:', {
		boxId: lending.boxId,
		isLender,
		isBorrower,
		state: lending.state,
		isExpired,
		userAddress
	});

	// LENDER ACTIONS
	if (isLender) {
		if (lending.state === 1) {
			// Lender can cancel their unborrowed loan offer
			return [
				{
					action: 'cancel',
					label: 'Cancel Loan Offer',
					role: 'lender',
					description: 'Cancel your loan offer and get your tokens back'
				}
			];
		}
		if (lending.state === 2 && isExpired) {
			// Lender can liquidate expired borrowed loans
			return [
				{
					action: 'liquidate',
					label: 'Liquidate (Expired)',
					role: 'lender',
					description: 'Seize collateral from expired loan'
				}
			];
		}
		if (lending.state === 2 && !isExpired) {
			// Active loan - show status
			const remainingBlocks = lending.creationHeight + lending.duration - currentHeight;
			return [
				{
					action: 'none',
					label: `Loan Active (${remainingBlocks} blocks left)`,
					role: 'lender',
					description: 'Your loan is currently borrowed'
				}
			];
		}
	}

	// BORROWER ACTIONS
	if (isBorrower) {
		if (lending.state === 2 && !isExpired) {
			// Borrower can repay active loan
			return [
				{
					action: 'repay',
					label: 'Repay Loan',
					role: 'borrower',
					description: 'Repay loan tokens and get your collateral back'
				}
			];
		}
		if (lending.state === 2 && isExpired) {
			// Loan expired - borrower lost collateral
			return [
				{
					action: 'none',
					label: 'Loan Expired (Collateral Lost)',
					role: 'borrower',
					description: 'This loan has expired and collateral was liquidated'
				}
			];
		}
	}

	// GENERAL PUBLIC ACTIONS
	if (lending.state === 1 && !isExpired) {
		// Anyone can borrow available loans
		return [
			{
				action: 'borrow',
				label: `Borrow (${Number(lending.lendingFee) / 1e9} ERG fee)`,
				role: 'public',
				description: 'Borrow these tokens by providing required collateral'
			}
		];
	}

	if (lending.state === 1 && isExpired) {
		// Expired unborrowed loan
		return [
			{
				action: 'none',
				label: 'Loan Offer Expired',
				role: 'public',
				description: 'This loan offer has expired'
			}
		];
	}

	// DEFAULT - no actions available
	const roleText = isLender ? 'lender' : isBorrower ? 'borrower' : 'public';
	return [
		{
			action: 'none',
			label: 'No actions available',
			role: roleText,
			description: 'No valid actions for current state'
		}
	];
}

// Get available actions for a lending box (legacy function - uses parsed data only)
export async function getAvailableActions(
	lending: any,
	userAddress: string,
	currentHeight: number
) {
	const isLender = checkIsLender(lending, userAddress);
	const isBorrower = await checkIsBorrower(lending, userAddress);
	const isExpired = currentHeight > lending.creationHeight + lending.duration;

	console.log('🔍 Checking available actions:', {
		boxId: lending.boxId,
		isLender,
		isBorrower,
		state: lending.state,
		isExpired,
		userAddress
	});

	// LENDER ACTIONS
	if (isLender) {
		if (lending.state === 1) {
			// Lender can cancel their unborrowed loan offer
			return [
				{
					action: 'cancel',
					label: 'Cancel Loan Offer',
					role: 'lender',
					description: 'Cancel your loan offer and get your tokens back'
				}
			];
		}
		if (lending.state === 2 && isExpired) {
			// Lender can liquidate expired borrowed loans
			return [
				{
					action: 'liquidate',
					label: 'Liquidate (Expired)',
					role: 'lender',
					description: 'Seize collateral from expired loan'
				}
			];
		}
		if (lending.state === 2 && !isExpired) {
			// Active loan - show status
			const remainingBlocks = lending.creationHeight + lending.duration - currentHeight;
			return [
				{
					action: 'none',
					label: `Loan Active (${remainingBlocks} blocks left)`,
					role: 'lender',
					description: 'Your loan is currently borrowed'
				}
			];
		}
	}

	// BORROWER ACTIONS
	if (isBorrower) {
		if (lending.state === 2 && !isExpired) {
			// Borrower can repay active loan
			return [
				{
					action: 'repay',
					label: 'Repay Loan',
					role: 'borrower',
					description: 'Repay loan tokens and get your collateral back'
				}
			];
		}
		if (lending.state === 2 && isExpired) {
			// Loan expired - borrower lost collateral
			return [
				{
					action: 'none',
					label: 'Loan Expired (Collateral Lost)',
					role: 'borrower',
					description: 'This loan has expired and collateral was liquidated'
				}
			];
		}
	}

	// GENERAL PUBLIC ACTIONS
	if (lending.state === 1 && !isExpired) {
		// Anyone can borrow available loans
		return [
			{
				action: 'borrow',
				label: `Borrow (${Number(lending.lendingFee) / 1e9} ERG fee)`,
				role: 'public',
				description: 'Borrow these tokens by providing required collateral'
			}
		];
	}

	if (lending.state === 1 && isExpired) {
		// Expired unborrowed loan
		return [
			{
				action: 'none',
				label: 'Loan Offer Expired',
				role: 'public',
				description: 'This loan offer has expired'
			}
		];
	}

	// DEFAULT - no actions available
	const roleText = isLender ? 'lender' : isBorrower ? 'borrower' : 'public';
	return [
		{
			action: 'none',
			label: 'No actions available',
			role: roleText,
			description: 'No valid actions for current state'
		}
	];
}
