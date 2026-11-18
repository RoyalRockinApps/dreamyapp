// Sign-in with Supabase Auth: email + password, the same on iOS, Android and web.
//
// There is no email sender yet, so "Confirm email" is off in Supabase and nothing proves who owns
// an address. That is why linking a sign-in to someone the theatre already knows waits for the
// owner's approval (link_me() in supabase/migrations). Password resets go through the theatre.

import type { Session } from '@supabase/supabase-js';

import { db } from './db';

export interface AuthSession {
  userId: string;
  email: string;
}

const toSession = (s: Session | null): AuthSession | null => (s ? { userId: s.user.id, email: s.user.email ?? '' } : null);

/** The saved session from an earlier visit, if any. */
export async function loadSession(): Promise<AuthSession | null> {
  const { data } = await db().auth.getSession();
  return toSession(data.session);
}

/** Called on sign-in, sign-out and token refresh. */
export function onAuthChange(listener: (s: AuthSession | null) => void): () => void {
  // Supabase asks that no other Supabase call runs inside this callback, so hand it off.
  const { data } = db().auth.onAuthStateChange((_event, session) => {
    setTimeout(() => listener(toSession(session)), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
}

/** Creates the account and signs in (with "Confirm email" off, Supabase returns a session right away). */
export async function signUp(email: string, password: string, name: string): Promise<void> {
  const { data, error } = await db().auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw new Error(friendly(error.message));
  if (!data.session) throw new Error('Account created. Sign in with your email and password.');
}

export async function signOut(): Promise<void> {
  await db().auth.signOut();
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. Check them and try again.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'There’s already an account for this email. Sign in instead.';
  if (m.includes('password should be') || m.includes('weak password')) return 'Choose a longer password (at least 8 characters).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute, then try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Can’t reach the theatre’s server. Check your internet connection.';
  return message;
}
