import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';

import { IconButton, type IconName } from '@/components/ui';
import { useCurrentUser, useIsAffiliated, useStore } from '@/store/useStore';
import { C } from '@/theme';

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
        headerStyle: { backgroundColor: C.bg },
        headerTitleStyle: { color: C.text, fontWeight: '700' },
        headerShadowVisible: false,
        tabBarStyle: affiliated ? { backgroundColor: C.surface, borderTopColor: C.border } : { display: 'none' },
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.faint,
        sceneStyle: { backgroundColor: C.bg },
        headerRight: () => <IconButton icon="person-circle-outline" color={C.gold} size={26} onPress={() => router.push('/settings')} />,
        headerRightContainerStyle: { paddingRight: 16 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: 'The Dream Theatre', tabBarIcon: icon('home') }} />
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
