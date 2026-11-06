import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';

import { IconButton, type IconName } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { useCurrentUser } from '@/store/useStore';
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
  // Each role sees the parts of the app that matter to them.
  const show = {
    calendar: role !== 'member',
    rentals: role !== 'member',
    shows: role !== 'renter',
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTitleStyle: { color: C.text, fontFamily: F.display },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontFamily: F.semibold, letterSpacing: 0.3 },
        sceneStyle: { backgroundColor: C.bg },
        headerRight: () => <IconButton icon="person-circle-outline" color={C.accent} size={26} onPress={() => router.push('/settings')} />,
        headerRightContainerStyle: { paddingRight: 16 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerTitle: () => <Wordmark width={170} />, tabBarIcon: icon('home') }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar', tabBarIcon: icon('calendar'), href: show.calendar ? undefined : null }} />
      <Tabs.Screen
        name="rentals"
        options={{ title: role === 'owner' ? 'Rentals' : 'Book', headerTitle: role === 'owner' ? 'Rentals' : 'Rent the Theatre', tabBarIcon: icon('key'), href: show.rentals ? undefined : null }}
      />
      <Tabs.Screen name="shows" options={{ title: role === 'owner' ? 'Shows' : 'My Shows', tabBarIcon: icon('people'), href: show.shows ? undefined : null }} />
      <Tabs.Screen name="tickets" options={{ title: 'Tickets', tabBarIcon: icon('ticket') }} />
    </Tabs>
  );
}
