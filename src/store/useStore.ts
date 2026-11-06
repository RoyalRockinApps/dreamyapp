import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { alert } from '@/components/alert';
import { normalizeLayout, type HomeLayout } from '@/lib/home';
import { uid, ticketCode } from '@/lib/ids';
import { quoteRental } from '@/lib/pricing';
import * as api from '@/lib/remote/api';
import { refresh, type Slice } from '@/lib/remote/bus';
import { unavailableSeats } from '@/lib/remote/rows';
import { claimsOutside, commitSale, configureHouse, DEFAULT_HOUSE, holdSeats, orderTotals, priceFor, releaseHolds, releaseSeats, SeatUnavailableError, setBlocked, type HouseConfig } from '@/lib/seating';
import { buildSeed, DEFAULT_SETTINGS, OWNER_ID, VENUE } from '@/lib/seed';
import { LIVE } from '@/lib/backend';
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
 * App state. Every mutation goes through an action here.
 *
 * Demo mode (no backend configured): state lives on this device, persisted to AsyncStorage.
 * Live mode (src/lib/backend.ts): the screen updates immediately, the change is sent to Neon,
 * and src/store/sync.ts keeps the state in step with the server. Seat holds, ticket sales and
 * check-in wait for the server, which has the final say.
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
  house: HouseConfig;
  /** demo-mode owner sign-in for the admin portal (live mode uses real accounts) */
  adminPin: string;
  /** admin setup checklist: sections the owner has reviewed & saved */
  setup: Record<string, boolean>;
  markSetup(key: string): void;
  /** per-person home screen layout (missing = role default) */
  homeLayouts: Record<string, HomeLayout>;
  setHomeLayout(userId: string, layout: HomeLayout | null): void;

  switchUser(id: string): void;
  updateHouse(h: HouseConfig): void; // throws if sold/blocked seats would vanish
  setAdminPin(pin: string): void;
  addUser(u: Omit<User, 'id' | 'color'>): User;
  updateUser(id: string, patch: Partial<Omit<User, 'id'>>): void;
  removeUser(id: string): void;
  deletePerformance(id: string): void; // throws if tickets were sold
  exportData(): string;
  importData(json: string): void; // throws on invalid data
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
  hold(performanceId: string, seatIds: string[]): Promise<void>; // rejects with SeatUnavailableError
  release(performanceId: string, seatIds?: string[]): void;
  purchase(performanceId: string, seatIds: string[], buyer: { name: string; email: string }, method: Order['method']): Promise<Order>; // rejects
  refundTicket(ticketId: string): void;
  block(performanceId: string, seatIds: string[], blocked: boolean, note?: string): void;
  checkIn(code: string, performanceId: string): Promise<{ ok: boolean; message: string; ticket?: Ticket }>;
}

const COLORS = ['#E8B04B', '#E26D5C', '#7FB7BE', '#9B8DE3', '#6CC596', '#F08FC0', '#5DA9E9'];

type Data = Pick<AppState, (typeof DATA_KEYS)[number]>;

function fresh(): Data {
  const seed = buildSeed(new Date());
  return {
    currentUserId: OWNER_ID,
    venue: VENUE,
    settings: DEFAULT_SETTINGS,
    lastRead: {},
    house: DEFAULT_HOUSE,
    adminPin: '2020',
    setup: {},
    homeLayouts: {},
    ...seed,
  };
}

/** Live mode starts empty and fills from the server after sign-in. */
export function emptyState(): Data {
  return {
    currentUserId: '',
    venue: VENUE,
    settings: DEFAULT_SETTINGS,
    lastRead: {},
    house: DEFAULT_HOUSE,
    adminPin: '',
    setup: {},
    homeLayouts: {},
    users: [],
    bookings: [],
    productions: [],
    schedule: [],
    conflicts: [],
    channels: [],
    messages: [],
    performances: [],
    orders: [],
    tickets: [],
  };
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';
}

/**
 * Live mode: send a change to the server after the screen has already updated. If it fails,
 * say so (when `what` is given) and reload those parts from the server so the screen is right again.
 */
