// Small, dependency-free date helpers. We format manually so output is identical on
// Hermes (iOS/Android) and the web, regardless of Intl support.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

const pad = (n: number) => String(n).padStart(2, '0');

/** Local "YYYY-MM-DD" key for a date. */
export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** Build a local Date from a day key and minutes after midnight. */
export function atMinutes(key: string, minutes: number): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

/** ISO string for local date + "HH:MM" */
export function localIso(y: number, month1: number, d: number, h = 0, min = 0): string {
  return new Date(y, month1 - 1, d, h, min).toISOString();
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60000);
}

export function sameDay(a: Date | string, b: Date | string) {
  return dayKey(a) === dayKey(b);
}

export function fmtTime(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  let h = x.getHours();
  const m = x.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m === 0 ? `${h}${ap}` : `${h}:${pad(m)}${ap}`;
}

export function fmtMinutes(minutes: number): string {
  return fmtTime(atMinutes('2000-01-01', minutes));
}

export function fmtDate(d: Date | string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const base = `${MONTHS_SHORT[x.getMonth()]} ${x.getDate()}`;
  const wd = opts.weekday ? `${WEEKDAYS_SHORT[x.getDay()]}, ` : '';
  const yr = opts.year ? `, ${x.getFullYear()}` : '';
  return wd + base + yr;
}

export function fmtRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (sameDay(s, e)) return `${fmtDate(s, { weekday: true })} · ${fmtTime(s)}–${fmtTime(e)}`;
  return `${fmtDate(s, { weekday: true })} ${fmtTime(s)} → ${fmtDate(e, { weekday: true })} ${fmtTime(e)}`;
}

export function hoursBetween(start: string | Date, end: string | Date): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3600000;
}

export function relativeDay(d: Date | string, now = new Date()): string {
  const diff = Math.round((startOfDay(new Date(d)).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return WEEKDAYS[new Date(d).getDay()];
  return fmtDate(d, { weekday: true });
}

export function timeAgo(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return fmtDate(iso);
}

/** 6x7 grid of dates covering the month containing `month`. */
export function monthGrid(year: number, month0: number): Date[] {
  const first = new Date(year, month0, 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function money(n: number, cents = false): string {
  const neg = n < 0;
  const v = Math.abs(n);
  const str = cents || v % 1 !== 0 ? v.toFixed(2) : String(Math.round(v));
  const [int, dec] = str.split('.');
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${withCommas}${dec ? '.' + dec : ''}`;
}
