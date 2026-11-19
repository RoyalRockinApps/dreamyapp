import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';

import { Button, Card, Field, Txt } from '@/components/ui';
import { Wordmark } from '@/components/Wordmark';
import { SITE_NAME, SITE_URL } from '@/lib/links';
import { signIn, signUp } from '@/lib/remote/auth';
import { VENUE } from '@/lib/seed';
import { retryLive, signOut, useLive } from '@/store/sync';
import { errorMessage } from '@/store/useStore';
import { C } from '@/theme';

/** Shown instead of the app in live mode until the person is signed in and their data has loaded. */
export function LiveGate() {
  const { status, error, email, message } = useLive();

  // while the owner hasn't confirmed this account yet, check back every 20 seconds
  useEffect(() => {
    if (status !== 'pending') return;
    const id = setInterval(() => void retryLive(), 20_000);
    return () => clearInterval(id);
  }, [status]);

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
      ) : status === 'pending' ? (
        <Card style={{ gap: 12 }}>
          <Ionicons name="hourglass-outline" size={30} color={C.accent} />
          <Txt v="h2">Almost there</Txt>
          <Txt v="muted">{message ?? 'The theatre needs to confirm this account.'}</Txt>
          {email ? <Txt v="small">{`Signed in as ${email}`}</Txt> : null}
          <Button title="Check again" icon="refresh" onPress={() => void retryLive()} />
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
  const [mode, setMode] = useState<'signIn' | 'create'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const creating = mode === 'create';

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const ready = validEmail && password.length >= (creating ? 8 : 1) && (!creating || name.trim().length > 0);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const e = email.trim().toLowerCase();
      if (creating) await signUp(e, password, name.trim());
      else await signIn(e, password);
      // the session listener (src/store/sync.ts) takes over and loads the app
    } catch (err) {
      setError(errorMessage(err));
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
        <Txt v="h2">{creating ? 'Create your account' : 'Sign in'}</Txt>
        <Txt v="muted">
          {creating
            ? 'For the theatre’s staff, cast and crew, and performers applying to audition. If the theatre already has you on file, the owner confirms it’s you.'
            : 'Staff, cast, crew and audition applicants sign in with their email and password.'}
        </Txt>
        {creating && (
          <Field label="Your name" value={name} onChangeText={(t) => { setName(t); setError(''); }} placeholder="First and last name" autoComplete="name" textContentType="name" />
        )}
        <Field
          label="Email"
          value={email}
          onChangeText={(t) => { setEmail(t); setError(''); }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType={creating ? 'emailAddress' : 'username'}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={(t) => { setPassword(t); setError(''); }}
          placeholder={creating ? 'At least 8 characters' : 'Your password'}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={creating ? 'new-password' : 'current-password'}
          textContentType={creating ? 'newPassword' : 'password'}
          error={error}
          onSubmitEditing={() => void submit()}
        />
        <Button title={creating ? 'Create account' : 'Sign in'} icon={creating ? 'person-add' : 'log-in'} loading={busy} disabled={!ready} onPress={() => void submit()} />
        <Button variant="ghost" title={creating ? 'I already have an account' : 'New here? Create an account'} disabled={busy} onPress={() => { setMode(creating ? 'signIn' : 'create'); setError(''); }} />
        {!creating && <Txt v="small" style={{ textAlign: 'center' }}>{`Forgot your password? Call the theatre at ${VENUE.phone}.`}</Txt>}
      </Card>
      <Txt v="small" style={{ textAlign: 'center' }}>Renting the theatre or buying tickets?</Txt>
      <Button variant="ghost" icon="globe-outline" title={`Visit ${SITE_NAME}`} disabled={busy} onPress={() => void Linking.openURL(SITE_URL)} />
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
