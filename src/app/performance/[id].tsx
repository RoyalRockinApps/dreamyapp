import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { CardForm } from '@/components/CardForm';
import { SeatMap, TIER_COLOR } from '@/components/SeatMap';
import { Button, Card, Chips, Divider, Empty, Field, KeyValue, ListItem, Pill, Row, Screen, Segmented, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { fmtDate, fmtTime, money } from '@/lib/dates';
import {
  bestAvailable,
  orderTotals,
  orphanedSeats,
  priceFor,
  salesSummary,
  seatAvailability,
  seatById,
  seatLabel,
  SeatUnavailableError,
  seatsAreTogether,
  TIER_LABEL,
  type Availability,
} from '@/lib/seating';
import type { Order, PriceTier, Seat } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

const MAX_SEATS = 10;
type Mode = 'sell' | 'comp' | 'block';

export default function PerformanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const isOwner = user.role === 'owner';
  const perf = useStore((s) => s.performances.find((p) => p.id === id));
  const orders = useStore((s) => s.orders);
  const tickets = useStore((s) => s.tickets);
  const hold = useStore((s) => s.hold);
  const release = useStore((s) => s.release);
  const purchase = useStore((s) => s.purchase);
  const block = useStore((s) => s.block);
  const refundTicket = useStore((s) => s.refundTicket);
  const updatePerformance = useStore((s) => s.updatePerformance);
  const now = useNow(1000);

  const [phase, setPhase] = useState<'pick' | 'checkout' | 'done'>('pick');
  const [mode, setMode] = useState<Mode>('sell');
  const [blockSel, setBlockSel] = useState<string[]>([]);
  const [count, setCount] = useState('2');
  const [buyerName, setBuyerName] = useState(isOwner ? '' : user.name);
  const [buyerEmail, setBuyerEmail] = useState(isOwner ? '' : user.email);
  const [payWith, setPayWith] = useState<'card' | 'cash'>('card');
  const [order, setOrder] = useState<Order | null>(null);
  const warnedExpiry = useRef(false);

  const mine = useMemo(
    () => (perf ? Object.keys(perf.seats).filter((sid) => seatAvailability(perf.seats, sid, user.id, now) === 'mine') : []),
    [perf, user.id, now],
  );
  const holdExpiry = useMemo(() => {
    if (!perf || !mine.length) return null;
    return Math.min(...mine.map((sid) => new Date(perf.seats[sid].holdExpiresAt ?? 0).getTime()));
  }, [perf, mine]);
  const secondsLeft = holdExpiry ? Math.max(0, Math.round((holdExpiry - now.getTime()) / 1000)) : 0;

  // Release our holds if we leave the screen without buying.
  useEffect(() => () => useStore.getState().release(id), [id]);

  useEffect(() => {
    if (holdExpiry && secondsLeft === 0 && phase !== 'done' && !warnedExpiry.current) {
      warnedExpiry.current = true;
      release(id);
      setPhase('pick');
      Alert.alert('Time’s up', 'Your seats were released so others can buy them. Pick again whenever you’re ready.');
    }
    if (secondsLeft > 0) warnedExpiry.current = false;
  }, [secondsLeft, holdExpiry, phase, id, release]);

  if (!perf) return <Empty icon="alert-circle-outline" title="Performance not found" />;
  const p = perf;
  const isPast = new Date(p.start) < now;
  const stats = salesSummary(p.seats, now);
  const totals = orderTotals(mine, p.prices);
  const orphans = orphanedSeats(p.seats, mine, user.id, now);

  const tryHold = (ids: string[]) => {
    try {
      hold(p.id, ids);
    } catch (e) {
      if (e instanceof SeatUnavailableError) Alert.alert('Seat just taken', e.message);
      else throw e;
    }
  };

  const onSeat = (seat: Seat, a: Availability) => {
    if (isOwner && mode === 'block') {
      if (a === 'sold') return inspectSold(seat.id);
      setBlockSel((s) => (s.includes(seat.id) ? s.filter((x) => x !== seat.id) : [...s, seat.id]));
      return;
    }
    if (a === 'mine') return release(p.id, [seat.id]);
    if (a === 'available') {
      if (mine.length >= MAX_SEATS) return Alert.alert(`Limit ${MAX_SEATS} seats per order`);
      return tryHold([seat.id]);
    }
    if (isOwner && a === 'sold') return inspectSold(seat.id);
    if (isOwner && a === 'blocked') {
      return Alert.alert(`${seatLabel(seat.id)} is held back`, p.seats[seat.id]?.note ?? 'Blocked by the box office', [
        { text: 'Keep blocked', style: 'cancel' },
        { text: 'Release to sale', onPress: () => block(p.id, [seat.id], false) },
      ]);
    }
  };

  const inspectSold = (seatId: string) => {
    const t = tickets.find((x) => x.performanceId === p.id && x.seatId === seatId && !x.void);
    const o = orders.find((x) => x.id === t?.orderId);
    Alert.alert(seatLabel(seatId), o ? `${o.buyerName}\n${o.buyerEmail}\nTicket ${t?.code}${t?.checkedInAt ? '\nChecked in ✓' : ''}` : 'Sold', [
      { text: 'Close', style: 'cancel' },
      ...(t && !t.checkedInAt ? [{ text: 'Refund & release seat', style: 'destructive' as const, onPress: () => refundTicket(t.id) }] : []),
    ]);
  };

  const pickBest = () => {
    const n = Number(count);
    release(p.id);
    const ids = bestAvailable(p.seats, n, user.id, new Date(), { accessible: false });
    if (!ids) return Alert.alert('No block of seats together', `We couldn't find ${n} seats side by side. Try fewer seats or pick them on the map.`);
    tryHold(ids);
  };

  const complete = (method: Order['method']) => {
    if (!buyerName.trim() || !/^\S+@\S+\.\S+$/.test(buyerEmail)) {
      Alert.alert('Add the buyer’s name and email so we can send the tickets');
      return false;
    }
    try {
      const o = purchase(p.id, mine, { name: buyerName.trim(), email: buyerEmail.trim() }, method);
      setOrder(o);
      setPhase('done');
      return true;
    } catch (e) {
      if (e instanceof SeatUnavailableError) {
        Alert.alert('Seat no longer available', e.message);
        setPhase('pick');
        return false;
      }
      throw e;
    }
  };

  // ---------- Done ----------
  if (phase === 'done' && order) {
    const orderTickets = tickets.filter((t) => t.orderId === order.id);
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Confirmed' }} />
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
          <Ionicons name="checkmark-circle" size={72} color={C.green} />
          <Txt v="h1">{order.method === 'comp' ? 'Comps issued' : 'You’re going!'}</Txt>
          <Txt v="muted" style={{ textAlign: 'center' }}>{`${p.title} · ${fmtDate(p.start, { weekday: true })} at ${fmtTime(p.start)}\nTickets sent to ${order.buyerEmail}`}</Txt>
        </View>
        <Card>
          {orderTickets.map((t) => (
            <ListItem key={t.id} icon="qr-code" title={seatLabel(t.seatId)} subtitle={t.code} onPress={() => router.push(`/ticket/${t.id}`)} />
          ))}
          <Divider />
          <KeyValue k="Total" v={money(order.total, true)} strong />
        </Card>
        <Button title={isOwner ? 'Sell more seats' : 'Done'} onPress={() => (isOwner ? (setPhase('pick'), setOrder(null), setBuyerName(''), setBuyerEmail('')) : router.back())} />
      </Screen>
    );
  }

  // ---------- Checkout ----------
  if (phase === 'checkout') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Checkout' }} />
        <HoldTimer seconds={secondsLeft} />
        <Card>
          <Txt v="h3">{p.title}</Txt>
          <Txt v="muted">{`${fmtDate(p.start, { weekday: true, year: true })} · ${fmtTime(p.start)}`}</Txt>
          <Divider />
          {mine.map((sid) => (
            <KeyValue key={sid} k={`${seatLabel(sid)} · ${TIER_LABEL[seatById(sid)!.tier]}`} v={mode === 'comp' ? 'Comp' : money(priceFor(sid, p.prices), true)} />
          ))}
          {mode !== 'comp' && (
            <>
              <KeyValue k="Service fees" v={money(totals.fees, true)} />
              <Divider />
              <KeyValue k="Total" v={money(totals.total, true)} strong color={C.gold} />
            </>
          )}
        </Card>
        <Field label="Name for the tickets" value={buyerName} onChangeText={setBuyerName} />
        <Field label="Email for delivery" value={buyerEmail} onChangeText={setBuyerEmail} keyboardType="email-address" autoCapitalize="none" />
        {isOwner && mode === 'comp' ? (
          <Button title={`Issue ${mine.length} comp ticket${mine.length > 1 ? 's' : ''}`} icon="gift" onPress={() => complete('comp')} />
        ) : isOwner && payWith === 'cash' ? (
          <>
            <Chips options={['card', 'cash'] as const} value={payWith} onChange={setPayWith} labels={{ card: 'Card', cash: 'Cash at the door' }} />
            <Button title={`Take ${money(totals.total, true)} cash`} icon="cash" onPress={() => complete('cash')} />
          </>
        ) : (
          <>
            {isOwner && <Chips options={['card', 'cash'] as const} value={payWith} onChange={setPayWith} labels={{ card: 'Card', cash: 'Cash at the door' }} />}
            <CardForm amount={totals.total} description={`${p.title} tickets`} defaultName={buyerName} onPaid={() => complete('card')} cta={`Pay ${money(totals.total, true)}`} />
          </>
        )}
        <Button variant="ghost" title="Back to seat map" onPress={() => setPhase('pick')} />
      </Screen>
    );
  }

  // ---------- Pick seats ----------
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: isOwner ? 'Box Office' : 'Choose Seats' }} />
      <Screen>
        <Card accent={C.curtain}>
          <Txt v="h2">{p.title}</Txt>
          {p.subtitle ? <Txt v="muted">{p.subtitle}</Txt> : null}
          <Txt v="small">{`${fmtDate(p.start, { weekday: true, year: true })} · ${fmtTime(p.start)} · Doors ${fmtTime(new Date(new Date(p.start).getTime() - p.doorsMins * 60000))}`}</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {(Object.keys(p.prices) as PriceTier[]).map((t) => (
              <Pill key={t} label={`${TIER_LABEL[t]} ${money(p.prices[t])}`} color={TIER_COLOR[t]} bg={TIER_COLOR[t] + '22'} />
            ))}
          </Row>
          <Txt v="small">{`${stats.available} of ${stats.capacity} seats available`}</Txt>
        </Card>

        {isPast && <Txt v="muted">This performance has already happened.</Txt>}
        {!p.onSale && !isOwner && <Empty icon="pause-circle-outline" title="Not on sale" body="Check back soon!" />}

        {isOwner && (
          <>
            <Segmented options={['sell', 'comp', 'block'] as const} value={mode} onChange={(m) => { setMode(m); setBlockSel([]); }} labels={{ sell: 'Sell', comp: 'Comp', block: 'Hold back seats' }} />
            <Row>
              <Button small style={{ flex: 1 }} variant="secondary" icon={p.onSale ? 'pause' : 'play'} title={p.onSale ? 'Take off sale' : 'Put on sale'} onPress={() => updatePerformance(p.id, { onSale: !p.onSale })} />
              <Button small style={{ flex: 1 }} variant="secondary" icon="qr-code" title="Door check-in" onPress={() => router.push(`/checkin/${p.id}`)} />
            </Row>
          </>
        )}

        {(p.onSale || isOwner) && !isPast && (
          <>
            {mode !== 'block' && (
              <Card>
                <Txt v="label">Best available</Txt>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Chips options={['1', '2', '3', '4', '5', '6']} value={count} onChange={setCount} />
                  </View>
                </Row>
                <Button small variant="secondary" icon="sparkles" title={`Find ${count} seat${count === '1' ? '' : 's'} together`} onPress={pickBest} />
              </Card>
            )}
            <SeatMap claims={p.seats} holderId={user.id} selected={mode === 'block' ? blockSel : mine} onToggle={onSeat} manage={isOwner} now={now} />
            {mode !== 'block' && <Txt v="small">Tap a seat to add it. Accessible spaces (♿) can also be booked through the box office.</Txt>}
          </>
        )}
      </Screen>

      {/* Sticky footer */}
      {mode === 'block' && isOwner ? (
        blockSel.length > 0 && (
          <Footer>
            <Txt v="h3" style={{ flex: 1 }}>{`${blockSel.length} selected`}</Txt>
            <Button small variant="secondary" title="Release" onPress={() => { block(p.id, blockSel, false); setBlockSel([]); }} />
            <Button small title="Hold back" onPress={() => { block(p.id, blockSel, true, 'Held by box office'); setBlockSel([]); }} />
          </Footer>
        )
      ) : (
        mine.length > 0 && (
          <Footer>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">{`${mine.length} seat${mine.length > 1 ? 's' : ''} · ${mode === 'comp' ? 'Comp' : money(totals.total, true)}`}</Txt>
              <Txt v="small" numberOfLines={1}>{mine.map((s) => s.replace('-', '')).join(', ')}</Txt>
              {orphans.length > 0 ? (
                <Txt v="small" color={C.warn}>{`Leaves a single empty seat (${orphans.join(', ')}) — consider shifting over.`}</Txt>
              ) : !seatsAreTogether(mine) && mine.length > 1 ? (
                <Txt v="small" color={C.warn}>Heads up: these seats aren’t side by side.</Txt>
              ) : (
                <Txt v="small" color={secondsLeft < 60 ? C.danger : C.muted}>{`Held for you · ${fmtCountdown(secondsLeft)}`}</Txt>
              )}
            </View>
            <Button title={mode === 'comp' ? 'Issue comps' : 'Checkout'} icon="arrow-forward" onPress={() => setPhase('checkout')} />
          </Footer>
        )
      )}
    </View>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 28, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border }}>
      {children}
    </View>
  );
}

function fmtCountdown(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function HoldTimer({ seconds }: { seconds: number }) {
  return (
    <Card accent={seconds < 60 ? C.danger : C.gold} style={{ paddingVertical: 10 }}>
      <Row>
        <Ionicons name="timer-outline" size={20} color={seconds < 60 ? C.danger : C.gold} />
        <Txt v="h3" style={{ flex: 1 }}>Seats held for you</Txt>
        <Txt v="h2" color={seconds < 60 ? C.danger : C.gold}>{fmtCountdown(seconds)}</Txt>
      </Row>
    </Card>
  );
}

