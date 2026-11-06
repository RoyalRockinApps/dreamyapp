import { router } from 'expo-router';
import { Fragment } from 'react';
import { Linking, Platform, View } from 'react-native';

import { HomeWidget } from '@/components/HomeWidgets';
import { Button, Empty, Screen, Txt } from '@/components/ui';
import { MONTHS, WEEKDAYS } from '@/lib/dates';
import { APK_URL } from '@/lib/links';
import { useCurrentUser, useHomeLayout, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function Home() {
  const user = useCurrentUser();
  const layout = useHomeLayout();
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

      {layout.widgets.length === 0 ? (
        <Empty icon="apps-outline" title="Your home screen is empty" body="Add the sections you want to see first." />
      ) : (
        layout.widgets.map((id) => (
          <Fragment key={id}>
            <HomeWidget id={id} />
          </Fragment>
        ))
      )}

      <Button variant="ghost" small icon="options-outline" title="Customize home" onPress={() => router.push('/customize')} />
      {Platform.OS === 'web' && APK_URL ? <Button variant="ghost" small icon="logo-android" title="Get the Android app" onPress={() => Linking.openURL(APK_URL)} /> : null}
    </Screen>
  );
}
