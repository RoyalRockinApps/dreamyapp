// Push notifications on phones: asking permission, registering this phone's Expo push token with the
// theatre's database, and opening the right screen when an alert is tapped. The database decides
// who gets which alert (supabase/migrations/20261121000100_push_notifications.sql).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { LIVE } from './backend';
import * as api from './remote/api';

const TOKEN_KEY = 'dream-push-token';

/** Push only works in the live app on a phone. */
export const PUSH_SUPPORTED = LIVE && (Platform.OS === 'ios' || Platform.OS === 'android');

export type PushState = 'on' | 'off' | 'blocked' | 'unsupported';

if (PUSH_SUPPORTED) {
  // show alerts that arrive while the app is open, too
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

export async function pushState(): Promise<PushState> {
  if (!PUSH_SUPPORTED) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'on';
  return p.canAskAgain ? 'off' : 'blocked';
}

async function register(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Theatre alerts', importance: AndroidImportance.HIGH });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    throw new Error(
      Platform.OS === 'android'
        ? 'Alerts on Android aren’t set up for the theatre yet.'
        : `This phone couldn’t sign up for alerts. ${e instanceof Error ? e.message : ''}`.trim(),
    );
  }
  await api.registerPushToken(token, Platform.OS as 'ios' | 'android');
  await AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
}

/** Ask for permission (if needed) and sign this phone up for the signed-in person's alerts. */
export async function enablePush(): Promise<PushState> {
  if (!PUSH_SUPPORTED) return 'unsupported';
  let p = await Notifications.getPermissionsAsync();
  if (!p.granted && p.canAskAgain) p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  if (!p.granted) return p.canAskAgain ? 'off' : 'blocked';
  await register();
  return 'on';
}

/** After sign-in: if alerts are already allowed, make sure this phone is registered to whoever signed in. */
export async function refreshPush(): Promise<void> {
  if (!PUSH_SUPPORTED) return;
  if ((await Notifications.getPermissionsAsync()).granted) await register();
}

/** Before signing out: stop sending this person's alerts to this phone. */
export async function stopPush(): Promise<void> {
  if (!PUSH_SUPPORTED) return;
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await api.unregisterPushToken(token).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

/** The screen an alert opens, from the url the database put in its data. */
export function alertUrl(response: Notifications.NotificationResponse | null | undefined): string | undefined {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : undefined;
}
