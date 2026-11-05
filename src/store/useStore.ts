import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uid, ticketCode } from '@/lib/ids';
import { quoteRental } from '@/lib/pricing';
import { commitSale, holdSeats, orderTotals, priceFor, releaseHolds, releaseSeats, setBlocked } from '@/lib/seating';
import { buildSeed, DEFAULT_SETTINGS, OWNER_ID, VENUE } from '@/lib/seed';
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
  Ticket,
  User,
  VenueInfo,
} from '@/lib/types';

/**
 * Local-first app state. Every mutation goes through an action here so the same calls can
 * later be pointed at a real backend (see docs/BACKEND.md) without touching screens.
 */
export interface AppState {
  currentUserId: string;
  venue: VenueInfo;
  settings: RentalSettings;
  users: User[];
  bookings: Booking[];
  productions: Production[];
  schedule: ScheduleItem[];
  conflicts: MemberConflict[];
  channels: Channel[];
  messages: Message[];
  lastRead: Record<string, string>; // `${userId}:${channelId}` -> iso
  performances: Performance[];
  orders: Order[];
  tickets: Ticket[];

  switchUser(id: string): void;
  resetDemo(): void;
  updateVenue(v: Partial<VenueInfo>): void;
  updateSettings(s: Partial<RentalSettings>): void;

  // rentals
  createBooking(b: Omit<Booking, 'id' | 'createdAt' | 'quote' | 'payments' | 'status'> & { status?: Booking['status'] }): Booking;
  setBookingStatus(id: string, status: Booking['status']): void;
  updateBooking(id: string, patch: Partial<Booking>): void;
  addPayment(bookingId: string, p: Omit<Payment, 'id' | 'at'>): void;

  // productions
  createProduction(p: Omit<Production, 'id'>): Production;
  upsertScheduleItem(item: Omit<ScheduleItem, 'id' | 'rsvps'> & { id?: string }): ScheduleItem;
  deleteScheduleItem(id: string): void;
  rsvp(itemId: string, userId: string, r: Rsvp): void;
  addConflict(c: Omit<MemberConflict, 'id'>): void;
  removeConflict(id: string): void;
  addMember(productionId: string, user: Omit<User, 'id' | 'color' | 'role'>, groupIds: string[], part?: string): void;
  setMemberGroups(productionId: string, userId: string, groupIds: string[]): void;
  addGroup(productionId: string, name: string): void;
  sendMessage(channelId: string, text: string): void;
  markRead(channelId: string): void;
  openDirect(productionId: string, otherUserId: string): string;

  // ticketing
  createPerformance(p: Omit<Performance, 'id' | 'seats'>): Performance;
  updatePerformance(id: string, patch: Partial<Performance>): void;
  hold(performanceId: string, seatIds: string[]): void; // throws SeatUnavailableError
  release(performanceId: string, seatIds?: string[]): void;
  purchase(performanceId: string, seatIds: string[], buyer: { name: string; email: string }, method: Order['method']): Order; // throws
  refundTicket(ticketId: string): void;
  block(performanceId: string, seatIds: string[], blocked: boolean, note?: string): void;
  checkIn(code: string, performanceId: string): { ok: boolean; message: string; ticket?: Ticket };
}

const COLORS = ['#E8B04B', '#E26D5C', '#7FB7BE', '#9B8DE3', '#6CC596', '#F08FC0', '#5DA9E9'];

