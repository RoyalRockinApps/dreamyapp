import { View } from 'react-native';

import { Pill, Row, Txt, type IconName } from '@/components/ui';
import { PRODUCTION_STATUSES, productionStageLabel } from '@/lib/production';
import type { ProductionStage } from '@/lib/types';
import { C, F } from '@/theme';

export const PRODUCTION_STAGE_STYLE: Record<ProductionStage, { color: string; bg: string; icon: IconName; short: string }> = {
  concept: { color: C.blue, bg: C.blueSoft, icon: 'bulb-outline', short: 'Concept' },
  casting: { color: C.purple, bg: C.purpleSoft, icon: 'people-outline', short: 'Casting' },
  preparation: { color: C.gold, bg: C.goldSoft, icon: 'construct-outline', short: 'Prep' },
  tech: { color: C.warn, bg: C.warnSoft, icon: 'flash-outline', short: 'Tech' },
  performances: { color: C.curtain, bg: C.curtainSoft, icon: 'mic-outline', short: 'Shows' },
  wrap: { color: C.leather, bg: C.leatherSoft, icon: 'archive-outline', short: 'Wrap' },
  completed: { color: C.green, bg: C.greenSoft, icon: 'checkmark-circle-outline', short: 'Done' },
};

export function ProductionStageBadge({ stage }: { stage: ProductionStage }) {
  const { color, bg, icon } = PRODUCTION_STAGE_STYLE[stage];
  return <Pill label={productionStageLabel(stage)} color={color} bg={bg} icon={icon} />;
}

export function ProductionStageTrack({ stage }: { stage: ProductionStage }) {
  const current = PRODUCTION_STATUSES.indexOf(stage);
  return (
    <Row gap={5} style={{ alignItems: 'flex-start' }}>
      {PRODUCTION_STATUSES.map((step, i) => {
        const meta = PRODUCTION_STAGE_STYLE[step];
        return (
          <View key={step} style={{ flex: 1, gap: 4 }} accessibilityLabel={`${productionStageLabel(step)}${i === current ? ', current stage' : ''}`}>
            <View style={{ height: 5, borderRadius: 4, backgroundColor: i === current ? meta.color : i < current ? meta.bg : C.surface2 }} />
            <Txt v="small" color={i === current ? meta.color : C.muted} style={{ fontFamily: i === current ? F.bold : F.regular, fontSize: 11 }}>{meta.short}</Txt>
          </View>
        );
      })}
    </Row>
  );
}
