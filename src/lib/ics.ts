// A one-event calendar file (.ics), for "Add to calendar" on the website where there is no phone calendar to open.

export interface CalendarEventInput {
  uid: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  location?: string;
  notes?: string;
}

/** 2026-11-21T18:30:00.000Z → 20261121T183000Z */
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escape text per RFC 5545: backslashes, semicolons, commas and line breaks. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than 75 characters, as calendar apps expect. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 74) out.push((i ? ' ' : '') + line.slice(i, i + 74));
  return out.join('\r\n');
}

export function buildIcs(e: CalendarEventInput, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Dream Theatre//App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@thedreamtheatre.com`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.notes ? [`DESCRIPTION:${icsText(e.notes)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A file name from the event's title and date: "act-2-blocking-2026-11-22.ics". */
export function icsFileName(e: Pick<CalendarEventInput, 'title' | 'start'>): string {
  const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event';
  return `${slug}-${e.start.slice(0, 10)}.ics`;
}
