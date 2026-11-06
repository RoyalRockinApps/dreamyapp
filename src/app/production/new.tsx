import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Button, Chips, Field, Row, Screen, Txt } from '@/components/ui';
import { addDays, atMinutes, dayKey, fmtDate } from '@/lib/dates';
import { uid } from '@/lib/ids';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';
import { alert } from '@/components/alert';

const PRESET_GROUPS = ['Leads', 'Ensemble', 'Dance Corps', 'Kids Chorus', 'Tech Crew', 'Pit Band', 'Costumes', 'Front of House'];
const GROUP_COLORS = ['#E8B04B', '#7FB7BE', '#F08FC0', '#9B8DE3', '#E26D5C', '#5DA9E9', '#82D2A5', '#F2C14E'];
const SHOW_COLORS = ['#6CC596', '#E8B04B', '#E26D5C', '#9B8DE3', '#5DA9E9', '#F08FC0'];

export default function NewProduction() {
  const user = useCurrentUser();
  const createProduction = useStore((s) => s.createProduction);
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [groups, setGroups] = useState<string[]>(['Leads', 'Ensemble', 'Tech Crew']);
  const [color, setColor] = useState(SHOW_COLORS[0]);
  const start = addDays(new Date(), 60);
  const [ym, setYm] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const [opening, setOpening] = useState(dayKey(start));
  const [runDays, setRunDays] = useState('3');

  const create = () => {
    if (!title.trim()) return alert('Give your production a title');
    const closing = addDays(atMinutes(opening, 22 * 60), Number(runDays) - 1);
    const p = createProduction({
      title: title.trim(),
      tagline: tagline.trim() || undefined,
      color,
      openingDate: atMinutes(opening, 19 * 60).toISOString(),
      closingDate: closing.toISOString(),
      groups: groups.map((name) => ({ id: uid('g_'), name, color: GROUP_COLORS[PRESET_GROUPS.indexOf(name) % GROUP_COLORS.length] ?? C.gold })),
      members: [{ userId: user.id, groupIds: [], part: 'Director / Producer', isDirector: true }],
    });
    router.replace(`/production/${p.id}?tab=company`);
  };

  return (
    <Screen>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Annie Jr." />
      <Field label="Tagline (optional)" value={tagline} onChangeText={setTagline} placeholder="The sun'll come out tomorrow!" />
      <Txt v="label">Opening night</Txt>
      <MonthCalendar year={ym.y} month={ym.m} onChangeMonth={(y, m) => setYm({ y, m })} selected={opening} onSelect={setOpening} minDate={dayKey(new Date())} />
      <Txt v="label">Run length</Txt>
      <Chips options={['1', '2', '3', '4', '6', '9']} value={runDays} onChange={setRunDays} labels={{ '1': '1 day', '2': '2 days', '3': '3 days', '4': '4 days', '6': '2 weekends', '9': '3 weekends' }} />
      <Txt v="small">{`Runs ${fmtDate(atMinutes(opening, 0), { weekday: true })} – ${fmtDate(addDays(atMinutes(opening, 0), Number(runDays) - 1), { weekday: true, year: true })}`}</Txt>
      <Txt v="label">Groups (each gets a group chat)</Txt>
      <Chips multi options={PRESET_GROUPS} value={groups} onChange={(g) => setGroups((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))} />
      <Txt v="label">Color</Txt>
      <Row>
        {SHOW_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: color === c ? '#fff' : 'transparent' }} />
          </Pressable>
        ))}
      </Row>
      <Button title="Create production" icon="sparkles" onPress={create} />
    </Screen>
  );
}
