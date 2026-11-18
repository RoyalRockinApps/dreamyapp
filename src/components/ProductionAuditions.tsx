import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { alert } from '@/components/alert';
import { Button, Collapsible, Field, Pill, Row, Txt } from '@/components/ui';
import { useConceptWorkspace } from '@/hooks/useConceptWorkspace';
import { AUDITION_DETAILS_LIMIT } from '@/lib/auditions';
import { auditionDraftDetails } from '@/lib/concept';
import type { ProductionAudition } from '@/lib/types';
import { errorMessage, useStore } from '@/store/useStore';
import { C } from '@/theme';

export function ProductionAuditions({ productionId, includeConceptDraft }: { productionId: string; includeConceptDraft: boolean }) {
  return (
    <Collapsible title="Audition registration" icon="mic-outline" subtitle="Open, close, or update registration">
      <Registration productionId={productionId} includeConceptDraft={includeConceptDraft} />
    </Collapsible>
  );
}

function Registration({ productionId, includeConceptDraft }: { productionId: string; includeConceptDraft: boolean }) {
  const loadAudition = useStore((s) => s.loadProductionAudition);
  const saveAudition = useStore((s) => s.saveProductionAudition);
  const { concept, loadError: conceptError, loading: loadingConcept, refresh: refreshConcept } = useConceptWorkspace(productionId, includeConceptDraft);
  const [data, setData] = useState<ProductionAudition | null>();
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<string>();
  const [saving, setSaving] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const result = await loadAudition(productionId);
      if (request.current !== id) return;
      setData(result);
      setLoadError('');
    } catch (error) {
      if (request.current === id) setLoadError(errorMessage(error));
    }
  }, [loadAudition, productionId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]));

  const isOpen = data?.isOpen ?? false;
  const savedDetails = data?.details ?? '';
  const conceptDetails = concept ? auditionDraftDetails(concept.auditionDraft) : '';
  const details = draft ?? (data === null ? conceptDetails : savedDetails);

  const save = async (open: boolean) => {
    if (data === undefined || saving) return;
    const audition = { isOpen: open, details: details.trim() };
    setSaving(true);
    try {
      await saveAudition(productionId, audition);
      request.current += 1;
      setData(audition);
      setLoadError('');
      setDraft(undefined);
    } catch (error) {
      alert('Couldn’t save audition registration', errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <>
        <Txt color={C.danger}>{loadError}</Txt>
        <Button title="Try again" variant="secondary" onPress={() => void load()} />
      </>
    );
  }
  if (data === undefined) return <ActivityIndicator accessibilityLabel="Loading audition registration" color={C.accent} />;

  return (
    <>
      <Pill
        label={isOpen ? 'Open for applications' : 'Registration closed'}
        color={isOpen ? C.green : C.muted}
        bg={isOpen ? C.greenSoft : C.surface2}
      />
      {!!conceptError && (
        <Row style={{ flexWrap: 'wrap' }}>
          <Txt v="small" color={C.warn}>Couldn’t load the Concept draft.</Txt>
          <Button small variant="ghost" title="Retry Concept draft" onPress={() => void refreshConcept()} />
        </Row>
      )}
      <Field
        label="Audition details"
        accessibilityLabel="Audition details"
        value={details}
        onChangeText={setDraft}
        multiline
        maxLength={AUDITION_DETAILS_LIMIT}
        editable={!saving}
        placeholder="Add audition dates, location, and what to prepare."
        hint={conceptDetails && details === conceptDetails && !isOpen
          ? 'Concept draft loaded. Opening registration shares these details with performers.'
          : 'Performers can see these details while registration is open.'}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        {!!conceptDetails && details !== conceptDetails && (
          <Button title="Use Concept draft" variant="secondary" disabled={saving} onPress={() => setDraft(conceptDetails)} />
        )}
        <Button
          title={isOpen ? 'Close registration' : 'Open registration'}
          variant={isOpen ? 'secondary' : 'primary'}
          loading={saving}
          disabled={loadingConcept && data === null && draft === undefined}
          onPress={() => void save(!isOpen)}
        />
        <Button
          title="Save details"
          variant="ghost"
          disabled={saving || details.trim() === savedDetails}
          onPress={() => void save(isOpen)}
        />
      </Row>
    </>
  );
}
