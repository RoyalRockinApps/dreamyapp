import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { alert } from '@/components/alert';
import { AUDITION_DETAILS_LIMIT, AUDITION_FEEDBACK_LIMIT, AUDITION_REVIEW_PAGE_SIZE, auditionSummary, hasPerformerProfile, performerProfileError } from '@/lib/auditions';
import { EMPTY_CONCEPT } from '@/lib/concept';
import { normalizeLayout, type HomeLayout } from '@/lib/home';
import { uid, ticketCode } from '@/lib/ids';
import { quoteRental } from '@/lib/pricing';
import { canManageProduction, canPlanProduction, canReviewAudition, isAffiliated, productionStage, STAGE_LABELS } from '@/lib/production';
import { canManageTask, canSeeBoard } from '@/lib/tasks';
import * as api from '@/lib/remote/api';
import { refresh, type Slice } from '@/lib/remote/bus';
import { unavailableSeats } from '@/lib/remote/rows';
import { claimsOutside, commitSale, configureHouse, DEFAULT_HOUSE, holdSeats, orderTotals, priceFor, releaseHolds, releaseSeats, SeatUnavailableError, setBlocked, type HouseConfig } from '@/lib/seating';
import { buildSeed, DEFAULT_SETTINGS, OWNER_ID, VENUE } from '@/lib/seed';
import { LIVE } from '@/lib/backend';
import type {
  AuditionApplicant,
  AuditionApplication,
  AuditionDecision,
  AuditionDraft,
  AuditionFeedback,
  AuditionReviewCard,
  AuditionReviewFilter,
  Booking,
  Channel,
  ConceptWorkspace,
  FeasibilityCheck,
  LinkRequest,
  MemberConflict,
  Membership,
  Message,
  OpenAudition,
  Order,
  Payment,
  Performance,
  PerformerProfile,
  Production,
  ProductionAudition,
  ProductionBrief,
  ProductionMilestone,
  ProductionStage,
  RentalSettings,
  Rsvp,
  ScheduleItem,
  Task,
  TaskUpdate,
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
  /** live mode, owner only: sign-ins waiting to be confirmed as an existing person */
  linkRequests: LinkRequest[];
  approveLink(authUserId: string): Promise<void>;
  declineLink(authUserId: string): Promise<void>;
  /** live mode: delete the signed-in person's account (App Store requirement) */
  deleteMyAccount(): Promise<void>;

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
  createProduction(p: Omit<Production, 'id' | 'stage' | 'milestones' | 'members'>): Promise<Production>;
  updateProductionPitch(id: string, pitch: string): Promise<void>;
  changeProductionStage(id: string, expected: ProductionStage, stage: ProductionStage): Promise<void>;
  updateProductionRun(id: string, dates: Pick<Production, 'openingDate' | 'closingDate'>): Promise<void>;
  addMilestone(productionId: string, milestone: Omit<ProductionMilestone, 'id' | 'completed'>): Promise<void>;
  updateMilestone(productionId: string, id: string, patch: Partial<Omit<ProductionMilestone, 'id'>>): Promise<void>;
  removeMilestone(productionId: string, id: string): Promise<void>;
  productionConcepts: Partial<Record<string, ConceptWorkspace>>;
  loadConcept(productionId: string): Promise<ConceptWorkspace>;
  saveConceptBrief(productionId: string, brief: ProductionBrief): Promise<void>;
  saveConceptAuditionDraft(productionId: string, draft: AuditionDraft): Promise<void>;
  saveFeasibilityCheck(productionId: string, check: FeasibilityCheck): Promise<void>;
  upsertScheduleItem(item: Omit<ScheduleItem, 'id' | 'rsvps'> & { id?: string }): ScheduleItem;
  deleteScheduleItem(id: string): void;
  rsvp(itemId: string, userId: string, r: Rsvp): void;
  addConflict(c: Omit<MemberConflict, 'id'>): void;
  removeConflict(id: string): void;
  addMember(productionId: string, user: Omit<User, 'id' | 'color' | 'role'>, groupIds: string[], part?: string): Promise<void>;

  // task boards (a production's, or the theatre's when productionId is missing)
  tasks: Task[];
  taskUpdates: TaskUpdate[];
  addTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Promise<string>;
  updateTask(id: string, patch: Partial<Pick<Task, 'title' | 'notes' | 'status' | 'assigneeId' | 'dueDate' | 'groupId'>>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  postTaskUpdate(taskId: string, body: string): Promise<void>;
  deleteTaskUpdate(id: string): Promise<void>;
  updateCompanyMember(productionId: string, userId: string, patch: Partial<Omit<Membership, 'userId'>>): Promise<void>;
  addGroup(productionId: string, name: string): Promise<void>;
  sendMessage(channelId: string, text: string): void;
  markRead(channelId: string): void;
  openDirect(productionId: string, otherUserId: string): string;

  // Live profiles load on demand. Demo mode persists them with the other local data.
  performerProfiles: Partial<Record<string, PerformerProfile>>;
  productionAuditions: Partial<Record<string, ProductionAudition>>;
  auditionEntries: (AuditionApplicant & { productionId: string; decision?: AuditionDecision; feedback?: AuditionFeedback[] })[];
  loadPerformerProfile(personId: string): Promise<PerformerProfile | null>;
  savePerformerProfile(profile: PerformerProfile): Promise<void>;
  loadAuditions(): Promise<{ openings: OpenAudition[]; applications: AuditionApplication[] }>;
  applyForAudition(productionId: string): Promise<void>;
  withdrawAudition(productionId: string): Promise<void>;
  loadProductionAudition(productionId: string): Promise<ProductionAudition | null>;
  saveProductionAudition(productionId: string, audition: ProductionAudition): Promise<void>;
  loadAuditionReviewCards(productionId: string, filter: AuditionReviewFilter, offset: number): Promise<AuditionReviewCard[]>;
  saveAuditionReview(productionId: string, personId: string, expected: AuditionDecision, decision: AuditionDecision): Promise<void>;
  loadAuditionFeedback(productionId: string, personId: string): Promise<AuditionFeedback[]>;
  addAuditionFeedback(productionId: string, personId: string, entry: Pick<AuditionFeedback, 'id' | 'kind' | 'body'>): Promise<AuditionFeedback>;

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
    productionConcepts: {},
    performerProfiles: {},
    productionAuditions: {},
    auditionEntries: [],
    linkRequests: [],
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
    productionConcepts: {},
    performerProfiles: {},
    productionAuditions: {},
    auditionEntries: [],
    linkRequests: [],
    tasks: [],
    taskUpdates: [],
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

async function waitForDemoData() {
  if (useStore.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = useStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const patchPerf = (id: string, fn: (p: Performance) => Performance) =>
        set((s) => ({ performances: s.performances.map((p) => (p.id === id ? fn(p) : p)) }));
      const me = () => get().currentUserId;
      const requireConceptPlanner = (productionId: string) => {
        const { productions, users } = get();
        const production = productions.find((p) => p.id === productionId);
        const user = users.find((u) => u.id === me());
        if (!production || !user || !canPlanProduction(production, user)) throw new Error('You need Concept planning access for this production.');
        return production;
      };
      const patchDemoConcept = (productionId: string, patch: (concept: ConceptWorkspace) => Partial<ConceptWorkspace>) =>
        set((s) => {
          const concept = s.productionConcepts[productionId] ?? EMPTY_CONCEPT;
          return { productionConcepts: { ...s.productionConcepts, [productionId]: { ...concept, ...patch(concept) } } };
        });
      const requireAuditionReviewer = (productionId: string) => {
        const { productions, users } = get();
        const production = productions.find((p) => p.id === productionId);
        const user = users.find((u) => u.id === me());
        if (!production || !user || !canReviewAudition(production, user)) throw new Error('You need audition review access for this production.');
        return user;
      };
      const seats = (performanceId: string): Slice => `seats:${performanceId}`;
      const requireProductionManager = (id: string) => {
        const { productions, users } = get();
        const production = productions.find((p) => p.id === id);
        const user = users.find((u) => u.id === me());
        if (!production || !user || !canManageProduction(production, user)) throw new Error('Only a director or the venue owner can edit this production.');
        return user;
      };
      // Task boards. The database enforces the same rules (20261119000100_task_boards.sql).
      const taskBoard = (productionId?: string) => {
        const { productions, users } = get();
        const user = users.find((u) => u.id === me());
        const production = productionId ? productions.find((p) => p.id === productionId) : undefined;
        if (!user || (productionId && !production) || !canSeeBoard(user, production)) throw new Error('This board isn’t available to you.');
        return { user, production };
      };
      const requireTaskManager = (productionId: string | undefined, groupId: string | undefined) => {
        const { user, production } = taskBoard(productionId);
        if (!canManageTask(user, production, groupId)) {
          throw new Error(production ? 'Only a director, the owner or that group’s Team Lead can change this card.' : 'Only the owner, staff and Team Leads can change theatre cards.');
        }
        return user;
      };
      const findTask = (id: string) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) throw new Error('This card has been removed.');
        return task;
      };
      const writeTasks = async (write: () => Promise<unknown>, update: (s: AppState) => Partial<AppState>) => {
        const who = me();
        if (LIVE) await write();
        if (me() !== who) return;
        set(update);
        if (LIVE) void refresh(['tasks']).catch(() => {});
      };

      const manageProduction = async (id: string, write: () => Promise<unknown>, update: (p: Production) => Production) => {
        requireProductionManager(id);
        const who = me();
        if (LIVE) await write();
        if (me() !== who) return;
        set((s) => ({ productions: s.productions.map((p) => p.id === id ? update(p) : p) }));
        if (LIVE) void refresh(['productions']).catch(() => {});
      };

      return {
        ...(LIVE ? emptyState() : fresh()),

        switchUser: (id) => set({ currentUserId: id }),
        approveLink: async (authUserId) => {
          if (!LIVE) return;
          await api.approveLinkRequest(authUserId);
          await refresh(['links', 'people']);
        },
        declineLink: async (authUserId) => {
          if (!LIVE) return;
          await api.declineLinkRequest(authUserId);
          await refresh(['links']);
        },
        deleteMyAccount: async () => {
          if (!LIVE) throw new Error('There’s no account to delete in the demo.');
          await api.deleteMyAccount();
        },
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
            performerProfiles: Object.fromEntries(Object.entries(s.performerProfiles).filter(([personId]) => personId !== id)),
            auditionEntries: s.auditionEntries.filter((entry) => entry.personId !== id),
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
          set((s) => ({
            ...data,
            house,
            settings: { ...DEFAULT_SETTINGS, ...data.settings },
            currentUserId: data.users.some((u: User) => u.id === s.currentUserId) ? s.currentUserId : OWNER_ID,
            productionConcepts: data.productionConcepts ?? {},
            performerProfiles: data.performerProfiles ?? {},
            productionAuditions: data.productionAuditions ?? {},
            auditionEntries: data.auditionEntries ?? [],
          }));
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

        loadPerformerProfile: async (personId) => {
          if (LIVE) return api.loadPerformerProfile(personId);
          await waitForDemoData();
          const { auditionEntries, productions, users, performerProfiles } = get();
          const viewer = users.find((user) => user.id === me());
          const canView = personId === viewer?.id || (viewer && auditionEntries.some((entry) =>
            entry.personId === personId && productions.some((p) => p.id === entry.productionId && canReviewAudition(p, viewer)),
          ));
          return canView ? performerProfiles[personId] ?? null : null;
        },
        savePerformerProfile: async (profile) => {
          const validationError = performerProfileError(profile);
          if (validationError) throw new Error(validationError);
          const personId = me();
          if (LIVE) return api.savePerformerProfile(personId, profile);
          await waitForDemoData();
          if (personId !== me()) throw new Error('Your account changed. Reopen your performer profile.');
          set((s) => ({ performerProfiles: { ...s.performerProfiles, [personId]: profile } }));
        },
        loadAuditions: async () => {
          if (LIVE) return api.loadAuditions();
          await waitForDemoData();
          const { productions, productionAuditions, auditionEntries } = get();
          return {
            openings: productions.flatMap((p) => {
              const audition = productionAuditions[p.id];
              return audition?.isOpen ? [{ productionId: p.id, title: p.title, details: audition.details }] : [];
            }),
            applications: auditionEntries.flatMap((entry) => {
              if (entry.personId !== me()) return [];
              const production = productions.find((p) => p.id === entry.productionId);
              return production ? [{ productionId: production.id, title: production.title, submittedAt: entry.submittedAt }] : [];
            }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
          };
        },
        applyForAudition: async (productionId) => {
          if (LIVE) return api.applyForAudition(productionId);
          await waitForDemoData();
          const { productions, performerProfiles, productionAuditions, auditionEntries, users } = get();
          const person = users.find((user) => user.id === me());
          if (!person) throw new Error('Sign in to apply.');
          if (!hasPerformerProfile(performerProfiles[person.id] ?? null)) throw new Error('Save your performer profile before applying.');
          if (auditionEntries.some((entry) => entry.productionId === productionId && entry.personId === person.id)) return;
          if (!productions.some((p) => p.id === productionId) || !productionAuditions[productionId]?.isOpen) {
            throw new Error('Auditions are closed for this production.');
          }
          set((s) => ({ auditionEntries: [
            ...s.auditionEntries, { productionId, personId: person.id, name: person.name, submittedAt: new Date().toISOString() },
          ] }));
        },
        withdrawAudition: async (productionId) => {
          if (LIVE) return api.withdrawAudition(productionId, me());
          await waitForDemoData();
          set((s) => ({ auditionEntries: s.auditionEntries.filter((entry) => entry.productionId !== productionId || entry.personId !== s.currentUserId) }));
        },
        loadConcept: async (productionId) => {
          if (!LIVE) await waitForDemoData();
          requireConceptPlanner(productionId);
          return LIVE ? api.loadConcept(productionId) : get().productionConcepts[productionId] ?? EMPTY_CONCEPT;
        },
        saveConceptBrief: async (productionId, brief) => {
          if (!LIVE) await waitForDemoData();
          requireConceptPlanner(productionId);
          if (LIVE) return api.saveConceptBrief(productionId, brief);
          patchDemoConcept(productionId, () => ({ brief }));
        },
        saveConceptAuditionDraft: async (productionId, auditionDraft) => {
          if (!LIVE) await waitForDemoData();
          requireConceptPlanner(productionId);
          if (LIVE) return api.saveConceptAuditionDraft(productionId, auditionDraft);
          patchDemoConcept(productionId, () => ({ auditionDraft }));
        },
        saveFeasibilityCheck: async (productionId, check) => {
          if (!LIVE) await waitForDemoData();
          const production = requireConceptPlanner(productionId);
          if (check.assigneeId && !production.members.some((member) => member.userId === check.assigneeId)) {
            throw new Error('Assign this check to a company member.');
          }
          if (LIVE) return api.saveFeasibilityCheck(productionId, check);
          patchDemoConcept(productionId, (concept) => ({ checks: [...concept.checks.filter((entry) => entry.item !== check.item), check] }));
        },
        loadProductionAudition: async (productionId) => {
          if (LIVE) return api.loadProductionAudition(productionId);
          await waitForDemoData();
          requireProductionManager(productionId);
          return get().productionAuditions[productionId] ?? null;
        },
        saveProductionAudition: async (productionId, audition) => {
          if (!LIVE) await waitForDemoData();
          requireProductionManager(productionId);
          const next = { ...audition, details: audition.details.trim() };
          if (next.details.length > AUDITION_DETAILS_LIMIT) throw new Error(`Keep audition details to ${AUDITION_DETAILS_LIMIT} characters.`);
          if (LIVE) return api.saveProductionAudition(productionId, next);
          set((s) => ({ productionAuditions: { ...s.productionAuditions, [productionId]: next } }));
        },
        loadAuditionReviewCards: async (productionId, filter, offset) => {
          if (LIVE) return api.loadAuditionReviewCards(productionId, filter, offset);
          await waitForDemoData();
          requireAuditionReviewer(productionId);
          const { auditionEntries, performerProfiles, users } = get();
          return auditionEntries
            .filter((entry) => entry.productionId === productionId && (filter === 'all' || (entry.decision ?? 'pending') === filter))
            .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.personId.localeCompare(b.personId))
            .slice(offset, offset + AUDITION_REVIEW_PAGE_SIZE + 1)
            .flatMap(({ personId, name, submittedAt, decision }) => {
              const profile = performerProfiles[personId];
              return profile ? [{
                personId, name: users.find((user) => user.id === personId)?.name ?? name, submittedAt,
                headshot: profile.headshot, summary: auditionSummary(profile.skills, profile.credits[0]), decision: decision ?? 'pending',
              }] : [];
            });
        },
        saveAuditionReview: async (productionId, personId, expected, decision) => {
          if (LIVE) return api.saveAuditionReview(productionId, personId, expected, decision);
          await waitForDemoData();
          requireAuditionReviewer(productionId);
          const matches = (entry: AppState['auditionEntries'][number]) => entry.productionId === productionId && entry.personId === personId;
          const application = get().auditionEntries.find(matches);
          if (!application) throw new Error('This application is no longer available.');
          const current = application.decision ?? 'pending';
          if (current === decision) return;
          if (current !== expected) throw new Error('The audition decision changed. Refresh and try again.');
          set((s) => ({ auditionEntries: s.auditionEntries.map((entry) => matches(entry) ? { ...entry, decision } : entry) }));
        },
        loadAuditionFeedback: async (productionId, personId) => {
          if (LIVE) return api.loadAuditionFeedback(productionId, personId);
          await waitForDemoData();
          requireAuditionReviewer(productionId);
          return get().auditionEntries.find((entry) => entry.productionId === productionId && entry.personId === personId)?.feedback ?? [];
        },
        addAuditionFeedback: async (productionId, personId, entry) => {
          const body = entry.body.trim();
          if (!body || body.length > AUDITION_FEEDBACK_LIMIT[entry.kind]) throw new Error('Enter feedback within the character limit.');
          if (LIVE) return api.addAuditionFeedback(productionId, personId, { ...entry, body });
          await waitForDemoData();
          const reviewer = requireAuditionReviewer(productionId);
          const matches = (application: AppState['auditionEntries'][number]) =>
            application.productionId === productionId && application.personId === personId;
          const application = get().auditionEntries.find(matches);
          if (!application) throw new Error('This application is no longer available.');
          const existing = application.feedback?.find((item) => item.id === entry.id);
          if (existing) return existing;
          const feedback = { ...entry, body, authorName: reviewer.name, createdAt: new Date().toISOString() };
          set((s) => ({
            auditionEntries: s.auditionEntries.map((item) => matches(item) ? { ...item, feedback: [feedback, ...(item.feedback ?? [])] } : item),
          }));
          return feedback;
        },

        createProduction: async (p) => {
          const who = me();
          if (get().users.find((u) => u.id === who)?.role !== 'owner') throw new Error('Only the venue owner can start a production.');
          const prod: Production = {
            ...p,
            id: uid('p_'),
            stage: 'concept',
            milestones: [],
            members: [{ userId: who, groupIds: [], part: 'Director / Producer', isDirector: true }],
          };
          const channels: Channel[] = [
            { id: uid('ch_'), productionId: prod.id, name: 'Announcements', kind: 'announcements' },
            { id: uid('ch_'), productionId: prod.id, name: 'Full Company', kind: 'group' },
            ...prod.groups.map((g) => ({ id: uid('ch_'), productionId: prod.id, name: g.name, kind: 'group' as const, groupId: g.id })),
          ];
          if (LIVE) await api.insertProduction(prod, channels);
          if (me() === who) {
            set((s) => ({
              productions: [...s.productions.filter((x) => x.id !== prod.id), prod],
              channels: [...s.channels.filter((x) => x.productionId !== prod.id), ...channels],
            }));
            if (LIVE) void refresh(['productions', 'channels']).catch(() => {});
          }
          return prod;
        },
        updateProductionPitch: (id, pitch) => manageProduction(id, () => api.updateProductionPitch(id, pitch), (p) => ({ ...p, pitch })),
        changeProductionStage: async (id, expected, stage) => {
          const author = requireProductionManager(id);
          const slices = ['productions', 'channels', 'messages'] satisfies Slice[];
          if (LIVE) {
            try {
              await api.changeProductionStage(id, expected, stage);
              if (me() === author.id) set((s) => ({
                productions: s.productions.map((p) => p.id === id ? { ...p, stage } : p),
              }));
            } finally {
              if (me() === author.id) void refresh(slices).catch(() => {});
            }
            return;
          }

          const state = get();
          const current = productionStage(state.productions.find((p) => p.id === id)!);
          if (current === stage) return;
          if (current !== expected) throw new Error('The production stage changed. Review the current stage and try again.');
          const existing = state.channels.find((c) => c.productionId === id && c.kind === 'announcements' && !c.groupId);
          const channel: Channel = existing ?? { id: uid('ch_'), productionId: id, name: 'Announcements', kind: 'announcements' };
          const message: Message = {
            id: uid('m_'), channelId: channel.id, userId: author.id,
            text: `Production stage changed from ${STAGE_LABELS[current]} to ${STAGE_LABELS[stage]}.`,
            at: new Date().toISOString(), productionStage: stage,
          };
          set((s) => ({
            productions: s.productions.map((p) => p.id === id ? { ...p, stage } : p),
            channels: existing ? s.channels : [...s.channels, channel],
            messages: [...s.messages, message],
          }));
        },
        updateProductionRun: (id, dates) => manageProduction(id, () => api.updateProductionRun(id, dates), (p) => ({ ...p, ...dates })),
        addMilestone: (productionId, milestone) => {
          const next: ProductionMilestone = { ...milestone, id: uid('ms_'), completed: false };
          return manageProduction(productionId, () => api.insertMilestone(productionId, next), (p) => ({
            ...p, milestones: [...(p.milestones ?? []).filter((m) => m.id !== next.id), next],
          }));
        },
        updateMilestone: (productionId, id, patch) =>
          manageProduction(productionId, () => api.updateMilestone(productionId, id, patch), (p) => ({
            ...p, milestones: p.milestones?.map((m) => m.id === id ? { ...m, ...patch } : m),
          })),
        removeMilestone: (productionId, id) =>
          manageProduction(productionId, () => api.deleteMilestone(productionId, id), (p) => ({
            ...p, milestones: p.milestones?.filter((m) => m.id !== id),
          })),
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
        addMember: async (productionId, user, groupIds, part) => {
          requireProductionManager(productionId);
          const existing = get().users.find((u) => u.email.toLowerCase() === user.email.toLowerCase());
          const u: User = existing ?? { ...user, id: uid('u_'), role: 'member', color: COLORS[get().users.length % COLORS.length] };
          if (LIVE) {
            await api.addMember(productionId, u, groupIds, part);
            void refresh(['people', 'productions']).catch(() => {});
            return;
          }
          set((s) => ({
            users: existing ? s.users : [...s.users, u],
            productions: s.productions.map((p) => {
              if (p.id !== productionId) return p;
              const member = p.members.find((m) => m.userId === u.id);
              const next = { ...member, userId: u.id, groupIds, part: part ?? member?.part };
              return { ...p, members: member ? p.members.map((m) => m.userId === u.id ? next : m) : [...p.members, next] };
            }),
          }));
        },
        addTask: async (fields) => {
          const user = requireTaskManager(fields.productionId, fields.groupId);
          const title = fields.title.trim();
          if (!title) throw new Error('Give the card a title.');
          const at = new Date().toISOString();
          const task: Task = { ...fields, title, notes: fields.notes.trim(), id: uid('task_'), createdBy: user.id, createdAt: at, updatedAt: at };
          await writeTasks(() => api.insertTask(task), (s) => ({ tasks: [...s.tasks, task] }));
          return task.id;
        },
        updateTask: async (id, patch) => {
          const task = findTask(id);
          requireTaskManager(task.productionId, task.groupId);
          if ('groupId' in patch) requireTaskManager(task.productionId, patch.groupId);
          const next = { ...patch, ...(patch.title !== undefined ? { title: patch.title.trim() } : {}), ...(patch.notes !== undefined ? { notes: patch.notes.trim() } : {}) };
          if (next.title === '') throw new Error('Give the card a title.');
          await writeTasks(() => api.updateTask(id, next), (s) => ({
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...next, updatedAt: new Date().toISOString() } : t)),
          }));
        },
        deleteTask: async (id) => {
          const task = findTask(id);
          requireTaskManager(task.productionId, task.groupId);
          await writeTasks(() => api.deleteTask(id), (s) => ({
            tasks: s.tasks.filter((t) => t.id !== id), taskUpdates: s.taskUpdates.filter((u) => u.taskId !== id),
          }));
        },
        postTaskUpdate: async (taskId, body) => {
          const { user } = taskBoard(findTask(taskId).productionId);
          const text = body.trim();
          if (!text) return;
          const update: TaskUpdate = { id: uid('tu_'), taskId, personId: user.id, authorName: user.name, body: text, at: new Date().toISOString() };
          await writeTasks(() => api.insertTaskUpdate(update), (s) => ({ taskUpdates: [...s.taskUpdates, update] }));
        },
        deleteTaskUpdate: async (id) => {
          const update = get().taskUpdates.find((u) => u.id === id);
          if (!update) return;
          const task = findTask(update.taskId);
          const { user, production } = taskBoard(task.productionId);
          if (update.personId !== user.id && !canManageTask(user, production, task.groupId)) throw new Error('Only the person who posted it, or someone who manages the card, can remove an update.');
          await writeTasks(() => api.deleteTaskUpdate(id), (s) => ({ taskUpdates: s.taskUpdates.filter((u) => u.id !== id) }));
        },
        updateCompanyMember: async (productionId, userId, patch) => {
          if (patch.isDirector !== undefined && requireProductionManager(productionId).role !== 'owner') {
            throw new Error('Only the venue owner can change director access.');
          }
          return manageProduction(productionId, () => api.updateCompanyMember(productionId, userId, patch), (p) => ({
            ...p, members: p.members.map((m) => m.userId === userId ? { ...m, ...patch } : m),
          }));
        },
        addGroup: async (productionId, name) => {
          const who = requireProductionManager(productionId).id;
          const g = { id: uid('g_'), name, color: COLORS[Math.floor(Math.random() * COLORS.length)] };
          const channel: Channel = { id: uid('ch_'), productionId, name, kind: 'group', groupId: g.id };
          if (LIVE) await api.addGroup(productionId, g, channel.id);
          if (me() !== who) return;
          set((s) => ({
            productions: s.productions.map((p) => p.id === productionId && !p.groups.some((x) => x.id === g.id) ? { ...p, groups: [...p.groups, g] } : p),
            channels: s.channels.some((c) => c.id === channel.id) ? s.channels : [...s.channels, channel],
          }));
          if (LIVE) void refresh(['productions', 'channels']).catch(() => {});
        },
        sendMessage: (channelId, text) => {
          const msg: Message = { id: uid('m_'), channelId, userId: me(), text: text.trim(), at: new Date().toISOString() };
          if (!msg.text) return;
          set((s) => ({ messages: [...s.messages, msg], lastRead: { ...s.lastRead, [`${me()}:${channelId}`]: msg.at } }));
          push('your message', ['messages'], () => api.sendMessage(msg));
        },
        markRead: (channelId) => {
          const who = me();
          const key = `${who}:${channelId}`;
          const at = get().messages.reduce((latest, m) => m.channelId === channelId && m.at > latest ? m.at : latest, '');
          if (!at || at <= (get().lastRead[key] ?? '')) return;
          set((s) => ({ lastRead: { ...s.lastRead, [key]: at } }));
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
  'productionConcepts', 'performerProfiles', 'productionAuditions', 'auditionEntries', 'linkRequests',
  'tasks', 'taskUpdates',
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

/** False for someone outside the theatre (see isAffiliated): the app then only offers auditions. */
export function useIsAffiliated(): boolean {
  return useStore((s) => {
    const user = s.users.find((u) => u.id === s.currentUserId) ?? s.users[0];
    return !user || isAffiliated(user, s.productions);
  });
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
