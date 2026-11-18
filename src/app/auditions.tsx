import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { alert } from '@/components/alert';
import { Button, Card, Empty, Pill, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { hasPerformerProfile } from '@/lib/auditions';
import { fmtDate } from '@/lib/dates';
import type { AuditionApplication, OpenAudition } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

type AuditionData = {
  openings: OpenAudition[];
  applications: AuditionApplication[];
  hasProfile: boolean;
};

export default function AuditionsScreen() {
  const user = useCurrentUser();
  return <AuditionsForPerson key={user.id} personId={user.id} />;
}

function AuditionsForPerson({ personId }: { personId: string }) {
  const loadAuditions = useStore((s) => s.loadAuditions);
  const loadProfile = useStore((s) => s.loadPerformerProfile);
  const apply = useStore((s) => s.applyForAudition);
  const withdraw = useStore((s) => s.withdrawAudition);
  const [data, setData] = useState<AuditionData>();
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<string>();
  const [confirmation, setConfirmation] = useState<{ productionId: string; action: 'apply' | 'withdraw' }>();
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const [auditions, profile] = await Promise.all([loadAuditions(), loadProfile(personId)]);
      if (request.current !== id) return;
      setData({ ...auditions, hasProfile: hasPerformerProfile(profile) });
      setLoadError('');
    } catch (error) {
      if (request.current === id) setLoadError(errorMessage(error));
    }
  }, [loadAuditions, loadProfile, personId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]));

  const changeApplication = async (productionId: string, action: 'apply' | 'withdraw') => {
    if (pending) return;
    setPending(productionId);
    setConfirmation(undefined);
    try {
      await (action === 'apply' ? apply(productionId) : withdraw(productionId));
    } catch (error) {
      alert(action === 'apply' ? 'Couldn’t apply' : 'Couldn’t withdraw', errorMessage(error));
    } finally {
      await load();
      setPending(undefined);
    }
  };

  const applyTo = (opening: OpenAudition) => {
    if (!data?.hasProfile) {
      router.push('/performer-profile');
      return;
    }
    setConfirmation({ productionId: opening.productionId, action: 'apply' });
  };

  const renderConfirmation = (productionId: string, action: 'apply' | 'withdraw') => {
    if (confirmation?.productionId !== productionId || confirmation.action !== action) return null;
    return (
      <>
        <Txt v="small">{action === 'apply'
          ? 'The theatre owner, production directors, and authorized audition staff can view your profile while your application is active.'
          : 'Withdrawing removes this application and the production’s access to your profile through it.'}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          <Button
            title={action === 'apply' ? 'Submit application' : 'Confirm withdrawal'}
            variant={action === 'apply' ? 'primary' : 'danger'}
            onPress={() => void changeApplication(productionId, action)}
          />
          <Button title="Cancel" variant="ghost" onPress={() => setConfirmation(undefined)} />
        </Row>
      </>
    );
  };

  if (loadError) {
    return (
      <Screen>
        <Empty icon="alert-circle-outline" title="Couldn’t load auditions" body={loadError}>
          <Button title="Try again" onPress={() => void load()} />
        </Empty>
      </Screen>
    );
  }
  if (!data) {
    return <Screen><ActivityIndicator accessibilityLabel="Loading auditions" color={C.gold} /></Screen>;
  }

  const applied = new Set(data.applications.map((application) => application.productionId));
  const available = data.openings.filter((opening) => !applied.has(opening.productionId));

  return (
    <Screen>
      <Card>
        <Txt v="h2">Performer profile</Txt>
        <Txt v="muted">Use one profile for every audition. Add a headshot, skills, and any past roles.</Txt>
        <Button
          icon="person-circle-outline"
          variant="secondary"
          title={data.hasProfile ? 'Edit my profile' : 'Create my profile'}
          onPress={() => router.push('/performer-profile')}
        />
      </Card>

      {data.applications.length > 0 && <SectionHeader title="My applications" />}
      {data.applications.map((application) => {
        const opening = data.openings.find((item) => item.productionId === application.productionId);
        return (
          <Card key={application.productionId}>
            <Row style={{ flexWrap: 'wrap' }}>
              <Txt v="h3" style={{ flex: 1, minWidth: 160 }}>{application.title}</Txt>
              <Pill label="Applied" icon="checkmark" color={C.green} bg={C.greenSoft} />
            </Row>
            <Txt v="small">{`Submitted ${fmtDate(application.submittedAt, { year: true })}`}</Txt>
            {opening?.details ? <Txt>{opening.details}</Txt> : null}
            {!opening && <Txt v="small">Registration is closed.</Txt>}
            {renderConfirmation(application.productionId, 'withdraw') ?? <Button
              title="Withdraw application"
              variant="ghost"
              disabled={!!pending}
              loading={pending === application.productionId}
              onPress={() => setConfirmation({ productionId: application.productionId, action: 'withdraw' })}
            />}
          </Card>
        );
      })}

      <SectionHeader title="Open auditions" />
      {available.length === 0 && (
        <Empty
          icon="mic-outline"
          title={data.openings.length > 0 ? 'You’ve applied to all open auditions' : 'No auditions are open right now'}
        />
      )}
      {available.map((opening) => (
        <Card key={opening.productionId} accent={C.gold}>
          <Txt v="h2">{opening.title}</Txt>
          {opening.details ? <Txt>{opening.details}</Txt> : null}
          {renderConfirmation(opening.productionId, 'apply') ?? <Button
            title={data.hasProfile ? 'Apply for an audition' : 'Create a profile to apply'}
            disabled={!!pending}
            loading={pending === opening.productionId}
            onPress={() => applyTo(opening)}
          />}
        </Card>
      ))}
    </Screen>
  );
}
