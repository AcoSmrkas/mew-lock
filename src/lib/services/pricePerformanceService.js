/**
 * Price Performance Service
 * Tracks price changes between lock creation and current time
 */

// Was api.cruxfinance.io/spectrum/price, dead along with the rest of crux.
// Our replacement is a POST batch endpoint keyed on (ids[], timestamps[]) that
// snaps each timestamp to the nearest logged price, and returns USD directly.
const EE_PRICE_AT_API = 'https://api.ergexplorer.com/tokens/getTokenPriceAt';
const HEIGHT_TO_TIMESTAMP_API = 'https://api.ergo.watch/utils/height2timestamp';
const ERG_TOKEN_ID = '0000000000000000000000000000000000000000000000000000000000000000';

// On 2026-10-02 the /locks page sent ~350 getTokenPriceAt calls in 10 minutes: one or
// two per lock card, sent again on every re-render, with failures never cached. That
// held the whole api.ergexplorer.com php-fpm pool. So prices for a lock list are looked
// up in a few batched calls, concurrent callers share a request, and a failed lookup
// waits FAILURE_TTL_MS before it is retried.
const MAX_PAIRS_PER_REQUEST = 50;
const FAILURE_TTL_MS = 60 * 1000;
// ergo.watch has no batch form of height2timestamp.
const MAX_PARALLEL_HEIGHT_LOOKUPS = 6;

const isErg = (tokenId) => tokenId === ERG_TOKEN_ID;
const priceKey = (tokenId, timestamp) => `${tokenId}-${timestamp}`;

/**
 * A cache of promises, so concurrent callers share one request. A value is kept for
 * the session (block times and past prices don't change); a failure (null) is kept
 * only for FAILURE_TTL_MS.
 */
class PromiseCache {
    constructor() {
        this.entries = new Map();
    }

    get(key) {
        const entry = this.entries.get(key);
        return entry && entry.expires > Date.now() ? entry.promise : undefined;
    }

    set(key, promise) {
        const entry = { expires: Infinity, promise };
        entry.promise = promise
            .catch(() => null)
            .then((value) => {
                if (value == null) entry.expires = Date.now() + FAILURE_TTL_MS;
                return value;
            });
        this.entries.set(key, entry);
        return entry.promise;
    }
}

// Runs at most `max` tasks at once; the rest wait their turn.
function createLimiter(max) {
    let active = 0;
    const waiting = [];
    return async (task) => {
        if (active < max) active++;
        else await new Promise((resolve) => waiting.push(resolve));
        try {
            return await task();
        } finally {
            // Hand the slot straight to the next task, or free it.
            const next = waiting.shift();
            if (next) next();
            else active--;
        }
    };
}

/**
 * Splits (tokenId, timestamp) pairs into getTokenPriceAt requests of at most
 * MAX_PAIRS_PER_REQUEST pairs. Every timestamp in a request also asks for ERG, which
 * converts the token's USD price to ERG. Pairs go out sorted by timestamp, because the
 * endpoint only merges CONSECUTIVE equal timestamps, and each distinct one costs it a
 * lookup.
 */
