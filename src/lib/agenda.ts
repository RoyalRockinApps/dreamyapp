import { dayKey } from './dates';
import { bookingBlocksStage, isCalled } from './scheduling';
import type { Booking, Performance, Production, ScheduleItem, User } from './types';

export interface AgendaItem {
  id: string;
  kind: 'rental' | 'tentative' | 'rehearsal' | 'performance' | 'unavailable';
  title: string;
  subtitle?: string;
  start: string;
  end: string;
  href?: string;
}

interface Input {
  bookings: Booking[];
  schedule: ScheduleItem[];
  productions: Production[];
  performances: Performance[];
  user: User;
  now?: Date;
}

/** Everything happening at the venue, filtered to what this viewer is allowed to see. */
export function buildAgenda({ bookings, schedule, productions, performances, user, now = new Date() }: Input): AgendaItem[] {
  const out: AgendaItem[] = [];
  const isOwner = user.role === 'owner';

  for (const b of bookings) {
    if (!bookingBlocksStage(b, now)) continue;
    const mine = b.renterId === user.id;
    if (isOwner || mine) {
      out.push({
        id: b.id,
        kind: b.status === 'confirmed' || b.status === 'completed' ? 'rental' : 'tentative',
        title: b.title,
        subtitle: b.organization,
        start: b.start,
        end: b.end,
        href: `/booking/${b.id}`,
      });
    } else if (user.role === 'renter') {
      out.push({ id: b.id, kind: 'unavailable', title: b.isPublic && b.status === 'confirmed' ? b.title : 'Reserved', start: b.start, end: b.end });
    }
  }

  for (const s of schedule) {
    const prod = productions.find((p) => p.id === s.productionId);
    if (!prod) continue;
    if (isOwner || (user.role === 'member' && isCalled(s, prod, user.id))) {
      out.push({ id: s.id, kind: 'rehearsal', title: `${s.title}`, subtitle: `${prod.title} · ${s.space}`, start: s.start, end: s.end, href: `/production/${prod.id}?tab=schedule&item=${s.id}` });
    } else if (user.role === 'renter' && s.space === 'Main Stage') {
      out.push({ id: s.id, kind: 'unavailable', title: 'Reserved', start: s.start, end: s.end });
    }
  }

  for (const p of performances) {
    const end = new Date(new Date(p.start).getTime() + 2.5 * 3600000).toISOString();
    out.push({ id: p.id, kind: 'performance', title: p.title, subtitle: p.subtitle ?? 'Performance', start: p.start, end, href: `/performance/${p.id}` });
  }

  return out.sort((a, b) => a.start.localeCompare(b.start));
}

export function agendaByDay(items: AgendaItem[]): Record<string, AgendaItem[]> {
  const map: Record<string, AgendaItem[]> = {};
  for (const it of items) {
    let d = new Date(it.start);
    const end = new Date(it.end);
    // multi-day rentals appear on every day they cover
    do {
      (map[dayKey(d)] ??= []).push(it);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    } while (d < end);
  }
  return map;
}
