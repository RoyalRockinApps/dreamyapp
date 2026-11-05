import { Slot, Stack } from 'expo-router';
import { View } from 'react-native';

import { AdminSignIn, Sidebar, useIsWide } from '@/components/admin';
import { useCurrentUser } from '@/store/useStore';
import { C } from '@/theme';

export default function AdminLayout() {
  const user = useCurrentUser();
  const wide = useIsWide();

  if (user.role !== 'owner') return <AdminSignIn />;

  if (wide) {
    // Desktop/tablet: classic portal with a sidebar.
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
        <Sidebar />
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.gold,
        headerTitleStyle: { color: C.text, fontWeight: '700' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: C.bg },
      }}>
      <Stack.Screen name="index" options={{ title: 'Admin Portal' }} />
      <Stack.Screen name="venue" options={{ title: 'Venue profile' }} />
      <Stack.Screen name="rates" options={{ title: 'Rates & policy' }} />
      <Stack.Screen name="packages" options={{ title: 'Packages & add-ons' }} />
      <Stack.Screen name="seating" options={{ title: 'Seating chart' }} />
      <Stack.Screen name="shows" options={{ title: 'Shows & tickets' }} />
      <Stack.Screen name="people" options={{ title: 'People & access' }} />
      <Stack.Screen name="data" options={{ title: 'Data & security' }} />
    </Stack>
  );
}
