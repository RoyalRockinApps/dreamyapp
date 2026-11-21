import { Empty, Screen, Txt } from '@/components/ui';
import { TaskBoard } from '@/components/TaskBoard';
import { canSeeBoard } from '@/lib/tasks';
import { useCurrentUser } from '@/store/useStore';

/** The theatre-wide task board: for owners, staff and theatre Team Leads. */
export default function TheatreTasks() {
  const user = useCurrentUser();
  if (!canSeeBoard(user)) return <Empty icon="lock-closed-outline" title="This board isn’t available to you" />;
  return (
    <Screen>
      <Txt v="small">Venue work for the owner, staff and theatre Team Leads. Each show has its own board under Shows.</Txt>
      <TaskBoard />
    </Screen>
  );
}
