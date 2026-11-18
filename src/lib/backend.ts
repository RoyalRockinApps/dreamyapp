import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseKey?: string; demo?: boolean };

/** Supabase project URL, e.g. https://abcd1234.supabase.co */
export const SUPABASE_URL = (extra.supabaseUrl ?? '').replace(/\/$/, '');
/** Supabase publishable (anon) key. Designed to be public; row-level security protects the data. */
export const SUPABASE_KEY = extra.supabaseKey ?? '';

/**
 * Live mode: everyone signs in and shares one database (Supabase). Without the Supabase settings
 * (see app.config.js), or with EXPO_PUBLIC_DEMO=1, the app runs the on-device demo.
 */
export const LIVE = !!SUPABASE_URL && !!SUPABASE_KEY && !extra.demo;
