// The website has no push alerts: these stand in for src/lib/push.ts so expo-notifications stays out
// of the web bundle.
export const PUSH_SUPPORTED = false;
export type PushState = 'on' | 'off' | 'blocked' | 'unsupported';
export const pushState = async (): Promise<PushState> => 'unsupported';
export const enablePush = async (): Promise<PushState> => 'unsupported';
export const refreshPush = async (): Promise<void> => {};
export const stopPush = async (): Promise<void> => {};
export const alertUrl = (): string | undefined => undefined;
