import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Cross-platform Alert. React Native Web's Alert.alert is a no-op, so on the website we fall
 * back to the browser's confirm()/alert() and run the chosen button's handler.
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = [title, message].filter(Boolean).join('\n\n');
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  const cancel = (buttons ?? []).find((b) => b.style === 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  // Browsers offer OK/Cancel only, so OK runs the last (primary) action.
  const primary = actions[actions.length - 1];
  const ok = window.confirm(`${text}\n\nOK = ${primary.text ?? 'OK'}`);
  if (ok) primary.onPress?.();
  else cancel?.onPress?.();
}
