import { addMinutes, atMinutes, dayKey } from './dates';
import type { Booking, MemberConflict, Production, ScheduleItem } from './types';

export interface Busy {
  id: string;
  kind: 'booking' | 'schedule' | 'performance';
  title: string;
  start: string;
  end: string;
  status?: Booking['status'];
}

const t = (s: string | Date) => new Date(s).getTime();

/** Does a booking currently hold the stage? Expired, unpaid holds release their date. */
export function bookingBlocksStage(b: Booking, now: Date = new Date()): boolean {
  if (b.status === 'confirmed' || b.status === 'completed') return true;
  if (b.status === 'inquiry') return true; // tentative, still shown as a conflict
  if (b.status === 'awaiting_deposit') return !b.holdExpiresAt || t(b.holdExpiresAt) > now.getTime();
  return false;
}

export function stageBusy(
  bookings: Booking[],
  schedule: ScheduleItem[],
  now: Date = new Date(),
  ignoreId?: string,
): Busy[] {
  const busy: Busy[] = [];
  for (const b of bookings) {
    if (b.id === ignoreId || !bookingBlocksStage(b, now)) continue;
    busy.push({ id: b.id, kind: 'booking', title: b.title, start: b.start, end: b.end, status: b.status });
  }
  for (const s of schedule) {
    if (s.id === ignoreId || s.space !== 'Main Stage') continue;
    busy.push({ id: s.id, kind: 'schedule', title: s.title, start: s.start, end: s.end });
  }
  return busy;
}

/** Items overlapping [start, end] once a turnover buffer is applied on both sides. */
export function findConflicts(start: string, end: string, busy: Busy[], bufferMins = 0): Busy[] {
  const s = addMinutes(new Date(start), -bufferMins).getTime();
  const e = addMinutes(new Date(end), bufferMins).getTime();
  return busy.filter((b) => t(b.start) < e && t(b.end) > s);
}

/** Open windows on a day between `openMin` and `closeMin` (minutes after midnight). */
export function openWindows(
  key: string,
  busy: Busy[],
  bufferMins = 0,
  openMin = 8 * 60,
  closeMin = 23 * 60,
): { start: Date; end: Date }[] {
  const dayStart = atMinutes(key, openMin);
  const dayEnd = atMinutes(key, closeMin);
  const blocks = busy
    .map((b) => ({ s: addMinutes(new Date(b.start), -bufferMins), e: addMinutes(new Date(b.end), bufferMins) }))
    .filter((b) => b.e > dayStart && b.s < dayEnd)
    .sort((a, b) => a.s.getTime() - b.s.getTime());
  const out: { start: Date; end: Date }[] = [];
  let cursor = dayStart;
  for (const b of blocks) {
    if (b.s > cursor) out.push({ start: cursor, end: b.s });
    if (b.e > cursor) cursor = b.e;
  }
  if (cursor < dayEnd) out.push({ start: cursor, end: dayEnd });
  return out.filter((w) => w.end.getTime() - w.start.getTime() >= 60 * 60000);
}

export function busyDays(busy: Busy[]): Set<string> {
  const days = new Set<string>();
  for (const b of busy) {
    let d = new Date(b.start);
    const end = new Date(b.end);
    while (d < end) {
      days.add(dayKey(d));
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  return days;
}

/** Members of the production who are called to `item`. */
export function calledMemberIds(item: Pick<ScheduleItem, 'groupIds'>, production: Production): string[] {
  if (!item.groupIds.length) return production.members.map((m) => m.userId);
  return production.members
    .filter((m) => m.isDirector || m.groupIds.some((g) => item.groupIds.includes(g)))
    .map((m) => m.userId);
}

/** Called members who have a submitted conflict overlapping the call. */
export function memberConflictsFor(
  item: Pick<ScheduleItem, 'groupIds' | 'start' | 'end'>,
  production: Production,
  conflicts: MemberConflict[],
): MemberConflict[] {
  const called = new Set(calledMemberIds(item, production));
  return conflicts.filter(
    (c) => c.productionId === production.id && called.has(c.userId) && t(c.start) < t(item.end) && t(c.end) > t(item.start),
  );
}

export function isCalled(item: ScheduleItem, production: Production, userId: string): boolean {
  return calledMemberIds(item, production).includes(userId);
}
