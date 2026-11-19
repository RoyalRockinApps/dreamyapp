import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';

import { HeaderBackdrop, IconButton, type IconName } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { useCurrentUser, useIsAffiliated, useStore } from '@/store/useStore';
import { C, F } from '@/theme';

function icon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color as string} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const user = useCurrentUser();
  const role = user.role;
  const inCompany = useStore((s) => s.productions.some((p) => p.members.some((m) => m.userId === user.id)));
  // Someone outside the theatre only gets Home (auditions and a link to thedreamtheatre.com).
  const affiliated = useIsAffiliated();
  // Each role sees the parts of the app that matter to them.
  const show = {
    calendar: role !== 'member',
    rentals: role !== 'member',
    shows: role !== 'renter' || inCompany,
  };

  return (
    <Tabs
      screenOptions={{
        headerBackground: () => <HeaderBackdrop />,
        headerTitleStyle: { color: C.text, fontFamily: F.display, letterSpacing: 1 },
        headerShadowVisible: false,
        // an LED strip runs along the top of the tab bar, as along the screening room's ceiling beams
        tabBarStyle: affiliated
          ? { backgroundColor: '#0D0D0F', borderTopWidth: 1, borderTopColor: 'rgba(242,221,184,0.45)', boxShadow: '0 -4px 16px rgba(255,224,170,0.12)' }
          : { display: 'none' },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontFamily: F.semibold, letterSpacing: 0.3 },
        sceneStyle: { backgroundColor: C.bg },
        headerRight: () => <IconButton icon="person-circle-outline" color={C.accent} size={26} onPress={() => router.push('/settings')} />,
        headerRightContainerStyle: { paddingRight: 16 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: () => <Wordmark width={170} />, tabBarIcon: icon('home') }} />
      <Tabs.Protected guard={affiliated}>
        <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar'), href: show.calendar ? undefined : null }} />
        <Tabs.Screen
          name="rentals"
          options={{ title: role === 'owner' ? 'Rentals' : 'Book', headerTitle: role === 'owner' ? 'Rentals' : 'Rent the Theatre', tabBarIcon: icon('key'), href: show.rentals ? undefined : null }}
        />
        <Tabs.Screen name="shows" options={{ title: role === 'owner' ? 'Shows' : 'My Shows', tabBarIcon: icon('people'), href: show.shows ? undefined : null }} />
        <Tabs.Screen name="tickets" options={{ title: 'Tickets', tabBarIcon: icon('ticket') }} />
      </Tabs.Protected>
    </Tabs>
  );
}