function fresh() {
  const seed = buildSeed(new Date());
  return {
    currentUserId: OWNER_ID,
    venue: VENUE,
    settings: DEFAULT_SETTINGS,
    lastRead: {} as Record<string, string>,
    ...seed,
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const patchPerf = (id: string, fn: (p: Performance) => Performance) =>
        set((s) => ({ performances: s.performances.map((p) => (p.id === id ? fn(p) : p)) }));
      const me = () => get().currentUserId;

      return {
        ...fresh(),

        switchUser: (id) => set({ currentUserId: id }),
        resetDemo: () => set({ ...fresh() }),
        updateVenue: (v) => set((s) => ({ venue: { ...s.venue, ...v } })),
        updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

        createBooking: (input) => {
          const { settings } = get();
          const quote = quoteRental(settings, input);
          const status = input.status ?? (settings.autoApprove ? 'awaiting_deposit' : 'inquiry');
          const b: Booking = {
            ...input,
            id: uid('b_'),
            createdAt: new Date().toISOString(),
            quote,
            payments: [],
            status,
            holdExpiresAt: status === 'awaiting_deposit' ? new Date(Date.now() + settings.holdHours * 3600000).toISOString() : undefined,
          };
          set((s) => ({ bookings: [...s.bookings, b] }));
          return b;
        },
        setBookingStatus: (id, status) =>
          set((s) => ({
            bookings: s.bookings.map((b) => {
              if (b.id !== id) return b;
              const holdExpiresAt = status === 'awaiting_deposit' ? new Date(Date.now() + s.settings.holdHours * 3600000).toISOString() : b.holdExpiresAt;
              return { ...b, status, holdExpiresAt };
            }),
          })),
        updateBooking: (id, patch) =>
          set((s) => ({
            bookings: s.bookings.map((b) => {
              if (b.id !== id) return b;
              const next = { ...b, ...patch };
              if (patch.start || patch.end || patch.packageId !== undefined || patch.addOnIds) next.quote = quoteRental(s.settings, next);
              return next;
            }),
          })),
        addPayment: (bookingId, p) =>
          set((s) => ({
            bookings: s.bookings.map((b) => {
              if (b.id !== bookingId) return b;
              const payments = [...b.payments, { ...p, id: uid('pay_'), at: new Date().toISOString() }];
              const paid = payments.reduce((t, x) => t + x.amount, 0);
              let status = b.status;
              // paying the deposit locks in the date automatically
              if ((status === 'awaiting_deposit' || status === 'inquiry') && paid >= b.quote.depositDue) status = 'confirmed';
              return { ...b, payments, status };
            }),
          })),

        createProduction: (p) => {
          const prod: Production = { ...p, id: uid('p_') };
          const channels: Channel[] = [
            { id: uid('ch_'), productionId: prod.id, name: 'Announcements', kind: 'announcements' },
            { id: uid('ch_'), productionId: prod.id, name: 'Full Company', kind: 'group' },
            ...prod.groups.map((g) => ({ id: uid('ch_'), productionId: prod.id, name: g.name, kind: 'group' as const, groupId: g.id })),
          ];
          set((s) => ({ productions: [...s.productions, prod], channels: [...s.channels, ...channels] }));
          return prod;
        },
        upsertScheduleItem: (item) => {
          const existing = item.id ? get().schedule.find((x) => x.id === item.id) : undefined;
          const next: ScheduleItem = { ...item, id: item.id ?? uid('s_'), rsvps: existing?.rsvps ?? {} };
          set((s) => ({ schedule: existing ? s.schedule.map((x) => (x.id === next.id ? next : x)) : [...s.schedule, next] }));
          return next;
        },
        deleteScheduleItem: (id) => set((s) => ({ schedule: s.schedule.filter((x) => x.id !== id) })),
        rsvp: (itemId, userId, r) =>
          set((s) => ({ schedule: s.schedule.map((x) => (x.id === itemId ? { ...x, rsvps: { ...x.rsvps, [userId]: r } } : x)) })),
        addConflict: (c) => set((s) => ({ conflicts: [...s.conflicts, { ...c, id: uid('c_') }] })),
        removeConflict: (id) => set((s) => ({ conflicts: s.conflicts.filter((c) => c.id !== id) })),
        addMember: (productionId, user, groupIds, part) => {
          const u: User = { ...user, id: uid('u_'), role: 'member', color: COLORS[get().users.length % COLORS.length] };
          set((s) => ({
            users: [...s.users, u],
            productions: s.productions.map((p) => (p.id === productionId ? { ...p, members: [...p.members, { userId: u.id, groupIds, part }] } : p)),
          }));
        },
        setMemberGroups: (productionId, userId, groupIds) =>
          set((s) => ({
            productions: s.productions.map((p) =>
              p.id === productionId ? { ...p, members: p.members.map((m) => (m.userId === userId ? { ...m, groupIds } : m)) } : p,
            ),
          })),
        addGroup: (productionId, name) => {
          const g = { id: uid('g_'), name, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
          set((s) => ({
            productions: s.productions.map((p) => (p.id === productionId ? { ...p, groups: [...p.groups, g] } : p)),
            channels: [...s.channels, { id: uid('ch_'), productionId, name, kind: 'group', groupId: g.id }],
          }));
        },
        sendMessage: (channelId, text) => {
          const msg: Message = { id: uid('m_'), channelId, userId: me(), text: text.trim(), at: new Date().toISOString() };
          if (!msg.text) return;
          set((s) => ({ messages: [...s.messages, msg], lastRead: { ...s.lastRead, [`${me()}:${channelId}`]: msg.at } }));
        },
        markRead: (channelId) => set((s) => ({ lastRead: { ...s.lastRead, [`${me()}:${channelId}`]: new Date().toISOString() } })),
        openDirect: (productionId, otherUserId) => {
          const mine = me();
          const existing = get().channels.find(
            (c) => c.kind === 'direct' && c.productionId === productionId && c.memberIds?.includes(mine) && c.memberIds?.includes(otherUserId),
          );
          if (existing) return existing.id;
          const ch: Channel = { id: uid('ch_'), productionId, name: 'Direct', kind: 'direct', memberIds: [mine, otherUserId] };
          set((s) => ({ channels: [...s.channels, ch] }));
          return ch.id;
        },

        createPerformance: (p) => {
          const perf: Performance = { ...p, id: uid('perf_'), seats: {} };
          set((s) => ({ performances: [...s.performances, perf] }));
          return perf;
        },
        updatePerformance: (id, patch) => patchPerf(id, (p) => ({ ...p, ...patch })),
        hold: (performanceId, seatIds) => {
          const p = get().performances.find((x) => x.id === performanceId);
          if (!p) return;
          const seats = holdSeats(p.seats, seatIds, me()); // throws if taken
          patchPerf(performanceId, (x) => ({ ...x, seats }));
        },
        release: (performanceId, seatIds) => patchPerf(performanceId, (p) => ({ ...p, seats: releaseHolds(p.seats, me(), seatIds) })),
        purchase: (performanceId, seatIds, buyer, method) => {
          const p = get().performances.find((x) => x.id === performanceId);
          if (!p) throw new Error('Performance not found');
          const orderId = uid('o_');
          const seats = commitSale(p.seats, seatIds, me(), orderId, new Date(), method === 'comp' ? 'comp' : 'sold'); // throws -> nothing changes
          const totals = method === 'comp' ? { subtotal: 0, fees: 0, total: 0 } : orderTotals(seatIds, p.prices);
          const order: Order = { id: orderId, performanceId, seatIds, buyerName: buyer.name, buyerEmail: buyer.email, buyerUserId: me(), ...totals, at: new Date().toISOString(), method };
          const existing = new Set(get().tickets.map((t) => t.code));
          const tickets: Ticket[] = seatIds.map((seatId) => {
            let code = ticketCode();
            while (existing.has(code)) code = ticketCode();
            existing.add(code);
            return { id: uid('t_'), orderId, performanceId, seatId, code, price: method === 'comp' ? 0 : priceFor(seatId, p.prices) };
          });
          set((s) => ({
            performances: s.performances.map((x) => (x.id === performanceId ? { ...x, seats } : x)),
            orders: [...s.orders, order],
            tickets: [...s.tickets, ...tickets],
          }));
          return order;
        },
        refundTicket: (ticketId) => {
          const t = get().tickets.find((x) => x.id === ticketId);
          if (!t || t.void) return;
          set((s) => ({
            tickets: s.tickets.map((x) => (x.id === ticketId ? { ...x, void: true } : x)),
            performances: s.performances.map((p) => (p.id === t.performanceId ? { ...p, seats: releaseSeats(p.seats, [t.seatId]) } : p)),
          }));
        },
        block: (performanceId, seatIds, blocked, note) => patchPerf(performanceId, (p) => ({ ...p, seats: setBlocked(p.seats, seatIds, blocked, note) })),
        checkIn: (code, performanceId) => {
          const t = get().tickets.find((x) => x.code === code);
          if (!t) return { ok: false, message: 'Ticket not found' };
          if (t.void) return { ok: false, message: 'Ticket was refunded / voided', ticket: t };
          if (t.performanceId !== performanceId) return { ok: false, message: 'Ticket is for a different performance', ticket: t };
          if (t.checkedInAt) return { ok: false, message: 'Already checked in', ticket: t };
          const at = new Date().toISOString();
          set((s) => ({ tickets: s.tickets.map((x) => (x.id === t.id ? { ...x, checkedInAt: at } : x)) }));
          return { ok: true, message: 'Welcome in!', ticket: { ...t, checkedInAt: at } };
        },
      };
    },
    {
      name: 'dream-theatre-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

export function useCurrentUser(): User {
  const id = useStore((s) => s.currentUserId);
  const users = useStore((s) => s.users);
  return users.find((u) => u.id === id) ?? users[0];
}

export function useIsOwner(): boolean {
  return useCurrentUser().role === 'owner';
}
