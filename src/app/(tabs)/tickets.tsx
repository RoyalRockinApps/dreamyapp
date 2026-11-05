import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Empty, ListItem, Pill, ProgressBar, Row, Screen, SectionHeader, Segmented, Stat, Txt } from '@/components/ui';
import { fmtDate, fmtTime, money, relativeDay } from '@/lib/dates';
import { salesSummary, seatLabel } from '@/lib/seating';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function Tickets() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<'shows' | 'mine'>('shows');
  const isOwner = user.role === 'owner';
  return (
    <Screen>
      {!isOwner && <Segmented options={['shows', 'mine'] as const} value={tab} onChange={setTab} labels={{ shows: 'Buy tickets', mine: 'My tickets' }} />}
      {isOwner ? <BoxOffice /> : tab === 'shows' ? <ShowList /> : <MyTickets />}
    </Screen>
  );
}

function ShowList() {
  const performances = useStore((s) => s.performances);
  const now = new Date();
  const list = performances.filter((p) => p.onSale && new Date(p.start) > now).sort((a, b) => a.start.localeCompare(b.start));
  if (!list.length) return <Empty icon="ticket-outline" title="No shows on sale right now" />;
  return (
    <>
      {list.map((p) => {
        const s = salesSummary(p.seats, now);
        const low = s.available < 40;
        const from = Math.min(...Object.values(p.prices));
        return (
          <Card key={p.id} onPress={() => router.push(`/performance/${p.id}`)} accent={C.curtain}>
            <Row>
              <Pill label={relativeDay(p.start)} color={C.curtain} bg={C.curtain + '22'} />
              {low && <Pill label={s.available === 0 ? 'Sold out' : `Only ${s.available} left`} color={C.warn} bg={C.warnSoft} icon="flame" />}
            </Row>
            <Txt v="h2">{p.title}</Txt>
            {p.subtitle ? <Txt v="muted">{p.subtitle}</Txt> : null}
            <Txt v="small">{`${fmtDate(p.start, { weekday: true, year: true })} · ${fmtTime(p.start)} · Doors ${fmtTime(new Date(new Date(p.start).getTime() - p.doorsMins * 60000))}`}</Txt>
            <Row>
              <Txt v="h3" color={C.gold}>{`From ${money(from)}`}</Txt>
              <View style={{ flex: 1 }} />
              <Button small title={s.available ? 'Pick seats' : 'Sold out'} disabled={!s.available} onPress={() => router.push(`/performance/${p.id}`)} />
            </Row>
          </Card>
        );
      })}
    </>
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

  if (!mine.length) return <Empty icon="ticket-outline" title="No tickets yet" body="Seats you buy will appear here with a scannable code for the door." />;
  const byPerf = performances.filter((p) => mine.some((t) => t.performanceId === p.id)).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      {byPerf.map((p) => (
        <Card key={p.id} accent={C.curtain}>
          <Txt v="h2">{p.title}</Txt>
          <Txt v="muted">{`${fmtDate(p.start, { weekday: true, year: true })} · ${fmtTime(p.start)}`}</Txt>
          {mine
            .filter((t) => t.performanceId === p.id)
            .map((t) => (
              <ListItem key={t.id} icon={t.checkedInAt ? 'checkmark-done' : 'qr-code'} iconColor={t.checkedInAt ? C.green : C.gold} title={seatLabel(t.seatId)} subtitle={t.code} onPress={() => router.push(`/ticket/${t.id}`)} />
            ))}
        </Card>
      ))}
    </>
  );
}

function BoxOffice() {
  const performances = useStore((s) => s.performances);
  const orders = useStore((s) => s.orders);
  const tickets = useStore((s) => s.tickets);
  const [showPast, setShowPast] = useState(false);
  const now = new Date();
  const list = performances.filter((p) => (showPast ? new Date(p.start) < now : new Date(p.start) >= now)).sort((a, b) => a.start.localeCompare(b.start));
  const live = tickets.filter((t) => !t.void);
  const gross = live.reduce((s, t) => s + t.price, 0);
  const upcomingIds = new Set(performances.filter((p) => new Date(p.start) >= now).map((p) => p.id));
  const upcomingSold = live.filter((t) => upcomingIds.has(t.performanceId)).length;
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thisWeek = orders.filter((o) => o.at >= weekAgo).reduce((s, o) => s + o.seatIds.length, 0);

  return (
    <>
      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <Stat icon="ticket-outline" label="Tickets sold (upcoming)" value={String(upcomingSold)} sub={`${thisWeek} sold in the last 7 days`} />
        <Stat icon="cash-outline" label="Ticket gross" value={money(gross)} color={C.green} sub="All performances, before fees" />
      </Row>
      <Button icon="add" title="New performance" onPress={() => router.push('/performance/new')} />
      <Segmented options={['upcoming', 'past'] as const} value={showPast ? 'past' : 'upcoming'} onChange={(v) => setShowPast(v === 'past')} labels={{ upcoming: 'Upcoming', past: 'Past' }} />
      {list.length === 0 && <Empty icon="ticket-outline" title="No performances" />}
      {list.map((p) => {
        const s = salesSummary(p.seats, now);
        const rev = live.filter((t) => t.performanceId === p.id).reduce((x, t) => x + t.price, 0);
        const checked = live.filter((t) => t.performanceId === p.id && t.checkedInAt).length;
        return (
          <Card key={p.id} accent={C.curtain}>
            <Row>
              <Pill label={relativeDay(p.start)} color={C.curtain} bg={C.curtain + '22'} />
              {!p.onSale && <Pill label="Off sale" color={C.warn} bg={C.warnSoft} />}
              <View style={{ flex: 1 }} />
              <Txt v="h3" color={C.green}>{money(rev)}</Txt>
            </Row>
            <Txt v="h2">{p.title}</Txt>
            <Txt v="muted">{`${fmtDate(p.start, { weekday: true })} · ${fmtTime(p.start)}${p.subtitle ? ' · ' + p.subtitle : ''}`}</Txt>
            <ProgressBar value={(s.sold + s.comp) / s.sellable} color={C.curtain} />
            <Txt v="small">{`${s.sold} sold · ${s.comp} comp · ${s.blocked} held back · ${s.available} available${checked ? ` · ${checked} checked in` : ''}`}</Txt>
            <Row>
              <Button small style={{ flex: 1 }} variant="secondary" icon="grid" title="Seat map / sell" onPress={() => router.push(`/performance/${p.id}`)} />
              <Button small style={{ flex: 1 }} variant="secondary" icon="qr-code" title="Check-in" onPress={() => router.push(`/checkin/${p.id}`)} />
            </Row>
          </Card>
        );
      })}
      <SectionHeader title="How seats stay safe" />
      <Txt v="small">
        Seats are held for 8 minutes while a buyer checks out, then automatically released. The moment a ticket is purchased its seat is blocked for everyone — no double-selling. Refunds release the seat back to inventory.
      </Txt>
    </>
  );
}
