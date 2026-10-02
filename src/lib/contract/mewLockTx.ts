import { first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	SAFE_MIN_BOX_VALUE,
	TransactionBuilder,
	ErgoUnsignedInput
} from '@fleet-sdk/core';
import {
	SGroupElement,
	SInt,
	SSigmaProp,
	SByte,
	SColl,
	SByte as SByteType,
	estimateBoxSize
} from '@fleet-sdk/serializer';
import { chainFetch, EXPLORER_URL } from '$lib/api-explorer/chain';

// MewLockV2 smart contract address
// Mew Lock v2 (2026-10): BigInt fees (v1 could never release a token amount above
// ~3.07e15 raw units) and wallet-only inputs. Source:
// github.com/AcoSmrkas/mew-smart-contracts contracts/mew-lock/lock.es
export const MEWLOCK_CONTRACT_ADDRESS =
	'kcxXdmrwpV4HeLVbwiuVvmCtVuVQP19F6xE3NBze2ttRzanUcTyi43YCSPke48DZEescWk1r3PNn6PYMQnWuRgMmBcrVYzPqoAgmymQnhmv9WANAgH6keuGS6Vgg9hjzk2ZeGnrymq4AYoxDAcFo5kDgRC9BWYK5hQ1WreCDWQ5xHR16BYAC896Q2Xu3FkdTU7oKiBViPUgCGWCXr9NMuFeVQN5xoeZpA8NX5mmk7DCq4w5L3kRVTTwTX2Phma9ZZv8unkYchHC24vw1YB4iajNmzLNfZgQzbp6mC9EgZFq4cKK1Pbvjpm7fMU5TZSbEbWW35oufsAKmn7HZgpi9o9qvUT9TD1hc5GDBTuXBSTrRdRVFvqGGKm4Pm2ZqQjYU5WEK37k5MhtdoB9puQW7nWSdyHJZZTscE2sSrgpyXfBQsTUFoTJSbsvCA9xp5Fvxm2Rs694Vq4jevheykPhwvWpvHTdjFa6GaSBCKNHDn57JcUpPVUA9zNCu8Gr7gpiBCwVjbf42AeNijTDmEZPcYXAMXaCorKfgzpPuojTsUEf9t9sUAj4';

// Pre-rotation MewLock contract address (retired 2026-06-24 in the post-breach
// contract rotation). Existing depositors' locks are still sitting here since
// there was no migration path off it — kept read-only so the UI can still find
// and withdraw them. Ownership is enforced by each box's own R4 pubkey, not by
// the dev fee key that rotated, so withdrawals from this address still work.
// Older contracts that still hold locks, newest last. The first (pre-June 2026)
// pays the old dev fee key; see devKeyFor.
export const MEWLOCK_LEGACY_CONTRACT_ADDRESSES = [
	'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU',
	'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgTHyYBiqpnziCu8e2Fy9r9PCavASWuiFsfooJJbGSZFDdSLPLEgFWLKrFq1kksUhkKXWuhciQMP5W5akMYAWs4r5dPcaT8JhaaubtHtdKMgy6tZ3x9JRYdDbt9hSYq5Bg7vaBYqQTDcyTHJ6aXudhbnfbxJAbXzqjqqBkHhTt2wBBXXJzZKk7WN321fiL3kJQBrxPjk53u4aujWSAxJshKpHsNZdqqtif6AoLo81zWrQfPP6aBLu889zEbeMfL7RwbnMDE4K7mqX1wcv2N3Tw76tTm7MeXLVPs8Y9rATNVT5e2Em11L5JuPeJBZG6MNXJnWbtEWyc6PYji1C5JdYQjgzme6gZFpckU1NkiwtCUb8iMJXfx6NcMQnLNqLm8qcfR3uamQBmwEF3DXaTTvQD7opvtKxQJmdpDHKY6rZizwWk7uEWXWf946aSxPk7uv4jTnHod1rio5vuYACToJzmQLGYFA8SkjTtqED8wqyBfvFr63iu1CGtvMCi5E3SfMzjMYx7CstFgUeFMFKPAMLn3X8DGtc5H23JCVnAkwFrwzwXxC2NWzdsBbB4JVkBD783U6WNLPzhCykoP1QZBnc8nHiJpLzDpJuhwZp8DStumjMKRfEtNHp3QiUGW9tc94P49cLLu8VddmmMMwaZ769XSUTpcNi75sJRFUtHwKvyN4af7wjfmhCSkkReiUmb2ZmpJvw4FNs8An3xJSgEM5NX3zfz7Mr8PbtVfYjj35MiNSeEzRUKQH4qDpJX2R'
];

