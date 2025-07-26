// Price service for fetching ERG and token prices
export interface TokenPrice {
	symbol: string;
	ergPrice: number;
	usdPrice: number;
	tokenId?: string;
}

export interface PriceData {
	erg: {
		usd: number;
		btc: number;
		eth: number;
	};
	tokens: Map<string, TokenPrice>;
}

class PriceService {
	private priceData: PriceData = {
		erg: { usd: 0, btc: 0, eth: 0 },
		tokens: new Map()
	};
	
	private lastUpdate = 0;
	private updateInterval = 5 * 60 * 1000; // 5 minutes
	private isUpdating = false;

	async getErgPrice(): Promise<number> {
		await this.updatePrices();
		return this.priceData.erg.usd;
	}

	async getTokenPrice(tokenId: string): Promise<TokenPrice | null> {
		await this.updatePrices();
		return this.priceData.tokens.get(tokenId) || null;
	}

	async getAllPrices(): Promise<PriceData> {
		await this.updatePrices();
		return this.priceData;
	}

	private async updatePrices(): Promise<void> {
		const now = Date.now();
		
		// Check if we need to update
		if (now - this.lastUpdate < this.updateInterval || this.isUpdating) {
			return;
		}

		this.isUpdating = true;

		try {
			// Fetch ERG price from CoinGecko
			await this.fetchErgPrice();
			
			// Fetch token prices from Spectrum
			await this.fetchTokenPrices();
			
			this.lastUpdate = now;
		} catch (error) {
			console.error('Error updating prices:', error);
		} finally {
			this.isUpdating = false;
		}
	}

	private async fetchErgPrice(): Promise<void> {
		try {
			const response = await fetch('https://api.coingecko.com/api/v3/coins/ergo');
			const data = await response.json();
			
			if (data?.market_data?.current_price) {
				this.priceData.erg = {
					usd: data.market_data.current_price.usd || 0,
					btc: data.market_data.current_price.btc || 0,
					eth: data.market_data.current_price.eth || 0
				};
			}
		} catch (error) {
			console.error('Error fetching ERG price:', error);
			// Fallback to ErgExplorer
			try {
				const fallbackResponse = await fetch('https://api.ergexplorer.com/tokens/getErgPrice');
				const fallbackData = await fallbackResponse.json();
				if (fallbackData?.items?.[0]?.value) {
					this.priceData.erg.usd = Number(fallbackData.items[0].value);
				}
			} catch (fallbackError) {
				console.error('Error fetching ERG price fallback:', fallbackError);
			}
		}
	}

	private async fetchTokenPrices(): Promise<void> {
		try {
			const response = await fetch('https://api.spectrum.fi/v1/price-tracking/markets');
			const data = await response.json();
			
			const ergPrice = this.priceData.erg.usd;
			
			data.forEach((entry: any) => {
				if (entry.baseSymbol === 'ERG' && entry.quoteId && entry.lastPrice) {
					const lastPrice = Number(entry.lastPrice);
					const tokenErgPrice = 1 / lastPrice;
					const tokenUsdPrice = tokenErgPrice * ergPrice;
					
					this.priceData.tokens.set(entry.quoteId, {
						symbol: entry.quoteSymbol,
						ergPrice: tokenErgPrice,
						usdPrice: tokenUsdPrice,
						tokenId: entry.quoteId
					});
				}
			});
		} catch (error) {
			console.error('Error fetching token prices:', error);
		}
	}

	// Calculate USD value for a given amount of ERG or tokens
	calculateUsdValue(amount: number, tokenId?: string): number {
		if (!tokenId) {
			// ERG value
			return amount * this.priceData.erg.usd;
		}
		
		const tokenPrice = this.priceData.tokens.get(tokenId);
		return tokenPrice ? amount * tokenPrice.usdPrice : 0;
	}

	// Format currency values
	formatUsd(value: number): string {
		if (value < 0.01) return '$0.00';
		if (value < 1) return `$${value.toFixed(4)}`;
		if (value < 1000) return `$${value.toFixed(2)}`;
		if (value < 1000000) return `$${(value / 1000).toFixed(1)}K`;
		if (value < 1000000000) return `$${(value / 1000000).toFixed(1)}M`;
		return `$${(value / 1000000000).toFixed(1)}B`;
	}

	formatErg(value: number): string {
		if (value < 0.0001) return '0 ERG';
		if (value < 1) return `${value.toFixed(4)} ERG`;
		if (value < 1000) return `${value.toFixed(2)} ERG`;
		if (value < 1000000) return `${(value / 1000).toFixed(1)}K ERG`;
		return `${(value / 1000000).toFixed(1)}M ERG`;
	}
}

// Export singleton instance
export const priceService = new PriceService();