// Live mode: sign-in state, loading everything this person may see, and keeping it fresh.
// Row-level security on the server decides what each person gets; this file just asks for it all.
// Changes from other people arrive by checking every few seconds (usePoll / the background timer).

import { useEffect } from 'react';
import { AppState as RNAppState } from 'react-native';
import { create } from 'zustand';

import { LIVE } from '@/lib/backend';
import * as auth from '@/lib/remote/auth';
import { ALL_SLICES, setRefreshLoader, type BaseSlice, type Slice } from '@/lib/remote/bus';
import { db } from '@/lib/remote/db';
import * as R from '@/lib/remote/rows';
import { configureHouse } from '@/lib/seating';
import { DEFAULT_SETTINGS } from '@/lib/seed';
import { emptyState, errorMessage, useStore, type AppState } from './useStore';

type Status = 'starting' | 'signedOut' | 'loading' | 'ready' | 'error';

export const useLive = create<{ status: Status; error?: string; email?: string }>(() => ({ status: LIVE ? 'starting' : 'ready' }));

type Patch = Partial<AppState> | ((s: AppState) => Partial<AppState>);

const PAGE = 1000; // PostgREST's default row cap per request

async function rows<T>(table: string, orderBy: string[], where?: [string, string]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db().from(table).select('*');
    if (where) q = q.eq(where[0], where[1]);
    for (const col of orderBy) q = q.order(col);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

async function busy(): Promise<R.BusyRow[]> {
  const { data, error } = await db().rpc('stage_busy');
  if (error) throw new Error(`stage_busy: ${error.message}`);
  return (data ?? []) as R.BusyRow[];
}

const loaders: Record<BaseSlice, () => Promise<Patch>> = {
  config: async () => {
    const [c] = await rows<R.ConfigRow>('venue_config', ['id']);
    if (!c) return {};
    configureHouse(c.house);
    return { venue: c.venue, settings: { ...DEFAULT_SETTINGS, ...c.settings }, house: c.house, setup: c.setup ?? {} };
  },
  people: async () => ({ users: (await rows<R.PersonRow>('people', ['created_at', 'id'])).map(R.toUser) }),
  bookings: async () => {
    const [b, p, x] = await Promise.all([rows<R.BookingRow>('bookings', ['starts_at', 'id']), rows<R.PaymentRow>('payments', ['at', 'id']), busy()]);
    return { bookings: [...b.map((r) => R.toBooking(r, p)), ...x.filter((k) => k.kind === 'booking').map(R.busyToBooking)] };
  },
  productions: async () => {
    const [p, m] = await Promise.all([rows<R.ProductionRow>('productions', ['created_at', 'id']), rows<R.MembershipRow>('memberships', ['created_at', 'person_id'])]);
    return { productions: p.map((r) => R.toProduction(r, m)) };
  },
  schedule: async () => {
    const [s, r, x] = await Promise.all([rows<R.ScheduleRow>('schedule_items', ['starts_at', 'id']), rows<R.RsvpRow>('rsvps', ['item_id', 'person_id']), busy()]);
    return { schedule: [...s.map((row) => R.toScheduleItem(row, r)), ...x.filter((k) => k.kind === 'schedule').map(R.busyToSchedule)] };
  },
  conflicts: async () => ({ conflicts: (await rows<R.ConflictRow>('member_conflicts', ['starts_at', 'id'])).map(R.toConflict) }),
  channels: async () => ({ channels: (await rows<R.ChannelRow>('channels', ['created_at', 'id'])).map(R.toChannel) }),
  messages: async () => ({ messages: (await rows<R.MessageRow>('messages', ['at', 'id'])).map(R.toMessage) }),
  reads: async () => ({ lastRead: R.toLastRead(await rows<R.ReadRow>('channel_reads', ['channel_id'])) }),
  performances: async () => {
    const [p, c] = await Promise.all([rows<R.PerformanceRow>('performances', ['starts_at', 'id']), rows<R.SeatClaimRow>('seat_claims', ['performance_id', 'seat_id'])]);
    return { performances: p.map((r) => R.toPerformance(r, c)) };
  },
  orders: async () => ({ orders: (await rows<R.OrderRow>('orders', ['at', 'id'])).map(R.toOrder) }),
  tickets: async () => ({ tickets: (await rows<R.TicketRow>('tickets', ['id'])).map(R.toTicket) }),
  layouts: async () => {
    const out: AppState['homeLayouts'] = {};
    for (const r of await rows<R.HomeLayoutRow>('home_layouts', ['person_id'])) out[r.person_id] = r.layout;
    return { homeLayouts: out };
  },
};

async function loadSeats(performanceId: string): Promise<Patch> {
  const claims = R.toClaims(await rows<R.SeatClaimRow>('seat_claims', ['seat_id'], ['performance_id', performanceId]));
  return (s) => ({ performances: s.performances.map((p) => (p.id === performanceId ? { ...p, seats: claims } : p)) });
}

// Newer loads win: a slow response never overwrites a newer one for the same slice.
const generation: Record<string, number> = {};

async function load(slices: Slice[]): Promise<void> {
  if (!LIVE || !authUserId) return;
  const base = new Set<BaseSlice>();
  const seatMaps = new Set<string>();
  for (const s of slices) {
    if (s.startsWith('seats:')) seatMaps.add(s.slice(6));
    else base.add(s as BaseSlice);
  }
  if (base.has('performances')) seatMaps.clear();
  const jobs = [
    ...[...base].map((s) => ({ key: s as string, run: loaders[s] })),
    ...[...seatMaps].map((id) => ({ key: `seats:${id}`, run: () => loadSeats(id) })),
  ].map((j) => ({ ...j, gen: (generation[j.key] = (generation[j.key] ?? 0) + 1) }));
  const results = await Promise.all(jobs.map((j) => j.run()));
  useStore.setState((s) => {
    let next: Partial<AppState> = {};
    results.forEach((patch, i) => {
      if (generation[jobs[i].key] !== jobs[i].gen) return; // superseded
      next = { ...next, ...(typeof patch === 'function' ? patch({ ...s, ...next } as AppState) : patch) };
    });
    return next;
  });
}

// ---------- staying fresh ----------

let pending = new Set<Slice>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Batch reload requests that arrive close together into one round of fetches. */
function scheduleLoad(slices: Slice[]) {
  for (const s of slices) pending.add(s);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const batch = [...pending];
    pending = new Set();
    timer = null;
    load(batch).catch((e) => console.warn('[sync]', errorMessage(e)));
  }, 250);
}

