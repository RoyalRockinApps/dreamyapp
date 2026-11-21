import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { alert } from '@/components/alert';
import { ProductionDatePicker } from '@/components/ProductionDates';
import { Button, Chips, Empty, Field, Screen, Segmented, Txt } from '@/components/ui';
import { canManageProduction } from '@/lib/production';
import { boardPeople, canAddTasks, canManageTask, managedGroups, TASK_STATUS_LABELS } from '@/lib/tasks';
import { TASK_STATUSES, type TaskStatus } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';

const NONE = '_none';

/** Add a card to a board (`productionId`, or the theatre's), or edit one (`id`). */
export default function EditTask() {
  const params = useLocalSearchParams<{ id?: string; productionId?: string }>();
  const user = useCurrentUser();
  const existing = useStore((s) => (params.id ? s.tasks.find((t) => t.id === params.id) : undefined));
  const productionId = existing ? existing.productionId : params.productionId;
  const production = useStore((s) => (productionId ? s.productions.find((p) => p.id === productionId) : undefined));
  const users = useStore((s) => s.users);
  const addTask = useStore((s) => s.addTask);
  const updateTask = useStore((s) => s.updateTask);
  const director = !!production && canManageProduction(production, user);
  const groups = production ? managedGroups(user, production) : [];
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [groupId, setGroupId] = useState<string | undefined>(existing ? existing.groupId : director ? undefined : groups[0]?.id);
  const [status, setStatus] = useState<TaskStatus>(existing?.status ?? 'not_started');
  const [assigneeId, setAssigneeId] = useState(existing?.assigneeId);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? '');
  const [saving, setSaving] = useState(false);

  const allowed = existing ? canManageTask(user, production, existing.groupId) : canAddTasks(user, production);
  if ((productionId && !production) || (params.id && !existing) || !allowed) {
    return <Empty icon="lock-closed-outline" title="You can’t change this card" />;
  }

  // a Team Lead's cards belong to a group they lead; directors may leave a card ungrouped
  const groupOptions = [...(director || !production ? [NONE] : []), ...groups.map((g) => g.id)];
  const people = boardPeople(users, production);
  const ready = !!title.trim() && (!production || director || !!groupId);

  const save = async () => {
    setSaving(true);
    try {
      const fields = { title, notes, groupId, status, assigneeId, dueDate: dueDate || undefined };
      if (existing) await updateTask(existing.id, fields);
      else await addTask({ ...fields, productionId });
      router.back();
    } catch (e) {
      alert('Couldn’t save the card', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit card' : 'New card' }} />
      <Txt v="small">{production ? `${production.title} task board` : 'Theatre task board'}</Txt>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Order the elf costumes" editable={!saving} />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="Details, links, who to ask" editable={!saving} />
      {production && groupOptions.length > 0 && (
        <>
          <Txt v="label">Group</Txt>
          <Chips
            options={groupOptions}
            value={groupId ?? NONE}
            onChange={(v) => setGroupId(v === NONE ? undefined : v)}
            labels={{ [NONE]: 'No group', ...Object.fromEntries(production.groups.map((g) => [g.id, g.name])) }}
            colors={Object.fromEntries(production.groups.map((g) => [g.id, g.color]))}
          />
        </>
      )}
      <Txt v="label">Status</Txt>
      <Segmented options={TASK_STATUSES} value={status} onChange={setStatus} labels={TASK_STATUS_LABELS} />
      <Txt v="label">Assigned to</Txt>
      <Chips
        options={[NONE, ...people.map((p) => p.id)]}
        value={assigneeId ?? NONE}
        onChange={(v) => setAssigneeId(v === NONE ? undefined : v)}
        labels={{ [NONE]: 'Unassigned', ...Object.fromEntries(people.map((p) => [p.id, p.id === user.id ? `${p.name} (you)` : p.name])) }}
      />
      <ProductionDatePicker label="Due date" value={dueDate || undefined} onChange={setDueDate} clearable />
      <Button title={existing ? 'Save card' : 'Add card'} icon="checkmark" loading={saving} disabled={!ready} onPress={() => void save()} />
    </Screen>
  );
}
