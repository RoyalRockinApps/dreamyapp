import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Empty, KeyValue, Pill, Row, Screen, SectionHeader, Segmented, Txt } from '@/components/ui';
import { fmtRange, money } from '@/lib/dates';
import { amountPaid, outstanding } from '@/lib/pricing';
import type { Booking } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, STATUS_META } from '@/theme';

type Filter = 'action' | 'upcoming' | 'past' | 'all';

function BookingCard({ b }: { b: Booking }) {
  const meta = STATUS_META[b.status];
  const due = outstanding(b);
  const live = b.status !== 'cancelled' && b.status !== 'declined';
  return (
    <Card onPress={() => router.push(`/booking/${b.id}`)} accent={meta.color}>
      <Row>
        <Pill label={meta.label} color={meta.color} bg={meta.bg} />
        {b.ticketed && <Pill label="Ticketed" icon="ticket" color={C.curtain} bg={C.curtain + '22'} />}
        <View style={{ flex: 1 }} />
        <Txt v="small">{b.eventType}</Txt>
      </Row>
      <Txt v="h3">{b.title}</Txt>
      {b.organization && b.organization !== b.title ? <Txt v="small">{b.organization}</Txt> : null}
      <Txt v="muted">{fmtRange(b.start, b.end)}</Txt>
      <Row>
        <Txt v="small">{`Total ${money(b.quote.rentalTotal)}`}</Txt>
        <View style={{ flex: 1 }} />
        {live && due > 0 ? <Txt v="small" color={C.warn}>{`${money(due)} outstanding`}</Txt> : live ? <Txt v="small" color={C.green}>Paid in full</Txt> : null}
      </Row>
    </Card>
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
    switch (filter) {
      case 'action':
        return sorted.filter((b) => b.status === 'inquiry' || b.status === 'awaiting_deposit' || (b.status === 'confirmed' && outstanding(b) > 0));
      case 'upcoming':
        return sorted.filter((b) => b.end >= now && (b.status === 'confirmed' || b.status === 'awaiting_deposit'));
      case 'past':
        return sorted.filter((b) => b.end < now).reverse();
      default:
        return sorted;
    }
  }, [bookings, filter, now]);

  const pipeline = bookings.filter((b) => b.end >= now && ['confirmed', 'awaiting_deposit', 'inquiry'].includes(b.status));
  const booked = pipeline.filter((b) => b.status === 'confirmed').reduce((s, b) => s + b.quote.rentalTotal, 0);
  const pending = pipeline.filter((b) => b.status !== 'confirmed').reduce((s, b) => s + b.quote.rentalTotal, 0);
  const deposits = bookings.reduce((s, b) => s + b.payments.filter((p) => p.kind === 'deposit').reduce((x, p) => x + p.amount, 0), 0);

  return (
    <Screen>
      <Card>
        <Txt v="label">Rental pipeline</Txt>
        <KeyValue k="Confirmed upcoming" v={money(booked)} color={C.green} />
        <KeyValue k="Pending (requests + holds)" v={money(pending)} color={C.warn} />
        <KeyValue k="Deposits collected (all time)" v={money(deposits)} />
      </Card>
      <Button icon="add" title="New booking" onPress={() => router.push('/booking/new')} />
      <Segmented options={['action', 'upcoming', 'past', 'all'] as const} value={filter} onChange={setFilter} labels={{ action: 'To do', upcoming: 'Upcoming', past: 'Past', all: 'All' }} />
      {list.length === 0 && <Empty icon="checkmark-done-circle-outline" title="All caught up" body="No bookings in this view." />}
      {list.map((b) => (
        <BookingCard key={b.id} b={b} />
      ))}
    </Screen>
  );
}

function RenterRentals() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const settings = useStore((s) => s.settings);
  const mine = bookings.filter((b) => b.renterId === user.id).sort((a, b) => b.start.localeCompare(a.start));
  const paid = mine.reduce((s, b) => s + amountPaid(b), 0);

  return (
    <Screen>
      <Card accent={C.gold}>
        <Txt v="h2">Rent the Dream Theatre</Txt>
        <Txt v="muted">
          A newly renovated, family-friendly performance hall in the former Butler High School Theatre — perfect for recitals, concerts, musicals, worship nights and more.
        </Txt>
        <Button icon="calendar" title="Check dates & get a quote" onPress={() => router.push('/booking/new')} />
      </Card>

      <SectionHeader title="Your bookings" />
      {mine.length === 0 ? <Empty icon="key-outline" title="No bookings yet" /> : mine.map((b) => <BookingCard key={b.id} b={b} />)}
      {paid > 0 && <Txt v="small">{`You've paid ${money(paid)} across all bookings.`}</Txt>}

      <SectionHeader title="Packages" />
      {settings.packages.map((p) => (
        <Card key={p.id}>
          <Row>
            <Txt v="h3" style={{ flex: 1 }}>{p.name}</Txt>
            <Txt v="h3" color={C.gold}>{money(p.price)}</Txt>
          </Row>
          <Txt v="small">{`${p.hours} hours · ${p.description}`}</Txt>
        </Card>
      ))}
      <Txt v="small">{`Or book hourly at ${money(settings.hourlyRate)}/hr (${settings.minHours} hr minimum).`}</Txt>

      <SectionHeader title="Add-ons" />
      <Card>
        {settings.addOns.map((a) => (
          <KeyValue key={a.id} k={a.name} v={`${money(a.price)}${a.per === 'hour' ? '/hr' : ''}`} />
        ))}
      </Card>

      <SectionHeader title="How reserving works" />
      <Card>
        <Txt>{`1. Pick an open date and get an instant quote.\n2. ${settings.autoApprove ? 'Your date is held' : 'We review your request, then hold your date'} for ${settings.holdHours} hours.\n3. Pay a ${Math.round(settings.depositPercent * 100)}% reservation deposit + ${money(settings.securityDeposit)} refundable security deposit to lock it in.\n4. Remaining balance is due ${settings.balanceDueDays} days before your event.`}</Txt>
        <Txt v="small">{settings.cancellationPolicy}</Txt>
      </Card>
    </Screen>
  );
}
