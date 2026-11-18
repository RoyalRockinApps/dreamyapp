// Core domain model for The Dream Theatre app.
// All timestamps are ISO-8601 strings (local wall-clock time is derived when displayed).

export type Role = 'owner' | 'renter' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  color: string;
}

// ---------- Rentals ----------

export type BookingStatus =
  | 'inquiry' // request submitted, waiting on the owner
  | 'awaiting_deposit' // approved, date held until the deposit deadline
  | 'confirmed' // deposit received, date locked
  | 'completed'
  | 'cancelled'
  | 'declined';

export type EventType =
  | 'Concert'
  | 'Dance Recital'
  | 'Ballet'
  | 'Musical Theatre'
  | 'Play'
  | 'Comedy'
  | 'Worship / Ministry'
  | 'School Event'
  | 'Conference / Meeting'
  | 'Film Screening'
  | 'Rehearsal'
  | 'Other';

export const EVENT_TYPES: EventType[] = [
  'Concert',
  'Dance Recital',
  'Ballet',
  'Musical Theatre',
  'Play',
  'Comedy',
  'Worship / Ministry',
  'School Event',
  'Conference / Meeting',
  'Film Screening',
  'Rehearsal',
  'Other',
];

export interface RentalPackage {
  id: string;
  name: string;
  hours: number;
  price: number;
  description: string;
}

export interface AddOn {
  id: string;
  name: string;
  price: number;
  per: 'flat' | 'hour';
  description: string;
}

export interface RentalSettings {
  hourlyRate: number;
  minHours: number;
  packages: RentalPackage[];
  addOns: AddOn[];
  /** 0-1, share of the rental total due up-front to reserve the date */
  depositPercent: number;
  /** refundable damage deposit collected with the reservation deposit */
  securityDeposit: number;
  /** minutes kept free before/after every event for load-in/out and turnover */
  bufferMins: number;
  /** remaining balance is due this many days before the event */
  balanceDueDays: number;
  /** an approved request holds its date this many hours waiting on the deposit */
  holdHours: number;
  /** if false, renter requests must be approved by the owner before paying */
  autoApprove: boolean;
  cancellationPolicy: string;
  /** per-ticket service fee added at checkout */
  ticketFee: number;
}

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface Quote {
  lines: QuoteLine[];
  rentalTotal: number;
  securityDeposit: number;
  depositDue: number; // reservation deposit + security deposit, due now
  balanceDue: number; // remaining rental total
  balanceDueDate: string;
  hours: number;
}

export type PaymentKind = 'deposit' | 'balance' | 'security_refund' | 'refund';
export type PaymentMethod = 'card' | 'cash' | 'check';

export interface Payment {
  id: string;
  amount: number; // positive = received, negative = refunded
  kind: PaymentKind;
  method: PaymentMethod;
  at: string;
  reference?: string; // card last4 / check number
}

export interface Booking {
  id: string;
  title: string;
  eventType: EventType;
  organization?: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  renterId?: string;
  start: string;
  end: string;
  attendance: number;
  packageId?: string;
  addOnIds: string[];
  notes?: string;
  status: BookingStatus;
  quote: Quote;
  payments: Payment[];
  holdExpiresAt?: string;
  createdAt: string;
  /** venue sells assigned-seat tickets for this event */
  ticketed: boolean;
  isPublic: boolean;
}

// ---------- Productions (owner's own shows) ----------

export interface Group {
  id: string;
  name: string;
  color: string;
}

export interface Membership {
  userId: string;
  groupIds: string[];
  part?: string; // character / crew position
  isDirector?: boolean;
  canReviewAuditions?: boolean;
  canPlanConcept?: boolean;
}

export interface Production {
  id: string;
  title: string;
  tagline?: string;
  color: string;
  openingDate?: string;
  closingDate?: string;
  groups: Group[];
  members: Membership[];
  stage?: ProductionStage;
  pitch?: string;
  milestones?: ProductionMilestone[];
}

export const PRODUCTION_STAGES = ['concept', 'casting', 'preparation', 'production'] as const;
export type MilestoneStage = (typeof PRODUCTION_STAGES)[number];
export type ProductionStage = MilestoneStage | 'completed';

export interface ProductionMilestone {
  id: string;
  stage: MilestoneStage;
  title: string;
  dueDate?: string; // local calendar date, YYYY-MM-DD
  completed: boolean;
}

export interface PerformerCredit {
  production: string;
  role: string;
  year?: string;
}

export interface PerformerProfile {
  headshot: string;
  skills: string[];
  credits: PerformerCredit[];
}

export interface ProductionAudition {
  isOpen: boolean;
  details: string;
}

