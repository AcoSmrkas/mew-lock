// Exact amount parsing/formatting for 9-decimal LIT, plus block-time estimates.
// Amounts never go through floating point.

const DECIMALS = 9;
const UNIT = 10n ** BigInt(DECIMALS);

/** "1,234.5" -> raw units, or null if it is not a valid non-negative amount. */
export function parseLit(input: string): bigint | null {
	const s = input.replace(/[,_\s]/g, '');
	const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
	if (!m || (m[1] === '' && !m[2])) return null;
	const frac = m[2] ?? '';
	if (frac.length > DECIMALS) return null;
	return BigInt(m[1] || '0') * UNIT + BigInt(frac.padEnd(DECIMALS, '0') || '0');
}

/** Raw units -> "1,234.5678" with at most `maxDecimals` (truncated, never rounded up). */
export function fmtLit(raw: bigint, maxDecimals = 4): string {
	const neg = raw < 0n;
	const v = neg ? -raw : raw;
	const whole = (v / UNIT).toLocaleString('en-US');
	const frac = (v % UNIT).toString().padStart(DECIMALS, '0').slice(0, maxDecimals).replace(/0+$/, '');
	return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

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
