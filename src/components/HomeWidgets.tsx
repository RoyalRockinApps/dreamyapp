import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Linking, View } from 'react-native';

import { useSetupChecklist } from '@/components/admin';
import { Button, Card, Empty, Group, Line, ProgressBar, Row, SectionHeader, Shortcuts, Txt, type IconName } from '@/components/ui';
import { KIND_COLOR, useAgenda } from '@/hooks/useAgenda';
import { useChannels } from '@/hooks/useChannels';
import { fmtDate, fmtTime, money, relativeDay } from '@/lib/dates';
import type { ShortcutId, WidgetId } from '@/lib/home';
import { outstanding } from '@/lib/pricing';
import { isCalled } from '@/lib/scheduling';
import { salesSummary, seatLabel } from '@/lib/seating';
import { useCurrentUser, useHomeLayout, useStore } from '@/store/useStore';
import { C, STATUS_META } from '@/theme';

// ---------------- Shortcuts ----------------

export const SHORTCUT_META: Record<ShortcutId, { icon: IconName; label: string; color: string; href: string }> = {
  booking: { icon: 'add', label: 'Booking', color: C.accent, href: '/booking/new' },
  rehearsal: { icon: 'musical-notes', label: 'Rehearsal', color: C.purple, href: '/rehearsal/edit' },
  boxOffice: { icon: 'ticket', label: 'Box office', color: C.curtain, href: '/tickets' },
  checkIn: { icon: 'qr-code', label: 'Check-in', color: C.green, href: '/tickets' },
  calendar: { icon: 'calendar', label: 'Calendar', color: C.blue, href: '/calendar' },
  rentals: { icon: 'key', label: 'Rentals', color: C.accent, href: '/rentals' },
  shows: { icon: 'people', label: 'Shows', color: C.purple, href: '/shows' },
  admin: { icon: 'settings', label: 'Admin', color: C.blue, href: '/admin' },
  newShow: { icon: 'add-circle', label: 'Performance', color: C.curtain, href: '/performance/new' },
  chat: { icon: 'chatbubbles', label: 'Chat', color: C.green, href: '/shows' },
};

function ShortcutsWidget() {
  const layout = useHomeLayout();
  const performances = useStore((s) => s.performances);
  const nextShow = performances.filter((p) => new Date(p.start) > new Date()).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!layout.shortcuts.length) return null;
  return (
    <Shortcuts
      items={layout.shortcuts.map((id) => {
        const m = SHORTCUT_META[id];
        // check-in jumps straight to the next show's door scanner
        const href = id === 'checkIn' && nextShow ? `/checkin/${nextShow.id}` : m.href;
        return { icon: m.icon, label: m.label, color: m.color, onPress: () => router.push(href as Href) };
      })}
    />
  );
}

// ---------------- Owner ----------------

function NeedsWidget() {
  const bookings = useStore((s) => s.bookings);
  const now = new Date();
  const todo = [
    ...bookings.filter((b) => b.status === 'inquiry').map((b) => ({ b, why: 'New request', color: C.blue })),
    ...bookings.filter((b) => b.status === 'awaiting_deposit').map((b) => ({ b, why: `Waiting on ${money(b.quote.depositDue)} deposit`, color: C.warn })),
    ...bookings
      .filter((b) => b.status === 'confirmed' && outstanding(b) > 0 && new Date(b.quote.balanceDueDate) < now)
      .map((b) => ({ b, why: `${money(outstanding(b))} overdue`, color: C.danger })),
  ];
  return (
    <>
      <SectionHeader title={todo.length ? `Needs you · ${todo.length}` : 'Needs you'} action={todo.length > 3 ? 'See all' : undefined} onAction={() => router.push('/rentals')} />
      {todo.length === 0 ? (
        <Card>
          <Txt v="muted">You’re all caught up.</Txt>
        </Card>
      ) : (
        <Group>
          {todo.slice(0, 3).map(({ b, why, color }) => (
            <Line key={b.id} dot={color} title={b.title} detail={`${why} · ${fmtDate(b.start)}`} onPress={() => router.push(`/booking/${b.id}`)} />
          ))}
        </Group>
      )}
    </>
  );
}