// Background checks while the app is open: most things every 20 s, seat maps (the biggest
// download) every minute. Screens that need more (seat picker, chat, door) use usePoll().
const BACKGROUND: Slice[] = ALL_SLICES.filter((s) => s !== 'performances' && s !== 'config');
let ticks = 0;
let poller: ReturnType<typeof setInterval> | null = null;

function startPolling() {
  stopPolling();
  ticks = 0;
  poller = setInterval(() => {
    if (useLive.getState().status !== 'ready' || RNAppState.currentState === 'background') return;
    ticks++;
    scheduleLoad(ticks % 3 === 0 ? ALL_SLICES : BACKGROUND);
  }, 20_000);
}

function stopPolling() {
  if (poller) clearInterval(poller);
  poller = null;
}

/** While a screen is open, re-check these parts of the state every `ms` milliseconds. */
export function usePoll(slices: Slice[], ms: number) {
  const key = slices.join('|');
  useEffect(() => {
    if (!LIVE) return;
    const list = key.split('|') as Slice[];
    scheduleLoad(list);
    const id = setInterval(() => {
      if (useLive.getState().status === 'ready' && RNAppState.currentState !== 'background') scheduleLoad(list);
    }, ms);
    return () => clearInterval(id);
  }, [key, ms]);
}

// ---------- session ----------

let authUserId: string | null = null;
let started = false;

async function onSession(session: auth.AuthSession | null) {
  if (!session) {
    authUserId = null;
    stopPolling();
    useStore.setState(emptyState());
    useLive.setState({ status: 'signedOut', error: undefined, email: undefined });
    return;
  }
  if (session.userId === authUserId && useLive.getState().status === 'ready') return;
  authUserId = session.userId;
  useLive.setState({ status: 'loading', error: undefined, email: session.email });
  try {
    // links this sign-in to the person with the same (verified) email, or adds a new renter
    const { data: personId, error } = await db().rpc('link_me');
    if (error) throw new Error(error.message);
    if (authUserId !== session.userId) return; // signed out meanwhile
    useStore.setState({ currentUserId: personId as string });
    await load(ALL_SLICES);
    startPolling();
    useLive.setState({ status: 'ready' });
  } catch (e) {
    if (authUserId === session.userId) useLive.setState({ status: 'error', error: errorMessage(e) });
  }
}

/** Call once at startup. Restores a saved session or shows sign-in. */
export function startLive() {
  if (!LIVE || started) return;
  started = true;
  setRefreshLoader(load);
  auth.onAuthChange((s) => void onSession(s));
  auth.loadSession().then((s) => onSession(s), () => onSession(null));
  RNAppState.addEventListener('change', (state) => {
    if (state === 'active' && useLive.getState().status === 'ready') scheduleLoad(ALL_SLICES);
  });
}

export async function retryLive() {
  authUserId = null;
  await onSession(await auth.loadSession());
}

export async function signOut() {
  await auth.signOut();
}
