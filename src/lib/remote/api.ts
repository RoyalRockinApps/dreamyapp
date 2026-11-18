// Writes to the shared backend. Each function throws an Error with a readable message on failure.
// Reads and live updates live in src/store/sync.ts.

import { auditionSummary } from '../auditions';
import type { HomeLayout } from '../home';
import type { HouseConfig } from '../seating';
import type {
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
  Membership,
  MemberConflict,
  Message,
  OpenAudition,
  Order,
  Payment,
  Performance,
  PerformerCredit,
  PerformerProfile,
  Production,
  ProductionAudition,
  ProductionBrief,
  ProductionMilestone,
  ProductionStage,
  RentalSettings,
  Rsvp,
  ScheduleItem,
  User,
  VenueInfo,
} from '../types';
import { EMPTY_CONCEPT } from '../concept';
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

export const insertProduction = (p: Production, channels: Channel[]) =>
  rpc('create_production', { p_production: R.fromProduction(p), p_channels: channels.map(R.fromChannel), p_pitch: p.pitch ?? null });

export const updateProductionPitch = (id: string, pitch: string) =>
  run(db().from('production_plans').update({ pitch }).eq('production_id', id).select('production_id').single());

export const changeProductionStage = (id: string, expected: ProductionStage, stage: ProductionStage) =>
  rpc('change_production_stage', { p_production: id, p_expected: expected, p_stage: stage });

export const updateProductionRun = (id: string, dates: Pick<Production, 'openingDate' | 'closingDate'>) =>
  run(db().from('productions').update(R.fromProduction(dates)).eq('id', id).select('id').single());

export const insertMilestone = (productionId: string, m: ProductionMilestone) =>
  run(db().from('production_milestones').insert({
    id: m.id, production_id: productionId, stage: m.stage, title: m.title, due_date: m.dueDate ?? null, completed: m.completed,
  }));

export function updateMilestone(productionId: string, id: string, patch: Partial<Omit<ProductionMilestone, 'id'>>) {
  const { dueDate, ...fields } = patch;
  const row = { ...fields, ...('dueDate' in patch ? { due_date: dueDate ?? null } : {}) };
  return run(db().from('production_milestones').update(row).eq('production_id', productionId).eq('id', id).select('id').single());
}

export const deleteMilestone = (productionId: string, id: string) =>
  run(db().from('production_milestones').delete().eq('production_id', productionId).eq('id', id).select('id').single());

export async function loadConcept(productionId: string): Promise<ConceptWorkspace> {
  const [concept, feasibility] = await Promise.all([
    db().from('production_concepts').select('premise,audience,performance_window,cast_size,rough_budget,audition_roles,audition_timing,audition_preparation').eq('production_id', productionId).maybeSingle(),
    db().from('production_feasibility').select('item,status,assignee_id,due_date,notes').eq('production_id', productionId),
  ]);
  if (concept.error) throw new Error(concept.error.message);
  if (feasibility.error) throw new Error(feasibility.error.message);
  const row = concept.data;
  return {
    brief: row ? {
      premise: row.premise, audience: row.audience, performanceWindow: row.performance_window,
      castSize: row.cast_size, roughBudget: row.rough_budget,
    } : EMPTY_CONCEPT.brief,
    auditionDraft: row ? { roles: row.audition_roles, timing: row.audition_timing, preparation: row.audition_preparation } : EMPTY_CONCEPT.auditionDraft,
    checks: feasibility.data.map((check) => ({
      item: check.item, status: check.status, assigneeId: check.assignee_id ?? undefined,
      dueDate: check.due_date ?? undefined, notes: check.notes,
    })),
  };
}

export const saveConceptBrief = (productionId: string, brief: ProductionBrief) =>
  run(db().from('production_concepts').upsert({
    production_id: productionId, premise: brief.premise, audience: brief.audience,
    performance_window: brief.performanceWindow, cast_size: brief.castSize, rough_budget: brief.roughBudget,
  }, { defaultToNull: false }).select('production_id').single());

export const saveConceptAuditionDraft = (productionId: string, draft: AuditionDraft) =>
  run(db().from('production_concepts').upsert({
    production_id: productionId, audition_roles: draft.roles, audition_timing: draft.timing, audition_preparation: draft.preparation,
  }, { defaultToNull: false }).select('production_id').single());

export const saveFeasibilityCheck = (productionId: string, check: FeasibilityCheck) =>
  run(db().from('production_feasibility').upsert({
    production_id: productionId, item: check.item, status: check.status,
    assignee_id: check.assigneeId ?? null, due_date: check.dueDate ?? null, notes: check.notes,
  }).select('production_id').single());

// ---------- auditions ----------