function push(what: string | null, slices: Slice[], write: () => Promise<unknown>, reloadAfter = false) {
  if (!LIVE) return;
  write()
    .then(() => (reloadAfter ? refresh(slices) : undefined))
    .catch((e) => {
      if (what) alert(`Couldn’t save ${what}`, errorMessage(e));
      return refresh(slices);
    })
    .catch(() => {});
}

/** Server said some seats are taken: reload that seat map and turn it into the app's own error. */
async function seatError(e: unknown, performanceId: string, seatIds: string[]): Promise<never> {
  const taken = unavailableSeats(errorMessage(e));
  await refresh([`seats:${performanceId}`]).catch(() => {});
  if (taken) throw new SeatUnavailableError(taken.length ? taken : seatIds);
  throw e;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const patchPerf = (id: string, fn: (p: Performance) => Performance) =>
        set((s) => ({ performances: s.performances.map((p) => (p.id === id ? fn(p) : p)) }));
      const me = () => get().currentUserId;
      const seats = (performanceId: string): Slice => `seats:${performanceId}`;

      return {
        ...(LIVE ? emptyState() : fresh()),

        switchUser: (id) => set({ currentUserId: id }),
        resetDemo: () => {
          if (LIVE) return;
          const f = fresh();
          configureHouse(f.house);
          set({ ...f });
        },
        updateHouse: (h) => {
          const lost = claimsOutside(h, get().performances.map((p) => p.seats));
          if (lost.length) throw new Error(`${lost.length} sold or held-back seat${lost.length > 1 ? 's' : ''} (${lost.slice(0, 6).join(', ')}${lost.length > 6 ? '…' : ''}) would disappear. Refund or release them first.`);
          configureHouse(h);
          set({ house: h });
          push('the seating chart', ['config'], () => api.updateConfig({ house: h }));
        },
        setAdminPin: (pin) => set({ adminPin: pin }),
        markSetup: (key) => {
          set((s) => ({ setup: { ...s.setup, [key]: true } }));
          push(null, ['config'], () => api.updateConfig({ setup: get().setup }));
        },
        setHomeLayout: (userId, layout) => {
          set((s) => {
            const next = { ...s.homeLayouts };
            if (layout) next[userId] = layout;
            else delete next[userId];
            return { homeLayouts: next };
          });
          push('your home screen', ['layouts'], () => api.saveHomeLayout(userId, layout));
        },
        addUser: (u) => {
          const user: User = { ...u, id: uid('u_'), color: COLORS[get().users.length % COLORS.length] };
          set((s) => ({ users: [...s.users, user] }));
          push(user.name, ['people'], () => api.insertPerson(user));
          return user;
        },
        updateUser: (id, patch) => {
          set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
          push('this person', ['people'], () => api.updatePerson(id, patch));
        },
        removeUser: (id) => {
          set((s) => ({
            users: s.users.filter((u) => u.id !== id),
            productions: s.productions.map((p) => ({ ...p, members: p.members.filter((m) => m.userId !== id) })),
          }));
          push('the removal', ['people', 'productions'], () => api.deletePerson(id));
        },
        deletePerformance: (id) => {
          if (get().tickets.some((t) => t.performanceId === id && !t.void)) throw new Error('Tickets have been sold for this performance. Refund them or take it off sale instead.');
          set((s) => ({ performances: s.performances.filter((p) => p.id !== id) }));
          push('the deletion', ['performances'], () => api.deletePerformance(id));
        },
        exportData: () => {
          const { currentUserId: _c, lastRead: _l, ...data } = pickData(get());
          return JSON.stringify({ app: 'dream-theatre', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
        },
        importData: (json) => {
          if (LIVE) throw new Error('Restoring a backup is only available in the on-device demo.');
          const parsed = JSON.parse(json);
          const data = parsed?.data;
          if (parsed?.app !== 'dream-theatre' || !data || !Array.isArray(data.bookings) || !Array.isArray(data.users) || !data.settings) throw new Error('This file is not a Dream Theatre export.');
          const house: HouseConfig = data.house ?? DEFAULT_HOUSE;
          configureHouse(house);
          set((s) => ({ ...data, house, settings: { ...DEFAULT_SETTINGS, ...data.settings }, currentUserId: data.users.some((u: User) => u.id === s.currentUserId) ? s.currentUserId : OWNER_ID }));
        },
        updateVenue: (v) => {
          set((s) => ({ venue: { ...s.venue, ...v } }));
          push('the venue profile', ['config'], () => api.updateConfig({ venue: get().venue }));
        },
        updateSettings: (patch) => {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          push('the settings', ['config'], () => api.updateConfig({ settings: get().settings }));
        },

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
          push('your booking request', ['bookings'], () => api.insertBooking(b));
          return b;
        },
        setBookingStatus: (id, status) => {
          set((s) => ({
            bookings: s.bookings.map((b) => {
              if (b.id !== id) return b;
              const holdExpiresAt = status === 'awaiting_deposit' ? new Date(Date.now() + s.settings.holdHours * 3600000).toISOString() : b.holdExpiresAt;
              return { ...b, status, holdExpiresAt };
            }),
          }));
          const b = get().bookings.find((x) => x.id === id);
          if (b) push('the booking', ['bookings'], () => api.updateBooking(id, { status, holdExpiresAt: b.holdExpiresAt }));
        },
        updateBooking: (id, patch) => {
          let changed: Partial<Booking> = patch;
          set((s) => ({
            bookings: s.bookings.map((b) => {
              if (b.id !== id) return b;
              const next = { ...b, ...patch };
              if (patch.start || patch.end || patch.packageId !== undefined || patch.addOnIds) {
                next.quote = quoteRental(s.settings, next);
                changed = { ...patch, quote: next.quote };
              }
              return next;
            }),
          }));
          push('the booking', ['bookings'], () => api.updateBooking(id, changed));
        },
        addPayment: (bookingId, p) => {
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
          }));
          push('the payment', ['bookings'], () => api.addPayment(bookingId, p), true);
        },

        createProduction: (p) => {
          const prod: Production = { ...p, id: uid('p_') };
          const channels: Channel[] = [
            { id: uid('ch_'), productionId: prod.id, name: 'Announcements', kind: 'announcements' },
            { id: uid('ch_'), productionId: prod.id, name: 'Full Company', kind: 'group' },
            ...prod.groups.map((g) => ({ id: uid('ch_'), productionId: prod.id, name: g.name, kind: 'group' as const, groupId: g.id })),
          ];
          set((s) => ({ productions: [...s.productions, prod], channels: [...s.channels, ...channels] }));
          push('the production', ['productions', 'channels'], () => api.insertProduction(prod, channels));
          return prod;
        },
        upsertScheduleItem: (item) => {
          const existing = item.id ? get().schedule.find((x) => x.id === item.id) : undefined;
          const next: ScheduleItem = { ...item, id: item.id ?? uid('s_'), rsvps: existing?.rsvps ?? {} };
          set((s) => ({ schedule: existing ? s.schedule.map((x) => (x.id === next.id ? next : x)) : [...s.schedule, next] }));
          push('the call', ['schedule'], () => api.upsertScheduleItem(next));
          return next;
        },
        deleteScheduleItem: (id) => {
          set((s) => ({ schedule: s.schedule.filter((x) => x.id !== id) }));
          push('the deletion', ['schedule'], () => api.deleteScheduleItem(id));
        },
        rsvp: (itemId, userId, r) => {
          set((s) => ({ schedule: s.schedule.map((x) => (x.id === itemId ? { ...x, rsvps: { ...x.rsvps, [userId]: r } } : x)) }));
          push('your RSVP', ['schedule'], () => api.setRsvp(itemId, userId, r));
        },
        addConflict: (c) => {
          const conflict = { ...c, id: uid('c_') };
          set((s) => ({ conflicts: [...s.conflicts, conflict] }));
          push('the conflict', ['conflicts'], () => api.insertConflict(conflict));
        },
        removeConflict: (id) => {
          set((s) => ({ conflicts: s.conflicts.filter((c) => c.id !== id) }));
          push('the change', ['conflicts'], () => api.deleteConflict(id));
        },
        addMember: (productionId, user, groupIds, part) => {
          const u: User = { ...user, id: uid('u_'), role: 'member', color: COLORS[get().users.length % COLORS.length] };
          set((s) => ({
            users: [...s.users, u],
            productions: s.productions.map((p) => (p.id === productionId ? { ...p, members: [...p.members, { userId: u.id, groupIds, part }] } : p)),
          }));
          push(u.name, ['people', 'productions'], () => api.addMember(productionId, u, groupIds, part), true);
        },
        setMemberGroups: (productionId, userId, groupIds) => {
          set((s) => ({
            productions: s.productions.map((p) =>
              p.id === productionId ? { ...p, members: p.members.map((m) => (m.userId === userId ? { ...m, groupIds } : m)) } : p,
            ),
          }));
          push('the groups', ['productions'], () => api.setMemberGroups(productionId, userId, groupIds));
        },
        addGroup: (productionId, name) => {
          const g = { id: uid('g_'), name, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
          const channel: Channel = { id: uid('ch_'), productionId, name, kind: 'group', groupId: g.id };
          set((s) => ({
            productions: s.productions.map((p) => (p.id === productionId ? { ...p, groups: [...p.groups, g] } : p)),
            channels: [...s.channels, channel],
          }));
          const groups = get().productions.find((p) => p.id === productionId)?.groups ?? [g];
          push('the group', ['productions', 'channels'], () => api.addGroup(productionId, groups, channel));
        },
        sendMessage: (channelId, text) => {
          const msg: Message = { id: uid('m_'), channelId, userId: me(), text: text.trim(), at: new Date().toISOString() };
          if (!msg.text) return;
          set((s) => ({ messages: [...s.messages, msg], lastRead: { ...s.lastRead, [`${me()}:${channelId}`]: msg.at } }));
          push('your message', ['messages'], () => api.sendMessage(msg));
        },
        markRead: (channelId) => {
          const at = new Date().toISOString();
          set((s) => ({ lastRead: { ...s.lastRead, [`${me()}:${channelId}`]: at } }));
          const who = me();
          push(null, ['reads'], () => api.markRead(who, channelId, at));
        },
        openDirect: (productionId, otherUserId) => {
          const mine = me();
          const existing = get().channels.find(
            (c) => c.kind === 'direct' && c.productionId === productionId && c.memberIds?.includes(mine) && c.memberIds?.includes(otherUserId),
          );
          if (existing) return existing.id;
          const ch: Channel = { id: uid('ch_'), productionId, name: 'Direct', kind: 'direct', memberIds: [mine, otherUserId] };
          set((s) => ({ channels: [...s.channels, ch] }));
          push('the conversation', ['channels'], () => api.insertChannel(ch));
          return ch.id;
        },

        createPerformance: (p) => {
          const perf: Performance = { ...p, id: uid('perf_'), seats: {} };
          set((s) => ({ performances: [...s.performances, perf] }));
          push('the performance', ['performances'], () => api.insertPerformance(perf));
          return perf;
        },
        updatePerformance: (id, patch) => {
          patchPerf(id, (p) => ({ ...p, ...patch }));
          const { seats: _seats, ...fields } = patch;
          push('the performance', ['performances'], () => api.updatePerformance(id, fields));
        },
        hold: async (performanceId, seatIds) => {
          const p = get().performances.find((x) => x.id === performanceId);
          if (!p) return;
          const next = holdSeats(p.seats, seatIds, me()); // throws if taken
          patchPerf(performanceId, (x) => ({ ...x, seats: next }));
          if (!LIVE) return;
          try {
            await api.holdSeats(performanceId, seatIds);
          } catch (e) {
            await seatError(e, performanceId, seatIds);
          }
        },
        release: (performanceId, seatIds) => {
          const who = me();
          const p = get().performances.find((x) => x.id === performanceId);
          const mine = p && Object.values(p.seats).some((c) => c.status === 'held' && c.holderId === who);
          patchPerf(performanceId, (x) => ({ ...x, seats: releaseHolds(x.seats, who, seatIds) }));
          if (mine) push(null, [seats(performanceId)], () => api.releaseSeats(performanceId, seatIds));
        },
        purchase: async (performanceId, seatIds, buyer, method) => {
          const p = get().performances.find((x) => x.id === performanceId);
          if (!p) throw new Error('Performance not found');
          if (LIVE) {
            let orderId: string;
            try {
              ({ orderId } = await api.purchaseSeats(performanceId, seatIds, buyer, method));
            } catch (e) {
              return seatError(e, performanceId, seatIds);
            }
            await refresh([seats(performanceId), 'orders', 'tickets']);
            const order = get().orders.find((o) => o.id === orderId);
            if (!order) throw new Error('Your order went through, but it isn’t showing yet. Check Tickets in a moment.');
            return order;
          }
          const orderId = uid('o_');
          const claims = commitSale(p.seats, seatIds, me(), orderId, new Date(), method === 'comp' ? 'comp' : 'sold'); // throws -> nothing changes
          const totals = method === 'comp' ? { subtotal: 0, fees: 0, total: 0 } : orderTotals(seatIds, p.prices, get().settings.ticketFee);
          const order: Order = { id: orderId, performanceId, seatIds, buyerName: buyer.name, buyerEmail: buyer.email, buyerUserId: me(), ...totals, at: new Date().toISOString(), method };
          const existing = new Set(get().tickets.map((t) => t.code));
          const tickets: Ticket[] = seatIds.map((seatId) => {
            let code = ticketCode();
            while (existing.has(code)) code = ticketCode();
            existing.add(code);
            return { id: uid('t_'), orderId, performanceId, seatId, code, price: method === 'comp' ? 0 : priceFor(seatId, p.prices) };
          });
          set((s) => ({
            performances: s.performances.map((x) => (x.id === performanceId ? { ...x, seats: claims } : x)),
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
          push('the refund', ['tickets', 'orders', seats(t.performanceId)], () => api.refundTicket(ticketId), true);
        },
        block: (performanceId, seatIds, blocked, note) => {
          patchPerf(performanceId, (p) => ({ ...p, seats: setBlocked(p.seats, seatIds, blocked, note) }));
          push('the seats', [seats(performanceId)], () => api.blockSeats(performanceId, seatIds, blocked, note), true);
        },
        checkIn: async (code, performanceId) => {
          if (LIVE) {
            const r = await api.checkIn(code, performanceId);
            await refresh(['tickets']);
            return { ok: r.ok, message: r.message, ticket: r.ticketId ? get().tickets.find((t) => t.id === r.ticketId) : undefined };
          }
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
      // Live mode keeps nothing on the device: data comes from the server after sign-in,
      // so a shared phone never shows the previous person's bookings.
      name: LIVE ? 'dream-theatre-live-v1' : 'dream-theatre-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => (LIVE ? {} : pickData(s)),
      // keep new settings fields (added in later versions) when loading older saved data
      merge: (persisted, current) => {
        if (LIVE) return current;
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, settings: { ...current.settings, ...(p.settings ?? {}) }, house: p.house ?? current.house };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.house) configureHouse(state.house);
      },
    },
  ),
);

const DATA_KEYS = [
  'currentUserId', 'venue', 'settings', 'users', 'bookings', 'productions', 'schedule', 'conflicts',
  'channels', 'messages', 'lastRead', 'performances', 'orders', 'tickets', 'house', 'adminPin', 'setup', 'homeLayouts',
] as const;

function pickData(s: AppState): Data {
  const out = {} as Record<string, unknown>;
  for (const k of DATA_KEYS) out[k] = s[k];
  return out as Data;
}

export function useCurrentUser(): User {
  const id = useStore((s) => s.currentUserId);
  const users = useStore((s) => s.users);
  return users.find((u) => u.id === id) ?? users[0];
}

export function useIsOwner(): boolean {
  return useCurrentUser().role === 'owner';
}

/** The current person's home layout, falling back to their role's default. */
export function useHomeLayout(): HomeLayout {
  const user = useCurrentUser();
  const saved = useStore((s) => s.homeLayouts[user.id]);
  return normalizeLayout(user.role, saved);
}
