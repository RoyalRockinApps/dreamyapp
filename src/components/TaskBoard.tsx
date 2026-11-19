import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { alert } from '@/components/alert';
import { formatProductionDay } from '@/components/ProductionDates';
import { Avatar, Button, Card, Empty, Pill, Row, Segmented, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { dayKey } from '@/lib/dates';
import { agoLabel, canAddTasks, canManageTask, canSeeBoard, sortTasks, TASK_STATUS_LABELS, updatesByTask } from '@/lib/tasks';
import { TASK_STATUSES, type Production, type Task, type TaskStatus, type TaskUpdate, type User } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

const NEXT: Partial<Record<TaskStatus, TaskStatus>> = { not_started: 'in_progress', in_progress: 'completed' };

/**
 * A task board: cards in Not started, In progress and Completed. A production's board when given
 * its id, otherwise the theatre's. Phones show one column at a time; wide screens show all three.
 */
export function TaskBoard({ productionId }: { productionId?: string }) {
  const user = useCurrentUser();
  const production = useStore((s) => (productionId ? s.productions.find((p) => p.id === productionId) : undefined));
  const allTasks = useStore((s) => s.tasks);
  const allUpdates = useStore((s) => s.taskUpdates);
  const users = useStore((s) => s.users);
  const updateTask = useStore((s) => s.updateTask);
  const { width } = useWindowDimensions();
  const today = dayKey(useNow(60_000));
  const tasks = useMemo(() => allTasks.filter((t) => t.productionId === productionId), [allTasks, productionId]);
  const updates = useMemo(() => updatesByTask(allUpdates), [allUpdates]);
  const [column, setColumn] = useState<TaskStatus>(() => (tasks.some((t) => t.status === 'in_progress') ? 'in_progress' : 'not_started'));

  if (!canSeeBoard(user, production)) return <Empty icon="lock-closed-outline" title="This board isn’t available to you" />;

  const byStatus = (status: TaskStatus) => sortTasks(tasks.filter((t) => t.status === status));
  const move = (task: Task, status: TaskStatus) =>
    void updateTask(task.id, { status }).catch((e) => alert('Couldn’t move the card', errorMessage(e)));
  const cards = (status: TaskStatus) => {
    const list = byStatus(status);
    if (list.length === 0) return <Txt v="small" style={{ paddingVertical: 8 }}>{`No cards ${status === 'completed' ? 'completed yet' : TASK_STATUS_LABELS[status].toLowerCase()}.`}</Txt>;
    return list.map((task) => (
      <TaskCard
        key={task.id}
        task={task}
        production={production}
        users={users}
        latest={updates.get(task.id)}
        today={today}
        onMove={canManageTask(user, production, task.groupId) && NEXT[task.status] ? () => move(task, NEXT[task.status]!) : undefined}
      />
    ));
  };
  const count = (status: TaskStatus) => tasks.filter((t) => t.status === status).length;

  return (
    <View style={{ gap: 12 }}>
      {canAddTasks(user, production) && (
        <Button icon="add" title="New card" onPress={() => router.push({ pathname: '/task/edit', params: productionId ? { productionId } : {} })} />
      )}
      {width >= 900 ? (
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          {TASK_STATUSES.map((status) => (
            <View key={status} style={{ flex: 1, gap: 10 }}>
              <Txt v="label">{`${TASK_STATUS_LABELS[status]} · ${count(status)}`}</Txt>
              {cards(status)}
            </View>
          ))}
        </Row>
      ) : (
        <>
          <Segmented
            options={TASK_STATUSES}
            value={column}
            onChange={setColumn}
            labels={{ not_started: `Not started · ${count('not_started')}`, in_progress: `In progress · ${count('in_progress')}`, completed: `Done · ${count('completed')}` }}
          />
          {cards(column)}
        </>
      )}
    </View>
  );
}

function TaskCard({ task, production, users, latest, today, onMove }: {
  task: Task;
  production?: Production;
  users: User[];
  latest?: { last: TaskUpdate; count: number };
  today: string;
  onMove?: () => void;
}) {
  const group = production?.groups.find((g) => g.id === task.groupId);
  const assignee = users.find((u) => u.id === task.assigneeId);
  const overdue = task.status !== 'completed' && !!task.dueDate && task.dueDate < today;
  const next = NEXT[task.status];
  return (
    <Card accent={group?.color} onPress={() => router.push(`/task/${task.id}`)} style={{ gap: 8 }}>
      <Txt v="h3">{task.title}</Txt>
      {(group || task.dueDate) && (
        <Row style={{ flexWrap: 'wrap' }}>
          {group && <Pill label={group.name} color={group.color} bg={group.color + '22'} />}
          {task.dueDate && (
            <Pill icon="calendar-outline" label={`${overdue ? 'Overdue · ' : 'Due '}${formatProductionDay(task.dueDate)}`} color={overdue ? C.warn : C.muted} bg={overdue ? C.warnSoft : undefined} />
          )}
        </Row>
      )}
      <Row gap={8}>
        {assignee ? <Avatar name={assignee.name} color={assignee.color} size={22} /> : null}
        <Txt v="small">{assignee ? assignee.name : 'Unassigned'}</Txt>
      </Row>
      {latest ? (
        <View style={styles.latest}>
          <Txt v="small" color={C.text} numberOfLines={2}>{latest.last.body}</Txt>
          <Txt v="small">{`Last update by ${latest.last.authorName} · ${agoLabel(latest.last.at)}${latest.count > 1 ? ` · ${latest.count} updates` : ''}`}</Txt>
        </View>
      ) : (
        <Txt v="small">No updates yet</Txt>
      )}
      {onMove && next && (
        <Button small variant="secondary" icon={next === 'completed' ? 'checkmark' : 'play-outline'} title={next === 'completed' ? 'Mark completed' : 'Start'} onPress={onMove} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  latest: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingTop: 8, gap: 2 },
});
