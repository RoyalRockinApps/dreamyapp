import { router } from 'expo-router';
import { useMemo } from 'react';

import { ProductionStageBadge } from '@/components/ProductionStage';
import { Button, Card, Empty, ListItem, Pill, Row, Screen, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { useChannels } from '@/hooks/useChannels';
import { dayKey, fmtDate, fmtTime, relativeDay } from '@/lib/dates';
import { canManageProduction, productionStage } from '@/lib/production';
import { isCalled } from '@/lib/scheduling';
import { assignedTo, canSeeBoard, dueState } from '@/lib/tasks';
import type { Production } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

/** Your productions, the theatre-wide task board, and the cards assigned to you. */
export default function Productions() {
  const user = useCurrentUser();
  const productions = useStore((s) => s.productions);
  const tasks = useStore((s) => s.tasks);
  const today = dayKey(useNow(60_000));
  const isOwner = user.role === 'owner';
  const list = isOwner ? productions : productions.filter((p) => p.members.some((m) => m.userId === user.id));
  const mine = useMemo(() => assignedTo(tasks, user.id).open, [tasks, user.id]);
  const late = mine.filter((t) => dueState(t, today) === 'overdue').length;
  const theatreOpen = tasks.filter((t) => !t.productionId && t.status !== 'completed').length;

  return (
    <Screen>
      {(mine.length > 0 || canSeeBoard(user)) && (
        <Card style={{ paddingVertical: 4 }}>
          {mine.length > 0 && (
            <ListItem
              icon="person-circle-outline"
              iconColor={late ? C.warn : C.accent}
              title="Assigned to me"
              subtitle={`${mine.length} open card${mine.length === 1 ? '' : 's'}${late ? ` · ${late} overdue` : ''}`}
              onPress={() => router.push('/my-cards')}
            />
          )}
          {canSeeBoard(user) && (
            <ListItem icon="albums-outline" title="Theatre task board" subtitle={`Venue work for staff and Team Leads · ${theatreOpen} open`} onPress={() => router.push('/tasks')} />
          )}
        </Card>
      )}

      {list.length === 0 && <Empty icon="people-outline" title="No productions yet" body={isOwner ? 'Create one to start building your company.' : 'When a director adds you to a show it will appear here.'} />}
      {list.map((p) => (
        <ProductionCard key={p.id} p={p} />
      ))}
      {isOwner && <Button variant="secondary" icon="add" title="New production" onPress={() => router.push('/production/new')} />}
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
