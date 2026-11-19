import { router } from 'expo-router';

import { ProductionStageBadge } from '@/components/ProductionStage';
import { Button, Card, Empty, Pill, Row, Screen, Txt } from '@/components/ui';
import { useChannels } from '@/hooks/useChannels';
import { fmtDate, fmtTime, relativeDay } from '@/lib/dates';
import { canManageProduction, productionStage } from '@/lib/production';
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
          <Txt v="muted">Start with a pitch and plan milestones, calls, and company communications through the final performance.</Txt>
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
    .filter((s) => s.productionId === p.id && new Date(s.end) > now && (canManageProduction(p, user) || isCalled(s, p, user.id)))
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = upcoming[0];
  const unread = channels.reduce((s, c) => s + c.unread, 0);
  const me = p.members.find((m) => m.userId === user.id);
  const milestones = p.milestones ?? [];
  const done = milestones.filter((m) => m.completed).length;

  return (
    <Card onPress={() => router.push(`/production/${p.id}`)} accent={p.color}>
      <Row>
        <Txt v="h2" style={{ flex: 1 }}>{p.title}</Txt>
        {unread > 0 && <Pill icon="chatbubble" label={String(unread)} color={C.accent} bg={C.accentSoft} />}
      </Row>
      <ProductionStageBadge stage={productionStage(p)} />
      {(milestones.length > 0 || me?.part) ? <Txt v="small">{[milestones.length ? `${done}/${milestones.length} milestones` : '', me?.part ? `You: ${me.part}` : ''].filter(Boolean).join(' · ')}</Txt> : null}
      {p.openingDate && p.closingDate && <Txt v="small">{`${fmtDate(p.openingDate)} – ${fmtDate(p.closingDate)}`}</Txt>}
      {next && <Txt v="small" color={C.purple}>{`Next: ${next.title} · ${relativeDay(next.start)} ${fmtTime(next.start)}`}</Txt>}
    </Card>
  );
}