export async function loadPerformerProfile(personId: string): Promise<PerformerProfile | null> {
  const { data, error } = await db().from('performer_profiles').select('headshot,skills,credits').eq('person_id', personId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as PerformerProfile | null;
}

export const savePerformerProfile = (personId: string, profile: PerformerProfile) =>
  run(db().from('performer_profiles').upsert({
    person_id: personId, headshot: profile.headshot, skills: profile.skills, credits: profile.credits,
  }));

type OpeningRow = { production_id: string; title: string; details: string };
type ApplicationRow = { production_id: string; title: string; submitted_at: string };
type ReviewCardRow = {
  person_id: string; name: string; submitted_at: string; headshot: string;
  skills: string[]; credit: PerformerCredit | null; decision: AuditionDecision;
};

export async function loadAuditions(): Promise<{ openings: OpenAudition[]; applications: AuditionApplication[] }> {
  const [openings, applications] = await Promise.all([
    rpc<OpeningRow[]>('list_open_auditions', {}),
    rpc<ApplicationRow[]>('list_my_audition_applications', {}),
  ]);
  return {
    openings: openings.map((r) => ({ productionId: r.production_id, title: r.title, details: r.details })),
    applications: applications.map((r) => ({ productionId: r.production_id, title: r.title, submittedAt: isoDate(r.submitted_at) })),
  };
}

const isoDate = (value: string) => new Date(value).toISOString();

export const applyForAudition = (productionId: string) => rpc('apply_for_audition', { p_production: productionId });

export const withdrawAudition = (productionId: string, personId: string) =>
  run(db().from('audition_applications').delete().eq('production_id', productionId).eq('person_id', personId));

export async function loadProductionAudition(productionId: string): Promise<ProductionAudition | null> {
  const { data, error } = await db().from('production_auditions').select('is_open,details').eq('production_id', productionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { isOpen: data.is_open, details: data.details } : null;
}

export async function loadAuditionReviewCards(productionId: string, filter: AuditionReviewFilter, offset: number): Promise<AuditionReviewCard[]> {
  const cards = await rpc<ReviewCardRow[]>('list_audition_review_cards', { p_production: productionId, p_filter: filter, p_offset: offset });
  return cards.map((card) => ({
    personId: card.person_id, name: card.name, submittedAt: isoDate(card.submitted_at),
    headshot: card.headshot, summary: auditionSummary(card.skills, card.credit), decision: card.decision,
  }));
}

export const saveAuditionReview = (productionId: string, personId: string, expected: AuditionDecision, decision: AuditionDecision) =>
  rpc('save_audition_review', { p_production: productionId, p_person: personId, p_expected: expected, p_decision: decision });

type FeedbackRow = { id: string; author_name: string; kind: AuditionFeedback['kind']; body: string; created_at: string };
const toAuditionFeedback = (row: FeedbackRow): AuditionFeedback => ({
  id: row.id, authorName: row.author_name, kind: row.kind, body: row.body, createdAt: isoDate(row.created_at),
});

export async function loadAuditionFeedback(productionId: string, personId: string): Promise<AuditionFeedback[]> {
  const rows = await rpc<FeedbackRow[]>('list_audition_feedback', { p_production: productionId, p_person: personId });
  return rows.map(toAuditionFeedback);
}

export async function addAuditionFeedback(productionId: string, personId: string, entry: Pick<AuditionFeedback, 'id' | 'kind' | 'body'>): Promise<AuditionFeedback> {
  const [row] = await rpc<FeedbackRow[]>('add_audition_feedback', {
    p_production: productionId, p_person: personId, p_id: entry.id, p_kind: entry.kind, p_body: entry.body,
  });
  return toAuditionFeedback(row);
}

export const saveProductionAudition = (productionId: string, audition: ProductionAudition) =>
  run(db().from('production_auditions').upsert({
    production_id: productionId, is_open: audition.isOpen, details: audition.details,
  }).select('production_id').single());

export const addGroup = (productionId: string, group: Production['groups'][number], channelId: string) =>
  rpc('create_production_group', { p_production: productionId, p_group: group, p_channel: channelId });

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

export function updateCompanyMember(productionId: string, personId: string, patch: Partial<Omit<Membership, 'userId'>>) {
  const row: Partial<R.MembershipRow> = {};
  if ('part' in patch) row.part = patch.part || null;
  if (patch.groupIds !== undefined) row.group_ids = patch.groupIds;
  if (patch.isDirector !== undefined) row.is_director = patch.isDirector;
  if (patch.canReviewAuditions !== undefined) row.can_review_auditions = patch.canReviewAuditions;
  if (patch.canPlanConcept !== undefined) row.can_plan_concept = patch.canPlanConcept;
  return run(db().from('memberships').update(row).eq('production_id', productionId).eq('person_id', personId).select('person_id').single());
}

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

// ---------- accounts ----------

export type LinkResult = { person: string } | { status: 'pending' | 'declined'; message: string };

/** Right after sign-in: which person this sign-in is, or that it waits on the owner. */
export const linkMe = () => rpc<LinkResult>('link_me', {});
export const approveLinkRequest = (authUserId: string) => rpc('approve_link_request', { p_auth_user: authUserId });
export const declineLinkRequest = (authUserId: string) => rpc('decline_link_request', { p_auth_user: authUserId });
export const deleteMyAccount = () => rpc('delete_my_account', {});
