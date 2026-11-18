import { FEASIBILITY_ITEMS, type AuditionDraft, type ConceptWorkspace, type FeasibilityItem, type FeasibilityStatus } from './types';

export const EMPTY_CONCEPT: ConceptWorkspace = {
  brief: { premise: '', audience: '', performanceWindow: '', castSize: '', roughBudget: '' },
  auditionDraft: { roles: '', timing: '', preparation: '' },
  checks: [],
};

export const FEASIBILITY_LABELS: Record<FeasibilityItem, string> = {
  rights: 'Performance rights',
  venue: 'Venue availability',
  budget: 'Budget',
  staffing: 'Staffing',
  technical: 'Technical needs',
};

export const FEASIBILITY_STATUS_LABELS: Record<FeasibilityStatus, string> = {
  open: 'Open', working: 'In progress', blocked: 'Blocked', ready: 'Ready',
};

export const unresolvedFeasibility = (concept: ConceptWorkspace) =>
  FEASIBILITY_ITEMS.filter((item) => !concept.checks.some((check) => check.item === item && check.status === 'ready'));

export function auditionDraftDetails(draft: AuditionDraft): string {
  return [
    draft.roles.trim() && `Roles\n${draft.roles.trim()}`,
    draft.timing.trim() && `Dates and location\n${draft.timing.trim()}`,
    draft.preparation.trim() && `What to prepare\n${draft.preparation.trim()}`,
  ].filter(Boolean).join('\n\n');
}
