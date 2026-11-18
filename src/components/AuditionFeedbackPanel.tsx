import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button, Card, Field, Row, SectionHeader, Txt } from '@/components/ui';
import { AUDITION_FEEDBACK_LIMIT } from '@/lib/auditions';
import { fmtDate } from '@/lib/dates';
import { uid } from '@/lib/ids';
import type { AuditionFeedback } from '@/lib/types';
import { errorMessage, useStore } from '@/store/useStore';
import { C } from '@/theme';

const SECTIONS = [
  { kind: 'note', title: 'Audition notes', add: 'Add note', label: 'Note', placeholder: 'What stood out in the audition?' },
  { kind: 'role', title: 'Suggested roles', add: 'Suggest a role', label: 'Role', placeholder: 'e.g. The Narrator' },
] as const;

type Draft = Pick<AuditionFeedback, 'kind' | 'body'>;

export function AuditionFeedbackPanel({ productionId, personId, visible }: {
  productionId: string;
  personId: string;
  visible: boolean;
}) {
  const loadFeedback = useStore((s) => s.loadAuditionFeedback);
  const addFeedback = useStore((s) => s.addAuditionFeedback);
  const [items, setItems] = useState<AuditionFeedback[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const loadId = useRef(0);
  const lastAttempt = useRef<(Draft & { id: string }) | null>(null);
  const writing = useRef(false);

  const load = useCallback(() => {
    const id = ++loadId.current;
    void loadFeedback(productionId, personId).then((result) => {
      if (loadId.current === id) {
        setItems(result);
        setError('');
      }
    }).catch((reason: unknown) => {
      if (loadId.current === id) setError(errorMessage(reason));
    }).finally(() => {
      if (loadId.current === id) setLoading(false);
    });
  }, [loadFeedback, productionId, personId]);

  useEffect(() => {
    if (!visible) return;
    load();
    return () => { loadId.current += 1; };
  }, [load, visible]);

  async function save() {
    const body = draft?.body.trim();
    if (!draft || !body || writing.current) return;
    const previous = lastAttempt.current;
    const id = previous?.kind === draft.kind && previous.body === body ? previous.id : uid('af_');
    const entry = { id, kind: draft.kind, body };
    lastAttempt.current = entry;
    writing.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await addFeedback(productionId, personId, entry);
      loadId.current += 1;
      setLoading(false);
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(undefined);
      lastAttempt.current = null;
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
      writing.current = false;
    }
  }

  if (!visible) return null;
  return (
    <Card>
      <SectionHeader title="Casting feedback" action={loading || saving ? undefined : 'Refresh'} onAction={() => {
        setLoading(true);
        load();
      }} />
      {loading && <ActivityIndicator accessibilityLabel="Loading casting feedback" color={C.gold} />}
      {error ? <View accessibilityRole="alert"><Txt color={C.danger}>{error}</Txt></View> : null}
      {SECTIONS.map((section) => {
        const entries = items.filter((item) => item.kind === section.kind);
        return (
          <View key={section.kind} style={{ gap: 8 }}>
            <Txt v="h3">{section.title}</Txt>
            {entries.map((item) => (
              <View key={item.id} style={{ gap: 4, borderLeftWidth: 2, borderLeftColor: C.border, paddingLeft: 10 }}>
                <Txt>{item.body}</Txt>
                <Txt v="small">{`${item.authorName} · ${fmtDate(item.createdAt, { year: true })}`}</Txt>
              </View>
            ))}
            {!loading && !error && entries.length === 0 && <Txt v="small">{section.kind === 'note' ? 'No notes yet.' : 'No roles suggested yet.'}</Txt>}
            {draft?.kind === section.kind ? (
              <>
                <Field
                  label={section.label}
                  accessibilityLabel={section.label}
                  placeholder={section.placeholder}
                  multiline={section.kind === 'note'}
                  value={draft.body}
                  maxLength={AUDITION_FEEDBACK_LIMIT[section.kind]}
                  onChangeText={(body) => setDraft({ kind: section.kind, body })}
                  editable={!saving}
                />
                <Row style={{ flexWrap: 'wrap' }}>
                  <Button small title={section.kind === 'note' ? 'Save note' : 'Save suggestion'} loading={saving} disabled={loading || !draft.body.trim()} onPress={() => void save()} />
                  <Button small variant="ghost" title="Cancel" disabled={saving} onPress={() => { setDraft(undefined); lastAttempt.current = null; }} />
                </Row>
              </>
            ) : (
              <Button small variant="secondary" icon="add" title={section.add} disabled={!!draft || loading} onPress={() => setDraft({ kind: section.kind, body: '' })} />
            )}
          </View>
        );
      })}
    </Card>
  );
}
