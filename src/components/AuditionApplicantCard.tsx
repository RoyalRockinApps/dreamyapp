import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useReducedMotion } from 'react-native-reanimated';

import { AuditionFeedbackPanel } from '@/components/AuditionFeedbackPanel';
import { PerformerProfileView } from '@/components/PerformerProfile';
import { Button, Card, Pill, Row, Txt } from '@/components/ui';
import type { AuditionDecision, AuditionReviewCard, PerformerProfile } from '@/lib/types';
import { errorMessage, useStore } from '@/store/useStore';
import { C, R } from '@/theme';

const LABELS: Record<AuditionDecision, string> = { pending: 'To review', callback: 'Callback', pass: 'Not a fit' };

export function AuditionApplicantCard({ productionId, applicant, busy, onDecision }: {
  productionId: string;
  applicant: AuditionReviewCard;
  busy: boolean;
  onDecision: (decision: AuditionDecision) => void;
}) {
  const [back, setBack] = useState(false);
  const [rotation] = useState(() => new Animated.Value(0));
  const rotating = useRef(false);
  const swipeable = useRef<SwipeableMethods>(null);
  const reduceMotion = useReducedMotion();
  const color = applicant.decision === 'callback' ? C.green : applicant.decision === 'pass' ? C.danger : C.muted;

  function flip() {
    if (rotating.current) return;
    if (reduceMotion) {
      setBack((value) => !value);
      return;
    }
    rotating.current = true;
    const timing = { duration: 115, useNativeDriver: Platform.OS !== 'web' };
    Animated.timing(rotation, { ...timing, toValue: 90 }).start(({ finished }) => {
      if (!finished) {
        rotating.current = false;
        return;
      }
      setBack((value) => !value);
      rotation.setValue(-90);
      Animated.timing(rotation, { ...timing, toValue: 0 }).start(() => { rotating.current = false; });
    });
  }

  const rotationY = rotation.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });
  return (
    <View style={{ gap: 8 }}>
      <Swipeable
        ref={swipeable}
        enabled={!busy}
        containerStyle={{ borderRadius: R.lg }}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={80}
        rightThreshold={80}
        renderLeftActions={() => <SwipeAction decision="callback" />}
        renderRightActions={() => <SwipeAction decision="pass" />}
        onSwipeableOpen={(direction) => {
          swipeable.current?.close();
          if (!busy) onDecision(direction === 'right' ? 'callback' : 'pass');
        }}
      >
        <Animated.View style={{ transform: [{ perspective: 800 }, { rotateY: rotationY }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={back ? `Show summary for ${applicant.name}` : `Show full profile for ${applicant.name}`}
            accessibilityState={{ expanded: back }}
            onPress={flip}
          >
            <Card accent={color}>
              {back ? (
                <>
                  <Txt v="h3">{applicant.name}</Txt>
                  <FullProfile personId={applicant.personId} />
                  <Txt v="small" color={C.gold}>Tap to show summary</Txt>
                </>
              ) : (
                <Row gap={14} style={{ alignItems: 'flex-start' }}>
                  <Image
                    source={{ uri: applicant.headshot }}
                    cachePolicy="none"
                    accessibilityLabel={`Headshot of ${applicant.name}`}
                    contentFit="cover"
                    style={{ width: 78, height: 100, borderRadius: R.md, backgroundColor: C.surface2 }}
                  />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Txt v="h3">{applicant.name}</Txt>
                    <Txt v="small">{applicant.summary}</Txt>
                    <Pill label={LABELS[applicant.decision]} color={color} bg={C.surface2} />
                  </View>
                </Row>
              )}
            </Card>
          </Pressable>
        </Animated.View>
      </Swipeable>
      <AuditionFeedbackPanel productionId={productionId} personId={applicant.personId} visible={back} />
      <Row style={{ flexWrap: 'wrap' }}>
        {applicant.decision !== 'pass' && <Button small variant="secondary" title="Not a fit" icon="close-outline" disabled={busy} onPress={() => onDecision('pass')} />}
        {applicant.decision !== 'callback' && <Button small variant="success" title="Callback" icon="arrow-forward-outline" disabled={busy} onPress={() => onDecision('callback')} />}
        {applicant.decision !== 'pending' && <Button small variant="ghost" title="Return to review" disabled={busy} onPress={() => onDecision('pending')} />}
      </Row>
    </View>
  );
}

function SwipeAction({ decision }: { decision: 'callback' | 'pass' }) {
  const color = decision === 'callback' ? C.green : C.danger;
  return (
    <View style={{ width: 126, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surface2 }}>
      <Txt color={color}>{LABELS[decision]}</Txt>
    </View>
  );
}

function FullProfile({ personId }: { personId: string }) {
  const load = useStore((s) => s.loadPerformerProfile);
  const [profile, setProfile] = useState<PerformerProfile | null>();
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    void load(personId).then((data) => {
      if (current) setProfile(data);
    }).catch((reason: unknown) => {
      if (current) setError(errorMessage(reason));
    });
    return () => { current = false; };
  }, [load, personId]);

  if (error) return <Txt v="small" color={C.danger}>{error}</Txt>;
  if (profile === undefined) return <ActivityIndicator accessibilityLabel="Loading performer profile" color={C.gold} />;
  if (profile === null) return <Txt v="small">This profile is no longer shared with you.</Txt>;
  return <PerformerProfileView profile={profile} />;
}
