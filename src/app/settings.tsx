import { router } from 'expo-router';
import { Linking, View } from 'react-native';

import { alert } from '@/components/alert';
import { NotificationsRow } from '@/components/PushSettings';
import { Avatar, Button, Card, ListItem, Pill, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { APK_URL, WEB_URL } from '@/lib/links';
import { MEMBER_ID, OWNER_ID, RENTER_ID } from '@/lib/seed';
import { LIVE } from '@/lib/backend';
import { signOut } from '@/store/sync';
import { errorMessage, useCurrentUser, useIsAffiliated, useStore } from '@/store/useStore';
import { C } from '@/theme';

const PERSONAS = [
  { id: OWNER_ID, label: 'Theatre owner', desc: 'Everything: rentals, deposits, productions, box office, check-in.' },
  { id: RENTER_ID, label: 'Visitor', desc: 'Not in a company: applies for auditions here, and rents or buys tickets at thedreamtheatre.com.' },
  { id: MEMBER_ID, label: 'Cast member', desc: 'Their calls and RSVPs, roll for the Leads (she’s their Team Lead), her cards, conflicts and company chat.' },
];

export default function Me() {
  const user = useCurrentUser();
  const deleteMyAccount = useStore((st) => st.deleteMyAccount);
  const users = useStore((s) => s.users);
  const switchUser = useStore((s) => s.switchUser);
  const resetDemo = useStore((s) => s.resetDemo);
  const venue = useStore((s) => s.venue);
  const isOwner = user.role === 'owner';
  const affiliated = useIsAffiliated();
  const myCards = useStore((s) => s.tasks.filter((t) => t.assigneeId === user.id && t.status !== 'completed').length);
  const myBookings = useStore((s) => s.bookings.filter((b) => b.renterId === user.id).length);

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
          <Pill label={affiliated ? user.role : 'visitor'} color={C.accent} bg={C.accentSoft} />
        </Row>
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <ListItem icon="person-outline" title="My performer profile" subtitle="Your photo, résumé and skills for auditions" onPress={() => router.push('/performer-profile')} />
        <ListItem icon="mic-outline" title="Auditions" subtitle="Open auditions and your applications" onPress={() => router.push('/auditions')} />
        {affiliated && <ListItem icon="albums-outline" title="Assigned to me" subtitle={myCards ? `${myCards} open card${myCards === 1 ? '' : 's'}` : 'Cards assigned to you'} onPress={() => router.push('/my-cards')} />}
        {affiliated && !isOwner && <ListItem icon="ticket-outline" title="My tickets" subtitle="Shows on sale and seats you’ve bought" onPress={() => router.navigate('/tickets')} />}
        {affiliated && !isOwner && (user.role === 'renter' || myBookings > 0) && <ListItem icon="key-outline" title="My bookings" subtitle="Rent the theatre and see your reservations" onPress={() => router.push('/bookings')} />}
        {affiliated && <NotificationsRow />}
        {isOwner && <ListItem icon="settings-outline" title="Admin portal" subtitle="Venue, rates, seating, people and backups" onPress={() => router.push('/admin')} />}
      </Card>

      {LIVE && (
        <Button
          variant="secondary"
          icon="log-out-outline"
          title="Sign out"
          onPress={() =>
            alert('Sign out?', 'Sign back in with your email and password.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ])
          }
        />
      )}
      {LIVE && (
        <Button
          variant="danger"
          icon="trash-outline"
          title="Delete my account"
          onPress={() =>
            alert(
              'Delete your account?',
              'This permanently deletes your sign-in, performer profile, auditions and company memberships, and removes your name and contact details. Bookings and ticket records stay with the theatre without your details. This can’t be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: () => {
                    deleteMyAccount()
                      .then(() => signOut())
                      .catch((e) => alert('Couldn’t delete your account', errorMessage(e)));
                  },
                },
              ],
            )
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

      {affiliated && !!(APK_URL || WEB_URL) && (
        <Card style={{ paddingVertical: 4 }}>
          {APK_URL ? <ListItem icon="logo-android" iconColor={C.green} title="Get the Android app" subtitle="Latest build from the pipeline" onPress={() => Linking.openURL(APK_URL)} /> : null}
          {WEB_URL ? <ListItem icon="globe-outline" iconColor={C.blue} title="Open the website" subtitle={WEB_URL} onPress={() => Linking.openURL(WEB_URL)} /> : null}
        </Card>
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
