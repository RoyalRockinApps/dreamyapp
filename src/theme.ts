import type { BookingStatus } from '@/lib/types';

// Matches thedreamtheatre.com: a black stage under one spotlight. Black and charcoal surfaces,
// off-white type, white buttons with black text, square-ish corners, Adamina headings set in
// letter-spaced capitals and Cabin for everything else. The site has no accent color, so the
// brand accent is its off-white; color is kept only where it carries meaning (statuses, seat
// tiers, calendar event types).
export const C = {
  bg: '#000000',
  surface: '#111111',
  surface2: '#1C1C1C',
  border: '#303030',
  text: '#F1F1F1',
  muted: '#BFBFBF',
  faint: '#7A7A7A',
  /** brand accent: primary buttons, active tabs, links, selection */
  accent: '#F1F1F1',
  accentSoft: 'rgba(241,241,241,0.12)',
  /** text and icons drawn on top of the accent */
  onAccent: '#111111',
  /** data color only: premium seats, rentals on the calendar, call times */
  gold: '#C9A961',
  goldSoft: 'rgba(201,169,97,0.15)',
  curtain: '#B3263A',
  green: '#6FBF8E',
  greenSoft: 'rgba(111,191,142,0.15)',
  warn: '#E0A458',
  warnSoft: 'rgba(224,164,88,0.15)',
  danger: '#E06B5D',
  dangerSoft: 'rgba(224,107,93,0.15)',
  blue: '#7FA7D9',
  blueSoft: 'rgba(127,167,217,0.15)',
  purple: '#A795D8',
  purpleSoft: 'rgba(167,149,216,0.15)',
};

/** Font families (loaded in src/app/_layout.tsx). Custom fonts pick their weight by family. */
export const F = {
  display: 'Adamina_400Regular',
  regular: 'Cabin_400Regular',
  medium: 'Cabin_500Medium',
  semibold: 'Cabin_600SemiBold',
  bold: 'Cabin_700Bold',
};

export const R = { sm: 2, md: 4, lg: 6, xl: 10 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  inquiry: { label: 'New request', color: C.blue, bg: C.blueSoft },
  awaiting_deposit: { label: 'Awaiting deposit', color: C.warn, bg: C.warnSoft },
  confirmed: { label: 'Confirmed', color: C.green, bg: C.greenSoft },
  completed: { label: 'Completed', color: C.muted, bg: 'rgba(191,191,191,0.12)' },
  cancelled: { label: 'Cancelled', color: C.danger, bg: C.dangerSoft },
  declined: { label: 'Declined', color: C.danger, bg: C.dangerSoft },
};

export const EVENT_COLORS = {
  rental: C.gold,
  rehearsal: C.purple,
  performance: C.curtain,
  tentative: C.blue,
};