function UpcomingWidget() {
  const agenda = useAgenda();
  const now = new Date();
  const upcoming = agenda.filter((a) => new Date(a.end) >= now).slice(0, 4);
  return (
    <>
      <SectionHeader title="Coming up" action="Calendar" onAction={() => router.push('/calendar')} />
      {upcoming.length ? (
        <Group>
          {upcoming.map((a) => (
            <Line key={a.id + a.start} dot={KIND_COLOR[a.kind]} title={a.title} detail={`${relativeDay(a.start)} · ${fmtTime(a.start)}`} onPress={a.href ? () => router.push(a.href as Href) : undefined} />
          ))}
        </Group>
      ) : (
        <Card>
          <Txt v="muted">Nothing scheduled.</Txt>
        </Card>
      )}
    </>
  );
}

function NextShowWidget() {
  const performances = useStore((s) => s.performances);
  const now = new Date();
  const p = performances.filter((x) => new Date(x.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!p) return null;
  const s = salesSummary(p.seats, now);
  return (
    <Card onPress={() => router.push(`/performance/${p.id}`)}>
      <Row>
        <Txt v="label" style={{ flex: 1 }}>Next show</Txt>
        <Txt v="small" color={C.curtain}>{relativeDay(p.start)}</Txt>
      </Row>
      <Txt v="h3">{p.title}</Txt>
      <ProgressBar value={(s.sold + s.comp) / s.sellable} color={C.curtain} />
      <Txt v="small">{`${s.sold + s.comp} of ${s.sellable} sold · ${s.available} left`}</Txt>
    </Card>
  );
}

function MoneyWidget() {
  const bookings = useStore((s) => s.bookings);
  const orders = useStore((s) => s.orders);
  const { rentals, tix } = useMemo(() => {
    const d = new Date();
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const inMonth = (iso: string) => {
      const x = new Date(iso);
      return `${x.getFullYear()}-${x.getMonth()}` === key;
    };
    return {
      rentals: bookings.reduce((s, b) => s + b.payments.filter((p) => inMonth(p.at)).reduce((t, p) => t + p.amount, 0), 0),
      tix: orders.filter((o) => !o.refunded && inMonth(o.at)).reduce((s, o) => s + o.subtotal, 0),
    };
  }, [bookings, orders]);
  return (
    <Card>
      <Txt v="label">This month</Txt>
      <Row>
        <View style={{ flex: 1 }}>
          <Txt v="h2" color={C.green}>{money(rentals + tix)}</Txt>
          <Txt v="small">collected</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="small">{`${money(rentals)} rentals`}</Txt>
          <Txt v="small">{`${money(tix)} tickets`}</Txt>
        </View>
      </Row>
    </Card>
  );
}

function MessagesWidget() {
  const channels = useChannels();
  const users = useStore((s) => s.users);
  const unread = channels.filter((c) => c.unread > 0).slice(0, 3);
  return (
    <>
      <SectionHeader title="Messages" />
      {unread.length === 0 ? (
        <Card>
          <Txt v="muted">No unread messages.</Txt>
        </Card>
      ) : (
        <Group>
          {unread.map(({ channel, last, unread: n, title }) => (
            <Line
              key={channel.id}
              dot={C.accent}
              title={title}
              detail={last ? `${users.find((u) => u.id === last.userId)?.name.split(' ')[0]}: ${last.text}` : undefined}
              value={String(n)}
              valueColor={C.accent}
              onPress={() => router.push(`/chat/${channel.id}`)}
            />
          ))}
        </Group>
      )}
    </>
  );
}

function SetupWidget() {
  const list = useSetupChecklist();
  const done = list.filter((c) => c.done).length;
  const next = list.find((c) => !c.done && c.href);
  return (
    <Card onPress={() => router.push((next?.href ?? '/admin') as Href)}>
      <Row>
        <Txt v="label" style={{ flex: 1 }}>Setup</Txt>
        <Txt v="small">{`${done} of ${list.length}`}</Txt>
      </Row>
      <ProgressBar value={done / list.length} />
      {next ? <Txt v="small">{`Next: ${next.title}`}</Txt> : <Txt v="small" color={C.green}>All set</Txt>}
    </Card>
  );
}

// ---------------- Renter ----------------

function CtaWidget() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const owed = bookings.find((b) => b.renterId === user.id && b.status === 'awaiting_deposit' && new Date(b.end) > new Date());
  if (owed) {
    return (
      <Card accent={C.warn}>
        <Txt v="h3">{`Lock in ${fmtDate(owed.start)}`}</Txt>
        <Txt v="small">{`${owed.title} is held for you until you pay the deposit.`}</Txt>
        <Button title={`Pay ${money(owed.quote.depositDue)} deposit`} onPress={() => router.push(`/pay?bookingId=${owed.id}&kind=deposit` as Href)} />
      </Card>
    );
  }
  return (
    <Card>
      <Txt v="h3">Host your event here</Txt>
      <Txt v="small">See open dates and get an instant quote.</Txt>
      <Button title="Check dates" icon="calendar" onPress={() => router.push('/booking/new')} />
    </Card>
  );
}

