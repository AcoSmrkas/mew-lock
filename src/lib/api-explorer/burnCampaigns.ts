/**
 * Burn Campaigns and Events System
 * Allows creation and tracking of burn contests and campaigns
 */

export interface BurnCampaign {
	id: string;
	name: string;
	description: string;
	startDate: number; // timestamp
	endDate: number; // timestamp
	status: 'upcoming' | 'active' | 'ended';
	targetToken?: string; // Optional: specific token to burn
	targetAmount?: number; // Optional: target burn amount
	prizes?: Array<{
		rank: number;
		description: string;
		value?: string;
	}>;
	rules?: string[];
	participants?: number;
	totalBurned?: number;
}

export interface CampaignLeaderboard {
	campaignId: string;
	entries: Array<{
		rank: number;
		address: string;
		burnedAmount: number;
		burnCount: number;
		lastBurnTimestamp: number;
	}>;
}

/**
 * In-memory storage for campaigns (will be replaced with backend storage)
 * For now, using localStorage for persistence
 */
const CAMPAIGNS_STORAGE_KEY = 'burn_campaigns';

/**
 * Get all campaigns
 */
export function getAllCampaigns(): BurnCampaign[] {
	if (typeof window === 'undefined') return [];

	const stored = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
	if (!stored) return getDefaultCampaigns();

	try {
		const campaigns = JSON.parse(stored);
		return campaigns.map((c: BurnCampaign) => ({
			...c,
			status: getCampaignStatus(c.startDate, c.endDate)
		}));
	} catch {
		return getDefaultCampaigns();
	}
}

/**
 * Get campaign by ID
 */
export function getCampaignById(id: string): BurnCampaign | null {
	const campaigns = getAllCampaigns();
	return campaigns.find((c) => c.id === id) || null;
}

/**
 * Create a new campaign
 */
export function createCampaign(campaign: Omit<BurnCampaign, 'id' | 'status'>): BurnCampaign {
	const newCampaign: BurnCampaign = {
		...campaign,
		id: generateId(),
		status: getCampaignStatus(campaign.startDate, campaign.endDate)
	};

	const campaigns = getAllCampaigns();
	campaigns.push(newCampaign);
	saveCampaigns(campaigns);

	return newCampaign;
}

/**
 * Update campaign
 */
export function updateCampaign(id: string, updates: Partial<BurnCampaign>): BurnCampaign | null {
	const campaigns = getAllCampaigns();
	const index = campaigns.findIndex((c) => c.id === id);

	if (index === -1) return null;

	campaigns[index] = {
		...campaigns[index],
		...updates,
		status: getCampaignStatus(
			updates.startDate || campaigns[index].startDate,
			updates.endDate || campaigns[index].endDate
		)
	};

	saveCampaigns(campaigns);
	return campaigns[index];
}

/**
 * Delete campaign
 */
export function deleteCampaign(id: string): boolean {
	const campaigns = getAllCampaigns();
	const filtered = campaigns.filter((c) => c.id !== id);

	if (filtered.length === campaigns.length) return false;

	saveCampaigns(filtered);
	return true;
}

/**
 * Get active campaigns
 */
export function getActiveCampaigns(): BurnCampaign[] {
	return getAllCampaigns().filter((c) => c.status === 'active');
}

/**
 * Get upcoming campaigns
 */
export function getUpcomingCampaigns(): BurnCampaign[] {
	return getAllCampaigns().filter((c) => c.status === 'upcoming');
}

/**
 * Get ended campaigns
 */
export function getEndedCampaigns(): BurnCampaign[] {
	return getAllCampaigns().filter((c) => c.status === 'ended');
}

/**
 * Helper: Determine campaign status based on dates
 */
function getCampaignStatus(startDate: number, endDate: number): BurnCampaign['status'] {
	const now = Date.now();

	if (now < startDate) return 'upcoming';
	if (now > endDate) return 'ended';
	return 'active';
}

/**
 * Helper: Generate unique ID
 */
