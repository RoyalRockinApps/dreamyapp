import type { AuditionFeedbackKind, PerformerCredit, PerformerProfile } from './types';

export const PERFORMER_HEADSHOT_LIMIT = 350_000;
export const PERFORMER_SKILL_LIMIT = 30;
export const PERFORMER_SKILL_LENGTH = 60;
export const PERFORMER_CREDIT_LIMIT = 30;
export const PERFORMER_CREDIT_LENGTH = 120;
export const AUDITION_DETAILS_LIMIT = 1500;
export const AUDITION_REVIEW_PAGE_SIZE = 12;
export const AUDITION_FEEDBACK_LIMIT: Record<AuditionFeedbackKind, number> = { note: 2000, role: 120 };

export function auditionSummary(skills: string[], credit?: PerformerCredit | null): string {
  const role = credit ? `played ${credit.role} in ${credit.production}` : '';
  const listed = skills.slice(0, 2).filter(Boolean);
  const skillsText = listed.length ? `lists ${listed.join(' and ')} as skills` : '';
  const summary = [role, skillsText].filter(Boolean).join(' and ');
  return summary ? `This performer ${summary.replace(/[.!?]+$/, '')}.` : 'This performer has yet to list any skills or past roles.';
}

const JPEG_PREFIX = 'data:image/jpeg;base64,';

export function performerProfileError(profile: PerformerProfile): string | undefined {
  if (!profile.headshot) return 'Choose a headshot for your profile.';
  const photo = profile.headshot.slice(JPEG_PREFIX.length);
  if (profile.headshot.length > PERFORMER_HEADSHOT_LIMIT || !profile.headshot.startsWith(JPEG_PREFIX)
    || !photo.startsWith('/9j/') || photo.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo)) {
    return 'Choose a different photo for your headshot.';
  }
  if (profile.skills.length > PERFORMER_SKILL_LIMIT || profile.skills.some((skill) => !skill.trim() || skill.trim().length > PERFORMER_SKILL_LENGTH)) {
    return `Enter up to ${PERFORMER_SKILL_LIMIT} skills with ${PERFORMER_SKILL_LENGTH} characters or fewer per skill.`;
  }
  if (profile.credits.length > PERFORMER_CREDIT_LIMIT || profile.credits.some(({ production, role }) =>
    !production.trim() || !role.trim() || production.trim().length > PERFORMER_CREDIT_LENGTH || role.trim().length > PERFORMER_CREDIT_LENGTH,
  )) {
    return `Enter a production and a part for each credit, with up to ${PERFORMER_CREDIT_LIMIT} credits.`;
  }
  if (profile.credits.some(({ year }) => year && !/^\d{4}$/.test(year))) return 'Enter a four-digit year or leave it blank.';
}

export function hasPerformerProfile(profile: PerformerProfile | null): boolean {
  return profile !== null && performerProfileError(profile) === undefined;
}
