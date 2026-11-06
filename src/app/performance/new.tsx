import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { TIER_COLOR } from '@/components/SeatMap';
import { Button, Chips, Field, Row, Screen, Txt, tap } from '@/components/ui';
import { atMinutes, dayKey, fmtMinutes } from '@/lib/dates';
import { TIER_LABEL } from '@/lib/seating';
import type { PriceTier } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C, F, R } from '@/theme';
import { alert } from '@/components/alert';

const TIMES = Array.from({ length: 25 }, (_, i) => 10 * 60 + i * 30);

export default function NewPerformance() {
  const params = useLocalSearchParams<{ productionId?: string; bookingId?: string }>();
  const productions = useStore((s) => s.productions);
  const bookings = useStore((s) => s.bookings);
  const createPerformance = useStore((s) => s.createPerformance);

  const booking = bookings.find((b) => b.id === params.bookingId);
  const [source, setSource] = useState<string>(params.bookingId ? `b:${params.bookingId}` : `p:${params.productionId ?? productions[0]?.id ?? ''}`);
  const prod = productions.find((p) => `p:${p.id}` === source);
  const book = bookings.find((b) => `b:${b.id}` === source) ?? booking;
  const initialDay = book ? dayKey(book.start) : prod ? dayKey(prod.openingDate) : dayKey(new Date());

  const [title, setTitle] = useState(book?.title ?? prod?.title ?? '');
  const [subtitle, setSubtitle] = useState('');
  const [day, setDay] = useState(initialDay);
  const [ym, setYm] = useState(() => {
    const d = atMinutes(initialDay, 0);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [startMin, setStartMin] = useState(19 * 60);
  const [doors, setDoors] = useState('30');
  const [prices, setPrices] = useState<Record<PriceTier, string>>({ premium: '25', standard: '20', value: '12', accessible: '12' });

  const sources = [
    ...productions.map((p) => [`p:${p.id}`, `🎭 ${p.title}`] as const),
    ...bookings.filter((b) => b.ticketed && (b.status === 'confirmed' || b.status === 'awaiting_deposit')).map((b) => [`b:${b.id}`, `🔑 ${b.title}`] as const),
  ];

  const save = () => {
    if (!title.trim()) return alert('Add a title');
    const parsed = Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, Number(v)])) as Record<PriceTier, number>;
    if (Object.values(parsed).some((n) => !(n >= 0))) return alert('Prices must be numbers');
    const perf = createPerformance({
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      productionId: source.startsWith('p:') ? source.slice(2) : undefined,
      bookingId: source.startsWith('b:') ? source.slice(2) : undefined,
      start: atMinutes(day, startMin).toISOString(),
      doorsMins: Number(doors),
      prices: parsed,
      onSale: true,
    });
    router.replace(`/performance/${perf.id}`);
  };

  return (
    <Screen>
      <Txt v="label">For</Txt>
      <Chips
        options={sources.map((s) => s[0])}
        value={source}
        onChange={(v) => {
          setSource(v);
          const p = productions.find((x) => `p:${x.id}` === v);
          const b = bookings.find((x) => `b:${x.id}` === v);
          setTitle(p?.title ?? b?.title ?? '');
          const k = b ? dayKey(b.start) : p ? dayKey(p.openingDate) : day;
          setDay(k);
          const d = atMinutes(k, 0);
          setYm({ y: d.getFullYear(), m: d.getMonth() });
        }}
        labels={Object.fromEntries(sources)}
      />
      <Field label="Title" value={title} onChangeText={setTitle} />
      <Field label="Subtitle (optional)" value={subtitle} onChangeText={setSubtitle} placeholder="Opening Night, Matinee, Sensory-friendly…" />
      <MonthCalendar year={ym.y} month={ym.m} onChangeMonth={(y, m) => setYm({ y, m })} selected={day} onSelect={setDay} minDate={dayKey(new Date())} />
      <Txt v="label">Curtain</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {TIMES.map((m) => (
          <Pressable key={m} onPress={() => { tap(); setStartMin(m); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.md, borderWidth: 1, borderColor: m === startMin ? C.accent : C.border, backgroundColor: m === startMin ? C.accentSoft : C.surface }}>
            <Text style={{ color: m === startMin ? C.accent : C.text, fontFamily: F.bold }}>{fmtMinutes(m)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Txt v="label">Doors open</Txt>
      <Chips options={['30', '45', '60']} value={doors} onChange={setDoors} labels={{ '30': '30 min before', '45': '45 min before', '60': '1 hr before' }} />
      <Txt v="label">Ticket prices</Txt>
      <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }} gap={10}>
        {(Object.keys(prices) as PriceTier[]).map((t) => (
          <Field
            key={t}
            label={TIER_LABEL[t]}
            value={prices[t]}
            onChangeText={(v) => setPrices((p) => ({ ...p, [t]: v.replace(/[^\d.]/g, '') }))}
            keyboardType="decimal-pad"
            style={{ minWidth: 140, borderColor: TIER_COLOR[t] }}
          />
        ))}
      </Row>
      <Txt v="small">Premium = center orchestra rows C–H · Value = rows N–P · Accessible = wheelchair spaces. Edit the house layout in src/lib/seating.ts.</Txt>
      <Button title="Create & put on sale" icon="ticket" onPress={save} />
    </Screen>
  );
}
