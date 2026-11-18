// The Supabase client. Requests carry the signed-in person's token, and row-level security in
// supabase/migrations decides what each one may read or change. The session is kept in
// AsyncStorage on every platform (no cookies), so the website works in Safari too.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { LIVE, SUPABASE_KEY, SUPABASE_URL } from '../backend';

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!LIVE) throw new Error('The shared backend is not configured.');
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
    // phones pause token refresh in the background and resume when the app comes back
    if (Platform.OS !== 'web') {
      const c = client;
      AppState.addEventListener('change', (state) => (state === 'active' ? c.auth.startAutoRefresh() : c.auth.stopAutoRefresh()));
    }
  }
  return client;
}
