import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Linking, Platform, View } from 'react-native';

import { ADMIN_SECTIONS, AdminPage, Grid, useIsWide, useSetupChecklist } from '@/components/admin';
import { Card, ListItem, Pill, ProgressBar, Row, Stat, Txt } from '@/components/ui';
import { money } from '@/lib/dates';
import { outstanding } from '@/lib/pricing';
import { APK_URL, WEB_URL } from '@/lib/links';
import { useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function AdminOverview() {
  const wide = useIsWide();
  const venue = useStore((s) => s.venue);
  const bookings = useStore((s) => s.bookings);
  const performances = useStore((s) => s.performances);
  const tickets = useStore((s) => s.tickets);
  const now = new Date().toISOString();

  const checklist = useSetupChecklist();
  const done = checklist.filter((c) => c.done).length;

  const requests = bookings.filter((b) => b.status === 'inquiry').length;
  const owed = bookings.filter((b) => b.status === 'confirmed').reduce((s, b) => s + outstanding(b), 0);
  const upcomingShows = performances.filter((p) => p.start > now).length;
  const sold = tickets.filter((t) => !t.void && performances.find((p) => p.id === t.performanceId && p.start > now)).length;

  return (
    <AdminPage title="Overview" subtitle={`Everything you need to set up and run ${venue.name}.`}>
      <Row style={{ flexWrap: 'wrap' }} gap={12}>
        <Stat icon="mail-unread-outline" label="New requests" value={String(requests)} color={requests ? C.blue : C.text} />
        <Stat icon="receipt-outline" label="Balances owed" value={money(owed)} color={owed ? C.warn : C.text} />
        <Stat icon="ticket-outline" label="Tickets sold (upcoming)" value={String(sold)} sub={`${upcomingShows} upcoming performances`} />
      </Row>

      <Card>
        <Row>
          <Txt v="h2" style={{ flex: 1 }}>Setup checklist</Txt>
          <Pill label={`${done} of ${checklist.length}`} color={C.gold} bg={C.goldSoft} />
        </Row>
        <ProgressBar value={done / checklist.length} />
        {checklist.map((c) => (
          <ListItem
            key={c.key}
            icon={c.done ? 'checkmark-circle' : 'ellipse-outline'}
            iconColor={c.done ? C.green : C.faint}
            title={c.title}
            subtitle={c.note}
            onPress={c.href ? () => router.navigate(c.href as Href) : undefined}
          />
        ))}
      </Card>

      {!wide && (
        <Card>
          {ADMIN_SECTIONS.filter((s) => s.key !== 'overview').map((s) => (
            <ListItem key={s.href} icon={s.icon} title={s.title} subtitle={s.blurb} onPress={() => router.push(s.href as Href)} />
          ))}
        </Card>
      )}

      <Grid>
        <Card>
          <Row>
            <Ionicons name="logo-android" size={22} color={C.green} />
            <Txt v="h3">Android app</Txt>
          </Row>
          <Txt v="small">Every push builds a fresh installable APK. Share this link with staff to sideload it.</Txt>
          {APK_URL ? <ListItem icon="download" iconColor={C.green} title="Download APK" subtitle={APK_URL} onPress={() => Linking.openURL(APK_URL)} /> : <Txt v="small" color={C.warn}>Link appears once the build pipeline has run.</Txt>}
        </Card>
        <Card>
          <Row>
            <Ionicons name="globe-outline" size={22} color={C.blue} />
            <Txt v="h3">Website</Txt>
          </Row>
          <Txt v="small">The same app, in any browser — including this admin portal.</Txt>
          {WEB_URL && Platform.OS !== 'web' ? <ListItem icon="open-outline" iconColor={C.blue} title="Open website" subtitle={WEB_URL} onPress={() => Linking.openURL(WEB_URL)} /> : <Txt v="small">{WEB_URL || 'Published by the pipeline to GitHub Pages.'}</Txt>}
        </Card>
      </Grid>
      <View />
    </AdminPage>
  );
}
