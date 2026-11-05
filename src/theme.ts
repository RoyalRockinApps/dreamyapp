import type { BookingStatus } from '@/lib/types';

// "House lights down" palette: midnight velvet, marquee gold, curtain red.
export const C = {
  bg: '#0E0B1A',
  surface: '#191430',
  surface2: '#231C40',
  border: '#30285A',
  text: '#F6F1E7',
  muted: '#A69EC2',
  faint: '#6F6791',
  gold: '#E8B04B',
  goldSoft: 'rgba(232,176,75,0.15)',
  curtain: '#B3263A',
  green: '#5CC08B',
  greenSoft: 'rgba(92,192,139,0.15)',
  warn: '#F2A65A',
  warnSoft: 'rgba(242,166,90,0.15)',
  danger: '#E26D5C',
  dangerSoft: 'rgba(226,109,92,0.15)',
  blue: '#6FA8F5',
  blueSoft: 'rgba(111,168,245,0.15)',
  purple: '#A48CF0',
  purpleSoft: 'rgba(164,140,240,0.15)',
};

export const R = { sm: 8, md: 12, lg: 18, xl: 24 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };


export const STATUS_META: Record<BookingStatus, { label: string; color: string; bg: string }> = {
  inquiry: { label: 'New request', color: C.blue, bg: C.blueSoft },
  awaiting_deposit: { label: 'Awaiting deposit', color: C.warn, bg: C.warnSoft },
  confirmed: { label: 'Confirmed', color: C.green, bg: C.greenSoft },
  completed: { label: 'Completed', color: C.muted, bg: 'rgba(166,158,194,0.12)' },
  cancelled: { label: 'Cancelled', color: C.danger, bg: C.dangerSoft },
  declined: { label: 'Declined', color: C.danger, bg: C.dangerSoft },
};

export const EVENT_COLORS = {
  rental: C.gold,
  rehearsal: C.purple,
  performance: C.curtain,
  tentative: C.blue,
};
