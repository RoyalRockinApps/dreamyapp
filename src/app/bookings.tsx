import { router } from 'expo-router';

import { BookingLine } from '@/components/BookingLine';
import { Button, Collapsible, Empty, Group, KeyValue, Screen, Txt } from '@/components/ui';
import { money } from '@/lib/dates';
import { useCurrentUser, useStore } from '@/store/useStore';

/** A renter's own bookings, with how booking works and the prices. Reached from Me and from Home. */
export default function MyBookings() {
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
