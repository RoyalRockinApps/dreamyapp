// import each weight by path so unused styles (italics) stay out of the bundle
import { Adamina_400Regular } from '@expo-google-fonts/adamina/400Regular';
import { Cabin_400Regular } from '@expo-google-fonts/cabin/400Regular';
import { Cabin_500Medium } from '@expo-google-fonts/cabin/500Medium';
import { Cabin_600SemiBold } from '@expo-google-fonts/cabin/600SemiBold';
import { Cabin_700Bold } from '@expo-google-fonts/cabin/700Bold';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LiveGate } from '@/components/LiveGate';
import { usePush } from '@/hooks/usePush';
import { LIVE } from '@/lib/backend';
import { startLive, useLive } from '@/store/sync';
import { useIsAffiliated, useStore } from '@/store/useStore';
import { C, F } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
startLive();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, text: C.text, border: C.border, primary: C.accent },
};

export default function RootLayout() {
  const liveStatus = useLive((s) => s.status);
  // the website's typefaces (src/theme.ts → F); if loading fails the app falls back to system fonts
  const [fontsLoaded, fontError] = useFonts({ Adamina_400Regular, Cabin_400Regular, Cabin_500Medium, Cabin_600SemiBold, Cabin_700Bold });
  const fontsReady = fontsLoaded || !!fontError;
  // People outside the theatre only get Home, auditions, their performer profile and settings.
  const affiliated = useIsAffiliated();
  const showingApp = fontsReady && (!LIVE || liveStatus === 'ready');
  usePush(LIVE && showingApp);

  useEffect(() => {
    if (!fontsReady) return;
    const hide = () => SplashScreen.hideAsync().catch(() => {});
    if (useStore.persist.hasHydrated()) hide();
    return useStore.persist.onFinishHydration(hide);
  }, [fontsReady]);

  if (!fontsReady) return null; // keep the splash screen up until the fonts are in

  // Live mode: sign in and load the shared data before showing any screen.
  if (LIVE && liveStatus !== 'ready') {
    return (
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <LiveGate />
      </ThemeProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.bg },
            headerTintColor: C.accent,
            headerTitleStyle: { color: C.text, fontFamily: F.display },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: C.bg },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auditions" options={{ title: 'Auditions' }} />
          <Stack.Screen name="performer-profile" options={{ title: 'Performer Profile' }} />
          <Stack.Screen name="settings" options={{ title: 'Me' }} />
          <Stack.Protected guard={affiliated}>
            <Stack.Screen name="booking/new" options={{ title: 'Book the Theatre', presentation: 'modal' }} />
            <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
            <Stack.Screen name="pay" options={{ title: 'Secure Payment', presentation: 'modal' }} />
            <Stack.Screen name="production/[id]" options={{ title: 'Production' }} />
            <Stack.Screen name="production/new" options={{ title: 'New Production', presentation: 'modal' }} />
            <Stack.Screen name="production/concept" options={{ title: 'Concept Workspace' }} />
            <Stack.Screen name="production/audition-review" options={{ title: 'Audition Review' }} />
            <Stack.Screen name="rehearsal/edit" options={{ title: 'Schedule a Call', presentation: 'modal' }} />
            <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
            <Stack.Screen name="performance/[id]" options={{ title: 'Choose Seats' }} />
            <Stack.Screen name="performance/new" options={{ title: 'New Performance', presentation: 'modal' }} />
            <Stack.Screen name="ticket/[id]" options={{ title: 'Your Ticket' }} />
            <Stack.Screen name="checkin/[id]" options={{ title: 'Door Check-in' }} />
            <Stack.Screen name="bookings" options={{ title: 'My Bookings' }} />
            <Stack.Screen name="my-cards" options={{ title: 'Assigned to Me' }} />
            <Stack.Screen name="attendance/[id]" options={{ title: 'Attendance' }} />
            <Stack.Screen name="tasks" options={{ title: 'Theatre Tasks' }} />
            <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
            <Stack.Screen name="task/edit" options={{ title: 'Card', presentation: 'modal' }} />
            <Stack.Screen name="admin" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
