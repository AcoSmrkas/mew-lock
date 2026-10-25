// "Remind me": a calendar file the user saves and opens in their own calendar.
// Nothing is stored or sent; the browser just hands over an .ics file.
import { BLOCK_SECONDS } from './lockUi';

export interface Reminder {
	/** Stable per position, so re-adding replaces the event instead of duplicating it. */
	uid: string;
	title: string;
	/** Blocks from now until the event. */
	blocks: number;
	description: string;
	url: string;
	/** Alerts, in minutes before the event (0 = at the time). */
	alertsBefore: number[];
}

/** Text value per RFC 5545: backslash, semicolon, comma and newlines escaped. */
function escapeText(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;
	const parts: string[] = [];
	let current = '';
	let size = 0;
	for (const char of line) {
		const charSize = new TextEncoder().encode(char).length;
		if (size + charSize > (parts.length ? 74 : 75)) {
			parts.push(current);
			current = '';
			size = 0;
		}
		current += char;
		size += charSize;
	}
	parts.push(current);
	return parts.join('\r\n ');
}

function utcStamp(date: Date): string {
	return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** The estimated time of a block `blocks` from now. */
export function blockTime(blocks: number, now = Date.now()): Date {
	return new Date(now + Math.max(0, blocks) * BLOCK_SECONDS * 1000);
}

export function reminderIcs(reminder: Reminder, now = Date.now()): string {
	const start = blockTime(reminder.blocks, now);
	const end = new Date(start.getTime() + 30 * 60 * 1000);
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Mew Finance//Remind me//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${reminder.uid}`,
		`DTSTAMP:${utcStamp(new Date(now))}`,
		`DTSTART:${utcStamp(start)}`,
		`DTEND:${utcStamp(end)}`,
		`SUMMARY:${escapeText(reminder.title)}`,
		`DESCRIPTION:${escapeText(reminder.description)}`,
		`URL:${reminder.url}`
	];
	// An alert that would fire before now is left out (a loan due in 3 h gets no day-before alert).
	const lead = Math.max(0, reminder.blocks) * (BLOCK_SECONDS / 60);
	const alerts = [...new Set(reminder.alertsBefore)].filter((m) => m <= lead).sort((a, b) => b - a);
	for (const minutes of alerts) {
		lines.push(
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			`DESCRIPTION:${escapeText(reminder.title)}`,
			`TRIGGER:-PT${Math.max(0, Math.round(minutes))}M`,
			'END:VALARM'
		);
	}
	lines.push('END:VEVENT', 'END:VCALENDAR');
	return lines.map(fold).join('\r\n') + '\r\n';
}

/** Hands the browser an .ics file to save or open. */
export function downloadReminder(reminder: Reminder, filename: string): void {
	const blob = new Blob([reminderIcs(reminder)], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
