// Database rows (db/migrations) <-> app types (src/lib/types.ts). Pure functions, no I/O.

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
  PriceTier,
  Production,
  Quote,
  RentalSettings,
  Rsvp,
  ScheduleItem,
  SeatClaim,
  Ticket,
  User,
  VenueInfo,
} from '../types';

type Nullable<T> = T | null;

export interface ConfigRow {
  id: number;
  venue: VenueInfo;
  settings: RentalSettings;
  house: HouseConfig;
  setup: Record<string, boolean>;
}

export interface PersonRow {
  id: string;
  auth_user_id?: Nullable<string>;
  name: string;
  email: string;
  phone: Nullable<string>;
  role: User['role'];
  color: string;
}

export interface BookingRow {
  id: string;
  renter_id: Nullable<string>;
  title: string;
  event_type: string;
  organization: Nullable<string>;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  starts_at: string;
  ends_at: string;
  attendance: number;
  package_id: Nullable<string>;
  add_on_ids: string[];
  notes: Nullable<string>;
  status: Booking['status'];
  quote: Quote;
  hold_expires_at: Nullable<string>;
  ticketed: boolean;
  is_public: boolean;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  amount: number | string;
  kind: Payment['kind'];
  method: Payment['method'];
  reference: Nullable<string>;
  at: string;
}

/** A busy slot from stage_busy(): someone else's booking or rehearsal, details removed. */
export interface BusyRow {
  kind: 'booking' | 'schedule';
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: Nullable<Booking['status']>;
  hold_expires_at: Nullable<string>;
  is_public: Nullable<boolean>;
  production_id: Nullable<string>;
  space: Nullable<string>;
}

export interface ProductionRow {
  id: string;
  title: string;
  tagline: Nullable<string>;
  color: string;
  opening_date: string;
  closing_date: string;
  groups: Production['groups'];
}

export interface MembershipRow {
  production_id: string;
  person_id: string;
  group_ids: string[];
  part: Nullable<string>;
  is_director: boolean;
}

export interface ScheduleRow {
  id: string;
  production_id: string;
  title: string;
  kind: ScheduleItem['kind'];
  space: ScheduleItem['space'];
  starts_at: string;
  ends_at: string;
  group_ids: string[];
  notes: Nullable<string>;
}

export interface RsvpRow {
  item_id: string;
  person_id: string;
  answer: Rsvp;
}

export interface ConflictRow {
  id: string;
  production_id: string;
  person_id: string;
  starts_at: string;
  ends_at: string;
  note: string;
}

export interface ChannelRow {
  id: string;
  production_id: string;
  name: string;
  kind: Channel['kind'];
  group_id: Nullable<string>;
  member_ids: Nullable<string[]>;
}

export interface MessageRow {
  id: string;
  channel_id: string;
  person_id: string;
  body: string;
  at: string;
}

export interface ReadRow {
  person_id: string;
  channel_id: string;
  read_at: string;
}

export interface PerformanceRow {
  id: string;
  title: string;
  subtitle: Nullable<string>;
  production_id: Nullable<string>;
  booking_id: Nullable<string>;
  starts_at: string;
  doors_mins: number;
  prices: Record<PriceTier, number>;
  on_sale: boolean;
}

export interface SeatClaimRow {
  performance_id: string;
  seat_id: string;
  status: SeatClaim['status'];
  holder_id: Nullable<string>;
  hold_expires_at: Nullable<string>;
  order_id: Nullable<string>;
  note: Nullable<string>;
}

export interface OrderRow {
  id: string;
  performance_id: string;
  seat_ids: string[];
  buyer_id: Nullable<string>;
  buyer_name: string;
  buyer_email: string;
  subtotal: number | string;
  fees: number | string;
  total: number | string;
  method: Order['method'];
  refunded: boolean;
  at: string;
}

export interface TicketRow {
  id: string;
  order_id: string;
  performance_id: string;
  seat_id: string;
  code: string;
  price: number | string;
  checked_in_at: Nullable<string>;
  void: boolean;
}

export interface HomeLayoutRow {
  person_id: string;
  layout: HomeLayout;
}

// Postgres returns timestamps as "2026-11-05T23:00:00+00:00"; the app compares ISO strings, so
// normalise everything to Date.toISOString() ("…T23:00:00.000Z").
const iso = (s: string) => new Date(s).toISOString();
const isoOpt = (s: Nullable<string> | undefined) => (s ? iso(s) : undefined);
const opt = <T>(v: Nullable<T> | undefined): T | undefined => (v === null ? undefined : v);
const num = (v: number | string) => Number(v);

// ---------- people ----------

export function toUser(r: PersonRow): User {
  return { id: r.id, name: r.name, email: r.email, phone: opt(r.phone), role: r.role, color: r.color };
}

export function fromUser(u: Partial<User> & { id: string }): Partial<PersonRow> {
  const row: Partial<PersonRow> = { id: u.id };
  if (u.name !== undefined) row.name = u.name;
  if (u.email !== undefined) row.email = u.email;
  if ('phone' in u) row.phone = u.phone ?? null;
  if (u.role !== undefined) row.role = u.role;
  if (u.color !== undefined) row.color = u.color;
  return row;
}

