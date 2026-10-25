import { describe, expect, it } from 'vitest';
import { reminderIcs, blockTime } from './reminder';

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);

const base = {
	uid: 'abc@lock.mewfinance.com',
	title: 'Mew Lock unlocks',
	blocks: 720,
	description: 'Block 1,900,000. Block times vary, so the time is an estimate.',
	url: 'https://lock.mewfinance.com/my-locks',
	alertsBefore: [0]
};

describe('blockTime', () => {
	it('counts 2-minute blocks', () => {
		expect(blockTime(720, NOW).toISOString()).toBe('2026-10-26T12:00:00.000Z');
		expect(blockTime(-5, NOW).getTime()).toBe(NOW);
	});
});

describe('reminderIcs', () => {
	it('writes one event at the estimated time, in UTC', () => {
		const ics = reminderIcs(base, NOW);
		expect(ics).toContain('DTSTART:20261026T120000Z\r\n');
		expect(ics).toContain('DTEND:20261026T123000Z\r\n');
		expect(ics).toContain('DTSTAMP:20261025T120000Z\r\n');
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
	});

	it('uses CRLF line ends only', () => {
		expect(reminderIcs(base, NOW).replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
	});

	it('escapes commas and semicolons in text', () => {
		const ics = reminderIcs({ ...base, title: 'a, b; c' }, NOW);
		expect(ics).toContain('SUMMARY:a\\, b\\; c\r\n');
	});

	it('adds one alert per distinct time, earliest first', () => {
		const ics = reminderIcs({ ...base, alertsBefore: [120, 1440, 120] }, NOW);
		expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
		expect(ics.indexOf('TRIGGER:-PT1440M')).toBeLessThan(ics.indexOf('TRIGGER:-PT120M'));
	});

	it('leaves out alerts that would fire before now', () => {
		const ics = reminderIcs({ ...base, blocks: 90, alertsBefore: [1440, 120, 0] }, NOW);
		expect(ics).not.toContain('PT1440M');
		expect(ics).toContain('TRIGGER:-PT120M');
		expect(ics).toContain('TRIGGER:-PT0M');
	});

	it('folds long lines at 75 octets', () => {
		const ics = reminderIcs({ ...base, description: 'x'.repeat(200) }, NOW);
		for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		const unfolded = ics.replace(/\r\n /g, '');
		expect(unfolded).toContain(`DESCRIPTION:${'x'.repeat(200)}\r\n`);
	});
});
