import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Empty, Group, Line, Screen, Segmented } from '@/components/ui';
import { fmtDate, fmtTime, money } from '@/lib/dates';
import { salesSummary, seatLabel } from '@/lib/seating';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

/** Shows on sale and the tickets you have. The owner's box office lives in the Business tab. */
export default function Tickets() {
  const [tab, setTab] = useState<'shows' | 'mine'>('shows');
  return (
    <Screen>
      <Segmented options={['shows', 'mine'] as const} value={tab} onChange={setTab} labels={{ shows: 'Shows', mine: 'My tickets' }} />
      {tab === 'shows' ? <ShowList /> : <MyTickets />}
    </Screen>
  );
}

function ShowList() {
  const performances = useStore((s) => s.performances);
  const now = new Date();
  const list = performances.filter((p) => p.onSale && new Date(p.start) > now).sort((a, b) => a.start.localeCompare(b.start));
  if (!list.length) return <Empty icon="ticket-outline" title="No shows on sale right now" />;
  return (
    <Group>
      {list.map((p) => {
        const s = salesSummary(p.seats, now);
        const from = Math.min(...Object.values(p.prices));
        return (
          <Line
            key={p.id}
            dot={C.curtain}
            title={p.title}
            detail={`${fmtDate(p.start, { weekday: true })} · ${fmtTime(p.start)} · from ${money(from)}`}
            value={s.available === 0 ? 'Sold out' : s.available < 40 ? `${s.available} left` : undefined}
            valueColor={C.warn}
            onPress={() => router.push(`/performance/${p.id}`)}
          />
        );
      })}
    </Group>
  );
}

function MyTickets() {
  const user = useCurrentUser();
  const orders = useStore((s) => s.orders);
  const tickets = useStore((s) => s.tickets);
  const performances = useStore((s) => s.performances);
  const mine = useMemo(() => {
    const ids = new Set(orders.filter((o) => o.buyerUserId === user.id).map((o) => o.id));
    return tickets.filter((t) => ids.has(t.orderId) && !t.void);
  }, [orders, tickets, user.id]);

  if (!mine.length) return <Empty icon="ticket-outline" title="No tickets yet" body="Seats you buy show up here with a code for the door." />;
  return (
    <Group>
      {mine.map((t) => {
        const p = performances.find((x) => x.id === t.performanceId);
        return (
          <Line
            key={t.id}
            dot={t.checkedInAt ? C.green : C.curtain}
            title={p?.title ?? 'Ticket'}
            detail={`${p ? fmtDate(p.start, { weekday: true }) + ' · ' : ''}${seatLabel(t.seatId)}`}
            value={t.checkedInAt ? 'Used' : undefined}
            onPress={() => router.push(`/ticket/${t.id}`)}
          />
        );
      })}
    </Group>
  );
}
