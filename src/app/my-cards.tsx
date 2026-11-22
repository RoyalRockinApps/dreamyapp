import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { TaskCard } from '@/components/TaskBoard';
import { Empty, Screen, Segmented, Txt } from '@/components/ui';
import { useNow } from '@/hooks/useAgenda';
import { dayKey } from '@/lib/dates';
import { assignedTo, updatesByTask } from '@/lib/tasks';
import { useCurrentUser, useStore } from '@/store/useStore';

/** Every card assigned to you, across the theatre board and each production's board. */
export default function MyCards() {
  const user = useCurrentUser();
  const tasks = useStore((s) => s.tasks);
  const taskUpdates = useStore((s) => s.taskUpdates);
  const productions = useStore((s) => s.productions);
  const users = useStore((s) => s.users);
  const today = dayKey(useNow(60_000));
  const [view, setView] = useState<'open' | 'completed'>('open');
  const { open, completed } = useMemo(() => assignedTo(tasks, user.id), [tasks, user.id]);
  const updates = useMemo(() => updatesByTask(taskUpdates), [taskUpdates]);
  const list = view === 'open' ? open : completed;

  return (
    <Screen>
      <Segmented options={['open', 'completed'] as const} value={view} onChange={setView} labels={{ open: `To do (${open.length})`, completed: 'Completed' }} />
      {list.length === 0 && (
        <Empty
          icon={view === 'open' ? 'checkmark-done-outline' : 'albums-outline'}
          title={view === 'open' ? 'Nothing assigned to you' : 'No completed cards yet'}
          body={view === 'open' ? 'Cards a director or Team Lead assigns to you show up here.' : undefined}
        />
      )}
      <View style={{ gap: 10 }}>
        {list.map((task) => {
          const production = productions.find((p) => p.id === task.productionId);
          return <TaskCard key={task.id} task={task} production={production} users={users} latest={updates.get(task.id)} today={today} board={production?.title ?? 'Theatre board'} />;
        })}
      </View>
      {view === 'open' && open.length > 0 && <Txt v="small">Post an update on a card to tell everyone how it’s going.</Txt>}
    </Screen>
  );
}