export const ALL_MEWLOCK_CONTRACT_ADDRESSES = [
	MEWLOCK_CONTRACT_ADDRESS,
	...MEWLOCK_LEGACY_CONTRACT_ADDRESSES
];

// Fetches unspent MewLock boxes across the current contract and all retired
// ones, so pre-rotation locks stay visible/withdrawable after a rotation.
export async function fetchMewLockBoxes(limit = 500): Promise<Array<any>> {
	const results = await Promise.all(
		ALL_MEWLOCK_CONTRACT_ADDRESSES.map(async (address) => {
			try {
				const response = await chainFetch(
					`${EXPLORER_URL}/api/v1/boxes/unspent/byAddress/${address}?limit=${limit}`
				);
				const data = await response.json();
				return data.items || [];
			} catch (error) {
				console.error('Error fetching MewLock boxes for', address, error);
				return [];
			}
		})
	);
	return results.flat();
}

// Dev fee configuration (matching smart contract)
const FEE_NUM = 3000; // feeNum from smart contract
const FEE_DENOM = 100000; // feeDenom from smart contract
const DEV_PUBLIC_KEY = '9hMRoSfXZJs83S2hLqxZZ8ivw1L8FFgSk7RJB7eq2qXyxU2paED'; // Dev address from smart contract
// The pre-June 2026 contract has the pre-rotation dev key compiled in; a withdrawal
// that pays DEV_PUBLIC_KEY instead is rejected on chain.
const OLD_DEV_PUBLIC_KEY = '9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY';
const devKeyFor = (lockErgoTree: string) =>
	ErgoAddress.fromErgoTree(lockErgoTree).encode() === MEWLOCK_LEGACY_CONTRACT_ADDRESSES[0]
		? OLD_DEV_PUBLIC_KEY
		: DEV_PUBLIC_KEY;
const MIN_ERG_FEE_THRESHOLD = 100000; // 0.1 ERG minimum for fee calculation
const MIN_TOKEN_FEE_THRESHOLD = 34; // 34 tokens minimum for fee calculation

// Ergo charges storage rent once a box is 1,051,200 blocks (~4 years) old: a miner may take
// 1,250,000 nanoERG per byte of the box (the current storageFeeFactor) and recreate it, or
// take a box worth less than that whole, tokens included. A lock that opens later keeps
// enough ERG to pay every rent period before it opens.
export const STORAGE_RENT_PERIOD = 1_051_200;
const STORAGE_FEE_PER_BYTE = 1_250_000n;

/** The least nanoERG a lock box must hold so storage rent can't empty it before it opens. */
export function lockRentReserve(lockBox: OutputBuilder, height: number, unlockHeight: number): bigint {
	const periods = Math.floor((unlockHeight - height) / STORAGE_RENT_PERIOD);
	if (periods <= 0) return 0n;
	// A few bytes of slack: each recreated box carries a larger creation height.
	const bytes = BigInt(estimateBoxSize(lockBox.setCreationHeight(height).build()) + 8);
	return BigInt(periods) * STORAGE_FEE_PER_BYTE * bytes + BigInt(SAFE_MIN_BOX_VALUE);
}

