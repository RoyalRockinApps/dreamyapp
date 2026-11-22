import { addDays, atMinutes, dayKey } from './dates';
import { PRODUCTION_STAGES, type MilestoneStage, type Production, type ProductionMilestone, type ProductionStage, type User } from './types';

export const PRODUCTION_STATUSES = [...PRODUCTION_STAGES, 'completed'] as const;

export const STAGE_LABELS: Record<ProductionStage, string> = {
  concept: 'Concept',
  casting: 'Casting',
  preparation: 'Preparation',
  tech: 'Tech & dress',
  performances: 'Performances',
  wrap: 'Wrap',
  completed: 'Completed',
};

/** What each stage covers, shown under the stage on the production's Timeline. */
/**
 * What a production page offers at each stage. Earlier stages' tools are put away as the show moves
 * on and later ones appear when they're needed; a director can always move the stage back.
 */
export type StageFeature =
  | 'conceptWorkspace' // brief, feasibility checks and the audition draft
  | 'pitch'
  | 'runDates' // editing the opening and closing dates
  | 'auditions' // registration, applicants and review
  | 'conflicts' // cast and crew submitting dates they can't make
  | 'attendance' // taking roll at calls, and each person's record
  | 'tickets' // the run's performances and sales
  | 'addPerformances'
  | 'scheduleCalls'
  | 'addMembers'
  | 'addCards'
  | 'milestones';

export const STAGE_FEATURES: Record<ProductionStage, readonly StageFeature[]> = {
  concept: ['conceptWorkspace', 'pitch', 'runDates', 'scheduleCalls', 'addMembers', 'addCards', 'milestones'],
  casting: ['pitch', 'runDates', 'auditions', 'scheduleCalls', 'addMembers', 'addCards', 'milestones'],
  preparation: ['runDates', 'conflicts', 'attendance', 'tickets', 'addPerformances', 'scheduleCalls', 'addMembers', 'addCards', 'milestones'],
  tech: ['conflicts', 'attendance', 'tickets', 'addPerformances', 'scheduleCalls', 'addMembers', 'addCards', 'milestones'],
  performances: ['conflicts', 'attendance', 'tickets', 'addPerformances', 'scheduleCalls', 'addCards', 'milestones'],
  wrap: ['attendance', 'tickets', 'scheduleCalls', 'addCards', 'milestones'],
  completed: ['tickets'],
};

export const stageHas = (stage: ProductionStage, feature: StageFeature) => STAGE_FEATURES[stage].includes(feature);

export const STAGE_GUIDE: Record<MilestoneStage, string> = {
  concept: 'Pitch, rights, budget, venue, and production team',
  casting: 'Design meetings, auditions, callbacks, and the cast list',
  preparation: 'Rehearsals, set and costume builds, marketing, and ticket sales',
  tech: 'Load-in, cue-to-cue, and dress rehearsals',
  performances: 'Opening night through closing',
  wrap: 'Strike, returns, royalties, and the company debrief',
};

/**
 * Starter milestones for each stage, which the director can edit or remove. `days` counts from
 * opening night (or, with `fromClosing`, from the last performance); a typical community-theatre
 * schedule of about four months.
 */
export const SUGGESTED_MILESTONES: Record<MilestoneStage, { title: string; days: number; fromClosing?: boolean }[]> = {
  concept: [
    { title: 'Performance rights secured', days: -120 },
    { title: 'Budget approved', days: -112 },
    { title: 'Theatre dates held', days: -112 },
    { title: 'Production team confirmed', days: -105 },
  ],
  casting: [
    { title: 'Design concepts approved', days: -84 },
    { title: 'Audition notice posted', days: -84 },
    { title: 'Auditions', days: -70 },
    { title: 'Callbacks', days: -68 },
    { title: 'Cast list posted', days: -66 },
  ],
  preparation: [
    { title: 'First read-through', days: -63 },
    { title: 'Tickets on sale', days: -42 },
    { title: 'Off-book', days: -28 },
    { title: 'Program to print', days: -10 },
    { title: 'Set and costumes finished', days: -8 },
  ],
  tech: [
    { title: 'Load-in', days: -7 },
    { title: 'Cue-to-cue', days: -5 },
    { title: 'First dress rehearsal', days: -3 },
    { title: 'Final dress rehearsal', days: -1 },
  ],
  performances: [
    { title: 'Opening night', days: 0 },
    { title: 'Closing performance', days: 0, fromClosing: true },
  ],
  wrap: [
    { title: 'Strike', days: 1, fromClosing: true },
    { title: 'Rentals and rights materials returned', days: 7, fromClosing: true },
    { title: 'Royalty report filed', days: 14, fromClosing: true },
    { title: 'Company debrief', days: 14, fromClosing: true },
  ],
};

/**
 * A stage's suggested milestones for this production, dated from its run when it has one. A date
 * that has already passed is left off, so a show that's under way isn't greeted with overdue items.
 */
export function suggestedMilestones(stage: MilestoneStage, p: Production, today: string): Omit<ProductionMilestone, 'id' | 'completed'>[] {
  const opening = p.openingDate ? dayKey(p.openingDate) : undefined;
  const closing = p.closingDate ? dayKey(p.closingDate) : opening;
  return SUGGESTED_MILESTONES[stage].map(({ title, days, fromClosing }) => {
    const from = fromClosing ? closing : opening;
    const due = from ? dayKey(addDays(atMinutes(from, 12 * 60), days)) : undefined;
    return { stage, title, ...(due && due >= today ? { dueDate: due } : {}) };
  });
}

export const productionStage = (p: Production): ProductionStage => p.stage ?? (p.openingDate ? 'preparation' : 'concept');

export const productionStageLabel = (stage: ProductionStage): string =>
  stage === 'completed' ? STAGE_LABELS[stage] : `Stage ${PRODUCTION_STAGES.indexOf(stage) + 1} · ${STAGE_LABELS[stage]}`;

/**
 * The app is for people affiliated with the theatre: owners and staff, cast and crew, and anyone in a
 * production's company. Everyone else (a renter with no company) only applies for auditions here; they
 * rent the theatre and buy tickets at thedreamtheatre.com. The database refuses their bookings, payments
 * and ticket orders too (supabase/migrations/20261118000009_company_only_app.sql).
 */
export const isAffiliated = (user: User, productions: Production[]): boolean =>
  user.role !== 'renter' || !!user.teamLead || productions.some((p) => p.members.some((member) => member.userId === user.id));

export const canManageProduction = (p: Production, user: User): boolean =>
  user.role === 'owner' || p.members.some((member) => member.userId === user.id && member.isDirector);

export const canViewProduction = (p: Production, user: User): boolean =>
  user.role === 'owner' || p.members.some((member) => member.userId === user.id);

export const canReviewAudition = (p: Production, user: User): boolean =>
  canManageProduction(p, user) || p.members.some((member) => member.userId === user.id && member.canReviewAuditions);

export const canPlanProduction = (p: Production, user: User): boolean =>
  canManageProduction(p, user) || p.members.some((member) => member.userId === user.id && member.canPlanConcept);

type RunDates = Pick<Production, 'openingDate' | 'closingDate'>;

export function productionRunDates(opening: string, closing: string, existing?: RunDates): RunDates {
  if (!opening) return { openingDate: undefined, closingDate: undefined };
  const withTime = (day: string, original: string | undefined, hour: number) => {
    if (original && dayKey(original) === day) return original;
    return atMinutes(day, hour * 60).toISOString();
  };
  return {
    openingDate: withTime(opening, existing?.openingDate, 19),
    closingDate: withTime(closing, existing?.closingDate, 22),
  };
}
