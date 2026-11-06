// Writes to the shared backend. Each function throws an Error with a readable message on failure.
// Reads and live updates live in src/store/sync.ts.

import type { HomeLayout } from '../home';
import type { HouseConfig } from '../seating';
import type {
  Booking,
  Channel,
  MemberConflict,
  Message,
  Order,
  Payment,
  Performance,
  Production,
  RentalSettings,
  Rsvp,
  ScheduleItem,
  User,
  VenueInfo,
} from '../types';
import { db } from './db';
import * as R from './rows';

type Result = { error: { message: string } | null };

async function run(q: PromiseLike<Result>): Promise<void> {
  const { error } = await q;
  if (error) throw new Error(error.message);
}

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const omitId = <T extends { id?: unknown }>(row: T) => {
  const { id: _id, ...rest } = row;
  return rest;
};

// ---------- venue config ----------

export function updateConfig(patch: { venue?: VenueInfo; settings?: RentalSettings; house?: HouseConfig; setup?: Record<string, boolean> }) {
  return run(db().from('venue_config').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1));
}

// ---------- people ----------

export const insertPerson = (u: User) => run(db().from('people').insert(R.fromUser(u)));
export const updatePerson = (id: string, patch: Partial<Omit<User, 'id'>>) => run(db().from('people').update(omitId(R.fromUser({ ...patch, id }))).eq('id', id));
export const deletePerson = (id: string) => run(db().from('people').delete().eq('id', id));

export function saveHomeLayout(personId: string, layout: HomeLayout | null) {
  return layout
    ? run(db().from('home_layouts').upsert({ person_id: personId, layout }))
    : run(db().from('home_layouts').delete().eq('person_id', personId));
}

// ---------- rentals ----------

export const insertBooking = (b: Booking) => run(db().from('bookings').insert(R.fromBooking(b)));
export const updateBooking = (id: string, patch: Partial<Booking>) => run(db().from('bookings').update(omitId(R.fromBooking(patch))).eq('id', id));

export function addPayment(bookingId: string, p: Omit<Payment, 'id' | 'at'>) {
  return rpc('add_payment', { p_booking: bookingId, p_amount: p.amount, p_kind: p.kind, p_method: p.method, p_reference: p.reference ?? null });
}

// ---------- productions ----------

export async function insertProduction(p: Production, channels: Channel[]) {
  await run(db().from('productions').insert(R.fromProduction(p)));
  if (p.members.length) await run(db().from('memberships').insert(p.members.map((m) => R.fromMembership(p.id, m))));
  if (channels.length) await run(db().from('channels').insert(channels.map(R.fromChannel)));
}

export async function addGroup(productionId: string, groups: Production['groups'], channel: Channel) {
  await run(db().from('productions').update({ groups }).eq('id', productionId));
  await run(db().from('channels').insert(R.fromChannel(channel)));
}

export const upsertScheduleItem = (s: Omit<ScheduleItem, 'rsvps'>) => run(db().from('schedule_items').upsert(R.fromScheduleItem(s)));
export const deleteScheduleItem = (id: string) => run(db().from('schedule_items').delete().eq('id', id));
export const setRsvp = (itemId: string, personId: string, answer: Rsvp) =>
  run(db().from('rsvps').upsert({ item_id: itemId, person_id: personId, answer }));

export const insertConflict = (c: MemberConflict) => run(db().from('member_conflicts').insert(R.fromConflict(c)));
export const deleteConflict = (id: string) => run(db().from('member_conflicts').delete().eq('id', id));

export function addMember(productionId: string, u: Pick<User, 'id' | 'name' | 'email' | 'color'>, groupIds: string[], part?: string) {
  return rpc<string>('add_member', {
    p_production: productionId,
    p_id: u.id,
    p_name: u.name,
    p_email: u.email,
    p_group_ids: groupIds,
    p_part: part ?? null,
    p_color: u.color,
  });
}

export const setMemberGroups = (productionId: string, personId: string, groupIds: string[]) =>
  run(db().from('memberships').update({ group_ids: groupIds }).eq('production_id', productionId).eq('person_id', personId));

export const insertChannel = (c: Channel) => run(db().from('channels').insert(R.fromChannel(c)));

export async function sendMessage(m: Message) {
  await run(db().from('messages').insert({ id: m.id, channel_id: m.channelId, person_id: m.userId, body: m.text }));
  await markRead(m.userId, m.channelId, new Date().toISOString());
}

export const markRead = (personId: string, channelId: string, at: string) =>
  run(db().from('channel_reads').upsert({ person_id: personId, channel_id: channelId, read_at: at }));

// ---------- ticketing ----------

export const insertPerformance = (p: Omit<Performance, 'seats'>) => run(db().from('performances').insert(R.fromPerformance(p)));
export const updatePerformance = (id: string, patch: Partial<Omit<Performance, 'seats'>>) =>
  run(db().from('performances').update(omitId(R.fromPerformance(patch))).eq('id', id));
export const deletePerformance = (id: string) => run(db().from('performances').delete().eq('id', id));

export const holdSeats = (performanceId: string, seatIds: string[]) => rpc('hold_seats', { p_performance: performanceId, p_seats: seatIds });
export const releaseSeats = (performanceId: string, seatIds?: string[]) => rpc('release_seats', { p_performance: performanceId, p_seats: seatIds ?? null });
export const blockSeats = (performanceId: string, seatIds: string[], blocked: boolean, note?: string) =>
  rpc('block_seats', { p_performance: performanceId, p_seats: seatIds, p_blocked: blocked, p_note: note ?? null });
export const refundTicket = (ticketId: string) => rpc('refund_ticket', { p_ticket: ticketId });

export function purchaseSeats(performanceId: string, seatIds: string[], buyer: { name: string; email: string }, method: Order['method']) {
  return rpc<{ orderId: string }>('purchase_seats', {
    p_performance: performanceId,
    p_seats: seatIds,
    p_buyer_name: buyer.name,
    p_buyer_email: buyer.email,
    p_method: method,
  });
}

export const checkIn = (code: string, performanceId: string) =>
  rpc<{ ok: boolean; message: string; ticketId?: string }>('check_in', { p_code: code, p_performance: performanceId });
