import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { BookingLine } from '@/components/BookingLine';
import { Button, Card, Empty, Group, ListItem, ProgressBar, Row, Screen, Segmented, Txt } from '@/components/ui';
import { fmtTime, money, relativeDay } from '@/lib/dates';
import { outstanding } from '@/lib/pricing';
import { salesSummary } from '@/lib/seating';
import type { Performance } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

type View_ = 'rentals' | 'boxOffice';

/** The owner's side of the theatre: rentals, the box office, and the admin portal. */
export default function Business() {
  const params = useLocalSearchParams<{ view?: View_ }>();
  const [view, setView] = useState<View_>(params.view === 'boxOffice' ? 'boxOffice' : 'rentals');
  const requests = useStore((s) => s.bookings.filter((b) => b.status === 'inquiry').length);

  return (
    <Screen>
      <Segmented options={['rentals', 'boxOffice'] as const} value={view} onChange={setView} labels={{ rentals: requests ? `Rentals (${requests})` : 'Rentals', boxOffice: 'Box office' }} />
      {view === 'rentals' ? <Rentals /> : <BoxOffice />}
      <Card style={{ marginTop: 8 }}>
        <ListItem icon="settings-outline" title="Admin portal" subtitle="Venue, rates, packages, seating, people and backups" onPress={() => router.push('/admin')} />
      </Card>
    </Screen>
  );
}

type Filter = 'action' | 'upcoming' | 'past';

function Rentals() {
  const bookings = useStore((s) => s.bookings);
  const [filter, setFilter] = useState<Filter>('action');
  const now = new Date().toISOString();

  const list = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => a.start.localeCompare(b.start));
    if (filter === 'action') return sorted.filter((b) => b.status === 'inquiry' || b.status === 'awaiting_deposit' || (b.status === 'confirmed' && outstanding(b) > 0));
    if (filter === 'upcoming') return sorted.filter((b) => b.end >= now && (b.status === 'confirmed' || b.status === 'awaiting_deposit'));
    return sorted.filter((b) => b.end < now || b.status === 'cancelled' || b.status === 'declined').reverse();
  }, [bookings, filter, now]);

  return (
    <View style={{ gap: 12 }}>
      <Segmented options={['action', 'upcoming', 'past'] as const} value={filter} onChange={setFilter} labels={{ action: 'To do', upcoming: 'Upcoming', past: 'Past' }} />
      {list.length === 0 ? (
        <Empty icon="checkmark-done-circle-outline" title="All caught up" />
      ) : (
        <Group>
          {list.map((b) => (
            <BookingLine key={b.id} b={b} />
          ))}
        </Group>
      )}
      <Button icon="add" title="New booking" variant="secondary" onPress={() => router.push('/booking/new')} />
    </View>
  );
}

function BoxOffice() {
  const performances = useStore((s) => s.performances);
  const tickets = useStore((s) => s.tickets);
  const [showPast, setShowPast] = useState(false);
  const now = new Date();
  const list = performances
    .filter((p) => (showPast ? new Date(p.start) < now : new Date(p.start) >= now))
    .sort((a, b) => (showPast ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
  const sold = (p: Performance) => tickets.filter((t) => t.performanceId === p.id && !t.void);
  const next = performances.filter((p) => new Date(p.start) >= now).sort((a, b) => a.start.localeCompare(b.start))[0];

  return (
    <View style={{ gap: 12 }}>
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
      <Row>
        <Button style={{ flex: 1 }} variant="secondary" icon="add" title="New performance" onPress={() => router.push('/performance/new')} />
        {next && <Button style={{ flex: 1 }} variant="secondary" icon="qr-code-outline" title="Door check-in" onPress={() => router.push(`/checkin/${next.id}`)} />}
      </Row>
    </View>
  );
}
