import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { Avatar, Button, Card, Field, Pill, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { MEMBER_ID, OWNER_ID, RENTER_ID } from '@/lib/seed';
import type { RentalSettings } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

const PERSONAS = [
  { id: OWNER_ID, label: 'Theatre owner', desc: 'Everything: rentals, deposits, productions, box office, check-in.' },
  { id: RENTER_ID, label: 'Renter', desc: 'Checks dates, requests bookings, pays deposits, buys tickets.' },
  { id: MEMBER_ID, label: 'Cast member', desc: 'Sees their calls, RSVPs, submits conflicts and chats with the company.' },
];

export default function Settings() {
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const switchUser = useStore((s) => s.switchUser);
  const resetDemo = useStore((s) => s.resetDemo);
  const venue = useStore((s) => s.venue);
  const updateVenue = useStore((s) => s.updateVenue);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const isOwner = user.role === 'owner';

  return (
    <Screen>
      <SectionHeader title="Signed in as" />
      <Card>
        <Row gap={12}>
          <Avatar name={user.name} color={user.color} size={44} />
          <View style={{ flex: 1 }}>
            <Txt v="h3">{user.name}</Txt>
            <Txt v="small">{user.email}</Txt>
          </View>
          <Pill label={user.role} color={C.gold} bg={C.goldSoft} />
        </Row>
      </Card>

      <SectionHeader title="Preview the app as…" />
      {PERSONAS.map((p) => {
        const u = users.find((x) => x.id === p.id);
        const on = user.id === p.id;
        return (
          <Card
            key={p.id}
            onPress={() => {
              switchUser(p.id);
              router.dismissAll();
              router.replace('/');
            }}
            style={on ? { borderColor: C.gold } : undefined}>
            <Row>
              <Txt v="h3" style={{ flex: 1 }}>{`${p.label}${u ? ` · ${u.name}` : ''}`}</Txt>
              {on && <Pill label="Current" color={C.gold} bg={C.goldSoft} />}
            </Row>
            <Txt v="small">{p.desc}</Txt>
          </Card>
        );
      })}

      {isOwner && (
        <>
          <SectionHeader title="Venue" />
          <Card>
            <Field label="Your name" value={venue.ownerName} onChangeText={(v) => updateVenue({ ownerName: v })} />
            <Field label="Phone" value={venue.phone} onChangeText={(v) => updateVenue({ phone: v })} keyboardType="phone-pad" />
            <Field label="Email" value={venue.email} onChangeText={(v) => updateVenue({ email: v })} autoCapitalize="none" />
            <Field label="Address" value={venue.address} onChangeText={(v) => updateVenue({ address: v })} />
            <Field label="Tagline" value={venue.tagline} onChangeText={(v) => updateVenue({ tagline: v })} />
          </Card>
          <RatesEditor settings={settings} update={updateSettings} />
        </>
      )}

      <SectionHeader title="Demo data" />
      <Card>
        <Txt v="small">Everything is stored on this device. Reset to restore the sample bookings, Elf: The Musical company and ticket sales.</Txt>
        <Button
          variant="danger"
          title="Reset demo data"
          onPress={() =>
            Alert.alert('Reset all data?', 'This erases changes made on this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => { resetDemo(); router.dismissAll(); router.replace('/'); } },
            ])
          }
        />
      </Card>
      <Txt v="small" style={{ textAlign: 'center', marginTop: 12 }}>{`${venue.name} · ${venue.address}`}</Txt>
    </Screen>
  );
}

function NumField({ label, value, onChange, hint, prefix = '' }: { label: string; value: number; onChange: (n: number) => void; hint?: string; prefix?: string }) {
  const [text, setText] = useState(String(value));
  return (
    <Field
      label={label}
      value={prefix + text}
      hint={hint}
      keyboardType="decimal-pad"
      onChangeText={(t) => {
        const clean = t.replace(/[^\d.]/g, '');
        setText(clean);
        const n = Number(clean);
        if (clean !== '' && !Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

function RatesEditor({ settings, update }: { settings: RentalSettings; update: (s: Partial<RentalSettings>) => void }) {
  return (
    <>
      <SectionHeader title="Rental rates & policy" />
      <Card>
        <Txt v="small" color={C.warn}>Sample prices — set these to your real rates. New quotes use them immediately; existing bookings keep their quoted price.</Txt>
        <NumField label="Hourly rate" prefix="$" value={settings.hourlyRate} onChange={(n) => update({ hourlyRate: n })} />
        <NumField label="Minimum hours" value={settings.minHours} onChange={(n) => update({ minHours: n })} />
        <NumField label="Reservation deposit %" value={Math.round(settings.depositPercent * 100)} onChange={(n) => update({ depositPercent: Math.min(100, n) / 100 })} hint="Share of the rental total due to lock in the date" />
        <NumField label="Security deposit" prefix="$" value={settings.securityDeposit} onChange={(n) => update({ securityDeposit: n })} hint="Refundable after the event" />
        <NumField label="Turnover buffer (minutes)" value={settings.bufferMins} onChange={(n) => update({ bufferMins: n })} hint="Kept free between events for cleanup & load-in" />
        <NumField label="Balance due (days before event)" value={settings.balanceDueDays} onChange={(n) => update({ balanceDueDays: n })} />
        <NumField label="Hold length while awaiting deposit (hours)" value={settings.holdHours} onChange={(n) => update({ holdHours: n })} />
        <Row>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Auto-approve requests</Txt>
            <Txt v="small">Renters can pay the deposit and confirm instantly if the date is open.</Txt>
          </View>
          <Switch value={settings.autoApprove} onValueChange={(v) => update({ autoApprove: v })} trackColor={{ true: C.gold, false: C.surface2 }} />
        </Row>
        <Field label="Cancellation policy" value={settings.cancellationPolicy} onChangeText={(v) => update({ cancellationPolicy: v })} multiline />
      </Card>
      <SectionHeader title="Packages" />
      <Card>
        {settings.packages.map((p) => (
          <NumField key={p.id} label={`${p.name} (${p.hours} hrs)`} prefix="$" value={p.price} onChange={(n) => update({ packages: settings.packages.map((x) => (x.id === p.id ? { ...x, price: n } : x)) })} />
        ))}
      </Card>
      <SectionHeader title="Add-ons" />
      <Card>
        {settings.addOns.map((a) => (
          <NumField key={a.id} label={`${a.name}${a.per === 'hour' ? ' (per hour)' : ''}`} prefix="$" value={a.price} onChange={(n) => update({ addOns: settings.addOns.map((x) => (x.id === a.id ? { ...x, price: n } : x)) })} />
        ))}
      </Card>
    </>
  );
}
