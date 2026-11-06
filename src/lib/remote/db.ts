// Neon Data API client (PostgREST). Every request carries the signed-in person's JWT, and
// row-level security in db/migrations decides what it may read or change.

import { PostgrestClient } from '@supabase/postgrest-js';

import { DATA_API_URL, LIVE } from '../backend';
import { getJwt } from './auth';

let client: PostgrestClient | null = null;

export function db(): PostgrestClient {
  if (!LIVE) throw new Error('The shared backend is not configured.');
  client ??= new PostgrestClient(DATA_API_URL, {
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${await getJwt()}`);
      return fetch(input, { ...init, headers });
    },
  });
  return client;
}