function BookingsWidget() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const mine = bookings
    .filter((b) => b.renterId === user.id && !['cancelled', 'declined'].includes(b.status) && new Date(b.end) > new Date())
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!mine.length) return null;
  return (
    <>
      <SectionHeader title="Your bookings" action="All" onAction={() => router.push('/rentals')} />
      <Group>
        {mine.slice(0, 3).map((b) => (
          <Line key={b.id} dot={STATUS_META[b.status].color} title={b.title} detail={`${fmtDate(b.start, { weekday: true })} · ${STATUS_META[b.status].label}`} onPress={() => router.push(`/booking/${b.id}`)} />
        ))}
      </Group>
    </>
  );
}

function ShowsWidget() {
  const performances = useStore((s) => s.performances);
  const shows = performances.filter((p) => p.onSale && new Date(p.start) > new Date()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  if (!shows.length) return null;
  return (
    <>
      <SectionHeader title="On stage soon" action="Tickets" onAction={() => router.push('/tickets')} />
      <Group>
        {shows.map((p) => (
          <Line key={p.id} dot={C.curtain} title={p.title} detail={`${fmtDate(p.start, { weekday: true })} · ${fmtTime(p.start)}`} onPress={() => router.push(`/performance/${p.id}`)} />
        ))}
      </Group>
    </>
  );
}

function ContactWidget() {
  const venue = useStore((s) => s.venue);
  return (
    <Row style={{ justifyContent: 'center' }} gap={24}>
      <Button variant="ghost" small icon="call" title="Call" onPress={() => Linking.openURL(`tel:${venue.phone.replace(/\D/g, '')}`)} />
      <Button variant="ghost" small icon="mail" title="Email" onPress={() => Linking.openURL(`mailto:${venue.email}`)} />
      <Button variant="ghost" small icon="navigate" title="Directions" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(venue.address)}`)} />
    </Row>
  );
}

// ---------------- Cast & crew ----------------

function useMyCalls() {
  const user = useCurrentUser();
  const productions = useStore((s) => s.productions);
  const schedule = useStore((s) => s.schedule);
  return useMemo(() => {
    const now = new Date();
    const myProds = productions.filter((p) => p.members.some((m) => m.userId === user.id));
    const calls = schedule
      .filter((s) => new Date(s.end) > now)
      .filter((s) => {
        const p = myProds.find((x) => x.id === s.productionId);
        return p && isCalled(s, p, user.id);
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    return { myProds, calls };
  }, [productions, schedule, user.id]);
}

function NextCallWidget() {
  const user = useCurrentUser();
  const rsvp = useStore((s) => s.rsvp);
  const next = useMyCalls().calls[0];
  if (!next) return <Empty icon="musical-notes-outline" title="No upcoming calls" />;
  return (
    <Card accent={C.purple}>
      <Txt v="label" color={C.purple}>{`Next call · ${relativeDay(next.start)}`}</Txt>
      <Txt v="h2">{next.title}</Txt>
      <Txt v="muted">{`${fmtTime(next.start)}–${fmtTime(next.end)} · ${next.space}`}</Txt>
      <Row>
        {(['yes', 'maybe', 'no'] as const).map((r) => (
          <Button
            key={r}
            small
            style={{ flex: 1 }}
            title={r === 'yes' ? 'Going' : r === 'maybe' ? 'Maybe' : "Can't"}
            variant={next.rsvps[user.id] === r ? (r === 'no' ? 'danger' : 'success') : 'secondary'}
            onPress={() => rsvp(next.id, user.id, r)}
          />
        ))}
      </Row>
    </Card>
  );
}

function HubWidget() {
  const user = useCurrentUser();
  const channels = useStore((s) => s.channels);
  const messages = useStore((s) => s.messages);
  const lastRead = useStore((s) => s.lastRead);
  const { myProds, calls } = useMyCalls();
  return (
    <>
      {myProds.map((p) => {
        const ids = channels.filter((c) => c.productionId === p.id).map((c) => c.id);
        const unread = messages.filter((m) => ids.includes(m.channelId) && m.userId !== user.id && m.at > (lastRead[`${user.id}:${m.channelId}`] ?? '')).length;
        const toRsvp = calls.filter((c) => c.productionId === p.id && !c.rsvps[user.id]).length;
        return (
          <Group key={p.id}>
            <Line
              title={p.title}
              detail={[unread ? `${unread} unread` : 'Schedule, cast & chat', toRsvp ? `${toRsvp} to RSVP` : ''].filter(Boolean).join(' · ')}
              value={unread ? '●' : undefined}
              valueColor={C.accent}
              onPress={() => router.push(`/production/${p.id}`)}
            />
          </Group>
        );
      })}
    </>
  );
}

function LaterWidget() {
  const user = useCurrentUser();
  const later = useMyCalls().calls.slice(1, 4);
  if (!later.length) return null;
  return (
    <>
      <SectionHeader title="After that" />
      <Group>
        {later.map((s) => (
          <Line key={s.id} dot={C.purple} title={s.title} detail={`${relativeDay(s.start)} · ${fmtTime(s.start)}`} value={s.rsvps[user.id] ? undefined : 'RSVP'} valueColor={C.warn} onPress={() => router.push(`/production/${s.productionId}?item=${s.id}` as Href)} />
        ))}
      </Group>
    </>
  );
}

function AnnouncementsWidget() {
  const channels = useChannels();
  const messages = useStore((s) => s.messages);
  const ann = channels.filter((c) => c.channel.kind === 'announcements').map((c) => c.channel.id);
  const latest = messages.filter((m) => ann.includes(m.channelId)).slice(-2).reverse();
  if (!latest.length) return null;
  return (
    <>
      <SectionHeader title="Announcements" />
      {latest.map((m) => (
        <Card key={m.id} onPress={() => router.push(`/chat/${m.channelId}`)}>
          <Txt v="small">{relativeDay(m.at)}</Txt>
          <Txt numberOfLines={3}>{m.text}</Txt>
        </Card>
      ))}
    </>
  );
}

function TicketsWidget() {
  const user = useCurrentUser();
  const orders = useStore((s) => s.orders);
  const tickets = useStore((s) => s.tickets);
  const performances = useStore((s) => s.performances);
  const ids = new Set(orders.filter((o) => o.buyerUserId === user.id).map((o) => o.id));
  const mine = tickets.filter((t) => ids.has(t.orderId) && !t.void).slice(0, 3);
  if (!mine.length) return null;
  return (
    <>
      <SectionHeader title="My tickets" action="All" onAction={() => router.push('/tickets')} />
      <Group>
        {mine.map((t) => {
          const p = performances.find((x) => x.id === t.performanceId);
          return <Line key={t.id} dot={C.curtain} title={p?.title ?? 'Ticket'} detail={`${p ? fmtDate(p.start) + ' · ' : ''}${seatLabel(t.seatId)}`} onPress={() => router.push(`/ticket/${t.id}`)} />;
        })}
      </Group>
    </>
  );
}

const REGISTRY: Record<WidgetId, () => React.ReactNode> = {
  shortcuts: ShortcutsWidget,
  needs: NeedsWidget,
  upcoming: UpcomingWidget,
  nextShow: NextShowWidget,
  money: MoneyWidget,
  messages: MessagesWidget,
  setup: SetupWidget,
  cta: CtaWidget,
  bookings: BookingsWidget,
  shows: ShowsWidget,
  contact: ContactWidget,
  nextCall: NextCallWidget,
  hub: HubWidget,
  later: LaterWidget,
  announcements: AnnouncementsWidget,
  tickets: TicketsWidget,
};

export function HomeWidget({ id }: { id: WidgetId }) {
  const W = REGISTRY[id];
  return <W />;
}
