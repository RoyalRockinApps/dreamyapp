import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname, type Href } from 'expo-router';
import { Children, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { LIVE } from '@/lib/backend';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, F, R, SP } from '@/theme';
import { Button, Card, Field, Row, Txt, type IconName } from './ui';

export const ADMIN_SECTIONS: { href: string; key: string; title: string; icon: IconName; blurb: string }[] = [
  { href: '/admin', key: 'overview', title: 'Overview', icon: 'speedometer', blurb: 'Setup checklist and what needs attention' },
  { href: '/admin/venue', key: 'venue', title: 'Venue profile', icon: 'business', blurb: 'Name, contact details, address and tagline' },
  { href: '/admin/rates', key: 'rates', title: 'Rates & policy', icon: 'cash', blurb: 'Hourly rate, deposits, holds and cancellation policy' },
  { href: '/admin/packages', key: 'packages', title: 'Packages & add-ons', icon: 'pricetags', blurb: 'What renters can book and what it costs' },
  { href: '/admin/seating', key: 'seating', title: 'Seating chart', icon: 'grid', blurb: 'Rows, sections, price tiers and accessible spaces' },
  { href: '/admin/shows', key: 'shows', title: 'Shows & tickets', icon: 'ticket', blurb: 'Performances, ticket prices, on-sale and fees' },
  { href: '/admin/people', key: 'people', title: 'People & access', icon: 'people', blurb: 'Owners, staff, renters and cast accounts' },
  { href: '/admin/data', key: 'data', title: 'Data & security', icon: 'shield-checkmark', blurb: LIVE ? 'Download a backup of everything' : 'Backup, restore, reset and admin PIN' },
];

export function useIsWide() {
  return useWindowDimensions().width >= 900;
}

/** Page shell. On desktop it renders its own title (no native header); on phones the Stack header shows it. */
export function AdminPage({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  const wide = useIsWide();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: wide ? 32 : SP.lg, gap: SP.md, paddingBottom: 64, width: '100%', maxWidth: 980 }} keyboardShouldPersistTaps="handled">
      {(wide || subtitle || actions) && (
        <Row style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
            {wide && <Txt v="h1">{title}</Txt>}
            {subtitle ? <Txt v="muted">{subtitle}</Txt> : null}
          </View>
          {actions}
        </Row>
      )}
      {children}
    </ScrollView>
  );
}

export function Sidebar() {
  const path = usePathname();
  const venue = useStore((s) => s.venue);
  const user = useCurrentUser();
  return (
    <View style={{ width: 260, backgroundColor: C.surface, borderRightWidth: 1, borderRightColor: C.border, padding: 16, gap: 4 }}>
      <View style={{ paddingVertical: 12, gap: 2 }}>
        <Txt v="label" color={C.accent}>Admin portal</Txt>
        <Txt v="h2">{venue.name}</Txt>
        <Txt v="small">{`Signed in as ${user.name}`}</Txt>
      </View>
      {ADMIN_SECTIONS.map((s) => {
        const on = path === s.href || (s.href !== '/admin' && path.startsWith(s.href));
        return (
          <Pressable
            key={s.href}
            onPress={() => router.navigate(s.href as Href)}
            style={(state) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: R.md,
              // `hovered` exists on react-native-web only
              backgroundColor: on ? C.accentSoft : (state as { hovered?: boolean }).hovered ? C.surface2 : 'transparent',
            })}>
            <Ionicons name={s.icon} size={18} color={on ? C.accent : C.muted} />
            <Text style={{ color: on ? C.accent : C.text, fontFamily: on ? F.bold : F.medium, fontSize: 14 }}>{s.title}</Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Button small variant="secondary" icon="phone-portrait-outline" title="Back to the app" onPress={() => router.navigate('/')} />
    </View>
  );
}

/** Live mode: the portal opens for signed-in owners only. Demo mode: the admin PIN switches to the owner persona. */
export function AdminSignIn() {
  if (LIVE) return <OwnersOnly />;
  return <DemoPinSignIn />;
}

function OwnersOnly() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: '100%', maxWidth: 420, gap: 14 }}>
        <Ionicons name="lock-closed" size={32} color={C.accent} />
        <Txt v="h1">Owners only</Txt>
        <Txt v="muted">The admin portal is for the theatre’s owners. If you help run the theatre, ask an owner to change your role in People & access.</Txt>
        <Button variant="ghost" title="Back to the app" onPress={() => router.navigate('/')} />
      </Card>
    </View>
  );
}

