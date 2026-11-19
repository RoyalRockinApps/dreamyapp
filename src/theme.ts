import type { BookingStatus } from '@/lib/types';

// A private screening room on thedreamtheatre.com's black stage. The website gives the black,
// the off-white type, the square-ish buttons and the typefaces: Adamina headings in letter-spaced
// capitals and Cabin for everything else. The screening room gives the materials:
//   - charcoal walls quilted in a fine diamond pattern (QuiltBackground in src/components/ui.tsx);
//   - warm LED light lines tracing edges and dividers, and lighting the main buttons (C.accent);
//   - a walnut screen wall for headline panels (ScreenWall);
//   - cognac leather, the seats' warm second accent (C.leather).
// Other colors are kept only where they carry meaning (statuses, seat tiers, calendar event types).
export const C = {
  bg: '#09090A',
  surface: '#131315',
  surface2: '#1C1C1F',
  border: '#29292D',
  text: '#F4EFE6',
  muted: '#BCB5A9',
  faint: '#7B756C',
  /** LED light: primary buttons, active tabs, links, selection */
  accent: '#F2DDB8',
  accentSoft: 'rgba(242,221,184,0.12)',
  /** text and icons drawn on top of the accent */
  onAccent: '#17120B',
  /** an LED line at rest: card edges, dividers, outlines */
  line: 'rgba(242,221,184,0.2)',
  /** the halo around a lit LED line or button */
  glow: 'rgba(255,224,170,0.45)',
  /** the seats' cognac leather: avatars, highlights */
  leather: '#B9814F',
  leatherSoft: 'rgba(185,129,79,0.16)',
  /** the screen wall's walnut, dark to light */
  walnut: '#3A2417',
  walnutLight: '#6E4529',
  /** data color only: premium seats, rentals on the calendar, call times */
  gold: '#C9A961',
  goldSoft: 'rgba(201,169,97,0.15)',
  curtain: '#B3263A',
  green: '#7DBE93',
  greenSoft: 'rgba(125,190,147,0.15)',
  warn: '#E0A458',
  warnSoft: 'rgba(224,164,88,0.15)',
  danger: '#E0705F',
  dangerSoft: 'rgba(224,112,95,0.15)',
  blue: '#86A9D3',
  blueSoft: 'rgba(134,169,211,0.15)',
  purple: '#A898D6',
  purpleSoft: 'rgba(168,152,214,0.15)',
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

/** The glow of a lit LED line. */
export const GLOW = `0 0 10px ${C.glow}`;

export const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  inquiry: { label: 'New request', color: C.blue, bg: C.blueSoft },
  awaiting_deposit: { label: 'Awaiting deposit', color: C.warn, bg: C.warnSoft },
  confirmed: { label: 'Confirmed', color: C.green, bg: C.greenSoft },
  completed: { label: 'Completed', color: C.muted, bg: 'rgba(188,181,169,0.12)' },
  cancelled: { label: 'Cancelled', color: C.danger, bg: C.dangerSoft },
  declined: { label: 'Declined', color: C.danger, bg: C.dangerSoft },
};

export const EVENT_COLORS = {
  rental: C.gold,
  rehearsal: C.purple,
  performance: C.curtain,
  tentative: C.blue,
};
