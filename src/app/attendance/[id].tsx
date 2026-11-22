import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Button, Card, Empty, Row, Screen, Txt } from '@/components/ui';
import { ATTENDANCE_LABELS, marksFor, rollFor, rollOpen, takesRoll } from '@/lib/attendance';
import { fmtDate, fmtTime } from '@/lib/dates';
import { ATTENDANCE_STATUSES } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { ATTENDANCE_COLOR, C, F, R } from '@/theme';

const RSVP_HINT = { yes: 'Said going', maybe: 'Said maybe', no: 'Said can’t make it' } as const;

/** Take roll at a call: mark each person present, late, absent or excused. */
export default function TakeAttendance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useCurrentUser();
  const item = useStore((s) => s.schedule.find((x) => x.id === id));
  const production = useStore((s) => (item ? s.productions.find((p) => p.id === item.productionId) : undefined));
  const users = useStore((s) => s.users);
  const records = useStore((s) => s.attendance);
  const conflicts = useStore((s) => s.conflicts);
  const markAttendance = useStore((s) => s.markAttendance);
  const roll = useMemo(() => (item && production ? rollFor(item, production, user, users) : []), [item, production, user, users]);
  const marks = useMemo(() => marksFor(records, id), [records, id]);

  if (!item || !production || !takesRoll(user, production)) return <Empty icon="lock-closed-outline" title="Attendance isn’t available to you" />;

  const counts = ATTENDANCE_STATUSES.map((st) => [st, roll.filter((u) => marks.get(u.id)?.status === st).length] as const);
  const unmarked = roll.filter((u) => !marks.has(u.id));
  const open = rollOpen(item);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <Card>
        <Txt v="h2">{item.title}</Txt>
        <Txt v="small">{`${fmtDate(item.start, { weekday: true })} · ${fmtTime(item.start)}–${fmtTime(item.end)} · ${item.space}`}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {counts.map(([st, n]) => (
            <Txt key={st} v="small" color={n ? ATTENDANCE_COLOR[st] : C.faint}>{`${n} ${ATTENDANCE_LABELS[st].toLowerCase()}`}</Txt>
          ))}
          <Txt v="small" color={unmarked.length ? C.text : C.faint}>{`${unmarked.length} not marked`}</Txt>
        </Row>
      </Card>

      {!open && <Txt v="small" color={C.warn}>Roll opens half an hour before the call starts.</Txt>}
      {open && unmarked.length > 0 && (
        <Button variant="secondary" icon="checkmark-done" title={`Mark the other ${unmarked.length} present`} onPress={() => unmarked.forEach((u) => markAttendance(item.id, u.id, 'present'))} />
      )}

      {roll.length === 0 && <Empty icon="people-outline" title="No one to mark" body="Nobody you take roll for is called to this." />}
      {roll.map((u) => {
        const mark = marks.get(u.id);
        const rsvp = item.rsvps[u.id];
        const conflict = conflicts.find((c) => c.userId === u.id && c.productionId === production.id && c.start < item.end && c.end > item.start);
        const hint = conflict ? `Conflict: ${conflict.note || 'can’t make it'}` : rsvp ? RSVP_HINT[rsvp] : 'No RSVP';
        return (
          <Card key={u.id} style={{ gap: 10, paddingVertical: 12 }}>
            <Row gap={10}>
              <Avatar name={u.name} color={u.color} size={32} />
              <View style={{ flex: 1 }}>
                <Txt v="h3">{u.name}</Txt>
                <Txt v="small" color={conflict || rsvp === 'no' ? C.warn : C.muted}>{hint}</Txt>
              </View>
            </Row>
            <Row gap={6}>
              {ATTENDANCE_STATUSES.map((st) => {
                const on = mark?.status === st;
                return (
                  <Pressable
                    key={st}
                    disabled={!open}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !open }}
                    accessibilityLabel={`${u.name}: ${ATTENDANCE_LABELS[st]}`}
                    onPress={() => markAttendance(item.id, u.id, on ? null : st, st === 'excused' && conflict ? conflict.note : '')}
                    style={({ pressed }) => ({
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: R.md,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: on ? ATTENDANCE_COLOR[st] : C.border,
                      backgroundColor: on ? ATTENDANCE_COLOR[st] + '2A' : C.surface2,
                      opacity: !open ? 0.45 : pressed ? 0.7 : 1,
                    })}>
                    <Txt v="small" color={on ? ATTENDANCE_COLOR[st] : C.muted} style={{ fontFamily: F.semibold }}>{ATTENDANCE_LABELS[st]}</Txt>
                  </Pressable>
                );
              })}
            </Row>
          </Card>
        );
      })}
      {open && roll.length > 0 && <Txt v="small">Tap a mark again to clear it. Each person can see their own record.</Txt>}
    </Screen>
  );
}
