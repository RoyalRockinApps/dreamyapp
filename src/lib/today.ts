// The Home ("Today") page's "Needs you" list: everything waiting on this person, most urgent first.
import { atMinutes, dayKey, fmtDate, fmtTime, money, relativeDay } from './dates';
import { outstanding } from './pricing';
import { isCalled } from './scheduling';
import { dueState } from './tasks';
import type { Booking, LinkRequest, Production, ScheduleItem, Task, User } from './types';

export type NeedKind = 'account' | 'request' | 'deposit' | 'overdue' | 'rsvp' | 'card' | 'announcement';

export interface Need {
  key: string;
  kind: NeedKind;
  title: string;
  detail: string;
  href: string;
  /** 0 = most urgent */
  rank: number;
}

interface Input {
  user: User;
  bookings: Booking[];
  linkRequests: LinkRequest[];
  schedule: ScheduleItem[];
  productions: Production[];
  tasks: Task[];
  /** unread announcement channels: id, production title, how many unread */
  announcements: { channelId: string; production: string; unread: number }[];
  /** a call shown on its own card with RSVP buttons, left out of the list */
  skipCallId?: string;
  now?: Date;
  /** how far ahead to ask for RSVPs */
  rsvpDays?: number;
}

export function needsYou({ user, bookings, linkRequests, schedule, productions, tasks, announcements, skipCallId, now = new Date(), rsvpDays = 14 }: Input): Need[] {
  const out: Need[] = [];
  const isOwner = user.role === 'owner';
  const today = dayKey(now);

  if (isOwner) {
    const accounts = linkRequests.filter((r) => !r.declined).length;
    if (accounts) out.push({ key: 'accounts', kind: 'account', title: `${accounts} account${accounts > 1 ? 's' : ''} to confirm`, detail: 'People & access', href: '/admin/people', rank: 1 });
    for (const b of bookings) {
      if (b.status === 'inquiry') out.push({ key: `b:${b.id}`, kind: 'request', title: b.title, detail: `New booking request · ${fmtDate(b.start)}`, href: `/booking/${b.id}`, rank: 1 });
      else if (b.status === 'awaiting_deposit') out.push({ key: `b:${b.id}`, kind: 'deposit', title: b.title, detail: `Waiting on ${money(b.quote.depositDue)} deposit · ${fmtDate(b.start)}`, href: `/booking/${b.id}`, rank: 2 });
      else if (b.status === 'confirmed' && outstanding(b) > 0 && new Date(b.quote.balanceDueDate) < now)
        out.push({ key: `b:${b.id}`, kind: 'overdue', title: b.title, detail: `${money(outstanding(b))} overdue · ${fmtDate(b.start)}`, href: `/booking/${b.id}`, rank: 0 });
    }
  } else {
    for (const b of bookings) {
      if (b.renterId !== user.id || new Date(b.end) < now) continue;
      if (b.status === 'awaiting_deposit')
        out.push({ key: `b:${b.id}`, kind: 'deposit', title: `Pay the deposit for ${b.title}`, detail: `${money(b.quote.depositDue)} holds ${fmtDate(b.start)} for you`, href: `/pay?bookingId=${b.id}&kind=deposit`, rank: 0 });
      else if (b.status === 'confirmed' && outstanding(b) > 0)
        out.push({ key: `b:${b.id}`, kind: 'deposit', title: `Balance for ${b.title}`, detail: `${money(outstanding(b))} due ${fmtDate(b.quote.balanceDueDate)}`, href: `/booking/${b.id}`, rank: new Date(b.quote.balanceDueDate) < now ? 0 : 3 });
    }
  }

  // calls waiting on an answer: listed one by one, or as one line per show when there are several
  const horizon = now.getTime() + rsvpDays * 86_400_000;
  const unanswered = new Map<string, ScheduleItem[]>();
  for (const s of [...schedule].sort((a, b) => a.start.localeCompare(b.start))) {
    if (s.id === skipCallId || s.rsvps[user.id]) continue;
    const start = new Date(s.start).getTime();
    if (start < now.getTime() || start > horizon) continue;
    const p = productions.find((x) => x.id === s.productionId);
    if (!p || !isCalled(s, p, user.id)) continue;
    unanswered.set(p.id, [...(unanswered.get(p.id) ?? []), s]);
  }
  for (const [id, calls] of unanswered) {
    const p = productions.find((x) => x.id === id)!;
    if (calls.length > 2) {
      const next = calls[0];
      out.push({ key: `rsvp:${id}`, kind: 'rsvp', title: `RSVP to ${calls.length} calls`, detail: `${p.title} · next: ${next.title}, ${relativeDay(next.start)} ${fmtTime(next.start)}`, href: `/production/${id}?tab=schedule`, rank: 2 });
      continue;
    }
    for (const s of calls) {
      out.push({ key: `rsvp:${s.id}`, kind: 'rsvp', title: `RSVP: ${s.title}`, detail: `${p.title} · ${relativeDay(s.start)} ${fmtTime(s.start)}`, href: `/production/${p.id}?tab=schedule&item=${s.id}`, rank: 2 });
    }
  }

  for (const t of tasks) {
    if (t.assigneeId !== user.id) continue;
    const due = dueState(t, today);
    if (!due) continue;
    const board = productions.find((p) => p.id === t.productionId)?.title ?? 'Theatre board';
    const day = atMinutes(t.dueDate!, 12 * 60);
    const rd = relativeDay(day, now);
    const when = due === 'overdue' ? `Overdue since ${fmtDate(day)}` : `Due ${rd === 'Today' || rd === 'Tomorrow' ? rd.toLowerCase() : rd}`;
    out.push({ key: `card:${t.id}`, kind: 'card', title: t.title, detail: `${when} · ${board}`, href: `/task/${t.id}`, rank: due === 'overdue' ? 0 : 2 });
  }

  for (const a of announcements) {
    if (a.unread) out.push({ key: `ann:${a.channelId}`, kind: 'announcement', title: `New announcement${a.unread > 1 ? 's' : ''} · ${a.production}`, detail: `${a.unread} unread`, href: `/chat/${a.channelId}`, rank: 3 });
  }

  return out.sort((a, b) => a.rank - b.rank);
}