function generateId(): string {
	return `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper: Save campaigns to localStorage
 */
function saveCampaigns(campaigns: BurnCampaign[]): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
}

/**
 * Get default example campaigns
 */
function getDefaultCampaigns(): BurnCampaign[] {
	const now = Date.now();
	const oneDay = 24 * 60 * 60 * 1000;
	const oneWeek = 7 * oneDay;

	return [
		{
			id: 'example_1',
			name: 'New Year Burn Fest 2025',
			description:
				'Kick off 2025 by burning tokens! Top 10 burners win exclusive NFTs and ERG rewards.',
			startDate: now - 5 * oneDay, // Started 5 days ago
			endDate: now + 25 * oneDay, // Ends in 25 days
			status: 'active',
			prizes: [
				{ rank: 1, description: 'Rare NFT + 100 ERG', value: '100 ERG' },
				{ rank: 2, description: 'Epic NFT + 50 ERG', value: '50 ERG' },
				{ rank: 3, description: 'Uncommon NFT + 25 ERG', value: '25 ERG' },
				{ rank: 4, description: '10 ERG' },
				{ rank: 5, description: '5 ERG' }
			],
			rules: [
				'Burn any supported token to participate',
				'Each burn transaction counts towards your total',
				'Winners announced after campaign ends',
				'Minimum 1 ERG worth of tokens must be burned'
			],
			participants: 42,
			totalBurned: 15000
		},
		{
			id: 'example_2',
			name: 'Gyros Burn Challenge',
			description: 'Burn Gyros tokens and compete for the top spot!',
			startDate: now + 3 * oneDay, // Starts in 3 days
			endDate: now + 10 * oneDay,
			status: 'upcoming',
			targetToken: '2a4db3601ab5835392d5202b3f88c13932f338c539ba5f131fb1370bf60f32b3',
			targetAmount: 100000,
			prizes: [
				{ rank: 1, description: '1000 Gyros + Exclusive Badge' },
				{ rank: 2, description: '500 Gyros' },
				{ rank: 3, description: '250 Gyros' }
			],
			rules: [
				'Only Gyros token burns count',
				'Burn as many Gyros as you can',
				'Leaderboard updates in real-time'
			],
			participants: 0,
			totalBurned: 0
		},
		{
			id: 'example_3',
			name: 'BEPOS Community Burn',
			description: 'Past campaign - BEPOS holders united to burn for ecosystem health',
			startDate: now - 30 * oneDay,
			endDate: now - 23 * oneDay,
			status: 'ended',
			targetToken: '6ef0423fa6840de2f921e08c9698baaf9b84d34612db9e507f5b4033425ed7a7',
			prizes: [
				{ rank: 1, description: 'Community Hero Badge + 50 ERG' },
				{ rank: 2, description: 'Community Supporter Badge + 25 ERG' },
				{ rank: 3, description: 'Community Member Badge + 10 ERG' }
			],
			participants: 28,
			totalBurned: 50000
		}
	];
}

/**
 * Calculate campaign leaderboard based on burn transactions
 * This would query burn transactions filtered by campaign dates and target token
 */
export async function calculateCampaignLeaderboard(
	campaignId: string,
	burnTransactions: Array<any>
): Promise<CampaignLeaderboard> {
	const campaign = getCampaignById(campaignId);
	if (!campaign) {
		throw new Error('Campaign not found');
	}

	// Filter burns by campaign period
	const campaignBurns = burnTransactions.filter(
		(burn) => burn.timestamp >= campaign.startDate && burn.timestamp <= campaign.endDate
	);

	// Aggregate by burner
	const burnerStats = new Map<
		string,
		{
			burnedAmount: number;
			burnCount: number;
			lastBurnTimestamp: number;
		}
	>();

	for (const burn of campaignBurns) {
		// If campaign targets specific token, filter
		let relevantBurns = burn.burnedTokens;
		if (campaign.targetToken) {
			relevantBurns = burn.burnedTokens.filter((t: any) => t.tokenId === campaign.targetToken);
		}

		if (relevantBurns.length === 0) continue;

		const totalBurned = relevantBurns.reduce((sum: number, t: any) => sum + t.amount, 0);

		const existing = burnerStats.get(burn.burnerAddress) || {
			burnedAmount: 0,
			burnCount: 0,
			lastBurnTimestamp: 0
		};

		burnerStats.set(burn.burnerAddress, {
			burnedAmount: existing.burnedAmount + totalBurned,
			burnCount: existing.burnCount + 1,
			lastBurnTimestamp: Math.max(existing.lastBurnTimestamp, burn.timestamp)
		});
	}

	// Convert to leaderboard entries and sort
	const entries = Array.from(burnerStats.entries())
		.map(([address, stats]) => ({
			address,
			...stats,
			rank: 0 // Will be set below
		}))
		.sort((a, b) => {
			// Sort by amount burned (descending), then by timestamp (earlier wins ties)
			if (b.burnedAmount !== a.burnedAmount) {
				return b.burnedAmount - a.burnedAmount;
			}
			return a.lastBurnTimestamp - b.lastBurnTimestamp;
		})
		.map((entry, index) => ({
			...entry,
			rank: index + 1
		}));

	return {
		campaignId,
		entries
	};
}
