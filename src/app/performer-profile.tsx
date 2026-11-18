import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';

import { PerformerProfileEditor } from '@/components/PerformerProfile';
import { Button, Card, Screen, Txt } from '@/components/ui';
import type { PerformerProfile } from '@/lib/types';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

function ProfileForm({ personId, name }: { personId: string; name: string }) {
  const loadProfile = useStore((state) => state.loadPerformerProfile);
  const saveProfile = useStore((state) => state.savePerformerProfile);
  const [profile, setProfile] = useState<PerformerProfile | null>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void loadProfile(personId).then((loaded) => {
      if (active) setProfile(loaded);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Couldn’t load the profile.');
    });
    return () => { active = false; };
  }, [loadProfile, personId, attempt]);

  if (error) {
    return (
      <Card>
        <Txt color={C.danger}>{error}</Txt>
        <Button title="Try again" onPress={() => {
          setError('');
          setAttempt((value) => value + 1);
        }} />
      </Card>
    );
  }
  if (profile === undefined) return <Txt v="muted">Loading performer profile…</Txt>;
  return <PerformerProfileEditor profile={profile} name={name} onSave={saveProfile} />;
}

export default function PerformerProfileScreen() {
  const person = useCurrentUser();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Performer profile' }} />
      <ProfileForm key={person.id} personId={person.id} name={person.name} />
    </Screen>
  );
}