// ---------- rentals ----------

export function toPayment(r: PaymentRow): Payment {
  return { id: r.id, amount: num(r.amount), kind: r.kind, method: r.method, at: iso(r.at), reference: opt(r.reference) };
}

export function toBooking(r: BookingRow, payments: PaymentRow[] = []): Booking {
  return {
    id: r.id,
    title: r.title,
    eventType: r.event_type as Booking['eventType'],
    organization: opt(r.organization),
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    renterId: opt(r.renter_id),
    start: iso(r.starts_at),
    end: iso(r.ends_at),
    attendance: r.attendance,
    packageId: opt(r.package_id),
    addOnIds: r.add_on_ids ?? [],
    notes: opt(r.notes),
    status: r.status,
    quote: r.quote,
    payments: payments
      .filter((p) => p.booking_id === r.id)
      .map(toPayment)
      .sort((a, b) => a.at.localeCompare(b.at)),
    holdExpiresAt: isoOpt(r.hold_expires_at),
    createdAt: iso(r.created_at),
    ticketed: r.ticketed,
    isPublic: r.is_public,
  };
}

const BOOKING_COLUMNS: [keyof Booking, keyof BookingRow][] = [
  ['title', 'title'],
  ['eventType', 'event_type'],
  ['organization', 'organization'],
  ['contactName', 'contact_name'],
  ['contactEmail', 'contact_email'],
  ['contactPhone', 'contact_phone'],
  ['renterId', 'renter_id'],
  ['start', 'starts_at'],
  ['end', 'ends_at'],
  ['attendance', 'attendance'],
  ['packageId', 'package_id'],
  ['addOnIds', 'add_on_ids'],
  ['notes', 'notes'],
  ['status', 'status'],
  ['quote', 'quote'],
  ['holdExpiresAt', 'hold_expires_at'],
  ['createdAt', 'created_at'],
  ['ticketed', 'ticketed'],
  ['isPublic', 'is_public'],
];

/** Row for insert (full booking) or update (only the keys present in `b`). Payments are separate. */
export function fromBooking(b: Partial<Booking>): Partial<BookingRow> {
  const row: Record<string, unknown> = {};
  if (b.id !== undefined) row.id = b.id;
  for (const [k, col] of BOOKING_COLUMNS) if (k in b) row[col] = b[k] ?? null;
  return row as Partial<BookingRow>;
}

const EMPTY_QUOTE = (start: string): Quote => ({
  lines: [],
  rentalTotal: 0,
  securityDeposit: 0,
  depositDue: 0,
  balanceDue: 0,
  balanceDueDate: start,
  hours: 0,
});

/** Someone else's booking, as a placeholder that only blocks the calendar. */
export function busyToBooking(r: BusyRow): Booking {
  const start = iso(r.starts_at);
  return {
    id: r.id,
    title: r.title,
    eventType: 'Other',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    start,
    end: iso(r.ends_at),
    attendance: 0,
    addOnIds: [],
    status: r.status ?? 'confirmed',
    quote: EMPTY_QUOTE(start),
    payments: [],
    holdExpiresAt: isoOpt(r.hold_expires_at),
    createdAt: start,
    ticketed: false,
    isPublic: r.is_public ?? false,
  };
}

/** Another production's Main Stage call, as a placeholder that only blocks the calendar. */
export function busyToSchedule(r: BusyRow): ScheduleItem {
  return {
    id: r.id,
    productionId: r.production_id ?? '',
    title: r.title,
    kind: 'Rehearsal',
    start: iso(r.starts_at),
    end: iso(r.ends_at),
    space: (r.space ?? 'Main Stage') as ScheduleItem['space'],
    groupIds: [],
    rsvps: {},
  };
}

// ---------- productions ----------

export function toProduction(r: ProductionRow, members: MembershipRow[] = []): Production {
  return {
    id: r.id,
    title: r.title,
    tagline: opt(r.tagline),
    color: r.color,
    openingDate: iso(r.opening_date),
    closingDate: iso(r.closing_date),
    groups: r.groups ?? [],
    members: members
      .filter((m) => m.production_id === r.id)
      .map((m) => ({ userId: m.person_id, groupIds: m.group_ids ?? [], part: opt(m.part), ...(m.is_director ? { isDirector: true } : {}) })),
  };
}

export function fromProduction(p: Partial<Production>): Partial<ProductionRow> {
  const row: Partial<ProductionRow> = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.title !== undefined) row.title = p.title;
  if ('tagline' in p) row.tagline = p.tagline ?? null;
  if (p.color !== undefined) row.color = p.color;
  if (p.openingDate !== undefined) row.opening_date = p.openingDate;
  if (p.closingDate !== undefined) row.closing_date = p.closingDate;
  if (p.groups !== undefined) row.groups = p.groups;
  return row;
}

export function fromMembership(productionId: string, m: Production['members'][number]): MembershipRow {
  return { production_id: productionId, person_id: m.userId, group_ids: m.groupIds, part: m.part ?? null, is_director: !!m.isDirector };
}

