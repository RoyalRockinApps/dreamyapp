import { router } from 'expo-router';

import { Line } from '@/components/ui';
import { fmtDate, money } from '@/lib/dates';
import { outstanding } from '@/lib/pricing';
import type { Booking } from '@/lib/types';
import { C, STATUS_META } from '@/theme';

/** One booking in a list: date, status and anything still owed. */
export function BookingLine({ b }: { b: Booking }) {
  const meta = STATUS_META[b.status];
  const due = outstanding(b);
  const live = !['cancelled', 'declined', 'completed'].includes(b.status);
  return (
    <Line
      dot={meta.color}
      title={b.title}
      detail={`${fmtDate(b.start, { weekday: true })} · ${meta.label}`}
      value={live && due > 0 ? `${money(due)} due` : undefined}
      valueColor={C.warn}
      onPress={() => router.push(`/booking/${b.id}`)}
    />
  );
}
