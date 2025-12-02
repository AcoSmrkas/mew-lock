/**
 * Price Performance Service
 * Tracks price changes between lock creation and current time
 */

const CRUX_API_BASE = 'https://api.cruxfinance.io/spectrum/price';

export class PricePerformanceService {
    constructor() {
        this.cache = new Map(); // Cache for historical prices
    }

    /**
     * Get historical price for a token at specific timestamp
     */
    async getHistoricalPrice(tokenId, timestamp) {
        const cacheKey = `${tokenId}-${timestamp}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // Use the exact API format you provided
            const url = `${CRUX_API_BASE}?token_id=${tokenId}&time_point=${timestamp}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // Cache the result
            this.cache.set(cacheKey, data);
            
            return data;
        } catch (error) {
            console.error('Failed to fetch historical price:', error);
            return null;
        }
    }

    /**
     * Calculate price performance for a lock (handles both ERG and tokens)
     */
    async calculateLockPerformance(lockBox, currentPrices) {
        try {
            console.log('🔍 Lock Box Data:', {
                boxId: lockBox.boxId,
                creationHeight: lockBox.creationHeight,
                additionalRegisters: lockBox.additionalRegisters
            });
            
            // Get exact timestamp from creationHeight using ErgoWatch API
            const creationTimestamp = await this.getTimestampFromHeight(lockBox.creationHeight);
            
            console.log('📅 Creation timestamp from height', lockBox.creationHeight, ':', creationTimestamp);
            
            if (!creationTimestamp) {
                return { error: 'No creation timestamp found' };
            }

            // Determine what tokens are in this lock
            const tokens = [];
            
            // Add ERG
            if (lockBox.value && lockBox.value > 0) {
                tokens.push({
                    tokenId: '0000000000000000000000000000000000000000000000000000000000000000', // ERG token ID
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

            // Calculate performance for each token
            const tokenPerformances = [];
            let totalHistoricalValue = 0;
            let totalCurrentValue = 0;

            for (const token of tokens) {
                const historicalData = await this.getHistoricalPrice(token.tokenId, creationTimestamp);
                
                if (!historicalData) {
                    console.warn(`No historical data for token ${token.tokenId}`);
                    continue;
                }

                let historicalPrice, currentPrice;
                
                if (token.tokenId === '0000000000000000000000000000000000000000000000000000000000000000') {
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
    async getTimestampFromHeight(creationHeight) {
        try {
            console.log('🔍 Fetching timestamp for height:', creationHeight);
            
            const response = await fetch(`https://api.ergo.watch/utils/height2timestamp/${creationHeight}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const timestamp = await response.text(); // API returns plain number as text
            const timestampMs = parseInt(timestamp);
            
            console.log('📅 Height', creationHeight, '→ Exact timestamp:', timestampMs, new Date(timestampMs).toISOString());
            
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