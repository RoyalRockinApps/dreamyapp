import { router } from 'expo-router';
import { Linking, View } from 'react-native';

import { alert } from '@/components/alert';
import { Avatar, Button, Card, ListItem, Pill, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { APK_URL, WEB_URL } from '@/lib/links';
import { MEMBER_ID, OWNER_ID, RENTER_ID } from '@/lib/seed';
import { LIVE } from '@/lib/backend';
import { signOut } from '@/store/sync';
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
          <Pill label={user.role} color={C.accent} bg={C.accentSoft} />
        </Row>
      </Card>

      {LIVE && (
        <Button
          variant="secondary"
          icon="log-out-outline"
          title="Sign out"
          onPress={() =>
            alert('Sign out?', 'You’ll need a new email code to sign back in.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          }
        />
      )}

      {!LIVE && <SectionHeader title="Preview the app as…" />}
      {!LIVE && PERSONAS.map((p) => {
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
            style={on ? { borderColor: C.accent } : undefined}>
            <Row>
              <Txt v="h3" style={{ flex: 1 }}>{`${p.label}${u ? ` · ${u.name}` : ''}`}</Txt>
              {on && <Pill label="Current" color={C.accent} bg={C.accentSoft} />}
            </Row>
            <Txt v="small">{p.desc}</Txt>
          </Card>
        );
      })}

      <SectionHeader title="Admin portal" />
      <Card accent={C.accent}>
        <Txt v="h3">Set everything up</Txt>
        <Txt v="small">Venue profile, rental rates & deposits, packages, seating chart, ticket prices, people and backups — on your phone or at the website.</Txt>
        <Button icon="settings" title={isOwner ? 'Open admin portal' : 'Owner sign-in'} onPress={() => router.push('/admin')} />
      </Card>
      {(APK_URL || WEB_URL) && (
        <>
          <SectionHeader title="Get the app" />
          <Card>
            {APK_URL ? <ListItem icon="logo-android" iconColor={C.green} title="Download the Android app (APK)" subtitle="Latest build from the pipeline" onPress={() => Linking.openURL(APK_URL)} /> : null}
            {WEB_URL ? <ListItem icon="globe-outline" iconColor={C.blue} title="Open the website" subtitle={WEB_URL} onPress={() => Linking.openURL(WEB_URL)} /> : null}
          </Card>
        </>
      )}

      {!LIVE && <SectionHeader title="Demo data" />}
      {!LIVE && <Card>
        <Txt v="small">Everything is stored on this device. Reset to restore the sample bookings, Elf: The Musical company and ticket sales.</Txt>
        <Button
          variant="danger"
          title="Reset demo data"
          onPress={() =>
            alert('Reset all data?', 'This erases changes made on this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => { resetDemo(); router.dismissAll(); router.replace('/'); } },
            ])
          }
        />
      </Card>}
      <Txt v="small" style={{ textAlign: 'center', marginTop: 12 }}>{`${venue.name} · ${venue.address}`}</Txt>
    </Screen>
  );
}
