import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useStore } from '@/store/useStore';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.gold },
};

export default function RootLayout() {
  useEffect(() => {
    const hide = () => SplashScreen.hideAsync().catch(() => {});
    if (useStore.persist.hasHydrated()) hide();
    return useStore.persist.onFinishHydration(hide);
  }, []);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.bg },
          headerTintColor: C.gold,
          headerTitleStyle: { color: C.text, fontWeight: '700' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="booking/new" options={{ title: 'Book the Theatre', presentation: 'modal' }} />
        <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="pay" options={{ title: 'Secure Payment', presentation: 'modal' }} />
        <Stack.Screen name="production/[id]" options={{ title: 'Production' }} />
        <Stack.Screen name="production/new" options={{ title: 'New Production', presentation: 'modal' }} />
        <Stack.Screen name="rehearsal/edit" options={{ title: 'Schedule a Call', presentation: 'modal' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="performance/[id]" options={{ title: 'Choose Seats' }} />
        <Stack.Screen name="performance/new" options={{ title: 'New Performance', presentation: 'modal' }} />
        <Stack.Screen name="ticket/[id]" options={{ title: 'Your Ticket' }} />
        <Stack.Screen name="checkin/[id]" options={{ title: 'Door Check-in' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
