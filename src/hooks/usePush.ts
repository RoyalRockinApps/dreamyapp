import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

import { alertUrl, PUSH_SUPPORTED, refreshPush } from '@/lib/push';

/**
 * Once the app is signed in and showing screens: keep this phone registered for the person's
 * alerts, and open the screen an alert points to when it's tapped (also when it launched the app).
 */
export function usePush(ready: boolean) {
  useEffect(() => {
    if (!PUSH_SUPPORTED || !ready) return;
    void refreshPush().catch(() => {});
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      const url = alertUrl(r);
      if (!url) return;
      router.push(url as Href);
      void Notifications.clearLastNotificationResponseAsync();
    });
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const url = alertUrl(r);
      if (url) router.push(url as Href);
    });
    return () => sub.remove();
  }, [ready]);
}
