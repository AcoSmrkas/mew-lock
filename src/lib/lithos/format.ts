// Exact amount parsing/formatting for 9-decimal LIT, plus block-time estimates.
// Amounts never go through floating point.

/** "1,234.5" -> raw units with `decimals`, or null if it is not a valid non-negative amount. */
export function parseAmount(input: string, decimals: number): bigint | null {
	const s = input.replace(/[,_\s]/g, '');
	const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
	if (!m || (m[1] === '' && !m[2])) return null;
	const frac = m[2] ?? '';
	if (frac.length > decimals) return null;
	return BigInt(m[1] || '0') * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/**
 * Raw units -> "1,234.5678" with at most `maxDecimals` (truncated, never rounded up).
 * A non-zero amount below one unit keeps two significant digits instead of reading 0
 * (short locks earn rewards like 0.000019).
 */
export function fmtAmount(raw: bigint, decimals: number, maxDecimals = 4): string {
	const unit = 10n ** BigInt(decimals);
	const neg = raw < 0n;
	const v = neg ? -raw : raw;
	const whole = (v / unit).toLocaleString('en-US');
	const digits = (v % unit).toString().padStart(decimals, '0');
	let frac = digits.slice(0, maxDecimals).replace(/0+$/, '');
	if (!frac && v > 0n && v < unit) frac = digits.slice(0, digits.search(/[1-9]/) + 2).replace(/0+$/, '');
	return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** 9-decimal shorthands (LIT, ERG). */
export const parseLit = (input: string) => parseAmount(input, 9);
export const fmtLit = (raw: bigint, maxDecimals = 4) => fmtAmount(raw, 9, maxDecimals);

export function fmtApr(bps: number): string {
	return `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

export function fmtErg(nanoErg: bigint): string {
	return fmtLit(nanoErg, 4);
}

/** "≈ 30 days" style estimate for a block count. */
export function fmtBlocks(blocks: number, blockSeconds: number): string {
	const s = Math.max(0, blocks) * blockSeconds;
	if (s < 3600) return `≈ ${Math.max(1, Math.round(s / 60))} min`;
	if (s < 2 * 86400) return `≈ ${Math.round(s / 3600)} h`;
	return `≈ ${Math.round(s / 86400)} days`;
}

/** Estimated calendar date of a future (or past) block. */
export function estimateDate(height: number, current: number, blockSeconds: number): string {
	const d = new Date(Date.now() + (height - current) * blockSeconds * 1000);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Yearly rate of a lock when stake and reward differ: reward units of B per one
 * whole A per year, e.g. 0.0125 (ERG per LIT per year). Same-asset campaigns
 * show an APR instead.
 */
export function yearlyRate(
	reward: bigint,
	rewardDecimals: number,
	principal: bigint,
	stakeDecimals: number,
	blocks: number,
	blocksPerYear: number
): number {
	if (principal <= 0n || blocks <= 0) return 0;
	const perUnit = Number(reward) / 10 ** rewardDecimals / (Number(principal) / 10 ** stakeDecimals);
	return (perUnit * blocksPerYear) / blocks;
}

export function fmtRate(x: number): string {
	return x.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}