function DemoPinSignIn() {
  const pin = useStore((s) => s.adminPin);
  const users = useStore((s) => s.users);
  const switchUser = useStore((s) => s.switchUser);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState('');
  const owner = users.find((u) => u.role === 'owner');
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: '100%', maxWidth: 420, gap: 14 }}>
        <Ionicons name="lock-closed" size={32} color={C.accent} />
        <Txt v="h1">Owner sign-in</Txt>
        <Txt v="muted">The admin portal is for theatre owners and staff. Enter the admin PIN to continue.</Txt>
        <Field label="Admin PIN" value={entry} onChangeText={(t) => { setEntry(t.replace(/\D/g, '')); setError(''); }} keyboardType="number-pad" secureTextEntry maxLength={8} error={error} hint="Demo PIN is 2020 — change it in Data & security." onSubmitEditing={() => submit()} />
        <Button title="Sign in" icon="log-in" onPress={() => submit()} />
        <Button variant="ghost" title="Back to the app" onPress={() => router.navigate('/')} />
      </Card>
    </View>
  );
  function submit() {
    if (entry !== pin || !owner) return setError('Incorrect PIN');
    switchUser(owner.id);
  }
}

export function SaveBar({ dirty, onSave, onReset, saved }: { dirty: boolean; onSave: () => void; onReset?: () => void; saved?: boolean }) {
  return (
    <Row style={{ justifyContent: 'flex-end', marginTop: 8 }}>
      {saved && !dirty ? (
        <Row gap={4}>
          <Ionicons name="checkmark-circle" size={16} color={C.green} />
          <Txt v="small" color={C.green}>Saved</Txt>
        </Row>
      ) : null}
      <View style={{ flex: 1 }} />
      {onReset && dirty && <Button small variant="secondary" title="Discard" onPress={onReset} />}
      <Button small title="Save changes" icon="save" disabled={!dirty} onPress={onSave} />
    </Row>
  );
}

/** Numeric text field that keeps the raw text while typing. */
export function MoneyField({ label, value, onChange, hint, prefix, suffix }: { label: string; value: number; onChange: (n: number) => void; hint?: string; prefix?: string; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // external reset (Discard)
    setLastValue(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <Field
      label={label + (suffix ? ` (${suffix})` : '')}
      value={(prefix ?? '') + text}
      hint={hint}
      keyboardType="decimal-pad"
      onChangeText={(t) => {
        const clean = t.replace(/[^\d.]/g, '');
        setText(clean);
        const n = Number(clean);
        if (clean !== '' && !Number.isNaN(n)) {
          setLastValue(n);
          onChange(n);
        }
      }}
    />
  );
}

export function Grid({ children, min = 220 }: { children: ReactNode; min?: number }) {
  const wide = useIsWide();
  return <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: 12 }}>{wrap(children, wide, min)}</View>;
}

function wrap(children: ReactNode, wide: boolean, min: number) {
  return Children.toArray(children).map((c, i) => (
    <View key={i} style={wide ? { flexGrow: 1, flexBasis: min, minWidth: min } : undefined}>
      {c}
    </View>
  ));
}

export interface ChecklistItem {
  key: string;
  title: string;
  done: boolean;
  href?: string;
  note?: string;
}

/** The owner's go-live checklist (shown in the admin overview and as a home widget). */
export function useSetupChecklist(): ChecklistItem[] {
  const setup = useStore((s) => s.setup);
  const users = useStore((s) => s.users);
  const performances = useStore((s) => s.performances);
  const now = new Date().toISOString();
  return [
    { key: 'venue', title: 'Confirm venue name & contact details', done: !!setup.venue, href: '/admin/venue' },
    { key: 'rates', title: 'Set your real rental rates, deposit & policy', done: !!setup.rates, href: '/admin/rates' },
    { key: 'packages', title: 'Review packages and add-ons', done: !!setup.packages, href: '/admin/packages' },
    { key: 'seating', title: 'Match the seating chart to the house', done: !!setup.seating, href: '/admin/seating' },
    { key: 'shows', title: 'Put a show on sale', done: performances.some((p) => p.onSale && p.start > now), href: '/admin/shows' },
    { key: 'people', title: 'Add your staff & cast', done: users.filter((u) => u.role !== 'renter').length > 1, href: '/admin/people' },
    ...(LIVE ? [] : [{ key: 'pin', title: 'Change the demo admin PIN', done: !!setup.pin, href: '/admin/data' }]),
    { key: 'payments', title: 'Connect card payments (Stripe)', done: false, note: 'Demo payments are active. See docs/BACKEND.md to go live.' },
  ];
}
