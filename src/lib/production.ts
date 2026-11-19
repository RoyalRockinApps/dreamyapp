import { atMinutes, dayKey } from './dates';
import { PRODUCTION_STAGES, type Production, type ProductionStage, type User } from './types';

export const PRODUCTION_STATUSES = [...PRODUCTION_STAGES, 'completed'] as const;

export const STAGE_LABELS: Record<ProductionStage, string> = {
  concept: 'Concept',
  casting: 'Casting',
  preparation: 'Preparation',
  production: 'Production',
  completed: 'Completed',
};

export const productionStage = (p: Production): ProductionStage => p.stage ?? (p.openingDate ? 'preparation' : 'concept');

export const productionStageLabel = (stage: ProductionStage): string =>
  stage === 'completed' ? STAGE_LABELS[stage] : `Stage ${PRODUCTION_STAGES.indexOf(stage)} · ${STAGE_LABELS[stage]}`;

/**
 * The app is for people affiliated with the theatre: owners and staff, cast and crew, and anyone in a
 * production's company. Everyone else (a renter with no company) only applies for auditions here; they
 * rent the theatre and buy tickets at thedreamtheatre.com. The database refuses their bookings, payments
 * and ticket orders too (supabase/migrations/20261118000009_company_only_app.sql).
 */
export const isAffiliated = (user: User, productions: Production[]): boolean =>
  user.role !== 'renter' || productions.some((p) => p.members.some((member) => member.userId === user.id));

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