export interface ProductionBrief {
  premise: string;
  audience: string;
  performanceWindow: string;
  castSize: string;
  roughBudget: string;
}

export interface AuditionDraft {
  roles: string;
  timing: string;
  preparation: string;
}

export const FEASIBILITY_ITEMS = ['rights', 'venue', 'budget', 'staffing', 'technical'] as const;
export type FeasibilityItem = (typeof FEASIBILITY_ITEMS)[number];
export type FeasibilityStatus = 'open' | 'working' | 'blocked' | 'ready';

export interface FeasibilityCheck {
  item: FeasibilityItem;
  status: FeasibilityStatus;
  assigneeId?: string;
  dueDate?: string;
  notes: string;
}

export interface ConceptWorkspace {
  brief: ProductionBrief;
  auditionDraft: AuditionDraft;
  checks: FeasibilityCheck[];
}

export interface OpenAudition {
  productionId: string;
  title: string;
  details: string;
}

export interface AuditionApplication {
  productionId: string;
  title: string;
  submittedAt: string;
}

export interface AuditionApplicant {
  personId: string;
  name: string;
  submittedAt: string;
}

export type AuditionDecision = 'pending' | 'callback' | 'pass';
export type AuditionReviewFilter = AuditionDecision | 'all';

export interface AuditionReviewCard extends AuditionApplicant {
  headshot: string;
  summary: string;
  decision: AuditionDecision;
}

export type AuditionFeedbackKind = 'note' | 'role';

export interface AuditionFeedback {
  id: string;
  authorName: string;
  kind: AuditionFeedbackKind;
  body: string;
  createdAt: string;
}

export type ScheduleKind =
  | 'Rehearsal'
  | 'Music'
  | 'Choreography'
  | 'Blocking'
  | 'Tech'
  | 'Dress'
  | 'Call Time'
  | 'Meeting'
  | 'Audition'
  | 'Performance'
  | 'Strike';

export const SCHEDULE_KINDS: ScheduleKind[] = [
  'Rehearsal',
  'Music',
  'Choreography',
  'Blocking',
  'Tech',
  'Dress',
  'Call Time',
  'Meeting',
  'Audition',
  'Performance',
  'Strike',
];

export type Space = 'Main Stage' | 'Rehearsal Room' | 'Lobby' | 'Dressing Rooms' | 'Off-site';
export const SPACES: Space[] = ['Main Stage', 'Rehearsal Room', 'Lobby', 'Dressing Rooms', 'Off-site'];

export type Rsvp = 'yes' | 'no' | 'maybe';

export interface ScheduleItem {
  id: string;
  productionId: string;
  title: string;
  kind: ScheduleKind;
  start: string;
  end: string;
  space: Space;
  /** empty = full company */
  groupIds: string[];
  notes?: string;
  rsvps: Record<string, Rsvp>;
}

export interface MemberConflict {
  id: string;
  userId: string;
  productionId: string;
  start: string;
  end: string;
  note: string;
}

export interface Channel {
  id: string;
  productionId: string;
  name: string;
  kind: 'announcements' | 'group' | 'direct';
  groupId?: string;
  memberIds?: string[]; // direct messages
}

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  text: string;
  at: string;
  productionStage?: ProductionStage;
}

// ---------- Ticketing ----------

export type PriceTier = 'premium' | 'standard' | 'value' | 'accessible';

export interface Seat {
  id: string; // e.g. "F-C7"
  row: string;
  section: 'L' | 'C' | 'R';
  number: number;
  tier: PriceTier;
  accessible: boolean;
  /** index within the row/section block, used to detect adjacency */
  index: number;
}

export type SeatStatus = 'sold' | 'held' | 'blocked' | 'comp';

export interface SeatClaim {
  status: SeatStatus;
  holderId?: string;
  holdExpiresAt?: string;
  orderId?: string;
  note?: string;
}

export interface Performance {
  id: string;
  title: string;
  subtitle?: string;
  productionId?: string;
  bookingId?: string;
  start: string;
  doorsMins: number;
  prices: Record<PriceTier, number>;
  onSale: boolean;
  seats: Record<string, SeatClaim>;
}

export interface Order {
  id: string;
  performanceId: string;
  seatIds: string[];
  buyerName: string;
  buyerEmail: string;
  buyerUserId?: string;
  subtotal: number;
  fees: number;
  total: number;
  at: string;
  method: PaymentMethod | 'comp';
  refunded?: boolean;
}

export interface Ticket {
  id: string;
  orderId: string;
  performanceId: string;
  seatId: string;
  code: string;
  price: number;
  checkedInAt?: string;
  void?: boolean;
}

export interface VenueInfo {
  name: string;
  ownerName: string;
  address: string;
  phone: string;
  email: string;
  tagline: string;
}