function chunkPairs(pairs) {
    const sorted = [...pairs].sort(
        (a, b) => a.timestamp - b.timestamp || Number(isErg(b.tokenId)) - Number(isErg(a.tokenId))
    );
    /** @type {{ tokenId: string, timestamp: number }[][]} */
    const chunks = [[]];
    let ergAt = new Set(); // timestamps the current chunk already asks ERG for
    for (const pair of sorted) {
        const needsErg = !isErg(pair.tokenId) && !ergAt.has(pair.timestamp);
        if (chunks[chunks.length - 1].length + (needsErg ? 2 : 1) > MAX_PAIRS_PER_REQUEST) {
            chunks.push([]);
            ergAt = new Set();
        }
        const chunk = chunks[chunks.length - 1];
        if (!isErg(pair.tokenId) && !ergAt.has(pair.timestamp)) {
            chunk.push({ tokenId: ERG_TOKEN_ID, timestamp: pair.timestamp });
        }
        ergAt.add(pair.timestamp);
        chunk.push(pair);
    }
    return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * The logged price batch the endpoint snapped `timestamp` to. It takes the closest
 * logged timestamp it holds, so the closest one in its reply is the same batch.
 */
function nearestLogged(logged, timestamp) {
    let best;
    for (const at of logged) {
        const distance = Math.abs(at - timestamp);
        const bestDistance = Math.abs(best - timestamp);
        if (best === undefined || distance < bestDistance || (distance === bestDistance && at < best)) {
            best = at;
        }
    }
    return best;
}

// Callers expect crux's shape ({ erg_price_usd, asset_price_erg }) and multiply the
// two, so convert our USD price back into an ERG-denominated one.
function toCruxShape(tokenId, usdByToken) {
    const ergUsd = usdByToken?.get(ERG_TOKEN_ID);
    if (!ergUsd || !isFinite(ergUsd)) {
        return null;
    }
    if (isErg(tokenId)) {
        return { erg_price_usd: ergUsd, asset_price_erg: 1 };
    }
    const tokenUsd = usdByToken.get(tokenId);
    if (!tokenUsd || !isFinite(tokenUsd)) {
        return null;
    }
    return { erg_price_usd: ergUsd, asset_price_erg: tokenUsd / ergUsd };
}

// The ERG and tokens in a lock box, in display units.
function lockHoldings(lockBox) {
    const tokens = [];

    // Add ERG
    if (lockBox.value && lockBox.value > 0) {
        tokens.push({
            tokenId: ERG_TOKEN_ID,
            amount: lockBox.value / 1e9,
            name: 'ERG',
            decimals: 9
        });
    }

    // Add other tokens
    if (lockBox.assets && lockBox.assets.length > 0) {
        lockBox.assets.forEach(asset => {
            tokens.push({
                tokenId: asset.tokenId,
                amount: asset.amount / Math.pow(10, asset.decimals || 0),
                name: asset.name || 'Unknown Token',
                decimals: asset.decimals || 0
            });
        });
    }

    return tokens;
}

export class PricePerformanceService {
    constructor() {
        this.priceCache = new PromiseCache(); // `${tokenId}-${timestamp}` -> crux shape | null
        this.timestampCache = new PromiseCache(); // block height -> timestamp (ms) | null
        this.heightLookups = createLimiter(MAX_PARALLEL_HEIGHT_LOOKUPS);
    }

    /**
     * Get historical price for a token at specific timestamp
     */
    async getHistoricalPrice(tokenId, timestamp) {
        const prices = await this.getHistoricalPrices([{ tokenId, timestamp }]);
        return prices.get(priceKey(tokenId, timestamp));
    }

    /**
     * Historical prices for many (tokenId, timestamp) pairs, in as few getTokenPriceAt
     * calls as possible. Returns a Map from `${tokenId}-${timestamp}` to
     * { erg_price_usd, asset_price_erg }, or to null where there is no price.
     */
    async getHistoricalPrices(pairs) {
        const promises = new Map();
        const missing = [];
        for (const { tokenId, timestamp } of pairs) {
            const key = priceKey(tokenId, timestamp);
            if (promises.has(key)) continue;

            let promise = this.priceCache.get(key);
            if (!promise) {
                let resolve;
                promise = this.priceCache.set(key, new Promise((r) => (resolve = r)));
                missing.push({ tokenId, timestamp, resolve });
            }
            promises.set(key, promise);
        }

        // Not awaited: each fetched pair resolves its own cache entry.
        this.fetchHistoricalPrices(missing);

        const prices = new Map();
        for (const [key, promise] of promises) {
            prices.set(key, await promise);
        }
        return prices;
    }

    // Sequential, so one lookup never holds more than one fpm child at a time.
    async fetchHistoricalPrices(missing) {
        for (const pairs of chunkPairs(missing)) {
            await this.fetchPriceChunk(pairs);
        }
    }

    // Resolves every pair in the chunk that is waiting for a price; never throws.
    async fetchPriceChunk(pairs) {
        const waiting = pairs.filter((pair) => pair.resolve);
        try {
            const body = new URLSearchParams();
            for (const { tokenId, timestamp } of pairs) {
                body.append('ids[]', isErg(tokenId) ? 'ERG' : tokenId);
                body.append('timestamps[]', String(timestamp));
            }

            const response = await fetch(EE_PRICE_AT_API, { method: 'POST', body });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // The reply has every asked-for token at every snapped timestamp, ERG with
            // a null tokenid. Index the USD prices by logged timestamp, then token.
            const usdAt = new Map();
            for (const row of (await response.json()).items ?? []) {
                const tokenId = row.tokenid ?? (row.ticker === 'ERG' ? ERG_TOKEN_ID : null);
                if (!tokenId) continue;
                const at = Number(row.timestamp);
                if (!usdAt.has(at)) usdAt.set(at, new Map());
                if (!usdAt.get(at).has(tokenId)) usdAt.get(at).set(tokenId, Number(row.price));
            }

            const logged = [...usdAt.keys()];
            for (const pair of waiting) {
                pair.resolve(toCruxShape(pair.tokenId, usdAt.get(nearestLogged(logged, pair.timestamp))));
            }
        } catch (error) {
            console.error('Failed to fetch historical prices:', error);
            for (const pair of waiting) pair.resolve(null);
        }
    }

    /**
     * Calculate price performance for a lock (handles both ERG and tokens)
     */
    async calculateLockPerformance(lockBox, currentPrices) {
        const results = await this.calculateLocksPerformance([lockBox], currentPrices);
        return results.get(lockBox.boxId);
    }

    /**
     * Price performance for every lock in a list, from one batched price lookup.
     * Returns a Map from boxId to the result calculateLockPerformance gives.
     */
    async calculateLocksPerformance(lockBoxes, currentPrices) {
        // Exact timestamps from creationHeight using ErgoWatch API
        const timestamps = await Promise.all(
            lockBoxes.map((lockBox) => this.getTimestampFromHeight(lockBox.creationHeight))
        );

        const pairs = lockBoxes.flatMap((lockBox, i) =>
            timestamps[i]
                ? lockHoldings(lockBox).map((token) => ({ tokenId: token.tokenId, timestamp: timestamps[i] }))
                : []
        );
        const historicalPrices = await this.getHistoricalPrices(pairs);

        return new Map(
            lockBoxes.map((lockBox, i) => [
                lockBox.boxId,
                this.buildLockPerformance(lockBox, timestamps[i], historicalPrices, currentPrices)
            ])
        );
    }

    buildLockPerformance(lockBox, creationTimestamp, historicalPrices, currentPrices) {
        try {
            if (!creationTimestamp) {
                return { error: 'No creation timestamp found' };
            }

            // Calculate performance for each token
            const tokenPerformances = [];
            let totalHistoricalValue = 0;
            let totalCurrentValue = 0;

            for (const token of lockHoldings(lockBox)) {
                const historicalData = historicalPrices.get(priceKey(token.tokenId, creationTimestamp));

                if (!historicalData) {
                    console.warn(`No historical data for token ${token.tokenId}`);
                    continue;
                }

                let historicalPrice, currentPrice;

                if (isErg(token.tokenId)) {
                    // ERG
                    historicalPrice = historicalData.erg_price_usd;
                    currentPrice = currentPrices.ergUsd;
                } else {
                    // Other tokens - get USD price via ERG
                    const historicalErgPrice = historicalData.erg_price_usd;
                    const historicalTokenErgPrice = historicalData.asset_price_erg;
                    historicalPrice = historicalTokenErgPrice * historicalErgPrice;

                    // Current token price (you'll need to pass current token prices)
                    currentPrice = currentPrices.tokens?.[token.tokenId]?.usdPrice || 0;
                }

                const tokenHistoricalValue = token.amount * historicalPrice;
                const tokenCurrentValue = token.amount * currentPrice;

                totalHistoricalValue += tokenHistoricalValue;
                totalCurrentValue += tokenCurrentValue;

                tokenPerformances.push({
                    tokenId: token.tokenId,
                    name: token.name,
                    amount: token.amount,
                    historicalPrice,
                    currentPrice,
                    historicalValue: tokenHistoricalValue,
                    currentValue: tokenCurrentValue,
                    priceChangePercent: historicalPrice > 0 ? ((currentPrice - historicalPrice) / historicalPrice) * 100 : 0
                });
            }

            // Overall portfolio performance
            const overallPriceChangePercent = totalHistoricalValue > 0 ?
                ((totalCurrentValue - totalHistoricalValue) / totalHistoricalValue) * 100 : 0;

            return {
                overallPerformance: {
                    historicalValue: totalHistoricalValue,
                    currentValue: totalCurrentValue,
                    absoluteChange: totalCurrentValue - totalHistoricalValue,
                    priceChangePercent: overallPriceChangePercent,
                    performance: this.getPerformanceLevel(overallPriceChangePercent)
                },
                tokenPerformances,
                lockTimestamp: creationTimestamp
            };
        } catch (error) {
            console.error('Error calculating lock performance:', error);
            return { error: error.message };
        }
    }

    /**
     * Get exact timestamp from block height using ErgoWatch API
     */
    getTimestampFromHeight(creationHeight) {
        return (
            this.timestampCache.get(creationHeight) ??
            this.timestampCache.set(
                creationHeight,
                this.heightLookups(() => this.fetchTimestampFromHeight(creationHeight))
            )
        );
    }

    async fetchTimestampFromHeight(creationHeight) {
        try {
            const response = await fetch(`${HEIGHT_TO_TIMESTAMP_API}/${creationHeight}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const timestamp = await response.text(); // API returns plain number as text
            const timestampMs = parseInt(timestamp);
            if (!isFinite(timestampMs)) {
                throw new Error(`not a timestamp: ${timestamp.slice(0, 40)}`);
            }

            return timestampMs;
        } catch (error) {
            console.error('Failed to fetch timestamp from ErgoWatch:', error);
            return null;
        }
    }

    /**
     * Extract timestamp from R6 register (backup method)
     */
    extractTimestampFromRegister(r6Register) {
        try {
            if (!r6Register?.serializedValue) return null;

            // R6 format: "05" + hex timestamp
            const hexTimestamp = r6Register.serializedValue.substring(2);
            return parseInt(hexTimestamp, 16) * 1000; // Convert to milliseconds
        } catch (error) {
            console.error('Failed to extract timestamp:', error);
            return null;
        }
    }

    /**
     * Get performance level for styling
     */
    getPerformanceLevel(priceChangePercent) {
        if (priceChangePercent >= 100) return 'diamond'; // 💎
        if (priceChangePercent >= 50) return 'rocket';   // 🚀
        if (priceChangePercent >= 10) return 'great';    // 📈
        if (priceChangePercent > 0) return 'good';       // 🟢
        if (priceChangePercent >= -5) return 'neutral';  // 🟡
        if (priceChangePercent >= -20) return 'poor';    // 🔻
        return 'bad';                                     // 🔴
    }

    /**
     * Format price change for display
     */
    formatPriceChange(priceChangePercent) {
        const sign = priceChangePercent >= 0 ? '+' : '';
        return `${sign}${priceChangePercent.toFixed(2)}%`;
    }

    /**
     * Get performance icon
     */
    getPerformanceIcon(performance) {
        const icons = {
            'diamond': '💎',
            'rocket': '🚀',
            'great': '📈',
            'good': '🟢',
            'neutral': '🟡',
            'poor': '🔻',
            'bad': '🔴'
        };
        return icons[performance] || '📊';
    }

    /**
     * Get performance color class
     */
    getPerformanceColorClass(performance) {
        const classes = {
            'diamond': 'performance-diamond',
            'rocket': 'performance-rocket',
            'great': 'performance-great',
            'good': 'performance-good',
            'neutral': 'performance-neutral',
            'poor': 'performance-poor',
            'bad': 'performance-bad'
        };
        return classes[performance] || 'performance-neutral';
    }
}

// Export singleton instance
export const pricePerformanceService = new PricePerformanceService();
