// Rehearsal attendance: who takes roll at a call and each person's record, mirroring the database
// rules in supabase/migrations/20261121000000_attendance.sql.
import { canManageProduction } from './production';
import { calledMemberIds } from './scheduling';
import type { Attendance, AttendanceStatus, Production, ScheduleItem, User } from './types';

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
};

/** Directors and the owner mark anyone in the show; a Team Lead marks the others in their groups. */
export function canTakeAttendance(user: User, production: Production, memberId: string): boolean {
  if (canManageProduction(production, user)) return true;
  if (memberId === user.id) return false;
  const leads = production.members.find((m) => m.userId === user.id)?.leadGroupIds ?? [];
  const member = production.members.find((m) => m.userId === memberId);
  return !!member && leads.some((g) => member.groupIds.includes(g));
}

/** Does this person take roll for anyone in the show? Directors, the owner and Team Leads do. */
export function takesRoll(user: User, production: Production): boolean {
  return canManageProduction(production, user) || (production.members.find((m) => m.userId === user.id)?.leadGroupIds?.length ?? 0) > 0;
}

/** Everyone on a call's roll: the people called, apart from directors, who take it. */
export function rollIds(item: ScheduleItem, production: Production): string[] {
  const directors = new Set(production.members.filter((m) => m.isDirector).map((m) => m.userId));
  return calledMemberIds(item, production).filter((id) => !directors.has(id));
}

/** The people on this call's roll that this person can mark, by name. */
export function rollFor(item: ScheduleItem, production: Production, user: User, users: User[]): User[] {
  return rollIds(item, production)
    .filter((id) => canTakeAttendance(user, production, id))
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is User => !!u)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Roll opens half an hour before a call starts. */
export function rollOpen(item: Pick<ScheduleItem, 'start'>, now = new Date()): boolean {
  return now.getTime() >= new Date(item.start).getTime() - 30 * 60_000;
}

/** The marks at one call, by person. */
export function marksFor(records: Attendance[], itemId: string): Map<string, Attendance> {
  return new Map(records.filter((r) => r.itemId === itemId).map((r) => [r.userId, r]));
}

export type AttendanceCounts = Record<AttendanceStatus, number> & { marked: number };

/** How often someone was present, late, absent or excused, at the given calls (all of theirs if omitted). */
export function attendanceCounts(records: Attendance[], userId: string, itemIds?: Set<string>): AttendanceCounts {
  const out: AttendanceCounts = { present: 0, late: 0, absent: 0, excused: 0, marked: 0 };
  for (const r of records) {
    if (r.userId !== userId || (itemIds && !itemIds.has(r.itemId))) continue;
    out[r.status]++;
    out.marked++;
  }
  return out;
}

/** "8 present · 1 late · 1 absent", or undefined when nothing has been marked. */
export function countsLabel(c: AttendanceCounts): string | undefined {
  if (!c.marked) return undefined;
  return (['present', 'late', 'absent', 'excused'] as const)
    .filter((k) => c[k] > 0)
    .map((k) => `${c[k]} ${ATTENDANCE_LABELS[k].toLowerCase()}`)
    .join(' · ');
}
