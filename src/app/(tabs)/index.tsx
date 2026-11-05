import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { AgendaRow } from '@/components/AgendaRow';
import { Button, Card, Empty, ListItem, Pill, ProgressBar, Row, Screen, SectionHeader, Stat, Txt, type IconName } from '@/components/ui';
import { useAgenda } from '@/hooks/useAgenda';
import { fmtDate, fmtRange, fmtTime, money, relativeDay, WEEKDAYS, MONTHS } from '@/lib/dates';
import { amountPaid, outstanding } from '@/lib/pricing';
import { isCalled } from '@/lib/scheduling';
import { salesSummary } from '@/lib/seating';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, STATUS_META } from '@/theme';

export default function Home() {
  const user = useCurrentUser();
  if (user.role === 'renter') return <RenterHome />;
  if (user.role === 'member') return <MemberHome />;
  return <OwnerHome />;
}

function Hero({ greeting }: { greeting: string }) {
  const venue = useStore((s) => s.venue);
  const d = new Date();
  return (
    <View style={{ paddingVertical: 8, gap: 4 }}>
      <Txt v="label" color={C.gold}>{`${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`}</Txt>
      <Txt v="display">{greeting}</Txt>
      <Txt v="muted" style={{ fontStyle: 'italic' }}>{venue.tagline}</Txt>
    </View>
  );
}

function QuickAction({ icon, label, onPress, color = C.gold }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 140, opacity: pressed ? 0.7 : 1 })}>
      <Card style={{ alignItems: 'flex-start', gap: 10 }}>
        <ListItem icon={icon} iconColor={color} title={label} />
      </Card>
    </Pressable>
  );
}

