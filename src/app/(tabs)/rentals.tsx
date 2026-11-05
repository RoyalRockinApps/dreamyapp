import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { Button, Collapsible, Empty, Group, KeyValue, Line, Screen, Segmented, Txt } from '@/components/ui';
import { fmtDate, money } from '@/lib/dates';
import { outstanding } from '@/lib/pricing';
import type { Booking } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, STATUS_META } from '@/theme';

type Filter = 'action' | 'upcoming' | 'past';

function BookingLine({ b }: { b: Booking }) {
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

export default function Rentals() {
  const user = useCurrentUser();
  return user.role === 'owner' ? <OwnerRentals /> : <RenterRentals />;
}

function OwnerRentals() {
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
    <Screen>
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
    </Screen>
  );
}

function RenterRentals() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const settings = useStore((s) => s.settings);
  const mine = bookings.filter((b) => b.renterId === user.id).sort((a, b) => b.start.localeCompare(a.start));

  return (
    <Screen>
      <Button icon="calendar" title="Check dates & get a quote" onPress={() => router.push('/booking/new')} />

      {mine.length === 0 ? (
        <Empty icon="key-outline" title="No bookings yet" body="Your requests and reservations will show up here." />
      ) : (
        <Group>
          {mine.map((b) => (
            <BookingLine key={b.id} b={b} />
          ))}
        </Group>
      )}

      <Collapsible title="Packages & prices" subtitle={`From ${money(Math.min(...settings.packages.map((p) => p.price), settings.hourlyRate * settings.minHours))}`} icon="pricetags-outline">
        {settings.packages.map((p) => (
          <KeyValue key={p.id} k={`${p.name} · ${p.hours} hrs`} v={money(p.price)} />
        ))}
        <KeyValue k={`Hourly (${settings.minHours} hr min)`} v={`${money(settings.hourlyRate)}/hr`} />
        <Txt v="label" style={{ marginTop: 8 }}>Add-ons</Txt>
        {settings.addOns.map((a) => (
          <KeyValue key={a.id} k={a.name} v={`${money(a.price)}${a.per === 'hour' ? '/hr' : ''}`} />
        ))}
      </Collapsible>

      <Collapsible title="How booking works" icon="information-circle-outline">
        <Txt v="small">{`1. Pick an open date and get a quote.\n2. ${settings.autoApprove ? 'Your date is held' : 'We approve your request and hold the date'} for ${settings.holdHours} hours.\n3. Pay a ${Math.round(settings.depositPercent * 100)}% deposit + ${money(settings.securityDeposit)} refundable security deposit to lock it in.\n4. The balance is due ${settings.balanceDueDays} days before your event.`}</Txt>
        <Txt v="small">{settings.cancellationPolicy}</Txt>
      </Collapsible>
    </Screen>
  );
}
