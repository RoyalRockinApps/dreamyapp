import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AuditionApplicantCard } from '@/components/AuditionApplicantCard';
import { Button, Empty, Screen, SectionHeader, Segmented, Txt } from '@/components/ui';
import { AUDITION_REVIEW_PAGE_SIZE } from '@/lib/auditions';
import { canReviewAudition } from '@/lib/production';
import type { AuditionDecision, AuditionReviewCard, AuditionReviewFilter } from '@/lib/types';
import { errorMessage, useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

const FILTERS = ['pending', 'callback', 'pass', 'all'] as const;
const LABELS = { pending: 'To review', callback: 'Callbacks', pass: 'Not a fit', all: 'All' };

export default function AuditionReview() {
  const { productionId } = useLocalSearchParams<{ productionId: string }>();
  const production = useStore((s) => s.productions.find((p) => p.id === productionId));
  const user = useCurrentUser();
  const [filter, setFilter] = useState<AuditionReviewFilter>('pending');

  if (!production || !canReviewAudition(production, user)) {
    return <Empty icon="lock-closed-outline" title="Audition review is unavailable" />;
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Audition Review' }} />
      <Txt v="h2">{production.title}</Txt>
      <Txt v="small">Tap a card to flip it. Swipe right for Callback or left for Not a fit.</Txt>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} labels={LABELS} />
      <ReviewList key={`${production.id}:${user.id}:${filter}`} productionId={production.id} filter={filter} />
    </Screen>
  );
}

function ReviewList({ productionId, filter }: { productionId: string; filter: AuditionReviewFilter }) {
  const loadCards = useStore((s) => s.loadAuditionReviewCards);
  const saveDecision = useStore((s) => s.saveAuditionReview);
  const [cards, setCards] = useState<AuditionReviewCard[]>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const writing = useRef(false);

  const load = useCallback(async (offset = 0) => {
    const id = ++request.current;
    setLoading(true);
    try {
      const result = await loadCards(productionId, filter, offset);
      if (request.current !== id) return;
      const page = result.slice(0, AUDITION_REVIEW_PAGE_SIZE);
      setCards((previous) => offset && previous
        ? [...previous, ...page.filter((card) => !previous.some((p) => p.personId === card.personId))]
        : page);
      setHasMore(result.length > AUDITION_REVIEW_PAGE_SIZE);
      setError('');
    } catch (reason) {
      if (request.current === id) setError(errorMessage(reason));
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [filter, loadCards, productionId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]));

  async function decide(card: AuditionReviewCard, decision: AuditionDecision) {
    if (writing.current || loading || card.decision === decision) return;
    writing.current = true;
    setSaving(true);
    setError('');
    try {
      await saveDecision(productionId, card.personId, card.decision, decision);
      const staysInList = filter === 'all' || filter === decision;
      setCards((previous) => previous?.flatMap((item) => {
        if (item.personId !== card.personId) return [item];
        return staysInList ? [{ ...item, decision }] : [];
      }));
      if (!staysInList && hasMore && cards?.length === 1) await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
      writing.current = false;
    }
  }

  return (
    <>
      <SectionHeader title="Applicants" action={loading || saving ? undefined : 'Refresh'} onAction={() => void load()} />
      {error ? <View accessibilityRole="alert"><Txt color={C.danger}>{error}</Txt></View> : null}
      {cards?.map((card) => (
        <AuditionApplicantCard key={card.personId} productionId={productionId} applicant={card} busy={loading || saving} onDecision={(decision) => void decide(card, decision)} />
      ))}
      {loading ? <ActivityIndicator accessibilityLabel="Loading applicants" color={C.gold} /> : null}
      {!loading && cards?.length === 0 && !hasMore && !error && (
        <Empty icon="people-outline" title={filter === 'all' ? 'No applications yet' : `No applicants in ${LABELS[filter]}`} />
      )}
      {hasMore && <Button variant="secondary" title="Load more applicants" loading={loading} disabled={saving} onPress={() => void load(cards?.length ?? 0)} />}
    </>
  );
}
