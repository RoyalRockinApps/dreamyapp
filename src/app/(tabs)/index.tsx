import { router } from 'expo-router';
import { Fragment } from 'react';
import { Linking, Platform, View } from 'react-native';

import { HomeWidget } from '@/components/HomeWidgets';
import { ProductionUpdates } from '@/components/ProductionUpdates';
import { Button, Card, Empty, Screen, Txt } from '@/components/ui';
import { MONTHS, WEEKDAYS } from '@/lib/dates';
import { APK_URL, SITE_NAME, SITE_URL } from '@/lib/links';
import { useCurrentUser, useHomeLayout, useIsAffiliated, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function Home() {
  const user = useCurrentUser();
  const layout = useHomeLayout();
  const affiliated = useIsAffiliated();
  const venue = useStore((s) => s.venue);
  const d = new Date();
  const h = d.getHours();
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = user.role === 'owner' ? '' : user.name.split(' ')[0];

  return (
    <Screen>
      <View style={{ gap: 4, paddingTop: 4 }}>
        <Txt v="label" color={C.accent}>{`${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`}</Txt>
        <Txt v="h1">{first ? `${hello}, ${first}` : hello}</Txt>
        {user.role === 'renter' ? <Txt v="muted" style={{ fontStyle: 'italic' }}>{venue.tagline}</Txt> : null}
      </View>

      {affiliated ? <ProductionUpdates /> : <OutsideTheTheatre />}
      <Button variant="secondary" icon="mic-outline" title="Find auditions" onPress={() => router.push('/auditions')} />
      {!affiliated && <Button variant="secondary" icon="person-outline" title="My performer profile" onPress={() => router.push('/performer-profile')} />}

      {!affiliated ? (
        <HomeWidget id="contact" />
      ) : layout.widgets.length === 0 ? (
        <Empty icon="apps-outline" title="Your home screen is empty" body="Add the sections you want to see first." />
      ) : (
        layout.widgets.map((id) => (
          <Fragment key={id}>
            <HomeWidget id={id} />
          </Fragment>
        ))
      )}

      {affiliated && <Button variant="ghost" small icon="options-outline" title="Customize home" onPress={() => router.push('/customize')} />}
      {affiliated && Platform.OS === 'web' && APK_URL ? <Button variant="ghost" small icon="logo-android" title="Get the Android app" onPress={() => Linking.openURL(APK_URL)} /> : null}
    </Screen>
  );
}

/** For someone outside the theatre: the app is only for auditions; renting and tickets are on the website. */
function OutsideTheTheatre() {
  return (
    <Card accent={C.accent} style={{ gap: 10 }}>
      <Txt v="h3">Renting the theatre or buying tickets?</Txt>
      <Txt v="small">{`Book your event and get show tickets at ${SITE_NAME}. This app is for the theatre’s staff, cast and crew, and for performers applying to audition.`}</Txt>
      <Button icon="globe-outline" title={`Open ${SITE_NAME}`} onPress={() => Linking.openURL(SITE_URL)} />
    </Card>
  );
}
