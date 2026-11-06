import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Button, Card, Field, Txt } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { VENUE } from '@/lib/seed';
import { lastSignOutReason, sendCode as requestCode, verifyCode } from '@/lib/remote/auth';
import { retryLive, signOut, useLive } from '@/store/sync';
import { errorMessage } from '@/store/useStore';
import { C } from '@/theme';

/** Shown instead of the app in live mode until the person is signed in and their data has loaded. */
export function LiveGate() {
  const { status, error, email } = useLive();

  if (status === 'signedOut') return <SignIn />;

  return (
    <Shell>
      {status === 'error' ? (
        <Card style={{ gap: 12 }}>
          <Ionicons name="cloud-offline-outline" size={30} color={C.warn} />
          <Txt v="h2">Couldn’t open the theatre</Txt>
          <Txt v="muted">{error ?? 'Something went wrong.'}</Txt>
          {email ? <Txt v="small">{`Signed in as ${email}`}</Txt> : null}
          <Button title="Try again" icon="refresh" onPress={() => void retryLive()} />
          <Button variant="ghost" title="Sign out" onPress={() => void signOut()} />
        </Card>
      ) : (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={C.accent} size="large" />
          <Txt v="muted">{status === 'loading' ? 'Raising the curtain…' : 'Opening the theatre…'}</Txt>
        </View>
      )}
    </Shell>
  );
}

function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [reason] = useState(lastSignOutReason);

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  const sendCode = async () => {
    if (!validEmail) return setError('Enter the email address you use with the theatre.');
    setBusy(true);
    setError('');
    try {
      await requestCode(email.trim().toLowerCase());
    } catch (e) {
      setBusy(false);
      return setError(friendly(errorMessage(e)));
    }
    setBusy(false);
    setStep('code');
    setCode('');
    setNote(`We emailed a sign-in code to ${email.trim()}. It can take a minute to arrive.`);
  };

  const verify = async () => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return setError('Enter the code from the email.');
    setBusy(true);
    setError('');
    try {
      await verifyCode(email.trim().toLowerCase(), token);
      // the session listener (src/store/sync.ts) takes over and loads the app
    } catch (e) {
      setError(friendly(errorMessage(e)));
    }
    setBusy(false);
  };

  return (
    <Shell>
      <View style={{ alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <Wordmark width={280} />
        <Txt v="muted" style={{ textAlign: 'center', letterSpacing: 0.5 }}>{VENUE.tagline}</Txt>
      </View>
      <Card style={{ gap: 14 }}>
        {step === 'email' ? (
          <>
            <Txt v="h2">Sign in</Txt>
            {reason ? <Txt v="small" color={C.warn}>{reason}</Txt> : null}
            <Txt v="muted">Owners, renters, cast and crew all sign in with their email. We’ll send you a one-time code. No password needed.</Txt>
            <Field
              label="Email"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(''); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              error={error}
              onSubmitEditing={() => void sendCode()}
            />
            <Button title="Email me a code" icon="mail" loading={busy} disabled={!validEmail} onPress={() => void sendCode()} />
          </>
        ) : (
          <>
            <Txt v="h2">Check your email</Txt>
            <Txt v="muted">{note}</Txt>
            <Field
              label="Sign-in code"
              value={code}
              onChangeText={(t) => { setCode(t.replace(/\D/g, '')); setError(''); }}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={10}
              error={error}
              onSubmitEditing={() => void verify()}
            />
            <Button title="Sign in" icon="log-in" loading={busy} disabled={code.length < 6} onPress={() => void verify()} />
            <Button variant="ghost" title="Send a new code" disabled={busy} onPress={() => void sendCode()} />
            <Button variant="ghost" title="Use a different email" disabled={busy} onPress={() => { setStep('email'); setError(''); }} />
          </>
        )}
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16, width: '100%', maxWidth: 440, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many') || m.includes('too_many')) {
    return 'Too many codes requested. Wait a minute, then try again.';
  }
  if (m.includes('expired') || m.includes('invalid otp') || m.includes('invalid code') || m.includes('otp')) return 'That code didn’t work or has expired. Check the latest email, or send a new code.';
  if (m.includes('sign up') || m.includes('signup')) return 'This email isn’t registered with the theatre yet.';
  return errorMessage(message);
}
