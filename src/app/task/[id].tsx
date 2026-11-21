import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { alert } from '@/components/alert';
import { formatProductionDay } from '@/components/ProductionDates';
import { Avatar, Button, Card, Empty, Field, IconButton, KeyValue, Pill, Row, Screen, SectionHeader, Segmented, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { dayKey, fmtDate, fmtTime } from '@/lib/dates';
import { agoLabel, canManageTask, canSeeBoard, TASK_STATUS_LABELS } from '@/lib/tasks';
import { TASK_STATUSES, type TaskStatus } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

/** One task card: its details, where it stands, and its thread of updates (newest first). */
export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const task = useStore((s) => s.tasks.find((t) => t.id === id));
  const production = useStore((s) => (task?.productionId ? s.productions.find((p) => p.id === task.productionId) : undefined));
  const users = useStore((s) => s.users);
  const allUpdates = useStore((s) => s.taskUpdates);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const postTaskUpdate = useStore((s) => s.postTaskUpdate);
  const deleteTaskUpdate = useStore((s) => s.deleteTaskUpdate);
  const today = dayKey(useNow(60_000));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const updates = useMemo(() => allUpdates.filter((u) => u.taskId === id).sort((a, b) => b.at.localeCompare(a.at)), [allUpdates, id]);

  if (!task || (task.productionId && !production) || !canSeeBoard(user, production)) {
    return <Empty icon="albums-outline" title="Card not available" body="It may have been removed." />;
  }

  const canManage = canManageTask(user, production, task.groupId);
  const group = production?.groups.find((g) => g.id === task.groupId);
  const person = (personId?: string) => users.find((u) => u.id === personId);
  const assignee = person(task.assigneeId);
  const overdue = task.status !== 'completed' && !!task.dueDate && task.dueDate < today;
  const run = async (what: string, write: () => Promise<void>) => {
    setBusy(true);
    try {
      await write();
    } catch (e) {
      alert(what, errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const post = () => void run('Couldn’t post the update', async () => {
    await postTaskUpdate(task.id, draft);
    setDraft('');
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: production ? production.title : 'Theatre tasks' }} />
      <View style={{ gap: 8 }}>
        <Txt v="h2">{task.title}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {group && <Pill label={group.name} color={group.color} bg={group.color + '22'} />}
          {!canManage && <Pill label={TASK_STATUS_LABELS[task.status]} color={task.status === 'completed' ? C.green : C.accent} bg={task.status === 'completed' ? C.greenSoft : C.accentSoft} />}
          {overdue && <Pill label="Overdue" color={C.warn} bg={C.warnSoft} />}
        </Row>
      </View>

      {canManage && (
        <Segmented
          options={TASK_STATUSES}
          value={task.status}
          onChange={(status: TaskStatus) => void run('Couldn’t move the card', () => updateTask(task.id, { status }))}
          labels={TASK_STATUS_LABELS}
        />
      )}

      <Card>
        <KeyValue k="Assigned to" v={assignee?.name ?? 'Unassigned'} />
        <KeyValue k="Due" v={task.dueDate ? formatProductionDay(task.dueDate) : 'No date'} color={overdue ? C.warn : undefined} />
        <KeyValue k="Added by" v={person(task.createdBy)?.name ?? '—'} />
        {task.notes ? <Txt style={{ marginTop: 4 }}>{task.notes}</Txt> : null}
      </Card>

      {canManage && (
        <Row style={{ flexWrap: 'wrap' }}>
          <Button small variant="secondary" icon="create-outline" title="Edit card" disabled={busy} onPress={() => router.push({ pathname: '/task/edit', params: { id: task.id } })} />
          <Button
            small
            variant="danger"
            icon="trash-outline"
            title="Delete card"
            disabled={busy}
            onPress={() => alert('Delete this card?', 'Its updates are deleted too. This can’t be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void run('Couldn’t delete the card', async () => {
                await deleteTask(task.id);
                router.back();
              }) },
            ])}
          />
        </Row>
      )}

      <SectionHeader title={`Updates · ${updates.length}`} />
      {updates[0] && <Txt v="small">{`Last update by ${updates[0].authorName}, ${agoLabel(updates[0].at)}.`}</Txt>}
      <Field label="Post an update" value={draft} onChangeText={setDraft} multiline maxLength={2000} placeholder="What’s changed?" editable={!busy} />
      <Button icon="send-outline" title="Post update" loading={busy} disabled={!draft.trim()} onPress={post} />
      {updates.map((u) => {
        const author = person(u.personId);
        const canRemove = u.personId === user.id || canManage;
        return (
          <Card key={u.id} style={{ gap: 6 }}>
            <Row gap={10}>
              <Avatar name={u.authorName} color={author?.color} size={30} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{u.authorName + (u.personId === user.id ? ' (you)' : '')}</Txt>
                <Txt v="small">{`${fmtDate(u.at, { weekday: true })} · ${fmtTime(u.at)}`}</Txt>
              </View>
              {canRemove && (
                <IconButton icon="trash-outline" size={18} color={C.faint} onPress={() => alert('Remove this update?', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => void run('Couldn’t remove the update', () => deleteTaskUpdate(u.id)) },
                ])} />
              )}
            </Row>
            <Txt>{u.body}</Txt>
          </Card>
        );
      })}
      {updates.length === 0 && <Txt v="muted">No updates yet. Post the first one.</Txt>}
    </Screen>
  );
}
