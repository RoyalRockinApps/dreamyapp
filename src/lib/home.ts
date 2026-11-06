import type { Role } from './types';

/** Sections that can appear on the home screen, per role. Order here = catalog order in the editor. */
export const WIDGETS = {
  owner: ['shortcuts', 'needs', 'upcoming', 'nextShow', 'money', 'messages', 'setup'],
  renter: ['cta', 'bookings', 'shows', 'contact'],
  member: ['nextCall', 'hub', 'later', 'announcements', 'tickets'],
} as const satisfies Record<Role, readonly string[]>;

export type WidgetId = (typeof WIDGETS)[Role][number];

export const WIDGET_INFO: Record<WidgetId, { title: string; blurb: string }> = {
  shortcuts: { title: 'Shortcuts', blurb: 'One-tap buttons you choose' },
  needs: { title: 'Needs you', blurb: 'Requests, deposits and overdue balances' },
  upcoming: { title: 'Coming up', blurb: 'Next events on the calendar' },
  nextShow: { title: 'Next show', blurb: 'Ticket sales for the next performance' },
  money: { title: 'This month', blurb: 'Money collected from rentals and tickets' },
  messages: { title: 'Messages', blurb: 'Unread company chats' },
  setup: { title: 'Setup progress', blurb: 'Admin checklist until it’s done' },
  cta: { title: 'Book the theatre', blurb: 'Check dates, or pay a pending deposit' },
  bookings: { title: 'Your bookings', blurb: 'Upcoming reservations' },
  shows: { title: 'On stage soon', blurb: 'Shows with tickets on sale' },
  contact: { title: 'Contact', blurb: 'Call, email or get directions' },
  nextCall: { title: 'Next call', blurb: 'Your next rehearsal with RSVP' },
  hub: { title: 'Production hub', blurb: 'Schedule, company and chat' },
  later: { title: 'After that', blurb: 'Your next few calls' },
  announcements: { title: 'Announcements', blurb: 'Latest from the director' },
  tickets: { title: 'My tickets', blurb: 'Seats you’ve bought' },
};

export const SHORTCUTS = ['booking', 'rehearsal', 'boxOffice', 'checkIn', 'calendar', 'rentals', 'shows', 'admin', 'newShow', 'chat'] as const;
export type ShortcutId = (typeof SHORTCUTS)[number];
export const MAX_SHORTCUTS = 4;

export interface HomeLayout {
  widgets: WidgetId[]; // shown, in order
  shortcuts: ShortcutId[];
}

export const DEFAULT_LAYOUT: Record<Role, HomeLayout> = {
  owner: { widgets: ['shortcuts', 'needs', 'upcoming'], shortcuts: ['booking', 'rehearsal', 'boxOffice', 'checkIn'] },
  renter: { widgets: ['cta', 'bookings', 'shows', 'contact'], shortcuts: [] },
  member: { widgets: ['nextCall', 'hub', 'later'], shortcuts: [] },
};

/** Drop unknown ids (e.g. from an older version) and keep only widgets valid for the role. */
export function normalizeLayout(role: Role, layout: HomeLayout | undefined): HomeLayout {
  if (!layout) return DEFAULT_LAYOUT[role];
  const allowed = WIDGETS[role] as readonly string[];
  return {
    widgets: [...new Set(layout.widgets)].filter((w) => allowed.includes(w)),
    shortcuts: [...new Set(layout.shortcuts)].filter((s) => (SHORTCUTS as readonly string[]).includes(s)).slice(0, MAX_SHORTCUTS),
  };
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(index, 1);
  next.splice(to, 0, it);
  return next;
}
