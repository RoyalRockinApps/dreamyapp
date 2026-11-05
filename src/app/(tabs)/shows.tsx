import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Empty, Pill, Row, Screen, Txt } from '@/components/ui';
import { useChannels } from '@/hooks/useChannels';
import { fmtDate, fmtTime, relativeDay } from '@/lib/dates';
import { isCalled } from '@/lib/scheduling';
import type { Production } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function Shows() {
  const user = useCurrentUser();
  const productions = useStore((s) => s.productions);
  const list = user.role === 'owner' ? productions : productions.filter((p) => p.members.some((m) => m.userId === user.id));

  return (
    <Screen>
      {user.role === 'owner' && (
        <Card accent={C.purple}>
          <Txt v="h2">Your productions</Txt>
          <Txt v="muted">Cast & crew, rehearsal calendar, RSVPs, conflicts and group chat for every show you produce.</Txt>
          <Button icon="add" title="New production" onPress={() => router.push('/production/new')} />
        </Card>
      )}
      {list.length === 0 && <Empty icon="people-outline" title="No productions yet" body={user.role === 'owner' ? 'Create one to start building your company.' : 'When a director adds you to a show it will appear here.'} />}
      {list.map((p) => (
        <ProductionCard key={p.id} p={p} />
      ))}
    </Screen>
  );
}

function ProductionCard({ p }: { p: Production }) {
  const user = useCurrentUser();
  const schedule = useStore((s) => s.schedule);
  const channels = useChannels(p.id);
  const now = new Date();
  const upcoming = schedule
    .filter((s) => s.productionId === p.id && new Date(s.end) > now && (user.role === 'owner' || isCalled(s, p, user.id)))
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0];
  const unread = channels.reduce((s, c) => s + c.unread, 0);
  const me = p.members.find((m) => m.userId === user.id);
  const daysToOpen = Math.ceil((new Date(p.openingDate).getTime() - now.getTime()) / 86400000);

  return (
    <Card onPress={() => router.push(`/production/${p.id}`)} accent={p.color}>
      <Row>
        {daysToOpen > 0 ? <Pill label={`Opens in ${daysToOpen} days`} color={p.color} bg={p.color + '22'} /> : <Pill label="Running / closed" />}
        <View style={{ flex: 1 }} />
        {unread > 0 && <Pill icon="chatbubble" label={`${unread} new`} color={C.gold} bg={C.goldSoft} />}
      </Row>
      <Txt v="h1">{p.title}</Txt>
      {p.tagline ? <Txt v="muted" style={{ fontStyle: 'italic' }}>{p.tagline}</Txt> : null}
      <Txt v="small">{`${fmtDate(p.openingDate)} – ${fmtDate(p.closingDate, { year: true })} · ${p.members.length} in company · ${p.groups.length} groups`}</Txt>
      {me?.part ? <Txt v="small" color={C.gold}>{`You: ${me.part}`}</Txt> : null}
      {next && (
        <View style={{ backgroundColor: C.surface2, borderRadius: 10, padding: 10, gap: 2 }}>
          <Txt v="label">Next call</Txt>
          <Txt v="h3">{next.title}</Txt>
          <Txt v="small">{`${relativeDay(next.start)} · ${fmtTime(next.start)}–${fmtTime(next.end)} · ${next.space}`}</Txt>
        </View>
      )}
    </Card>
  );
}
