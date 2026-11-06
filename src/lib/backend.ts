import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { neonAuthUrl?: string; neonDataApiUrl?: string; demo?: boolean };

/** Neon Auth (Managed Better Auth) base URL, e.g. https://ep-….neonauth…/neondb/auth */
export const AUTH_URL = (extra.neonAuthUrl ?? '').replace(/\/$/, '');
/** Neon Data API (PostgREST) base URL, e.g. https://ep-….apirest…/neondb/rest/v1 */
export const DATA_API_URL = (extra.neonDataApiUrl ?? '').replace(/\/$/, '');

/**
 * Live mode: everyone signs in and shares one database (Neon). Without the Neon settings
 * (see app.config.js), or with EXPO_PUBLIC_DEMO=1, the app runs the on-device demo.
 */
export const LIVE = !!AUTH_URL && !!DATA_API_URL && !extra.demo;
