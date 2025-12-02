import axios from 'axios';
import JSONbig from 'json-bigint-native';

/**
 * Burn address where tokens are sent to be burned
 */
export const BURN_ADDRESS = '9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY';

/**
 * Hex value for "burn" in R4 register
 */
const BURN_R4_HEX = '6275726e';

export interface BurnTransaction {
	txId: string;
	timestamp: number;
	height: number;
	burnerAddress: string;
	burnedTokens: Array<{
		tokenId: string;
		amount: number;
		name?: string;
		decimals?: number;
	}>;
}

export interface BurnStats {
	totalBurns: number;
	uniqueBurners: number;
	topBurners: Array<{
		address: string;
		burnCount: number;
		totalValueBurned: number;
	}>;
	topBurnedTokens: Array<{
		tokenId: string;
		name: string;
		totalBurned: number;
		burnCount: number;
		decimals?: number;
	}>;
}

/**
 * Check if a transaction output is a burn (has R4 = "burn")
 */
function isBurnOutput(output: any): boolean {
	const r4 = output.additionalRegisters?.R4;
	if (!r4) return false;

	const r4Value = r4.renderedValue || r4.serializedValue || r4;
	// Check if R4 contains "burn" in hex
	return r4Value.toLowerCase().includes(BURN_R4_HEX);
}

/**
 * Fetch ALL burn transactions from the burn address (with pagination)
 */
export async function fetchAllBurnTransactions(): Promise<{ items: BurnTransaction[]; total: number }> {
	const allBurns: BurnTransaction[] = [];
	let offset = 0;
	const limit = 100; // Fetch in batches of 100
	let totalCount = 0;

	try {
		while (true) {
			console.log(`Fetching burn transactions: offset=${offset}, limit=${limit}`);
			const response = await fetchBurnTransactions(offset, limit);

			allBurns.push(...response.items);
			totalCount = response.total;

			console.log(`Fetched ${response.items.length} burns, total so far: ${allBurns.length}/${totalCount}`);

			// Stop if we've fetched all transactions or got no results
			if (allBurns.length >= totalCount || response.items.length === 0) {
				break;
			}

			offset += limit;
		}

		console.log(`Finished fetching all burns: ${allBurns.length} total`);
		return { items: allBurns, total: totalCount };
	} catch (error) {
		console.error('Error fetching all burn transactions:', error);
		throw error;
	}
}

/**
 * Fetch transactions for the burn address (single page)
 */
export async function fetchBurnTransactions(
	offset: number = 0,
	limit: number = 100
): Promise<{ items: BurnTransaction[]; total: number }> {
	try {
		const response = await axios.get(
			`https://api.ergoplatform.com/api/v1/addresses/${BURN_ADDRESS}/transactions`,
			{
				params: {
					offset,
					limit
				},
				responseType: 'arraybuffer'
			}
		);

		const buffer = new TextDecoder('utf-8').decode(response.data);
		const parsed = JSONbig.parse(buffer);

		const burnTransactions: BurnTransaction[] = [];

		for (const tx of parsed.items) {
			// Check if any output has R4 = "burn"
			const hasBurnOutput = tx.outputs.some((output: any) => isBurnOutput(output));

			if (!hasBurnOutput) continue;

			// Calculate burned tokens (input - output)
			const inputTokens = new Map<string, { amount: number; name?: string; decimals?: number }>();
			const outputTokens = new Map<string, number>();

			// Collect input tokens (skip if from burn address itself)
			for (const input of tx.inputs) {
				if (input.address === BURN_ADDRESS) continue;

				for (const asset of input.assets || []) {
					const existing = inputTokens.get(asset.tokenId) || { amount: 0 };
					const assetAmount = typeof asset.amount === 'bigint' ? Number(asset.amount) : asset.amount;
					inputTokens.set(asset.tokenId, {
						amount: existing.amount + assetAmount,
						name: asset.name,
						decimals: asset.decimals
					});
				}
			}

			// Collect output tokens
			for (const output of tx.outputs) {
				for (const asset of output.assets || []) {
					const existing = outputTokens.get(asset.tokenId) || 0;
					const assetAmount = typeof asset.amount === 'bigint' ? Number(asset.amount) : asset.amount;
					outputTokens.set(asset.tokenId, existing + assetAmount);
				}
			}

			// Calculate burned amounts
			const burnedTokens: BurnTransaction['burnedTokens'] = [];
			for (const [tokenId, inputData] of inputTokens.entries()) {
				const outputAmount = outputTokens.get(tokenId) || 0;
				const burnedAmount = inputData.amount - outputAmount;

				if (burnedAmount > 0) {
					burnedTokens.push({
						tokenId,
						amount: burnedAmount,
						name: inputData.name,
						decimals: inputData.decimals
					});
				}
			}

			// Find burner address (first non-burn input address)
			const burnerAddress =
				tx.inputs.find((inp: any) => inp.address !== BURN_ADDRESS)?.address || 'Unknown';

			if (burnedTokens.length > 0) {
				burnTransactions.push({
					txId: tx.id,
					timestamp: tx.timestamp,
					height: tx.inclusionHeight,
					burnerAddress,
					burnedTokens
				});
			}
		}

		return {
			items: burnTransactions,
			total: parsed.total
		};
	} catch (error) {
		console.error('Error fetching burn transactions:', error);
		throw error;
	}
}

