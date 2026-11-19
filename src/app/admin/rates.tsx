import { useState } from 'react';
import { Switch, View } from 'react-native';

import { AdminPage, Grid, MoneyField, SaveBar } from '@/components/admin';
import { Card, Divider, Field, KeyValue, Row, Txt } from '@/components/ui';
import { addDays, localIso, money } from '@/lib/dates';
import { quoteRental } from '@/lib/pricing';
import type { RentalSettings } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function AdminRates() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const markSetup = useStore((s) => s.markSetup);
  const [draft, setDraft] = useState<RentalSettings>(settings);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof RentalSettings>(k: K) => (v: RentalSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Live example so the owner sees what a renter would be quoted.
  const d = addDays(new Date(), 60);
  const example = quoteRental(draft, { start: localIso(d.getFullYear(), d.getMonth() + 1, d.getDate(), 17), end: localIso(d.getFullYear(), d.getMonth() + 1, d.getDate(), 22), addOnIds: [] });

  return (
    <AdminPage title="Rates & policy" subtitle="New quotes use these right away. Existing bookings keep the price they were quoted.">
      <Card>
        <Txt v="label">Pricing</Txt>
        <Grid>
          <MoneyField label="Hourly rate" prefix="$" value={draft.hourlyRate} onChange={set('hourlyRate')} />
          <MoneyField label="Minimum hours" value={draft.minHours} onChange={set('minHours')} />
        </Grid>
        <Txt v="label">Deposits</Txt>
        <Grid>
          <MoneyField label="Reservation deposit" suffix="% of rental" value={Math.round(draft.depositPercent * 100)} onChange={(n) => set('depositPercent')(Math.min(100, n) / 100)} hint="Due to lock in the date" />
          <MoneyField label="Security deposit" prefix="$" value={draft.securityDeposit} onChange={set('securityDeposit')} hint="Refundable after the event" />
          <MoneyField label="Balance due" suffix="days before event" value={draft.balanceDueDays} onChange={set('balanceDueDays')} />
        </Grid>
        <Txt v="label">Calendar</Txt>
        <Grid>
          <MoneyField label="Turnover buffer" suffix="minutes" value={draft.bufferMins} onChange={set('bufferMins')} hint="Kept free between events for cleanup & load-in" />
          <MoneyField label="Date hold while awaiting deposit" suffix="hours" value={draft.holdHours} onChange={set('holdHours')} />
        </Grid>
        <Row>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Auto-approve requests</Txt>
            <Txt v="small">On: renters can pay the deposit and confirm instantly if the date is open. Off: you approve every request first.</Txt>
          </View>
          <Switch value={draft.autoApprove} onValueChange={set('autoApprove')} trackColor={{ true: C.accent, false: C.surface2 }} />
        </Row>
        <Field label="Cancellation policy" value={draft.cancellationPolicy} onChangeText={set('cancellationPolicy')} multiline hint="Renters must accept this before booking." />
        <SaveBar
          dirty={dirty}
          saved={saved}
          onSave={() => {
            updateSettings(draft);
            markSetup('rates');
            setSaved(true);
          }}
          onReset={() => setDraft(settings)}
        />
      </Card>

      <Card>
        <Txt v="label">Example quote · 5-hour evening rental, hourly</Txt>
        {example.lines.map((l) => (
          <KeyValue key={l.label} k={l.label} v={money(l.amount, true)} />
        ))}
        <Divider />
        <KeyValue k="Due to reserve (deposit + security)" v={money(example.depositDue, true)} strong color={C.accent} />
        <KeyValue k="Balance later" v={money(example.balanceDue, true)} />
      </Card>
    </AdminPage>
  );
}