function OwnerHome() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const performances = useStore((s) => s.performances);
  const orders = useStore((s) => s.orders);
  const agenda = useAgenda();
  const now = new Date();

  const requests = bookings.filter((b) => b.status === 'inquiry');
  const awaiting = bookings.filter((b) => b.status === 'awaiting_deposit');
  const balancesDue = bookings.filter((b) => b.status === 'confirmed' && outstanding(b) > 0);
  const overdue = balancesDue.filter((b) => new Date(b.quote.balanceDueDate) < now);
  const upcoming = agenda.filter((a) => new Date(a.end) >= now).slice(0, 6);

  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const collected = useMemo(() => {
    let rentals = 0;
    for (const b of bookings) for (const p of b.payments) {
      const d = new Date(p.at);
      if (`${d.getFullYear()}-${d.getMonth()}` === monthKey) rentals += p.amount;
    }
    const tix = orders
      .filter((o) => {
        const d = new Date(o.at);
        return !o.refunded && `${d.getFullYear()}-${d.getMonth()}` === monthKey;
      })
      .reduce((s, o) => s + o.subtotal, 0);
    return { rentals, tix };
  }, [bookings, orders, monthKey]);

  const nextShow = performances.filter((p) => new Date(p.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  const nextSales = nextShow ? salesSummary(nextShow.seats, now) : null;
  const owed = balancesDue.reduce((s, b) => s + outstanding(b), 0);

  return (
    <Screen>
      <Hero greeting={`Welcome back${user.name === 'Theatre Owner' ? '' : ', ' + user.name.split(' ')[0]}`} />

      {(requests.length > 0 || awaiting.length > 0 || overdue.length > 0) && (
        <Card accent={C.gold}>
          <Txt v="label" color={C.gold}>Needs your attention</Txt>
          {requests.map((b) => (
            <ListItem key={b.id} icon="mail-unread" iconColor={C.blue} title={b.title} subtitle={`New request · ${fmtRange(b.start, b.end)}`} onPress={() => router.push(`/booking/${b.id}`)} />
          ))}
          {awaiting.map((b) => (
            <ListItem key={b.id} icon="hourglass" iconColor={C.warn} title={b.title} subtitle={`Waiting on ${money(b.quote.depositDue)} deposit${b.holdExpiresAt ? ` · hold ends ${relativeDay(b.holdExpiresAt)}` : ''}`} onPress={() => router.push(`/booking/${b.id}`)} />
          ))}
          {overdue.map((b) => (
            <ListItem key={b.id} icon="alert-circle" iconColor={C.danger} title={b.title} subtitle={`Balance ${money(outstanding(b))} overdue`} onPress={() => router.push(`/booking/${b.id}`)} />
          ))}
        </Card>
      )}

      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <Stat icon="cash-outline" label="Collected this month" value={money(collected.rentals + collected.tix)} sub={`${money(collected.rentals)} rentals · ${money(collected.tix)} tickets`} color={C.green} />
        <Stat icon="receipt-outline" label="Balances owed" value={money(owed)} sub={`${balancesDue.length} confirmed booking${balancesDue.length === 1 ? '' : 's'}`} color={owed ? C.warn : C.text} />
      </Row>

      {nextShow && nextSales && (
        <Card onPress={() => router.push(`/performance/${nextShow.id}`)}>
          <Row>
            <Txt v="label">Next show on sale</Txt>
            <View style={{ flex: 1 }} />
            <Pill label={relativeDay(nextShow.start)} color={C.curtain} bg={C.curtain + '22'} />
          </Row>
          <Txt v="h2">{nextShow.title}</Txt>
          <Txt v="muted">{`${fmtDate(nextShow.start, { weekday: true })} · ${fmtTime(nextShow.start)}${nextShow.subtitle ? ' · ' + nextShow.subtitle : ''}`}</Txt>
          <ProgressBar value={(nextSales.sold + nextSales.comp) / nextSales.sellable} color={C.curtain} />
          <Txt v="small">{`${nextSales.sold + nextSales.comp} of ${nextSales.sellable} seats sold · ${nextSales.available} left`}</Txt>
        </Card>
      )}

      <SectionHeader title="Quick actions" />
      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <QuickAction icon="add-circle" label="New booking" onPress={() => router.push('/booking/new')} />
        <QuickAction icon="musical-notes" label="Schedule rehearsal" color={C.purple} onPress={() => router.push('/rehearsal/edit')} />
      </Row>
      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <QuickAction icon="storefront" label="Box office" color={C.curtain} onPress={() => router.push('/tickets')} />
        <QuickAction icon="qr-code" label="Door check-in" color={C.green} onPress={() => nextShow ? router.push(`/checkin/${nextShow.id}`) : router.push('/tickets')} />
      </Row>

      <SectionHeader title="Coming up" action="Full calendar" onAction={() => router.push('/calendar')} />
      {upcoming.length ? upcoming.map((a) => <AgendaRow key={a.id + a.start} item={a} />) : <Empty icon="calendar-outline" title="Nothing scheduled" />}
    </Screen>
  );
}

function RenterHome() {
  const user = useCurrentUser();
  const venue = useStore((s) => s.venue);
  const bookings = useStore((s) => s.bookings);
  const performances = useStore((s) => s.performances);
  const mine = bookings.filter((b) => b.renterId === user.id).sort((a, b) => a.start.localeCompare(b.start));
  const now = new Date();
  const upcomingShows = performances.filter((p) => p.onSale && new Date(p.start) > now).slice(0, 3);

  return (
    <Screen>
      <Hero greeting={`Hi, ${user.name.split(' ')[0]}`} />
      <Card accent={C.gold}>
        <Txt v="h2">Host your next event here</Txt>
        <Txt v="muted">Check open dates, get an instant quote and reserve the stage with a deposit — right from your phone.</Txt>
        <Button title="Check dates & get a quote" icon="calendar" onPress={() => router.push('/booking/new')} />
      </Card>

      <SectionHeader title="Your bookings" action="See all" onAction={() => router.push('/rentals')} />
      {mine.length === 0 && <Empty icon="key-outline" title="No bookings yet" body="Your requests and reservations will show up here." />}
      {mine.map((b) => {
        const meta = STATUS_META[b.status];
        const due = outstanding(b);
        return (
          <Card key={b.id} onPress={() => router.push(`/booking/${b.id}`)} accent={meta.color}>
            <Row>
              <Pill label={meta.label} color={meta.color} bg={meta.bg} />
              <View style={{ flex: 1 }} />
              {due > 0 && b.status !== 'cancelled' && b.status !== 'declined' ? <Txt v="small" color={C.warn}>{`${money(due)} due`}</Txt> : <Txt v="small" color={C.green}>{`Paid ${money(amountPaid(b))}`}</Txt>}
            </Row>
            <Txt v="h3">{b.title}</Txt>
            <Txt v="muted">{fmtRange(b.start, b.end)}</Txt>
            {b.status === 'awaiting_deposit' && (
              <Button title={`Pay ${money(b.quote.depositDue)} deposit to lock the date`} small onPress={() => router.push(`/pay?bookingId=${b.id}&kind=deposit` as Href)} />
            )}
          </Card>
        );
      })}

      <SectionHeader title="On stage soon" action="Tickets" onAction={() => router.push('/tickets')} />
      {upcomingShows.map((p) => (
        <ListItem key={p.id} icon="ticket" iconColor={C.curtain} title={p.title} subtitle={`${fmtDate(p.start, { weekday: true })} · ${fmtTime(p.start)}`} onPress={() => router.push(`/performance/${p.id}`)} />
      ))}

      <SectionHeader title="Contact the theatre" />
      <Card>
        <ListItem icon="call" title={venue.phone} subtitle="Call the box office" onPress={() => Linking.openURL(`tel:${venue.phone.replace(/\D/g, '')}`)} />
        <ListItem icon="mail" title={venue.email} subtitle="Email us" onPress={() => Linking.openURL(`mailto:${venue.email}`)} />
        <ListItem icon="location" title="Get directions" subtitle={venue.address} onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(venue.address)}`)} />
      </Card>
    </Screen>
  );
}

function MemberHome() {
  const user = useCurrentUser();
  const productions = useStore((s) => s.productions);
  const schedule = useStore((s) => s.schedule);
  const channels = useStore((s) => s.channels);
  const messages = useStore((s) => s.messages);
  const lastRead = useStore((s) => s.lastRead);
  const tickets = useStore((s) => s.tickets);
  const orders = useStore((s) => s.orders);
  const rsvp = useStore((s) => s.rsvp);
  const now = new Date();

  const myProds = productions.filter((p) => p.members.some((m) => m.userId === user.id));
  const myCalls = schedule
    .filter((s) => new Date(s.end) > now)
    .filter((s) => {
      const p = myProds.find((x) => x.id === s.productionId);
      return p && isCalled(s, p, user.id);
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = myCalls[0];
  const needsRsvp = myCalls.filter((s) => !s.rsvps[user.id]).length;

  const myChannelIds = channels
    .filter((c) => myProds.some((p) => p.id === c.productionId))
    .filter((c) => {
      const p = myProds.find((x) => x.id === c.productionId)!;
      const m = p.members.find((x) => x.userId === user.id)!;
      if (c.kind === 'direct') return c.memberIds?.includes(user.id);
      return !c.groupId || m.groupIds.includes(c.groupId) || m.isDirector;
    })
    .map((c) => c.id);
  const unread = messages.filter((m) => myChannelIds.includes(m.channelId) && m.userId !== user.id && m.at > (lastRead[`${user.id}:${m.channelId}`] ?? '')).length;
  const announcements = messages.filter((m) => channels.find((c) => c.id === m.channelId)?.kind === 'announcements' && myChannelIds.includes(m.channelId)).slice(-2).reverse();
  const myOrders = orders.filter((o) => o.buyerUserId === user.id).map((o) => o.id);
  const myTickets = tickets.filter((t) => myOrders.includes(t.orderId) && !t.void);

  return (
    <Screen>
      <Hero greeting={`Break a leg, ${user.name.split(' ')[0]}!`} />
      {next ? (
        <Card accent={C.purple}>
          <Txt v="label" color={C.purple}>Your next call</Txt>
          <Txt v="h2">{next.title}</Txt>
          <Txt v="muted">{`${relativeDay(next.start)} · ${fmtTime(next.start)}–${fmtTime(next.end)} · ${next.space}`}</Txt>
          {next.notes ? <Txt v="body">{next.notes}</Txt> : null}
          <Row>
            {(['yes', 'maybe', 'no'] as const).map((r) => (
              <Button key={r} small title={r === 'yes' ? "I'll be there" : r === 'maybe' ? 'Maybe' : "Can't make it"} variant={next.rsvps[user.id] === r ? (r === 'no' ? 'danger' : 'success') : 'secondary'} onPress={() => rsvp(next.id, user.id, r)} style={{ flex: 1 }} />
            ))}
          </Row>
        </Card>
      ) : (
        <Empty icon="musical-notes-outline" title="No upcoming calls" />
      )}
      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <Stat icon="chatbubbles-outline" label="Unread messages" value={String(unread)} color={unread ? C.gold : C.text} />
        <Stat icon="checkmark-done-outline" label="Need your RSVP" value={String(needsRsvp)} color={needsRsvp ? C.warn : C.text} />
      </Row>
      {myProds.map((p) => (
        <Button key={p.id} variant="secondary" icon="people" title={`Open ${p.title} hub`} onPress={() => router.push(`/production/${p.id}`)} />
      ))}
      {announcements.length > 0 && <SectionHeader title="Latest announcements" />}
      {announcements.map((m) => (
        <Card key={m.id} accent={C.gold}>
          <Txt v="small">{fmtDate(m.at, { weekday: true })}</Txt>
          <Txt>{m.text}</Txt>
        </Card>
      ))}
      {myTickets.length > 0 && <SectionHeader title="Your tickets" action="View" onAction={() => router.push('/tickets')} />}
      {myTickets.slice(0, 3).map((t) => (
        <ListItem key={t.id} icon="ticket" iconColor={C.curtain} title={t.seatId} subtitle={t.code} onPress={() => router.push(`/ticket/${t.id}`)} />
      ))}
    </Screen>
  );
}
