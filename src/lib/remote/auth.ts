// Sign-in with Neon Auth (Managed Better Auth) over plain HTTP, the same on iOS, Android and web.
//
//   1. POST /email-otp/send-verification-otp  { email, type: 'sign-in' }  -> emails a code
//   2. POST /sign-in/email-otp               { email, otp }              -> { token, user } + session cookie
//   3. GET  /token                                                       -> { token: <JWT> }
//      (fallback: GET /get-session, JWT in the `set-auth-jwt` response header)
// What actually carries the session is Neon's session cookie (`credentials: 'include'`). Neon
// does not accept the session token from step 2 as a bearer token (tested Nov 2026: /token -> 401),
// and its signed token header isn't readable from a browser. We still send the bearer header in
// case Neon adds support.
//   - iOS / Android: the native network layer keeps the cookie like any first-party cookie.
//   - Website: the cookie is third-party (it comes from neon.tech, not the site), so sign-in only
//     works in browsers that allow third-party cookies. Safari and privacy-hardened Chrome block
//     it; the sign-in screen then says so. Serving Neon Auth through the site's own host (a proxy)
//     would fix this; see docs/BACKEND.md.
// The JWT (about 15 minutes) is what the Data API checks; it is refreshed a minute before it expires.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { AUTH_URL } from '../backend';

const STORAGE_KEY = 'dream-theatre-auth-v1';

export interface AuthSession {
  token: string;
  userId: string;
  email: string;
  /** true once this device has used the session successfully (so a later failure means it expired) */
  confirmed?: boolean;
}

export class AuthError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

let session: AuthSession | null = null;
let signedOutBecause: string | null = null;
let loaded = false;
let jwt: { token: string; exp: number } | null = null;
let refreshing: Promise<string> | null = null;
const listeners = new Set<(s: AuthSession | null) => void>();

async function call<T>(path: string, opts: { body?: unknown; token?: string } = {}): Promise<{ data: T; headers: Headers; status: number }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  // A native app has no web origin of its own; Neon Auth trusts localhost origins by default.
  if (Platform.OS !== 'web') headers.Origin = 'https://localhost';
  let res: Response;
  try {
    res = await fetch(`${AUTH_URL}${path}`, {
      method: opts.body !== undefined ? 'POST' : 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
  } catch {
    throw new AuthError('Can’t reach the sign-in service. Check your internet connection.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = (data ?? {}) as { message?: string; code?: string };
    throw new AuthError(body.message ?? `Sign-in service error (${res.status})`, res.status, body.code);
  }
  return { data: data as T, headers: res.headers, status: res.status };
}

function emit() {
  for (const l of listeners) l(session);
}

async function save() {
  try {
    if (session) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private browsing): stay signed in for this visit only
  }
}

/** The saved session from an earlier visit, if any. */
export async function loadSession(): Promise<AuthSession | null> {
  if (!loaded) {
    loaded = true;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      session = raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      session = null;
    }
  }
  return session;
}

export function onAuthChange(listener: (s: AuthSession | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Why the last session ended, when it wasn't the person's own choice (shown on the sign-in screen). */
export function lastSignOutReason(): string | null {
  return signedOutBecause;
}

export async function sendCode(email: string): Promise<void> {
  signedOutBecause = null;
  await call('/email-otp/send-verification-otp', { body: { email, type: 'sign-in' } });
}

/** Signs in with the emailed code. A first sign-in creates the account. */
export async function verifyCode(email: string, otp: string): Promise<AuthSession> {
  const { data, headers } = await call<{ token: string; user: { id: string; email: string } }>('/sign-in/email-otp', { body: { email, otp } });
  // the bearer plugin may hand back a signed copy of the session token; prefer it when present
  const token = headers.get('set-auth-token') || data.token;
  session = { token, userId: data.user.id, email: data.user.email };
  jwt = null;
  await save();
  emit();
  return session;
}

export async function signOut(reason?: string): Promise<void> {
  const previous = session;
  session = null;
  jwt = null;
  signedOutBecause = reason ?? null;
  await save();
  emit();
  if (previous) await call('/sign-out', { body: {}, token: previous.token }).catch(() => {});
}

function expiresAt(token: string): number {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/** Ask Neon Auth for a JWT: GET /token, then GET /get-session's `set-auth-jwt` header. */
async function mintJwt(current: AuthSession): Promise<string> {
  try {
    const { data } = await call<{ token?: string }>('/token', { token: current.token });
    if (data?.token) return data.token;
  } catch (e) {
    if (!(e instanceof AuthError) || e.status !== 401) throw e;
  }
  const { data, headers } = await call<{ session?: unknown } | null>('/get-session', { token: current.token });
  const header = headers.get('set-auth-jwt');
  if (header) return header;
  if (!data?.session) throw new AuthError('Neon Auth didn’t recognize this sign-in.', 401, 'NO_SESSION');
  throw new AuthError('Signed in, but Neon Auth didn’t provide a database access token.', 500, 'NO_JWT');
}

/** A current JWT for the Data API. An expired or revoked session signs the person out, with the reason. */
export async function getJwt(): Promise<string> {
  const current = session;
  if (!current) throw new AuthError('You’ve been signed out.', 401);
  if (jwt && jwt.exp - Date.now() > 60_000) return jwt.token;
  if (!refreshing) {
    refreshing = mintJwt(current)
      .then((token) => {
        if (session === current) {
          jwt = { token, exp: expiresAt(token) || Date.now() + 5 * 60_000 };
          if (!current.confirmed) {
            current.confirmed = true;
            void save();
          }
        }
        return token;
      })
      .catch(async (e) => {
        if (e instanceof AuthError && e.status === 401 && session === current) {
          const blockedCookie = Platform.OS === 'web' && e.code === 'NO_SESSION' && !current.confirmed;
          await signOut(
            blockedCookie
              ? 'Your code was accepted, but this browser blocked the sign-in cookie (it comes from our sign-in service, neon.tech). Use the Dream Theatre app on your phone, or try another browser such as Chrome with third-party cookies allowed.'
              : current.confirmed
                ? 'Your sign-in expired. Please sign in again.'
                : `Your sign-in didn’t stick (${e.message}). Please sign in again; if this keeps happening, tell the theatre.`,
          );
        }
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
