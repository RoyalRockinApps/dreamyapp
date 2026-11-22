import { router } from 'expo-router';
import { Linking } from 'react-native';

import { ProductionUpdates } from '@/components/ProductionUpdates';
import { AtAGlance, ContactRow, NeedsYou, NextCallCard, UpNext } from '@/components/Today';
import { Button, Card, Screen, ScreenWall, Txt } from '@/components/ui';
import { MONTHS, WEEKDAYS } from '@/lib/dates';
import { SITE_NAME, SITE_URL } from '@/lib/links';
import { useCurrentUser, useIsAffiliated, useStore } from '@/store/useStore';
import { C } from '@/theme';

/** Today: your next call, what needs you, and what's coming up. The same layout for everyone in the theatre. */
export default function Home() {
  const user = useCurrentUser();
  const affiliated = useIsAffiliated();
  const venue = useStore((s) => s.venue);
  const d = new Date();
  const h = d.getHours();
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = user.role === 'owner' ? '' : user.name.split(' ')[0];

  return (
    <Screen>
      <ScreenWall>
        <Txt v="label" color={C.accent}>{`${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`}</Txt>
        <Txt v="h1">{first ? `${hello}, ${first}` : hello}</Txt>
        <Txt v="muted" style={{ fontStyle: 'italic' }}>{venue.tagline}</Txt>
      </ScreenWall>

      {affiliated ? (
        <>
          <NextCallCard />
          <NeedsYou />
          {user.role === 'owner' && <AtAGlance />}
          <ProductionUpdates />
          <UpNext />
        </>
      ) : (
        <>
          <OutsideTheTheatre />
          <Button variant="secondary" icon="mic-outline" title="Find auditions" onPress={() => router.push('/auditions')} />
          <Button variant="secondary" icon="person-outline" title="My performer profile" onPress={() => router.push('/performer-profile')} />
          <ContactRow />
        </>
      )}
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
