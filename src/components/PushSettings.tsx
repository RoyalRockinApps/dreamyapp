import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

import { alert } from '@/components/alert';
import { Button, Card, ListItem, Row, Txt } from '@/components/ui';
import { enablePush, PUSH_SUPPORTED, pushState, type PushState } from '@/lib/push';
import { C } from '@/theme';

const PROMPT_KEY = 'dream-push-prompt-dismissed';
const WHAT = 'Announcements, schedule changes and cards assigned to you.';

/** Whether alerts are on for this phone, rechecked when the person comes back from Settings. */
function usePushState() {
  const [state, setState] = useState<PushState | undefined>(PUSH_SUPPORTED ? undefined : 'unsupported');
  const check = useCallback(() => void pushState().then(setState).catch(() => setState('unsupported')), []);
  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);
  const turnOn = useCallback(async () => {
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'blocked') alert('Alerts are off for Dream Theatre', 'Turn on notifications for Dream Theatre in Settings.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    } catch (e) {
      alert('Couldn’t turn on alerts', e instanceof Error ? e.message : String(e));
    }
  }, []);
  return { state, turnOn };
}

/** The Me page's notifications row. Hidden where push doesn't work (the website, the demo). */
export function NotificationsRow() {
  const { state, turnOn } = usePushState();
  if (!state || state === 'unsupported') return null;
  return (
    <ListItem
      icon={state === 'on' ? 'notifications' : 'notifications-off-outline'}
      iconColor={state === 'on' ? C.green : C.warn}
      title={state === 'on' ? 'Alerts are on' : 'Turn on alerts'}
      subtitle={state === 'blocked' ? 'Allow notifications for Dream Theatre in Settings' : WHAT}
      onPress={state === 'on' || state === 'blocked' ? () => void Linking.openSettings() : () => void turnOn()}
    />
  );
}

/** A one-time card on Today offering alerts, until they're on or the person says not now. */
export function PushPrompt() {
  const { state, turnOn } = usePushState();
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    void AsyncStorage.getItem(PROMPT_KEY).then((v) => setDismissed(v === '1')).catch(() => setDismissed(false));
  }, []);
  if (state !== 'off' || dismissed !== false) return null;
  const dismiss = () => {
    setDismissed(true);
    void AsyncStorage.setItem(PROMPT_KEY, '1').catch(() => {});
  };
  return (
    <Card accent={C.accent}>
      <Txt v="h3">Get alerts on this phone?</Txt>
      <Txt v="small">{WHAT}</Txt>
      <Row>
        <Button small style={{ flex: 1 }} icon="notifications-outline" title="Turn on alerts" onPress={() => void turnOn()} />
        <Button small style={{ flex: 1 }} variant="ghost" title="Not now" onPress={dismiss} />
      </Row>
    </Card>
  );
}
