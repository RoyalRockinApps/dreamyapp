import { useEffect, useMemo, useState } from 'react';

import { buildAgenda, type AgendaItem } from '@/lib/agenda';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export const KIND_COLOR: Record<AgendaItem['kind'], string> = {
  rental: C.gold,
  tentative: C.blue,
  rehearsal: C.purple,
  performance: C.curtain,
  unavailable: C.faint,
};

export const KIND_LABEL: Record<AgendaItem['kind'], string> = {
  rental: 'Rental',
  tentative: 'Tentative',
  rehearsal: 'Rehearsal',
  performance: 'Performance',
  unavailable: 'Unavailable',
};

export function useAgenda() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const schedule = useStore((s) => s.schedule);
  const productions = useStore((s) => s.productions);
  const performances = useStore((s) => s.performances);
  return useMemo(() => buildAgenda({ bookings, schedule, productions, performances, user }), [bookings, schedule, productions, performances, user]);
}

/** Re-render every `ms` so countdowns and "now" based views stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
