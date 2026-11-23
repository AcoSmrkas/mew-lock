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
	private updating: Promise<void> | null = null;

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

	private updatePrices(): Promise<void> {
		// Check if we need to update
		if (Date.now() - this.lastUpdate < this.updateInterval) {
			return Promise.resolve();
		}

		// Callers during an update wait for it, instead of reading zero prices.
		this.updating ??= this.fetchPrices().finally(() => {
			this.updating = null;
		});
		return this.updating;
	}

	private async fetchPrices(): Promise<void> {
		const now = Date.now();

		try {
			// Fetch the ERG price
			await this.fetchErgPrice();
			
			// Fetch token prices from ErgExplorer
			await this.fetchTokenPrices();
			
			this.lastUpdate = now;
		} catch (error) {
			console.error('Error updating prices:', error);
		}
	}

	private async fetchErgPrice(): Promise<void> {
		// Our multi-source feed first; a stale (> 1 h) or missing value falls back to CoinGecko.
		try {
			const response = await fetch('https://api.ergexplorer.com/tokens/getErgPrice');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const item = (await response.json())?.items?.[0];
			const updated = Date.parse(String(item?.timestamp).slice(0, 19).replace(' ', 'T') + 'Z');
			const usd = Number(item?.value);
			if (Number.isFinite(usd) && usd > 0 && Date.now() - updated < 60 * 60 * 1000) {
				this.priceData.erg.usd = usd;
				return;
			}
		} catch (error) {
			console.error('Error fetching ERG price:', error);
		}

		try {
			const response = await fetch('https://api.coingecko.com/api/v3/coins/ergo');
			const data = await response.json();

			if (data?.market_data?.current_price?.usd > 0) {
				this.priceData.erg = {
					usd: data.market_data.current_price.usd,
					btc: data.market_data.current_price.btc || 0,
					eth: data.market_data.current_price.eth || 0
				};
			}
		} catch (error) {
			console.error('Error fetching ERG price fallback:', error);
		}
	}

	private async fetchTokenPrices(): Promise<void> {
		try {
			// One request for every token: { items: [{ id, ticker, price_erg, ... }] }, prices in ERG.
			const response = await fetch('https://api.ergexplorer.com/tokens/getTokenPrices');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const data = await response.json();
			if (!Array.isArray(data?.items)) throw new Error('No price list');

			const ergPrice = this.priceData.erg.usd;
			const tokens = new Map<string, TokenPrice>();

			// Without an ERG/USD rate no token has a USD price: leave them out, never price them at 0.
			if (ergPrice > 0) {
				for (const item of data.items) {
					const tokenErgPrice = Number(item?.price_erg);
					if (!item?.id || !Number.isFinite(tokenErgPrice) || tokenErgPrice <= 0) continue;
					tokens.set(item.id, {
						symbol: item.ticker || item.name || '',
						ergPrice: tokenErgPrice,
						usdPrice: tokenErgPrice * ergPrice,
						tokenId: item.id
					});
				}
			}

			this.priceData.tokens = tokens;
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