/**
 * Fetch all burn transactions for a specific user address
 */
export async function fetchUserBurnTransactions(
	userAddress: string,
	limit: number = 100
): Promise<BurnTransaction[]> {
	try {
		const response = await axios.get(
			`https://api.ergoplatform.com/api/v1/addresses/${userAddress}/transactions`,
			{
				params: {
					offset: 0,
					limit
				},
				responseType: 'arraybuffer'
			}
		);

		const buffer = new TextDecoder('utf-8').decode(response.data);
		const parsed = JSONbig.parse(buffer);

		const burnTransactions: BurnTransaction[] = [];

		for (const tx of parsed.items) {
			// Check if this tx has a burn output
			const hasBurnOutput = tx.outputs.some((output: any) => isBurnOutput(output));
			if (!hasBurnOutput) continue;

			// Check if this user was the burner
			const isUserInput = tx.inputs.some(
				(input: any) => input.address === userAddress && input.address !== BURN_ADDRESS
			);
			if (!isUserInput) continue;

			// Calculate burned tokens
			const inputTokens = new Map<string, { amount: number; name?: string; decimals?: number }>();
			const outputTokens = new Map<string, number>();

			for (const input of tx.inputs) {
				if (input.address !== userAddress) continue;

				for (const asset of input.assets || []) {
					const existing = inputTokens.get(asset.tokenId) || { amount: 0 };
					const assetAmount = typeof asset.amount === 'bigint' ? Number(asset.amount) : asset.amount;
					inputTokens.set(asset.tokenId, {
						amount: existing.amount + assetAmount,
						name: asset.name,
						decimals: asset.decimals
					});
				}
			}

			for (const output of tx.outputs) {
				for (const asset of output.assets || []) {
					const existing = outputTokens.get(asset.tokenId) || 0;
					const assetAmount = typeof asset.amount === 'bigint' ? Number(asset.amount) : asset.amount;
					outputTokens.set(asset.tokenId, existing + assetAmount);
				}
			}

			const burnedTokens: BurnTransaction['burnedTokens'] = [];
			for (const [tokenId, inputData] of inputTokens.entries()) {
				const outputAmount = outputTokens.get(tokenId) || 0;
				const burnedAmount = inputData.amount - outputAmount;

				if (burnedAmount > 0) {
					burnedTokens.push({
						tokenId,
						amount: burnedAmount,
						name: inputData.name,
						decimals: inputData.decimals
					});
				}
			}

			if (burnedTokens.length > 0) {
				burnTransactions.push({
					txId: tx.id,
					timestamp: tx.timestamp,
					height: tx.inclusionHeight,
					burnerAddress: userAddress,
					burnedTokens
				});
			}
		}

		return burnTransactions;
	} catch (error) {
		console.error('Error fetching user burn transactions:', error);
		throw error;
	}
}

/**
 * Calculate burn statistics and leaderboards
 */
export async function calculateBurnStats(): Promise<BurnStats> {
	const { items: burns } = await fetchAllBurnTransactions();

	const burnerStats = new Map<
		string,
		{
			burnCount: number;
			totalValueBurned: number;
		}
	>();

	const tokenStats = new Map<
		string,
		{
			name: string;
			totalBurned: number;
			burnCount: number;
			decimals?: number;
		}
	>();

	// Aggregate stats
	for (const burn of burns) {
		// Burner stats
		const burnerStat = burnerStats.get(burn.burnerAddress) || {
			burnCount: 0,
			totalValueBurned: 0
		};
		burnerStat.burnCount++;
		burnerStats.set(burn.burnerAddress, burnerStat);

		// Token stats
		for (const token of burn.burnedTokens) {
			const tokenStat = tokenStats.get(token.tokenId) || {
				name: token.name || 'Unknown Token',
				totalBurned: 0,
				burnCount: 0,
				decimals: token.decimals
			};

			const tokenAmount = typeof token.amount === 'bigint' ? Number(token.amount) : token.amount;
			tokenStat.totalBurned += tokenAmount;
			tokenStat.burnCount++;
			tokenStats.set(token.tokenId, tokenStat);
		}
	}

	// Convert to arrays and sort
	const topBurners = Array.from(burnerStats.entries())
		.map(([address, stats]) => ({
			address,
			...stats
		}))
		.sort((a, b) => b.burnCount - a.burnCount)
		.slice(0, 10);

	const topBurnedTokens = Array.from(tokenStats.entries())
		.map(([tokenId, stats]) => ({
			tokenId,
			...stats
		}))
		.sort((a, b) => b.totalBurned - a.totalBurned)
		.slice(0, 10);

	return {
		totalBurns: burns.length,
		uniqueBurners: burnerStats.size,
		topBurners,
		topBurnedTokens
	};
}