function lockBoxFor(
	value: bigint,
	owner: ErgoAddress,
	tokens: Array<{ tokenId: string; amount: bigint }>,
	unlockHeight: number,
	lockName?: string | null,
	lockDescription?: string | null
): OutputBuilder {
	const registers: { [key: string]: string } = {
		R4: SGroupElement(first(owner.getPublicKeys())).toHex(), // owner (recipient for lock-for)
		R5: SInt(unlockHeight).toHex(), // unlock height
		R6: SInt(Math.floor(Date.now() / 1000)).toHex() // timestamp
	};
	if (lockName) registers.R7 = SColl(SByte, Array.from(new TextEncoder().encode(lockName))).toHex();
	if (lockDescription) registers.R8 = SColl(SByte, Array.from(new TextEncoder().encode(lockDescription))).toHex();
	const box = new OutputBuilder(value, MEWLOCK_CONTRACT_ADDRESS).setAdditionalRegisters(registers);
	const held = tokens.filter((t) => t.amount > 0n);
	if (held.length > 0) box.addTokens(held);
	return box;
}

/** The storage-rent reserve a lock with these contents and unlock height will keep (0 under 4 years). */
export function estimateLockRentReserve(
	height: number,
	unlockHeight: number,
	ownerBase58PK: string,
	tokens: Array<{ tokenId: string; amount: bigint | number }>,
	lockName?: string | null,
	lockDescription?: string | null
): bigint {
	const box = lockBoxFor(
		BigInt(SAFE_MIN_BOX_VALUE),
		ErgoAddress.fromBase58(ownerBase58PK),
		tokens.map((t) => ({ tokenId: t.tokenId, amount: BigInt(t.amount) })),
		unlockHeight,
		lockName,
		lockDescription
	);
	return lockRentReserve(box, height, unlockHeight);
}

export function createMewLockDepositTx(
	depositorBase58PK: string,
	depositorUtxos: Array<any>,
	height: number,
	amountToLock: bigint,
	tokensToLock: Array<any>,
	unlockHeight: number,
	lockName?: string | null,
	lockDescription?: string | null,
	recipientBase58PK?: string | null
): any {
	const depositorAddress = ErgoAddress.fromBase58(depositorBase58PK);

	// If recipientBase58PK is provided, use recipient's key in R4 for lock-for functionality
	// Otherwise use depositor's key (normal lock)
	const r4Address = recipientBase58PK
		? ErgoAddress.fromBase58(recipientBase58PK)
		: depositorAddress;

	// Calculate token fees (3% if >= 34 tokens each) - matching smart contract logic
	const tokenFees = tokensToLock.map((token) => {
		const tokenAmount = BigInt(token.amount);
		return {
			tokenId: token.tokenId,
			remainingAmount: tokenAmount
		};
	});

	// Create the MewLock contract box with remaining amounts after fees
	const mewLockBox = lockBoxFor(
		amountToLock,
		r4Address,
		tokenFees.map((token) => ({ tokenId: token.tokenId, amount: token.remainingAmount })),
		unlockHeight,
		lockName,
		lockDescription
	);
	const rentReserve = lockRentReserve(mewLockBox, height, unlockHeight);
	if (rentReserve > amountToLock) mewLockBox.setValue(rentReserve);

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
	console.log('depositorAddress:', depositorAddress);

	// Fetch the complete box data from the API
	try {
		const response = await chainFetch(`${EXPLORER_URL}/api/v1/boxes/${mewLockBox.boxId}`);
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
		const devAddress = ErgoAddress.fromBase58(devKeyFor(normalizedLockBox.ergoTree));

		console.log('normalizedLockBox:', normalizedLockBox);

		// Calculate ERG fee (3% if >= 0.1 ERG) - matching smart contract logic
		const ergFee =
			normalizedLockBox.value > BigInt(MIN_ERG_FEE_THRESHOLD)
				? (normalizedLockBox.value * BigInt(FEE_NUM)) / BigInt(FEE_DENOM)
				: BigInt(0);

		// Calculate token fees (3% if >= 34 tokens each) - matching smart contract logic
		const tokenFees = normalizedLockBox.assets.map((token) => {
			const tokenAmount = BigInt(token.amount);
			const feeAmount =
				tokenAmount > BigInt(MIN_TOKEN_FEE_THRESHOLD)
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
