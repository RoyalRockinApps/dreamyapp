import { router, type Href } from 'expo-router';
import { Linking, Platform, View } from 'react-native';

import { Button, Card, Empty, Group, Line, Row, Screen, SectionHeader, Shortcuts, Txt } from '@/components/ui';
import { KIND_COLOR, useAgenda } from '@/hooks/useAgenda';
import { fmtDate, fmtTime, money, MONTHS, relativeDay, WEEKDAYS } from '@/lib/dates';
import { APK_URL } from '@/lib/links';
import { outstanding } from '@/lib/pricing';
import { isCalled } from '@/lib/scheduling';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, STATUS_META } from '@/theme';

export default function Home() {
  const user = useCurrentUser();
  if (user.role === 'renter') return <RenterHome />;
  if (user.role === 'member') return <MemberHome />;
  return <OwnerHome />;
}

function Greeting({ name, tagline }: { name?: string; tagline?: boolean }) {
  const venue = useStore((s) => s.venue);
  const d = new Date();
  const h = d.getHours();
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <View style={{ gap: 4, paddingTop: 4 }}>
      <Txt v="label" color={C.gold}>{`${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`}</Txt>
      <Txt v="h1">{name ? `${hello}, ${name}` : hello}</Txt>
      {tagline ? <Txt v="muted" style={{ fontStyle: 'italic' }}>{venue.tagline}</Txt> : null}
    </View>
  );
}

