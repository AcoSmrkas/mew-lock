import { describe, expect, it } from 'vitest';
import { fmtApr, fmtBlocks, fmtLit, parseLit } from './format.ts';

describe('parseLit / fmtLit', () => {
	it('parses exactly, with separators, and refuses junk or >9 decimals', () => {
		expect(parseLit('1')).toBe(1_000_000_000n);
		expect(parseLit('1,234.5')).toBe(1_234_500_000_000n);
		expect(parseLit('.000000001')).toBe(1n);
		expect(parseLit('500000000.123456789')).toBe(500_000_000_123_456_789n);
		expect(parseLit('0.0000000001')).toBeNull();
		expect(parseLit('1e5')).toBeNull();
		expect(parseLit('-1')).toBeNull();
		expect(parseLit('')).toBeNull();
		expect(parseLit('.')).toBeNull();
	});

	it('formats without floating point, truncating extra decimals', () => {
		expect(fmtLit(500_009_423_205_163_505n, 9)).toBe('500,009,423.205163505');
		expect(fmtLit(1_902_583_899n)).toBe('1.9025');
		expect(fmtLit(1_000_000_000n)).toBe('1');
		expect(fmtLit(0n)).toBe('0');
	});

	it('keeps two significant digits of a tiny non-zero amount instead of 0', () => {
		expect(fmtLit(19_025n)).toBe('0.000019');
		expect(fmtLit(19_025n, 2)).toBe('0.000019');
		expect(fmtLit(1n)).toBe('0.000000001');
		expect(fmtLit(100_000n, 2)).toBe('0.0001');
		expect(fmtLit(190_258_000n, 2)).toBe('0.19');
		expect(fmtLit(1_000_019_025n)).toBe('1');
	});

	it('formats APR and block estimates', () => {
		expect(fmtApr(4999)).toBe('49.99%');
		expect(fmtBlocks(21_600, 120)).toBe('≈ 30 days');
		expect(fmtBlocks(30, 120)).toBe('≈ 1 h');
		expect(fmtBlocks(10, 120)).toBe('≈ 20 min');
		expect(fmtBlocks(90, 60)).toBe('≈ 2 h');
	});
});
