// Sections of the Home ("Today") page: your next call, what needs you, the owner's numbers, and what's next.
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Linking, View } from 'react-native';

import { AddToCalendar } from '@/components/AddToCalendar';
import { Button, Card, Group, Line, ProgressBar, Row, SectionHeader, Txt } from '@/components/ui';
import { KIND_COLOR, useAgenda } from '@/hooks/useAgenda';
import { useChannels } from '@/hooks/useChannels';
import { fmtTime, money, relativeDay } from '@/lib/dates';
import { isCalled } from '@/lib/scheduling';
import { salesSummary } from '@/lib/seating';
import { needsYou, type NeedKind } from '@/lib/today';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

const NEED_COLOR: Record<NeedKind, string> = {
  account: C.warn,
  request: C.blue,
  deposit: C.warn,
  overdue: C.danger,
  rsvp: C.purple,
  card: C.leather,
  announcement: C.accent,
};

/** Your next call, with RSVP buttons. */
export function useNextCall() {
  const user = useCurrentUser();
  const productions = useStore((s) => s.productions);
  const schedule = useStore((s) => s.schedule);
  return useMemo(() => {
    const now = new Date();
    return schedule
      .filter((s) => new Date(s.end) > now)
      .filter((s) => {
        const p = productions.find((x) => x.id === s.productionId);
        return !!p && isCalled(s, p, user.id);
      })
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  }, [productions, schedule, user.id]);
}

export function NextCallCard() {
  const user = useCurrentUser();
  const rsvp = useStore((s) => s.rsvp);
  const productions = useStore((s) => s.productions);
  const next = useNextCall();
  if (!next) return null;
  const production = productions.find((p) => p.id === next.productionId);
  return (
    <Card accent={C.purple} onPress={() => router.push(`/production/${next.productionId}?tab=schedule&item=${next.id}` as Href)}>
      <Txt v="label" color={C.purple}>{`Your next call · ${relativeDay(next.start)}`}</Txt>
      <Txt v="h2">{next.title}</Txt>
      <Txt v="muted">{`${fmtTime(next.start)}–${fmtTime(next.end)} · ${next.space}${production ? ` · ${production.title}` : ''}`}</Txt>
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
      <AddToCalendar item={next} production={production} />
    </Card>
  );
}

export function NeedsYou() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const linkRequests = useStore((s) => s.linkRequests);
  const schedule = useStore((s) => s.schedule);
  const productions = useStore((s) => s.productions);
  const tasks = useStore((s) => s.tasks);
  const channels = useChannels();
  const nextCall = useNextCall();
  const needs = useMemo(() => {
    const announcements = channels
      .filter((c) => c.channel.kind === 'announcements' && c.unread > 0)
      .map((c) => ({ channelId: c.channel.id, production: productions.find((p) => p.id === c.channel.productionId)?.title ?? 'Production', unread: c.unread }));
    return needsYou({ user, bookings, linkRequests, schedule, productions, tasks, announcements, skipCallId: nextCall?.id });
  }, [user, bookings, linkRequests, schedule, productions, tasks, channels, nextCall?.id]);
  const shown = needs.slice(0, 6);

  return (
    <>
      <SectionHeader title={needs.length ? `Needs you · ${needs.length}` : 'Needs you'} />
      {needs.length === 0 ? (
        <Card>
          <Txt v="muted">You’re all caught up.</Txt>
        </Card>
      ) : (
        <Group>
          {shown.map((n) => (
            <Line key={n.key} dot={NEED_COLOR[n.kind]} title={n.title} detail={n.detail} onPress={() => router.push(n.href as Href)} />
          ))}
        </Group>
      )}
      {needs.length > shown.length && <Txt v="small">{`And ${needs.length - shown.length} more. Check the Business tab, your cards and the Inbox.`}</Txt>}
    </>
  );
}

/** The owner's numbers: the next show's sales and money collected this month. */
export function AtAGlance() {
  const performances = useStore((s) => s.performances);
  const bookings = useStore((s) => s.bookings);
  const orders = useStore((s) => s.orders);
  const now = new Date();
  const next = performances.filter((x) => new Date(x.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  const collected = useMemo(() => {
    const d = new Date();
    const inMonth = (iso: string) => {
      const x = new Date(iso);
      return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
    };
    const rentals = bookings.reduce((s, b) => s + b.payments.filter((p) => inMonth(p.at)).reduce((t, p) => t + p.amount, 0), 0);
    const tix = orders.filter((o) => !o.refunded && inMonth(o.at)).reduce((s, o) => s + o.subtotal, 0);
    return { rentals, tix };
  }, [bookings, orders]);
  const s = next ? salesSummary(next.seats, now) : undefined;

  return (
    <Row gap={10} style={{ alignItems: 'stretch' }}>
      <Card style={{ flex: 1 }} onPress={next ? () => router.push(`/performance/${next.id}`) : () => router.push('/business?view=boxOffice' as Href)}>
        <Txt v="label">Next show</Txt>
        {next && s ? (
          <>
            <Txt v="h3" numberOfLines={1}>{next.title}</Txt>
            <ProgressBar value={(s.sold + s.comp) / s.sellable} color={C.curtain} />
            <Txt v="small">{`${relativeDay(next.start)} · ${Math.round(((s.sold + s.comp) / s.sellable) * 100)}% sold`}</Txt>
          </>
        ) : (
          <Txt v="small">None scheduled</Txt>
        )}
      </Card>
      <Card style={{ flex: 1 }}>
        <Txt v="label">This month</Txt>
        <Txt v="h2" color={C.green}>{money(collected.rentals + collected.tix)}</Txt>
        <Txt v="small">{`${money(collected.rentals)} rentals · ${money(collected.tix)} tickets`}</Txt>
      </Card>
    </Row>
  );
}

/** The next few things on your calendar. */
export function UpNext() {
  const agenda = useAgenda();
  const nextCall = useNextCall();
  const now = new Date();
  const upcoming = agenda.filter((a) => a.kind !== 'unavailable' && a.kind !== 'task' && a.id !== nextCall?.id && new Date(a.end) >= now).slice(0, 5);
  return (
    <>
      <SectionHeader title="Up next" action="Calendar" onAction={() => router.navigate('/calendar')} />
      {upcoming.length ? (
        <Group>
          {upcoming.map((a) => (
            <Line key={a.id + a.start} dot={KIND_COLOR[a.kind]} title={a.title} detail={`${relativeDay(a.start)} · ${fmtTime(a.start)}${a.subtitle ? ` · ${a.subtitle}` : ''}`} onPress={a.href ? () => router.push(a.href as Href) : undefined} />
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

/** Call, email or get directions to the theatre. */
export function ContactRow() {
  const venue = useStore((s) => s.venue);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24 }}>
      <Button variant="ghost" small icon="call" title="Call" onPress={() => Linking.openURL(`tel:${venue.phone.replace(/\D/g, '')}`)} />
      <Button variant="ghost" small icon="mail" title="Email" onPress={() => Linking.openURL(`mailto:${venue.email}`)} />
      <Button variant="ghost" small icon="navigate" title="Directions" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(venue.address)}`)} />
    </View>
  );
}
