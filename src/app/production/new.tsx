import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { alert } from '@/components/alert';
import { ProductionRunFields } from '@/components/ProductionDates';
import { Button, Chips, Collapsible, Empty, Field, Row, Screen, Txt } from '@/components/ui';
import { uid } from '@/lib/ids';
import { productionRunDates } from '@/lib/production';
import { errorMessage, useIsOwner, useStore } from '@/store/useStore';
import { C } from '@/theme';

const PRESET_GROUPS = ['Leads', 'Ensemble', 'Dance Corps', 'Kids Chorus', 'Tech Crew', 'Pit Band', 'Costumes', 'Front of House', 'Production Staff'];
const GROUP_COLORS = ['#E8B04B', '#7FB7BE', '#F08FC0', '#9B8DE3', '#E26D5C', '#5DA9E9', '#82D2A5', '#F2C14E', '#B98BE2'];
const SHOW_COLORS = ['#6CC596', '#E8B04B', '#E26D5C', '#9B8DE3', '#5DA9E9', '#F08FC0'];

export default function NewProduction() {
  const isOwner = useIsOwner();
  const createProduction = useStore((s) => s.createProduction);
  const [title, setTitle] = useState('');
  const [pitch, setPitch] = useState('');
  const [tagline, setTagline] = useState('');
  const [groups, setGroups] = useState<string[]>(['Leads', 'Ensemble', 'Tech Crew', 'Production Staff']);
  const [color, setColor] = useState(SHOW_COLORS[0]);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!title.trim()) return alert('Give your production a title');
    setSaving(true);
    try {
      const p = await createProduction({
        title: title.trim(),
        pitch: pitch.trim() || undefined,
        tagline: tagline.trim() || undefined,
        color,
        ...productionRunDates(opening, closing),
        groups: groups.map((name) => ({ id: uid('g_'), name, color: GROUP_COLORS[PRESET_GROUPS.indexOf(name) % GROUP_COLORS.length] ?? C.accent })),
      });
      router.replace(`/production/${p.id}`);
    } catch (error) {
      alert('Couldn’t create production', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) return <Empty icon="lock-closed-outline" title="Only the venue owner can start a production" />;

  return (
    <Screen>
      <Txt v="h2">Start with a pitch</Txt>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Annie Jr." />
      <Field label="Pitch" value={pitch} onChangeText={setPitch} multiline placeholder="What’s the show, and what would it take to put it on?" hint="Visible to the company. Add private planning details in the Concept workspace." />
      <Field label="Tagline (optional)" value={tagline} onChangeText={setTagline} placeholder="The sun'll come out tomorrow!" />
      <Collapsible title="Run dates" subtitle="Optional at the concept stage" icon="calendar-outline">
        <ProductionRunFields opening={opening} closing={closing} setOpening={setOpening} setClosing={setClosing} />
      </Collapsible>
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
      <Button title="Create production" icon="sparkles" onPress={() => void create()} disabled={!title.trim()} loading={saving} />
    </Screen>
  );
}
