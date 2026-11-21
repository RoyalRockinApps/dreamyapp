// Task boards: who sees and manages which board, mirroring the database rules in
// supabase/migrations/20261119000100_task_boards.sql.
import { timeAgo } from './dates';
import { canManageProduction } from './production';
import type { Group, Production, Task, TaskStatus, TaskUpdate, User } from './types';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

/** A production's board is for its company and the owner; the theatre's for owners, staff and theatre Team Leads. */
export function canSeeBoard(user: User, production?: Production): boolean {
  if (user.role === 'owner') return true;
  if (!production) return !!user.teamLead;
  return production.members.some((m) => m.userId === user.id);
}

/** Groups whose cards this person manages on a production's board: every group for a director or the owner. */
export function managedGroups(user: User, production: Production): Group[] {
  if (canManageProduction(production, user)) return production.groups;
  const leads = production.members.find((m) => m.userId === user.id)?.leadGroupIds ?? [];
  return production.groups.filter((g) => leads.includes(g.id));
}

/** Can this person add, move, edit and delete this card (or, with no card, add one to this board)? */
export function canManageTask(user: User, production: Production | undefined, groupId?: string): boolean {
  if (!production) return user.role === 'owner' || !!user.teamLead;
  if (canManageProduction(production, user)) return true;
  return !!groupId && managedGroups(user, production).some((g) => g.id === groupId);
}

export function canAddTasks(user: User, production?: Production): boolean {
  if (!production) return canManageTask(user, undefined);
  return canManageProduction(production, user) || managedGroups(user, production).length > 0;
}

/** People a card on this board can be assigned to: whoever can see the board. */
export function boardPeople(users: User[], production?: Production): User[] {
  return users
    .filter((u) => u.role === 'owner' || (production ? production.members.some((m) => m.userId === u.id) : u.teamLead))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Cards in a column, soonest due first, then the newest. */
export function sortTasks(tasks: Task[]): Task[] {
  return tasks.slice().sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.createdAt.localeCompare(a.createdAt));
}

/** Each card's newest update and how many it has. */
export function updatesByTask(updates: TaskUpdate[]): Map<string, { last: TaskUpdate; count: number }> {
  const out = new Map<string, { last: TaskUpdate; count: number }>();
  for (const u of updates) {
    const seen = out.get(u.taskId);
    if (!seen) out.set(u.taskId, { last: u, count: 1 });
    else out.set(u.taskId, { last: u.at >= seen.last.at ? u : seen.last, count: seen.count + 1 });
  }
  return out;
}

/** "just now", "3h ago", or a date for anything older than a week. */
export function agoLabel(iso: string, now = new Date()): string {
  const t = timeAgo(iso, now);
  return t === 'now' ? 'just now' : /^\d+[mhd]$/.test(t) ? `${t} ago` : t;
}
