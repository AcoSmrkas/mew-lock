// Reward curve for the MewLock x Lithos campaign. Mirrors contracts/campaign.es
// exactly (integer BigInt maths, floor division) so the UI can show the reward
// a lock will get before the user signs.
//
//   weight  w = principal * blocks * boostBps
//   reward  r = floor(B * w / (V + w)),  then  B' = B - r,  V' = V + w
//
// B is the LIT budget left in the campaign box, V its virtual weight (R4).

export const BLOCKS_PER_DAY = 720;
export const BLOCKS_PER_YEAR = 262_800; // 365 days of 2-minute blocks
export const BOOST_DENOM = 10_000; // boostBps 10000 = 1.0x
export const BPS = 10_000;

export function lockWeight(principal: bigint, blocks: number, boostBps: number): bigint {
	if (principal <= 0n) return 0n;
	return principal * BigInt(blocks) * BigInt(boostBps);
}

/** Most reward the contract lets a lock of `weight` take from budget `budget` at virtual weight `v`. */
export function maxReward(budget: bigint, v: bigint, weight: bigint): bigint {
	if (v <= 0n) throw new Error('campaign virtual weight must be positive');
	return (budget * weight) / (v + weight);
}

/**
 * Starting virtual weight so that a small lock at boost 1.0x earns `baseAprBps`
 * (5000 = 50%) at genesis. The marginal APR of a boost-b lock is B * b * Y / V,
 * so V0 = B * 1.0x * Y / APR.
 */
export function initialVirtualWeight(budget: bigint, baseAprBps: number): bigint {
	if (budget <= 0n || baseAprBps <= 0) throw new Error('budget and base APR must be positive');
	return (budget * BigInt(BOOST_DENOM) * BigInt(BLOCKS_PER_YEAR) * BigInt(BPS)) / BigInt(baseAprBps);
}

/** APR of a concrete lock, in basis points. */
export function lockAprBps(principal: bigint, reward: bigint, blocks: number): number {
	if (principal <= 0n || blocks <= 0) return 0;
	return Number((reward * BigInt(BPS) * BigInt(BLOCKS_PER_YEAR)) / (principal * BigInt(blocks)));
}

/** APR a tiny lock at `boostBps` would get right now, in basis points. */
export function marginalAprBps(budget: bigint, v: bigint, boostBps: number): number {
	if (v <= 0n) return 0;
	return Number((budget * BigInt(boostBps) * BigInt(BLOCKS_PER_YEAR) * BigInt(BPS)) / v);
}

export type LockQuote = {
	weight: bigint;
	reward: bigint;
	aprBps: number;
	budgetAfter: bigint;
	vAfter: bigint;
};

export function quoteLock(
	budget: bigint,
	v: bigint,
	principal: bigint,
	blocks: number,
	boostBps: number
): LockQuote {
	const weight = lockWeight(principal, blocks, boostBps);
	const reward = maxReward(budget, v, weight);
	return {
		weight,
		reward,
		aprBps: lockAprBps(principal, reward, blocks),
		budgetAfter: budget - reward,
		vAfter: v + weight
	};
}
