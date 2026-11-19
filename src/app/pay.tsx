import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CardForm } from '@/components/CardForm';
import { Button, Card, Divider, Empty, KeyValue, Screen, Txt } from '@/components/ui';
import { fmtDate, fmtRange, money } from '@/lib/dates';
import { amountPaid, outstanding } from '@/lib/pricing';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function Pay() {
  const { bookingId, kind } = useLocalSearchParams<{ bookingId: string; kind?: 'deposit' | 'balance' }>();
  const user = useCurrentUser();
  const booking = useStore((s) => s.bookings.find((b) => b.id === bookingId));
  const addPayment = useStore((s) => s.addPayment);
  const [done, setDone] = useState<{ amount: number; ref: string } | null>(null);

  if (!booking) return <Empty icon="alert-circle-outline" title="Booking not found" />;
  const paid = amountPaid(booking);
  const amount = kind === 'balance' ? outstanding(booking) : Math.max(0, booking.quote.depositDue - paid);

  if (done) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <Ionicons name="checkmark-circle" size={72} color={C.green} />
          <Txt v="h1">{kind === 'balance' ? 'Paid in full!' : 'Your date is locked in!'}</Txt>
          <Txt v="muted" style={{ textAlign: 'center' }}>{`${money(done.amount, true)} charged to ${done.ref}. A receipt has been sent to ${booking.contactEmail}.`}</Txt>
        </View>
        <Card>
          <Txt v="h3">{booking.title}</Txt>
          <Txt v="muted">{fmtRange(booking.start, booking.end)}</Txt>
          {kind !== 'balance' && <Txt v="small">{`Remaining ${money(booking.quote.balanceDue, true)} due by ${fmtDate(booking.quote.balanceDueDate, { year: true })}.`}</Txt>}
        </Card>
        <Button title="View booking" onPress={() => router.replace(`/booking/${booking.id}`)} />
      </Screen>
    );
  }

  if (amount <= 0) return <Empty icon="checkmark-done-circle-outline" title="Nothing due right now" />;

  return (
    <Screen>
      <Card accent={C.accent}>
        <Txt v="label">{kind === 'balance' ? 'Remaining balance' : 'Reservation deposit'}</Txt>
        <Txt v="h2">{booking.title}</Txt>
        <Txt v="muted">{fmtRange(booking.start, booking.end)}</Txt>
        <Divider />
        {kind !== 'balance' && (
          <>
            <KeyValue k={`Reservation (${Math.round((booking.quote.depositDue - booking.quote.securityDeposit) / booking.quote.rentalTotal * 100)}% of rental)`} v={money(booking.quote.depositDue - booking.quote.securityDeposit, true)} />
            <KeyValue k="Refundable security deposit" v={money(booking.quote.securityDeposit, true)} />
          </>
        )}
        {paid > 0 && <KeyValue k="Already paid" v={`-${money(paid, true)}`} />}
        <KeyValue k="Due today" v={money(amount, true)} strong color={C.accent} />
      </Card>
      <CardForm
        amount={amount}
        description={`${booking.title} ${kind ?? 'deposit'}`}
        defaultName={user.role === 'owner' ? booking.contactName : user.name}
        onPaid={(ref) => {
          addPayment(booking.id, { amount, kind: kind === 'balance' ? 'balance' : 'deposit', method: 'card', reference: ref });
          setDone({ amount, ref });
        }}
      />
    </Screen>
  );
}
