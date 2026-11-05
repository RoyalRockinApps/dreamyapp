import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AdminPage, Grid, SaveBar } from '@/components/admin';
import { alert } from '@/components/alert';
import { SeatMap } from '@/components/SeatMap';
import { Button, Card, Chips, Pill, Row, Stat, Txt } from '@/components/ui';
import { DEFAULT_HOUSE, layoutFor, TIER_LABEL, type HouseConfig, type SectionId } from '@/lib/seating';
import type { PriceTier } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C, R } from '@/theme';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const SECTION_LABEL: Record<SectionId, string> = { L: 'House left', C: 'Center', R: 'House right' };

export default function AdminSeating() {
  const house = useStore((s) => s.house);
  const updateHouse = useStore((s) => s.updateHouse);
  const markSetup = useStore((s) => s.markSetup);
  const [draft, setDraft] = useState<HouseConfig>(house);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(house);
  const layout = useMemo(() => layoutFor(draft), [draft]);
  const now = useMemo(() => new Date(), []);

  const counts = layout.reduce((acc, s) => ({ ...acc, [s.tier]: (acc[s.tier] ?? 0) + 1 }), {} as Record<PriceTier, number>);

  const setRows = (n: number) => {
    const rows = LETTERS.slice(0, Math.max(1, Math.min(26, n)));
    setDraft((d) => ({
      ...d,
      rows,
      premiumRows: d.premiumRows.filter((r) => rows.includes(r)),
      valueRows: d.valueRows.filter((r) => rows.includes(r)),
      accessibleSeats: d.accessibleSeats.filter((id) => rows.includes(id.split('-')[0])),
    }));
  };
  const setWidth = (sec: SectionId, n: number) =>
    setDraft((d) => {
      const w = Math.max(sec === 'C' ? 1 : 0, Math.min(40, n));
      return { ...d, sectionWidths: { ...d.sectionWidths, [sec]: w }, accessibleSeats: d.accessibleSeats.filter((id) => !id.includes(`-${sec}`) || Number(id.split(sec)[1]) <= w) };
    });
  const toggleRow = (key: 'premiumRows' | 'valueRows', row: string) =>
    setDraft((d) => {
      const other = key === 'premiumRows' ? 'valueRows' : 'premiumRows';
      const on = d[key].includes(row);
      return { ...d, [key]: on ? d[key].filter((r) => r !== row) : [...d[key], row].sort(), [other]: d[other].filter((r) => r !== row) };
    });
  const toggleAccessible = (id: string) =>
    setDraft((d) => ({ ...d, accessibleSeats: d.accessibleSeats.includes(id) ? d.accessibleSeats.filter((x) => x !== id) : [...d.accessibleSeats, id] }));

  const save = () => {
    try {
      updateHouse(draft);
      markSetup('seating');
      setSaved(true);
    } catch (e) {
      alert('Can’t save this layout', (e as Error).message);
    }
  };

  return (
    <AdminPage title="Seating chart" subtitle="Match the house to the real seat chart. Changes apply to every performance’s seat map.">
      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <Stat label="Capacity" value={String(layout.length)} />
        {(Object.keys(TIER_LABEL) as PriceTier[]).map((t) => (
          <Stat key={t} label={TIER_LABEL[t]} value={String(counts[t] ?? 0)} />
        ))}
      </Row>

      <Card>
        <Grid min={200}>
          <Stepper label="Rows" value={draft.rows.length} sub={`A – ${draft.rows[draft.rows.length - 1]}`} onChange={setRows} />
          {(['L', 'C', 'R'] as SectionId[]).map((sec) => (
            <Stepper key={sec} label={`${SECTION_LABEL[sec]} seats / row`} value={draft.sectionWidths[sec]} onChange={(n) => setWidth(sec, n)} />
          ))}
        </Grid>
        <Txt v="label">Premium rows (center section)</Txt>
        <Chips multi options={draft.rows} value={draft.premiumRows} onChange={(r) => toggleRow('premiumRows', r)} />
        <Txt v="label">Value rows (all sections)</Txt>
        <Chips multi options={draft.rows} value={draft.valueRows} onChange={(r) => toggleRow('valueRows', r)} colors={Object.fromEntries(draft.rows.map((r) => [r, C.purple]))} />
        <Row style={{ flexWrap: 'wrap' }}>
          <Txt v="label">Accessible spaces</Txt>
          {draft.accessibleSeats.map((id) => (
            <Pill key={id} label={id} icon="accessibility" color={C.green} bg={C.greenSoft} />
          ))}
        </Row>
        <Txt v="small">Tap seats in the preview below to mark or unmark wheelchair spaces.</Txt>
        <SaveBar dirty={dirty} saved={saved} onSave={save} onReset={() => setDraft(house)} />
      </Card>

      <SeatMap claims={{}} holderId="" selected={[]} now={now} house={draft} initialZoom="fit" manage onToggle={(seat) => toggleAccessible(seat.id)} />

      <Button variant="ghost" icon="refresh" title="Start from the default layout" onPress={() => setDraft(DEFAULT_HOUSE)} />
      <Txt v="small">Layouts that would remove a seat that’s already sold or held back are blocked, so no ticket ever points at a seat that doesn’t exist.</Txt>
    </AdminPage>
  );
}

function Stepper({ label, value, onChange, sub }: { label: string; value: number; onChange: (n: number) => void; sub?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="label">{label}</Txt>
      <Row style={{ backgroundColor: C.surface2, borderRadius: R.md, padding: 8, borderWidth: 1, borderColor: C.border }}>
        <Pressable hitSlop={8} onPress={() => onChange(value - 1)}>
          <Ionicons name="remove-circle" size={28} color={C.gold} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt v="h2">{String(value)}</Txt>
          {sub ? <Txt v="small">{sub}</Txt> : null}
        </View>
        <Pressable hitSlop={8} onPress={() => onChange(value + 1)}>
          <Ionicons name="add-circle" size={28} color={C.gold} />
        </Pressable>
      </Row>
    </View>
  );
}
