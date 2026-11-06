import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Button, Card, Chips, Empty, Field, Row, Screen, SectionHeader, Txt, tap } from '@/components/ui';
import { addDays, addMinutes, atMinutes, dayKey, fmtDate, fmtMinutes, fmtTime } from '@/lib/dates';
import { findConflicts, memberConflictsFor, stageBusy } from '@/lib/scheduling';
import { SCHEDULE_KINDS, SPACES, type ScheduleKind, type Space } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C, F, R } from '@/theme';
import { alert } from '@/components/alert';

const TIMES = Array.from({ length: 31 }, (_, i) => 7 * 60 + i * 30); // 7:00am – 10:00pm
const DURATIONS = [60, 90, 120, 150, 180, 240, 300, 480];
const REPEATS = [1, 2, 4, 6, 8] as const;

export default function EditCall() {
  const params = useLocalSearchParams<{ id?: string; productionId?: string; date?: string }>();
  const productions = useStore((s) => s.productions);
  const schedule = useStore((s) => s.schedule);
  const bookings = useStore((s) => s.bookings);
  const conflicts = useStore((s) => s.conflicts);
  const bufferMins = useStore((s) => s.settings.bufferMins);
  const users = useStore((s) => s.users);
  const upsert = useStore((s) => s.upsertScheduleItem);
  const remove = useStore((s) => s.deleteScheduleItem);

  const existing = params.id ? schedule.find((s) => s.id === params.id) : undefined;
  const startD = existing ? new Date(existing.start) : null;
  const initialDay = existing ? dayKey(existing.start) : params.date ?? dayKey(addDays(new Date(), 1));

  const [productionId, setProductionId] = useState(existing?.productionId ?? params.productionId ?? productions[0]?.id);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<ScheduleKind>(existing?.kind ?? 'Rehearsal');
  const [day, setDay] = useState(initialDay);
  const [ym, setYm] = useState(() => {
    const d = atMinutes(initialDay, 0);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [startMin, setStartMin] = useState(startD ? startD.getHours() * 60 + startD.getMinutes() : 18 * 60);
  const [duration, setDuration] = useState(existing ? Math.round((new Date(existing.end).getTime() - new Date(existing.start).getTime()) / 60000) : 180);
  const [space, setSpace] = useState<Space>(existing?.space ?? 'Main Stage');
  const [groupIds, setGroupIds] = useState<string[]>(existing?.groupIds ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [repeat, setRepeat] = useState<(typeof REPEATS)[number]>(1);

  const production = productions.find((p) => p.id === productionId);
  const busy = useMemo(() => stageBusy(bookings, schedule, new Date(), existing?.id), [bookings, schedule, existing?.id]);

  if (!production) return <Empty icon="people-outline" title="Create a production first" />;

  const occurrences = Array.from({ length: existing ? 1 : repeat }, (_, i) => {
    const s = atMinutes(dayKey(addDays(atMinutes(day, 0), i * 7)), startMin);
    return { start: s, end: addMinutes(s, duration) };
  });
  const stageClashes = space === 'Main Stage' ? occurrences.map((o) => findConflicts(o.start.toISOString(), o.end.toISOString(), busy, bufferMins)) : occurrences.map(() => []);
  const peopleClashes = occurrences.flatMap((o) => memberConflictsFor({ groupIds, start: o.start.toISOString(), end: o.end.toISOString() }, production, conflicts));
  const blocked = stageClashes.filter((c) => c.length > 0).length;

  const save = () => {
    const t = title.trim() || kind;
    let created = 0;
    occurrences.forEach((o, i) => {
      if (stageClashes[i].length) return; // never double-book the stage
      upsert({ id: existing?.id, productionId: production.id, title: t, kind, start: o.start.toISOString(), end: o.end.toISOString(), space, groupIds, notes: notes.trim() || undefined });
      created++;
    });
    if (created === 0) return alert('Stage is booked', 'That time overlaps another event on the Main Stage. Pick another time or use the Rehearsal Room.');
    if (blocked > 0) alert('Scheduled with skips', `${created} call${created > 1 ? 's' : ''} added. ${blocked} week${blocked > 1 ? 's were' : ' was'} skipped because the stage is booked.`);
    router.back();
  };

  const groupLabels = Object.fromEntries(production.groups.map((g) => [g.id, g.name]));
  const groupColors = Object.fromEntries(production.groups.map((g) => [g.id, g.color]));

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit Call' : 'Schedule a Call' }} />
      {productions.length > 1 && (
        <>
          <Txt v="label">Production</Txt>
          <Chips options={productions.map((p) => p.id)} value={productionId} onChange={setProductionId} labels={Object.fromEntries(productions.map((p) => [p.id, p.title]))} />
        </>
      )}
      <Txt v="label">Type</Txt>
      <Chips options={SCHEDULE_KINDS} value={kind} onChange={setKind} />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder={`e.g. ${kind} — Act I`} />

      <MonthCalendar year={ym.y} month={ym.m} onChangeMonth={(y, m) => setYm({ y, m })} selected={day} onSelect={setDay} />

      <SectionHeader title="Start" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {TIMES.map((m) => {
          const on = m === startMin;
          return (
            <Pressable key={m} onPress={() => { tap(); setStartMin(m); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: on ? C.accent : C.border, backgroundColor: on ? C.accentSoft : C.surface }}>
              <Text style={{ color: on ? C.accent : C.text, fontFamily: F.bold }}>{fmtMinutes(m)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Txt v="label">Length</Txt>
      <Chips options={DURATIONS.map(String)} value={String(duration)} onChange={(v) => setDuration(Number(v))} labels={Object.fromEntries(DURATIONS.map((d) => [String(d), d % 60 ? `${Math.floor(d / 60)}½ hr` : `${d / 60} hr`]))} />

      <Txt v="label">Where</Txt>
      <Chips options={SPACES} value={space} onChange={setSpace} />

      <Txt v="label">Who is called</Txt>
      <Chips options={['__all']} value={groupIds.length ? [] : ['__all']} multi onChange={() => setGroupIds([])} labels={{ __all: 'Full company' }} />
      <Chips multi options={production.groups.map((g) => g.id)} value={groupIds} onChange={(id) => setGroupIds((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))} labels={groupLabels} colors={groupColors} />

      {!existing && (
        <>
          <Txt v="label">Repeat weekly</Txt>
          <Chips options={REPEATS.map(String)} value={String(repeat)} onChange={(v) => setRepeat(Number(v) as (typeof REPEATS)[number])} labels={{ '1': 'Just once', '2': '2 weeks', '4': '4 weeks', '6': '6 weeks', '8': '8 weeks' }} />
        </>
      )}

      <Field label="Notes for the company" value={notes} onChangeText={setNotes} multiline placeholder="What to bring, scenes being worked, parking…" />

      <Card accent={blocked ? C.danger : peopleClashes.length ? C.warn : C.green}>
        {occurrences.map((o, i) => (
          <Row key={i}>
            <Ionicons name={stageClashes[i].length ? 'close-circle' : 'checkmark-circle'} size={18} color={stageClashes[i].length ? C.danger : C.green} />
            <Txt v="small" style={{ flex: 1 }}>{`${fmtDate(o.start, { weekday: true })} ${fmtTime(o.start)}–${fmtTime(o.end)}`}</Txt>
            {stageClashes[i].length > 0 && <Txt v="small" color={C.danger}>{`Stage: ${stageClashes[i][0].title}`}</Txt>}
          </Row>
        ))}
        {space !== 'Main Stage' && <Txt v="small">{`${space} doesn't block stage rentals.`}</Txt>}
        {peopleClashes.length > 0 && (
          <View style={{ gap: 2, marginTop: 4 }}>
            <Txt v="small" color={C.warn}>Cast/crew with conflicts:</Txt>
            {peopleClashes.map((c, i) => (
              <Txt key={c.id + i} v="small" color={C.warn}>{`• ${users.find((u) => u.id === c.userId)?.name} — ${fmtDate(c.start)} (${c.note})`}</Txt>
            ))}
          </View>
        )}
      </Card>

      <Button title={existing ? 'Save changes' : occurrences.length > 1 ? `Schedule ${occurrences.length - blocked} calls` : 'Schedule & notify company'} icon="checkmark" onPress={save} />
      {existing && (
        <Button
          variant="danger"
          title="Delete call"
          onPress={() =>
            alert('Delete this call?', 'It will be removed from everyone’s schedule.', [
              { text: 'Keep', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { remove(existing.id); router.back(); } },
            ])
          }
        />
      )}
    </Screen>
  );
}
