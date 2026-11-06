import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Share, View } from 'react-native';

import { Button, Card, Chips, Collapsible, Divider, Empty, Field, IconButton, KeyValue, ListItem, Pill, ProgressBar, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { fmtDate, fmtRange, fmtTime, money, relativeDay } from '@/lib/dates';
import { amountPaid, bookingSummaryText, grandTotal, outstanding } from '@/lib/pricing';
import type { PaymentMethod } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, STATUS_META } from '@/theme';
import { alert } from '@/components/alert';

function confirm(title: string, message: string, onYes: () => void, destructive = false) {
  alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Yes', style: destructive ? 'destructive' : 'default', onPress: onYes },
  ]);
}

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const isOwner = user.role === 'owner';
  const booking = useStore((s) => s.bookings.find((b) => b.id === id));
  const venue = useStore((s) => s.venue);
  const settings = useStore((s) => s.settings);
  const performances = useStore((s) => s.performances);
  const setStatus = useStore((s) => s.setBookingStatus);
  const updateBooking = useStore((s) => s.updateBooking);
  const addPayment = useStore((s) => s.addPayment);
  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('check');
  const [reference, setReference] = useState('');

  if (!booking) return <Empty icon="alert-circle-outline" title="Booking not found" />;
  if (!isOwner && booking.renterId !== user.id) return <Empty icon="lock-closed-outline" title="This booking is private" />;

  const b = booking;
  const meta = STATUS_META[b.status];
  const paid = amountPaid(b);
  const due = outstanding(b);
  const depositRemaining = Math.max(0, b.quote.depositDue - paid);
  const isPastEvent = new Date(b.end) < new Date();
  const live = !['cancelled', 'declined'].includes(b.status);
  const linkedShows = performances.filter((p) => p.bookingId === b.id);
  const securityRefunded = b.payments.some((p) => p.kind === 'security_refund');
  const holdExpired = b.status === 'awaiting_deposit' && !!b.holdExpiresAt && new Date(b.holdExpiresAt) < new Date();

  const record = () => {
    const n = Number(amount);
    if (!n || n <= 0) return alert('Enter an amount');
    addPayment(b.id, { amount: n, kind: paid < b.quote.depositDue ? 'deposit' : 'balance', method, reference: reference || undefined });
    setRecording(false);
    setAmount('');
    setReference('');
  };

  const shareRequest = () =>
    Share.share({
      title: `${venue.name} — payment request`,
      message: `${bookingSummaryText(b, venue.name)}\n\nPay securely in the Dream Theatre app, or call ${venue.phone}.`,
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Booking' }} />
      <Card accent={meta.color}>
        <Row>
          <Pill label={holdExpired ? 'Hold expired' : meta.label} color={holdExpired ? C.danger : meta.color} bg={holdExpired ? C.dangerSoft : meta.bg} />
        </Row>
        <Txt v="h1">{b.title}</Txt>
        <Txt v="muted">{fmtRange(b.start, b.end)}</Txt>
        <Txt v="small">{`${b.eventType} · ${b.attendance} guests${b.isPublic ? '' : ' · private'}`}</Txt>
        {b.status === 'awaiting_deposit' && b.holdExpiresAt && !holdExpired && (
          <Txt v="small" color={C.warn}>{`Date held until ${relativeDay(b.holdExpiresAt)} ${fmtTime(b.holdExpiresAt)}`}</Txt>
        )}
      </Card>

      {/* ---- Primary actions ---- */}
      {isOwner && b.status === 'inquiry' && (
        <Row>
          <Button title="Decline" variant="danger" style={{ flex: 1 }} onPress={() => confirm('Decline request?', 'The renter will see this request as declined.', () => setStatus(b.id, 'declined'), true)} />
          <Button title="Approve & hold date" icon="checkmark" style={{ flex: 2 }} onPress={() => setStatus(b.id, 'awaiting_deposit')} />
        </Row>
      )}
      {!isOwner && live && depositRemaining > 0 && b.status === 'awaiting_deposit' && !holdExpired && (
        <Button title={`Pay ${money(depositRemaining)} deposit`} icon="lock-closed" onPress={() => router.push(`/pay?bookingId=${b.id}&kind=deposit` as Href)} />
      )}
      {!isOwner && b.status === 'inquiry' && (
        <Card>
          <Txt v="muted">The theatre is reviewing your request. You’ll be able to pay the deposit here as soon as it’s approved.</Txt>
        </Card>
      )}
      {!isOwner && b.status === 'confirmed' && due > 0 && (
        <Button title={`Pay remaining ${money(due)}`} icon="card" onPress={() => router.push(`/pay?bookingId=${b.id}&kind=balance` as Href)} />
      )}

      {/* ---- Money ---- */}
      <Card>
        <Row>
          <Txt v="h2" style={{ flex: 1 }}>{`${money(paid)} paid`}</Txt>
          <Txt v="muted">{`of ${money(grandTotal(b))}`}</Txt>
        </Row>
        <ProgressBar value={paid / grandTotal(b)} color={due === 0 ? C.green : C.accent} />
        <Txt v="small" color={due ? C.warn : C.green}>
          {due === 0 ? 'Paid in full' : depositRemaining > 0 ? `${money(depositRemaining, true)} deposit due now` : `${money(due, true)} balance due ${fmtDate(b.quote.balanceDueDate)}`}
        </Txt>
      </Card>

      <Collapsible title="Payments & quote" subtitle={`Rental ${money(b.quote.rentalTotal)} + ${money(b.quote.securityDeposit)} refundable deposit`} icon="receipt-outline">
        {b.quote.lines.map((l) => (
          <KeyValue key={l.label} k={l.label} v={money(l.amount, true)} />
        ))}
        <KeyValue k="Security deposit (refundable)" v={money(b.quote.securityDeposit, true)} />
        <Divider />
        <KeyValue k="Due to reserve" v={money(b.quote.depositDue, true)} />
        <KeyValue k={`Balance by ${fmtDate(b.quote.balanceDueDate)}`} v={money(b.quote.balanceDue, true)} />
        {b.payments.length > 0 && <Divider />}
        {b.payments.map((p) => (
          <ListItem
            key={p.id}
            icon={p.amount < 0 ? 'return-down-back' : p.method === 'card' ? 'card' : p.method === 'cash' ? 'cash' : 'document-text'}
            iconColor={p.amount < 0 ? C.danger : C.green}
            title={`${money(p.amount, true)} · ${p.kind.replace('_', ' ')}`}
            subtitle={`${fmtDate(p.at, { year: true })}${p.reference ? ' · ' + p.reference : ''}`}
          />
        ))}
        {isOwner && live && (
          <View style={{ gap: 8 }}>
            {!recording ? (
              <Row>
                <Button small variant="secondary" icon="add" title="Record payment" style={{ flex: 1 }} onPress={() => { setAmount(String(depositRemaining || due)); setRecording(true); }} />
                {due > 0 && <Button small variant="secondary" icon="share-outline" title="Send request" style={{ flex: 1 }} onPress={shareRequest} />}
              </Row>
            ) : (
              <View style={{ gap: 10 }}>
                <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
                <Chips options={['check', 'cash', 'card'] as const} value={method} onChange={setMethod} labels={{ check: 'Check', cash: 'Cash', card: 'Card (terminal)' }} />
                <Field label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="Check #, receipt…" />
                <Row>
                  <Button small variant="secondary" title="Cancel" style={{ flex: 1 }} onPress={() => setRecording(false)} />
                  <Button small title="Save payment" style={{ flex: 1 }} onPress={record} />
                </Row>
              </View>
            )}
            {b.status === 'completed' && !securityRefunded && b.quote.securityDeposit > 0 && (
              <Button small variant="secondary" icon="return-down-back" title={`Refund ${money(b.quote.securityDeposit)} security deposit`} onPress={() => confirm('Refund security deposit?', 'Records a refund to the renter.', () => addPayment(b.id, { amount: -b.quote.securityDeposit, kind: 'security_refund', method: 'card' }))} />
            )}
          </View>
        )}
      </Collapsible>

      {/* ---- Ticketing for renters who bought the box office add-on ---- */}
      {(b.ticketed || linkedShows.length > 0) && (
        <>
          <SectionHeader title="Ticket sales" action={isOwner && live ? '+ Add' : undefined} onAction={() => router.push(`/performance/new?bookingId=${b.id}` as Href)} />
          {linkedShows.length === 0 && <Txt v="muted">No performances on sale yet.</Txt>}
          {linkedShows.map((p) => {
            const sold = Object.values(p.seats).filter((c) => c.status === 'sold' || c.status === 'comp').length;
            return <ListItem key={p.id} icon="ticket" iconColor={C.curtain} title={`${fmtDate(p.start, { weekday: true })} · ${fmtTime(p.start)}`} subtitle={`${sold} seats sold`} onPress={() => router.push(`/performance/${p.id}`)} />;
          })}
        </>
      )}

      <Card>
        <Row>
          <View style={{ flex: 1 }}>
            <Txt v="h3">{b.contactName}</Txt>
            {b.organization && b.organization !== b.contactName ? <Txt v="small">{b.organization}</Txt> : null}
          </View>
          <IconButton icon="call" color={C.accent} onPress={() => Linking.openURL(`tel:${b.contactPhone.replace(/\D/g, '')}`)} />
          <IconButton icon="mail" color={C.accent} onPress={() => Linking.openURL(`mailto:${b.contactEmail}?subject=${encodeURIComponent(b.title)}`)} />
        </Row>
        {b.notes ? <Txt v="small">{`“${b.notes}”`}</Txt> : null}
      </Card>

      {/* ---- Secondary actions ---- */}
      {isOwner && live && (
        <Collapsible title="More actions" icon="ellipsis-horizontal-circle-outline">
          {b.status === 'awaiting_deposit' && (
            <Button variant="secondary" icon="time" title={`Extend hold ${settings.holdHours} hrs`} onPress={() => setStatus(b.id, 'awaiting_deposit')} />
          )}
          {b.status === 'confirmed' && isPastEvent && <Button variant="secondary" icon="flag" title="Mark event completed" onPress={() => setStatus(b.id, 'completed')} />}
          {!b.ticketed && b.status !== 'completed' && (
            <Button variant="secondary" icon="ticket" title="Enable assigned-seat ticketing" onPress={() => updateBooking(b.id, { ticketed: true, addOnIds: [...new Set([...b.addOnIds, 'add_tickets'])] })} />
          )}
          {b.status !== 'completed' && (
            <Button variant="danger" icon="close-circle" title="Cancel booking" onPress={() => confirm('Cancel this booking?', 'The date will be released. Refund deposits per your policy from the Payments section.', () => setStatus(b.id, 'cancelled'), true)} />
          )}
        </Collapsible>
      )}
      {!isOwner && (b.status === 'inquiry' || b.status === 'awaiting_deposit') && (
        <Button variant="danger" title="Withdraw request" onPress={() => confirm('Withdraw request?', 'This releases the date.', () => setStatus(b.id, 'cancelled'), true)} />
      )}
    </Screen>
  );
}