export function toScheduleItem(r: ScheduleRow, rsvps: RsvpRow[] = []): ScheduleItem {
  const answers: Record<string, Rsvp> = {};
  for (const x of rsvps) if (x.item_id === r.id) answers[x.person_id] = x.answer;
  return {
    id: r.id,
    productionId: r.production_id,
    title: r.title,
    kind: r.kind,
    start: iso(r.starts_at),
    end: iso(r.ends_at),
    space: r.space,
    groupIds: r.group_ids ?? [],
    notes: opt(r.notes),
    rsvps: answers,
  };
}

export function fromScheduleItem(s: Omit<ScheduleItem, 'rsvps'>): ScheduleRow {
  return {
    id: s.id,
    production_id: s.productionId,
    title: s.title,
    kind: s.kind,
    space: s.space,
    starts_at: s.start,
    ends_at: s.end,
    group_ids: s.groupIds,
    notes: s.notes ?? null,
  };
}

export function toConflict(r: ConflictRow): MemberConflict {
  return { id: r.id, userId: r.person_id, productionId: r.production_id, start: iso(r.starts_at), end: iso(r.ends_at), note: r.note };
}

export function fromConflict(c: MemberConflict): ConflictRow {
  return { id: c.id, production_id: c.productionId, person_id: c.userId, starts_at: c.start, ends_at: c.end, note: c.note };
}

export function toChannel(r: ChannelRow): Channel {
  return {
    id: r.id,
    productionId: r.production_id,
    name: r.name,
    kind: r.kind,
    ...(r.group_id ? { groupId: r.group_id } : {}),
    ...(r.member_ids ? { memberIds: r.member_ids } : {}),
  };
}

export function fromChannel(c: Channel): ChannelRow {
  return { id: c.id, production_id: c.productionId, name: c.name, kind: c.kind, group_id: c.groupId ?? null, member_ids: c.memberIds ?? null };
}

export function toMessage(r: MessageRow): Message {
  return { id: r.id, channelId: r.channel_id, userId: r.person_id, text: r.body, at: iso(r.at) };
}

export function toLastRead(rows: ReadRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) out[`${r.person_id}:${r.channel_id}`] = iso(r.read_at);
  return out;
}

// ---------- ticketing ----------

export function toClaims(rows: SeatClaimRow[]): Record<string, SeatClaim> {
  const out: Record<string, SeatClaim> = {};
  for (const r of rows) {
    const c: SeatClaim = { status: r.status };
    if (r.holder_id) c.holderId = r.holder_id;
    if (r.hold_expires_at) c.holdExpiresAt = iso(r.hold_expires_at);
    if (r.order_id) c.orderId = r.order_id;
    if (r.note) c.note = r.note;
    out[r.seat_id] = c;
  }
  return out;
}

export function toPerformance(r: PerformanceRow, claims: SeatClaimRow[] = []): Performance {
  return {
    id: r.id,
    title: r.title,
    subtitle: opt(r.subtitle),
    productionId: opt(r.production_id),
    bookingId: opt(r.booking_id),
    start: iso(r.starts_at),
    doorsMins: r.doors_mins,
    prices: r.prices,
    onSale: r.on_sale,
    seats: toClaims(claims.filter((c) => c.performance_id === r.id)),
  };
}

export function fromPerformance(p: Partial<Omit<Performance, 'seats'>>): Partial<PerformanceRow> {
  const row: Partial<PerformanceRow> = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.title !== undefined) row.title = p.title;
  if ('subtitle' in p) row.subtitle = p.subtitle ?? null;
  if ('productionId' in p) row.production_id = p.productionId ?? null;
  if ('bookingId' in p) row.booking_id = p.bookingId ?? null;
  if (p.start !== undefined) row.starts_at = p.start;
  if (p.doorsMins !== undefined) row.doors_mins = p.doorsMins;
  if (p.prices !== undefined) row.prices = p.prices;
  if (p.onSale !== undefined) row.on_sale = p.onSale;
  return row;
}

export function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    performanceId: r.performance_id,
    seatIds: r.seat_ids ?? [],
    buyerName: r.buyer_name,
    buyerEmail: r.buyer_email,
    buyerUserId: opt(r.buyer_id),
    subtotal: num(r.subtotal),
    fees: num(r.fees),
    total: num(r.total),
    at: iso(r.at),
    method: r.method,
    ...(r.refunded ? { refunded: true } : {}),
  };
}

export function toTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    orderId: r.order_id,
    performanceId: r.performance_id,
    seatId: r.seat_id,
    code: r.code,
    price: num(r.price),
    ...(r.checked_in_at ? { checkedInAt: iso(r.checked_in_at) } : {}),
    ...(r.void ? { void: true } : {}),
  };
}

/** "seats_unavailable: F-C7, F-C8" from hold_seats()/purchase_seats() -> the seat ids. */
export function unavailableSeats(message: string): string[] | null {
  const m = /seats_unavailable:\s*(.*)$/.exec(message);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim()).filter((s) => /^.+-[LCR]\d+$/.test(s));
}
