import axios from 'axios';
import JSONbig from 'json-bigint-native';

/**
 * Burn address where tokens are sent to be burned
 */
export const BURN_ADDRESS = '9gvdJkzLGmzWUzTNWkBcV4nMGvnXAivWbXdXuRp5Y42D4CRDNBU';

/**
 * Hex value for "burn" in R4 register
 */
const BURN_R4_HEX = '6275726e';

/**
 * Cache configuration
 */
const CACHE_KEY = 'burn_transactions_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

interface CachedBurnData {
	items: BurnTransaction[];
	total: number;
	timestamp: number;
}

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
 * Get cached burn data if valid
 */
function getCachedBurnData(): CachedBurnData | null {
	if (typeof window === 'undefined') return null;

	try {
		const cached = localStorage.getItem(CACHE_KEY);
		if (!cached) return null;

		const data: CachedBurnData = JSON.parse(cached);
		const now = Date.now();

		// Check if cache is still valid
		if (now - data.timestamp < CACHE_DURATION) {
			console.log(`Using cached burn data (${data.items.length} burns, cached ${Math.round((now - data.timestamp) / 1000)}s ago)`);
			return data;
		} else {
			console.log('Cache expired, will fetch fresh data');
			return null;
		}
	} catch (error) {
		console.error('Error reading cache:', error);
		return null;
	}
}

/**
 * Save burn data to cache
 */
function saveBurnDataToCache(data: { items: BurnTransaction[]; total: number }): void {
	if (typeof window === 'undefined') return;

	try {
		const cacheData: CachedBurnData = {
			...data,
			timestamp: Date.now()
		};
		localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
		console.log(`Cached ${data.items.length} burn transactions`);
	} catch (error) {
		console.error('Error saving to cache:', error);
	}
}

/**
 * Clear burn data cache (useful for manual refresh)
 */
export function clearBurnCache(): void {
	if (typeof window === 'undefined') return;
	localStorage.removeItem(CACHE_KEY);
	console.log('Burn cache cleared');
}

/**
 * Enrich burn transactions with token metadata
 */
async function enrichBurnTransactionsWithTokenData(burns: BurnTransaction[]): Promise<BurnTransaction[]> {
	// Collect all unique token IDs that need enrichment
	const tokenIds = new Set<string>();
	for (const burn of burns) {
		for (const token of burn.burnedTokens) {
			if (!token.name || token.name === 'Unknown Token') {
				tokenIds.add(token.tokenId);
			}
		}
	}

	if (tokenIds.size === 0) {
		return burns; // All tokens already have names
	}

	console.log(`Enriching ${tokenIds.size} tokens with metadata...`);

	try {
		// Fetch token metadata from Ergo Explorer
		const response = await axios.post(
			'https://api.ergexplorer.com/tokens/byId',
			Array.from(tokenIds),
			{
				headers: { 'Content-Type': 'application/json' }
			}
		);

		const tokenDataMap = new Map();
		for (const tokenData of response.data) {
			tokenDataMap.set(tokenData.id, {
				name: tokenData.name,
				decimals: tokenData.decimals
			});
		}

		// Enrich the burn transactions
		for (const burn of burns) {
			for (const token of burn.burnedTokens) {
				const metadata = tokenDataMap.get(token.tokenId);
				if (metadata) {
					token.name = metadata.name || token.name;
					token.decimals = metadata.decimals !== undefined ? metadata.decimals : token.decimals;
				}
			}
		}

		console.log(`Enriched ${tokenIds.size} tokens with metadata`);
	} catch (error) {
		console.error('Error enriching token metadata:', error);
		// Continue without metadata - don't fail the whole operation
	}

	return burns;
}

/**
 * Fetch ALL burn transactions from the burn address (with pagination and caching)
 * Set maxTransactions to limit how many transactions to process (for faster initial load)
 */
export async function fetchAllBurnTransactions(
	forceRefresh: boolean = false,
	maxTransactions: number = 1000
): Promise<{ items: BurnTransaction[]; total: number }> {
	// Check cache first unless force refresh
	if (!forceRefresh) {
		const cached = getCachedBurnData();
		if (cached) {
			return { items: cached.items, total: cached.total };
		}
	}

	console.log(`Fetching burn data from API (max ${maxTransactions} transactions)...`);
	const allBurns: BurnTransaction[] = [];
	let offset = 0;
	const limit = 100; // Fetch in batches of 100
	let totalTxCount = 0;
	let fetchedTxCount = 0;

	try {
		while (true) {
			console.log(`Fetching transactions from burn address: offset=${offset}, limit=${limit}`);
			const response = await fetchBurnTransactions(offset, limit);

			// Add valid burn transactions
			allBurns.push(...response.items);
			totalTxCount = response.total;
			fetchedTxCount += limit;

			console.log(`Found ${response.items.length} burn txs in this batch. Total burn txs so far: ${allBurns.length}. Processed ${Math.min(fetchedTxCount, totalTxCount)}/${totalTxCount} total transactions.`);

			// Stop if we've processed all transactions from the address
			if (fetchedTxCount >= totalTxCount) {
				console.log('Reached end of transactions');
				break;
			}

			// Stop if we've reached the max transaction limit
			if (fetchedTxCount >= maxTransactions) {
				console.log(`Reached max transaction limit (${maxTransactions})`);
				break;
			}

			// Safety check: if API returns nothing, stop
			if (response.total === 0) {
				console.log('API returned 0 total transactions, stopping');
				break;
			}

			offset += limit;
		}

		console.log(`Finished fetching burns: ${allBurns.length} valid burn transactions`);

		// Enrich with token metadata
		const enrichedBurns = await enrichBurnTransactionsWithTokenData(allBurns);

		const result = { items: enrichedBurns, total: enrichedBurns.length };

		// Save to cache
		saveBurnDataToCache(result);

		return result;
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
