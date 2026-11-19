import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { AdminPage, Grid, MoneyField, SaveBar } from '@/components/admin';
import { alert } from '@/components/alert';
import { Button, Card, Empty, Pill, ProgressBar, Row, SectionHeader, Segmented, Txt } from '@/components/ui';
import { fmtDate, fmtTime, money } from '@/lib/dates';
import { salesSummary, TIER_LABEL } from '@/lib/seating';
import type { Performance, PriceTier } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function AdminShows() {
  const performances = useStore((s) => s.performances);
  const ticketFee = useStore((s) => s.settings.ticketFee);
  const updateSettings = useStore((s) => s.updateSettings);
  const [fee, setFee] = useState(ticketFee);
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const now = new Date().toISOString();
  const list = performances.filter((p) => (when === 'upcoming' ? p.start >= now : p.start < now)).sort((a, b) => a.start.localeCompare(b.start));

  return (
    <AdminPage title="Shows & tickets" subtitle="Ticket prices, on-sale status and fees for every performance." actions={<Button small icon="add" title="New performance" onPress={() => router.push('/performance/new')} />}>
      <Card>
        <Txt v="label">Checkout fee</Txt>
        <MoneyField label="Service fee per ticket" prefix="$" value={fee} onChange={setFee} hint="Added to each ticket at checkout. Set to 0 to absorb card fees yourself." />
        <SaveBar dirty={fee !== ticketFee} onSave={() => updateSettings({ ticketFee: fee })} onReset={() => setFee(ticketFee)} />
      </Card>
      <Segmented options={['upcoming', 'past'] as const} value={when} onChange={setWhen} labels={{ upcoming: 'Upcoming', past: 'Past' }} />
      {list.length === 0 && <Empty icon="ticket-outline" title="No performances" />}
      {list.map((p) => (
        <PerformanceEditor key={p.id} p={p} />
      ))}
      <SectionHeader title="Productions" />
      <Txt v="small">Cast, crew, rehearsals and group chats are managed in the app’s Shows tab — it works the same here on the website.</Txt>
      <Button variant="secondary" icon="people" title="Open Shows" onPress={() => router.navigate('/shows')} />
    </AdminPage>
  );
}

function PerformanceEditor({ p }: { p: Performance }) {
  const updatePerformance = useStore((s) => s.updatePerformance);
  const deletePerformance = useStore((s) => s.deletePerformance);
  const tickets = useStore((s) => s.tickets);
  const [prices, setPrices] = useState(p.prices);
  const [title, setTitle] = useState(p.title);
  const s = salesSummary(p.seats);
  const gross = tickets.filter((t) => t.performanceId === p.id && !t.void).reduce((x, t) => x + t.price, 0);
  const dirty = JSON.stringify(prices) !== JSON.stringify(p.prices) || title !== p.title;

  return (
    <Card accent={C.curtain}>
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Txt v="h3">{`${p.title}${p.subtitle ? ' · ' + p.subtitle : ''}`}</Txt>
          <Txt v="small">{`${fmtDate(p.start, { weekday: true, year: true })} · ${fmtTime(p.start)}`}</Txt>
        </View>
        <Pill label={p.onSale ? 'On sale' : 'Off sale'} color={p.onSale ? C.green : C.warn} bg={p.onSale ? C.greenSoft : C.warnSoft} />
        <Switch value={p.onSale} onValueChange={(v) => updatePerformance(p.id, { onSale: v })} trackColor={{ true: C.accent, false: C.surface2 }} />
      </Row>
      <ProgressBar value={(s.sold + s.comp) / s.sellable} color={C.curtain} />
      <Txt v="small">{`${s.sold} sold · ${s.comp} comp · ${s.blocked} held back · ${s.available} available · ${money(gross)} gross`}</Txt>
      <Grid min={130}>
        {(Object.keys(prices) as PriceTier[]).map((t) => (
          <MoneyField key={t} label={TIER_LABEL[t]} prefix="$" value={prices[t]} onChange={(n) => setPrices((x) => ({ ...x, [t]: n }))} />
        ))}
      </Grid>
      <Txt v="small">Price changes apply to new sales only; tickets already sold keep their price.</Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small variant="secondary" icon="grid" title="Seat map / box office" onPress={() => router.push(`/performance/${p.id}`)} />
        <Button small variant="secondary" icon="qr-code" title="Door check-in" onPress={() => router.push(`/checkin/${p.id}`)} />
        <Button
          small
          variant="danger"
          icon="trash"
          title="Delete"
          onPress={() =>
            alert('Delete this performance?', 'This cannot be undone.', [
              { text: 'Keep', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  try {
                    deletePerformance(p.id);
                  } catch (e) {
                    alert('Can’t delete', (e as Error).message);
                  }
                },
              },
            ])
          }
        />
      </Row>
      {dirty && <SaveBar dirty onSave={() => updatePerformance(p.id, { prices, title })} onReset={() => { setPrices(p.prices); setTitle(p.title); }} />}
    </Card>
  );
}