function OwnerHome() {
  const bookings = useStore((s) => s.bookings);
  const performances = useStore((s) => s.performances);
  const agenda = useAgenda();
  const now = new Date();

  // Only the things that need a decision from the owner.
  const todo = [
    ...bookings.filter((b) => b.status === 'inquiry').map((b) => ({ b, why: 'New request', color: C.blue })),
    ...bookings.filter((b) => b.status === 'awaiting_deposit').map((b) => ({ b, why: `Waiting on ${money(b.quote.depositDue)} deposit`, color: C.warn })),
    ...bookings
      .filter((b) => b.status === 'confirmed' && outstanding(b) > 0 && new Date(b.quote.balanceDueDate) < now)
      .map((b) => ({ b, why: `${money(outstanding(b))} overdue`, color: C.danger })),
  ];
  const upcoming = agenda.filter((a) => new Date(a.end) >= now).slice(0, 4);
  const nextShow = performances.filter((p) => new Date(p.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];

  return (
    <Screen>
      <Greeting />
      <Shortcuts
        items={[
          { icon: 'add', label: 'Booking', onPress: () => router.push('/booking/new') },
          { icon: 'musical-notes', label: 'Rehearsal', color: C.purple, onPress: () => router.push('/rehearsal/edit') },
          { icon: 'ticket', label: 'Box office', color: C.curtain, onPress: () => router.push('/tickets') },
          { icon: 'qr-code', label: 'Check-in', color: C.green, onPress: () => (nextShow ? router.push(`/checkin/${nextShow.id}`) : router.push('/tickets')) },
        ]}
      />

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

      <SectionHeader title="Coming up" action="Calendar" onAction={() => router.push('/calendar')} />
      {upcoming.length ? (
        <Group>
          {upcoming.map((a) => (
            <Line
              key={a.id + a.start}
              dot={KIND_COLOR[a.kind]}
              title={a.title}
              detail={`${relativeDay(a.start)} · ${fmtTime(a.start)}`}
              onPress={a.href ? () => router.push(a.href as Href) : undefined}
            />
          ))}
        </Group>
      ) : (
        <Empty icon="calendar-outline" title="Nothing scheduled" />
      )}
      <GetTheAppLink />
    </Screen>
  );
}

/** On the website only: one quiet link to the phone app. */
function GetTheAppLink() {
  if (Platform.OS !== 'web' || !APK_URL) return null;
  return <Button variant="ghost" icon="logo-android" title="Get the Android app" onPress={() => Linking.openURL(APK_URL)} />;
}

function RenterHome() {
  const user = useCurrentUser();
  const bookings = useStore((s) => s.bookings);
  const performances = useStore((s) => s.performances);
  const venue = useStore((s) => s.venue);
  const mine = bookings
    .filter((b) => b.renterId === user.id && !['cancelled', 'declined'].includes(b.status) && new Date(b.end) > new Date())
    .sort((a, b) => a.start.localeCompare(b.start));
  const shows = performances.filter((p) => p.onSale && new Date(p.start) > new Date()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  const owed = mine.find((b) => b.status === 'awaiting_deposit');

  return (
    <Screen>
      <Greeting name={user.name.split(' ')[0]} tagline />

      {owed ? (
        <Card accent={C.warn}>
          <Txt v="h3">{`Lock in ${fmtDate(owed.start)}`}</Txt>
          <Txt v="small">{`${owed.title} is held for you until you pay the deposit.`}</Txt>
          <Button title={`Pay ${money(owed.quote.depositDue)} deposit`} onPress={() => router.push(`/pay?bookingId=${owed.id}&kind=deposit` as Href)} />
        </Card>
      ) : (
        <Card>
          <Txt v="h3">Host your event here</Txt>
          <Txt v="small">See open dates and get an instant quote.</Txt>
          <Button title="Check dates" icon="calendar" onPress={() => router.push('/booking/new')} />
        </Card>
      )}

      {mine.length > 0 && (
        <>
          <SectionHeader title="Your bookings" action="All" onAction={() => router.push('/rentals')} />
          <Group>
            {mine.slice(0, 3).map((b) => (
              <Line key={b.id} dot={STATUS_META[b.status].color} title={b.title} detail={`${fmtDate(b.start, { weekday: true })} · ${STATUS_META[b.status].label}`} onPress={() => router.push(`/booking/${b.id}`)} />
            ))}
          </Group>
        </>
      )}

      {shows.length > 0 && (
        <>
          <SectionHeader title="On stage soon" action="Tickets" onAction={() => router.push('/tickets')} />
          <Group>
            {shows.map((p) => (
              <Line key={p.id} dot={C.curtain} title={p.title} detail={`${fmtDate(p.start, { weekday: true })} · ${fmtTime(p.start)}`} onPress={() => router.push(`/performance/${p.id}`)} />
            ))}
          </Group>
        </>
      )}

      <Row style={{ justifyContent: 'center' }} gap={24}>
        <Button variant="ghost" small icon="call" title="Call" onPress={() => Linking.openURL(`tel:${venue.phone.replace(/\D/g, '')}`)} />
        <Button variant="ghost" small icon="mail" title="Email" onPress={() => Linking.openURL(`mailto:${venue.email}`)} />
        <Button variant="ghost" small icon="navigate" title="Directions" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(venue.address)}`)} />
      </Row>
      <GetTheAppLink />
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
  const rsvp = useStore((s) => s.rsvp);
  const now = new Date();

  const myProds = productions.filter((p) => p.members.some((m) => m.userId === user.id));
  const calls = schedule
    .filter((s) => new Date(s.end) > now)
    .filter((s) => {
      const p = myProds.find((x) => x.id === s.productionId);
      return p && isCalled(s, p, user.id);
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = calls[0];
  const later = calls.slice(1, 4);
  const unanswered = calls.filter((c) => !c.rsvps[user.id]).length;

  return (
    <Screen>
      <Greeting name={user.name.split(' ')[0]} />

      {next ? (
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
      ) : (
        <Empty icon="musical-notes-outline" title="No upcoming calls" />
      )}

      {myProds.map((p) => {
        const ids = channels.filter((c) => c.productionId === p.id).map((c) => c.id);
        const unread = messages.filter((m) => ids.includes(m.channelId) && m.userId !== user.id && m.at > (lastRead[`${user.id}:${m.channelId}`] ?? '')).length;
        return (
          <Group key={p.id}>
            <Line title={p.title} detail={[unread ? `${unread} unread` : 'Schedule, cast & chat', unanswered ? `${unanswered} to RSVP` : ''].filter(Boolean).join(' · ')} valueColor={C.gold} value={unread ? '●' : undefined} onPress={() => router.push(`/production/${p.id}`)} />
          </Group>
        );
      })}

      {later.length > 0 && (
        <>
          <SectionHeader title="After that" />
          <Group>
            {later.map((s) => (
              <Line key={s.id} dot={C.purple} title={s.title} detail={`${relativeDay(s.start)} · ${fmtTime(s.start)}`} value={s.rsvps[user.id] ? undefined : 'RSVP'} valueColor={C.warn} onPress={() => router.push(`/production/${s.productionId}?item=${s.id}` as Href)} />
            ))}
          </Group>
        </>
      )}
      <GetTheAppLink />
    </Screen>
  );
}

