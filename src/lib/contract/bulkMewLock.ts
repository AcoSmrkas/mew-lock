import { first } from '@fleet-sdk/common';
import {
	ErgoAddress,
	OutputBuilder,
	RECOMMENDED_MIN_FEE_VALUE,
	TransactionBuilder
} from '@fleet-sdk/core';
import { SGroupElement, SInt, SColl, SByte } from '@fleet-sdk/serializer';

// MewLockV2 smart contract address
export const MEWLOCK_CONTRACT_ADDRESS =
	'5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU';

export interface BulkLockRecipient {
	address: string; // Recipient address
	ergAmount: number; // ERG amount in ERG (not nanoERG)
	tokens?: Array<{ tokenId: string; amount: number; name?: string; decimals?: number }>; // Optional tokens with enriched info
	unlockHeight: number; // When they can unlock
	lockName?: string; // Optional name for this lock
	lockDescription?: string; // Optional description
}

/**
 * Creates a bulk lock transaction - locks assets for multiple recipients in a single transaction
 * This is perfect for vesting/airdrops where you want to lock assets for many people at once
 *
 * @param senderBase58PK - Your wallet address (who is funding the locks)
 * @param senderUtxos - Your UTXOs
 * @param height - Current blockchain height
 * @param recipients - Array of recipients with their lock details
 * @returns Unsigned transaction ready to be signed
 */
export function createBulkMewLockTx(
	senderBase58PK: string,
	senderUtxos: Array<any>,
	height: number,
	recipients: BulkLockRecipient[]
): any {
	const senderAddress = ErgoAddress.fromBase58(senderBase58PK);

	// Create outputs array
	const outputs: OutputBuilder[] = [];

	// Create a lock box for each recipient
	for (const recipient of recipients) {
		const recipientAddress = ErgoAddress.fromBase58(recipient.address);
		const lockBoxValue = BigInt(Math.round(recipient.ergAmount * 1e9)); // Convert ERG to nanoERG

		// Build registers - R4 has recipient's PK (lock-for)
		const registers: { [key: string]: string } = {
			R4: SGroupElement(first(recipientAddress.getPublicKeys())).toHex(), // Recipient's public key
			R5: SInt(recipient.unlockHeight).toHex(), // Unlock height
			R6: SInt(Math.floor(Date.now() / 1000)).toHex() // Timestamp
		};

		// Add optional lock name to R7
		if (recipient.lockName) {
			const nameBytes = new TextEncoder().encode(recipient.lockName);
			registers.R7 = SColl(SByte, Array.from(nameBytes)).toHex();
		}

		// Add optional lock description to R8
		if (recipient.lockDescription) {
			const descBytes = new TextEncoder().encode(recipient.lockDescription);
			registers.R8 = SColl(SByte, Array.from(descBytes)).toHex();
		}

		// Create the lock box
		const lockBox = new OutputBuilder(lockBoxValue, MEWLOCK_CONTRACT_ADDRESS).setAdditionalRegisters(
			registers
		);

		// Add tokens if specified
		if (recipient.tokens && recipient.tokens.length > 0) {
			lockBox.addTokens(recipient.tokens);
		}

		outputs.push(lockBox);
	}

	// Build and return the transaction
	const unsignedTransaction = new TransactionBuilder(height)
		.from(senderUtxos)
		.to(outputs)
		.sendChangeTo(senderAddress)
		.payFee(RECOMMENDED_MIN_FEE_VALUE)
		.build()
		.toEIP12Object();

	return unsignedTransaction;
}

/**
 * Parse CSV data into BulkLockRecipient array
 * CSV format: address,ergAmount,unlockHeight,lockName,lockDescription,tokens
 * Tokens format (optional): tokenId1:amount1;tokenId2:amount2
 * Example: 9eiDeT...,1.5,1668204,Vesting Round 1,Q1 2025 vesting,abc123:100;def456:50
 *
 * @param csvText - CSV content as string
 * @param currentHeight - Current blockchain height (for relative unlock times)
 * @returns Array of recipients ready for bulk lock
 */
export function parseBulkLockCSV(csvText: string, currentHeight: number): BulkLockRecipient[] {
	const lines = csvText.trim().split('\n');
	const recipients: BulkLockRecipient[] = [];

	// Skip header if it exists
	const startIndex = lines[0].toLowerCase().includes('address') ? 1 : 0;

	for (let i = startIndex; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue; // Skip empty lines

		const parts = line.split(',').map((p) => p.trim());

		if (parts.length < 3) {
			console.warn(`Skipping invalid line ${i + 1}: ${line}`);
			continue;
		}

		const address = parts[0];
		const ergAmount = parseFloat(parts[1]);
		const unlockHeightOrDuration = parseInt(parts[2]);
		const lockName = parts[3] || undefined;
		const lockDescription = parts[4] || undefined;
		const tokensStr = parts[5] || undefined;

		// If unlockHeight is small (< 100000), treat it as blocks from now
		const unlockHeight =
			unlockHeightOrDuration < 100000
				? currentHeight + unlockHeightOrDuration
				: unlockHeightOrDuration;

		// Validate address
		try {
			ErgoAddress.fromBase58(address);
		} catch (e) {
			console.error(`Invalid address on line ${i + 1}: ${address}`);
			continue;
		}

		// Parse tokens if provided
		let tokens: Array<{ tokenId: string; amount: number }> | undefined = undefined;
		if (tokensStr) {
			try {
				tokens = tokensStr.split(';').map((tokenPair) => {
					const [tokenId, amountStr] = tokenPair.split(':');
					return {
						tokenId: tokenId.trim(),
						amount: parseInt(amountStr.trim())
					};
				});
			} catch (e) {
				console.warn(`Invalid tokens format on line ${i + 1}: ${tokensStr}`);
			}
		}

		recipients.push({
			address,
			ergAmount,
			unlockHeight,
			lockName,
			lockDescription,
			tokens
		});
	}

	return recipients;
}

/**
 * Generate a sample CSV template
 */
export function generateCSVTemplate(): string {
	return `address,ergAmount,unlockDuration,lockName,lockDescription,tokens
9eiDeTFbz9N96eUhXDeww4A5DtmKDuHAVFXL31GANsK4TPcfLds,1.5,720,Team Vesting Round 1,Unlocks in 1 day,
9gvDVNy1XvDeFoi4ZHn5v6u3tFRECMXGKbwuHbijJu6Z2hLQTQz,2.0,5040,Team Vesting Round 2,Unlocks in 1 week,
9eiDeTFbz9N96eUhXDeww4A5DtmKDuHAVFXL31GANsK4TPcfLds,0.5,21600,Token Airdrop,Tokens + ERG,abe0a3c2f646dcd430aac9c29d80feee865bd8b5231edb545a41105d4c8e4985:1000000000`;
}
