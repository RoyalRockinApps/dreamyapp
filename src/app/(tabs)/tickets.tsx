import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Empty, Group, Line, ProgressBar, Row, Screen, Segmented, Txt } from '@/components/ui';
import { fmtDate, fmtTime, money, relativeDay } from '@/lib/dates';
import { salesSummary, seatLabel } from '@/lib/seating';
import type { Performance } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function Tickets() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<'shows' | 'mine'>('shows');
  if (user.role === 'owner') return <BoxOffice />;
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

function BoxOffice() {
  const performances = useStore((s) => s.performances);
  const tickets = useStore((s) => s.tickets);
  const [showPast, setShowPast] = useState(false);
  const now = new Date();
  const list = performances.filter((p) => (showPast ? new Date(p.start) < now : new Date(p.start) >= now)).sort((a, b) => (showPast ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  const sold = (p: Performance) => tickets.filter((t) => t.performanceId === p.id && !t.void);

  return (
    <Screen>
      <Segmented options={['upcoming', 'past'] as const} value={showPast ? 'past' : 'upcoming'} onChange={(v) => setShowPast(v === 'past')} labels={{ upcoming: 'Upcoming', past: 'Past' }} />
      {list.length === 0 && <Empty icon="ticket-outline" title="No performances" />}
      {list.length > 0 && (
        <Group>
          {list.map((p) => {
            const s = salesSummary(p.seats, now);
            const gross = sold(p).reduce((x, t) => x + t.price, 0);
            return (
              <Pressable key={p.id} onPress={() => router.push(`/performance/${p.id}`)} style={({ pressed }) => ({ paddingVertical: 12, gap: 8, opacity: pressed ? 0.6 : 1 })}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Txt v="h3" numberOfLines={1}>{p.title}</Txt>
                    <Txt v="small">{`${relativeDay(p.start)} · ${fmtTime(p.start)}${p.onSale ? '' : ' · off sale'}`}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt v="h3">{`${s.sold + s.comp}/${s.sellable}`}</Txt>
                    <Txt v="small">{money(gross)}</Txt>
                  </View>
                </Row>
                <ProgressBar value={(s.sold + s.comp) / s.sellable} color={C.curtain} />
              </Pressable>
            );
          })}
        </Group>
      )}
      <Button variant="secondary" icon="add" title="New performance" onPress={() => router.push('/performance/new')} />
    </Screen>
  );
}
