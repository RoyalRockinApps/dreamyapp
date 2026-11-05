import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { getHouse, layoutFor, seatAvailability, TIER_LABEL, type Availability, type HouseConfig } from '@/lib/seating';
import { useStore } from '@/store/useStore';
import type { PriceTier, Seat, SeatClaim } from '@/lib/types';
import { C, R } from '@/theme';
import { Segmented, tap } from './ui';

export const TIER_COLOR: Record<PriceTier, string> = {
  premium: C.gold,
  standard: C.blue,
  value: C.purple,
  accessible: C.green,
};

interface Props {
  claims: Record<string, SeatClaim>;
  holderId: string;
  selected: string[];
  onToggle(seat: Seat, availability: Availability): void;
  /** owner mode lets you tap sold/blocked seats to inspect or unblock them */
  manage?: boolean;
  now: Date;
  /** preview an unsaved layout (admin) */
  house?: HouseConfig;
  /** start in whole-house view */
  initialZoom?: 'fit' | 'zoom';
}

export function SeatMap({ claims, holderId, selected, onToggle, manage, now, house, initialZoom = 'zoom' }: Props) {
  const { width } = useWindowDimensions();
  const [zoom, setZoom] = useState<'fit' | 'zoom'>(initialZoom);
  const savedHouse = useStore((st) => st.house); // re-render when the owner changes the layout
  const HOUSE = house ?? savedHouse ?? getHouse();
  const layout = useMemo(() => layoutFor(HOUSE), [HOUSE]);
  const sel = useMemo(() => new Set(selected), [selected]);
  const scroller = useRef<ScrollViewInstance>(null);
  const viewW = useRef(0);
  const centered = useRef(false);
  const contentW = useRef(0);
  // start the zoomed map centred on the middle section
  const center = () => {
    if (centered.current || !viewW.current || !contentW.current) return;
    centered.current = true;
    scroller.current?.scrollTo({ x: Math.max(0, (contentW.current - viewW.current) / 2), animated: false });
  };

  const cols = HOUSE.sectionWidths.L + HOUSE.sectionWidths.C + HOUSE.sectionWidths.R;
  const labelW = 18;
  const aisle = zoom === 'fit' ? 8 : 18;
  const gap = zoom === 'fit' ? 2 : 4;
  const fitSize = Math.floor((Math.min(width, 700) - 32 - 24 - labelW * 2 - aisle * 2 - gap * cols) / cols);
  const size = zoom === 'fit' ? Math.max(7, fitSize) : 24;

  const rows = HOUSE.rows.map((row) => ({
    row,
    sections: (['L', 'C', 'R'] as const).map((sec) => layout.filter((s) => s.row === row && s.section === sec)),
  }));

  const renderSeat = (seat: Seat) => {
    const a = seatAvailability(claims, seat.id, holderId, now);
    const isSel = sel.has(seat.id) || a === 'mine';
    const tierCol = TIER_COLOR[seat.tier];
    let bg = tierCol + '40';
    let border = tierCol;
    let icon: React.ReactNode = null;
    if (isSel) {
      bg = '#FFFFFF';
      border = C.gold;
      if (size >= 16) icon = <Ionicons name="checkmark" size={size - 8} color="#1A1206" />;
    } else if (a === 'sold') {
      bg = '#2B2640';
      border = '#2B2640';
      if (size >= 16) icon = <Ionicons name="close" size={size - 10} color={C.faint} />;
    } else if (a === 'held') {
      bg = C.warn + '30';
      border = C.warn + '60';
    } else if (a === 'blocked') {
      bg = '#151124';
      border = C.faint;
      if (size >= 16) icon = <Ionicons name="remove" size={size - 10} color={C.faint} />;
    } else if (seat.accessible && size >= 16) {
      icon = <Ionicons name="accessibility" size={size - 10} color={tierCol} />;
    }
    const tappable = manage || a === 'available' || a === 'mine' || isSel;
    return (
      <Pressable
        key={seat.id}
        accessibilityLabel={`Row ${seat.row} seat ${seat.section}${seat.number}, ${a}`}
        disabled={!tappable}
        onPress={() => {
          tap();
          onToggle(seat, a);
        }}
        hitSlop={zoom === 'fit' ? 2 : 0}
        style={{
          width: size,
          height: size,
          borderRadius: size / 3.5,
          borderTopLeftRadius: size / 2,
          borderTopRightRadius: size / 2,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {icon}
      </Pressable>
    );
  };

  const map = (
    <View style={{ paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}>
      <View style={[s.stage, { width: (size + gap) * cols * 0.75 }]}>
        <Text style={s.stageText}>STAGE</Text>
      </View>
      {rows.map(({ row, sections }) => (
        <View key={row} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: gap }}>
          <Text style={[s.rowLabel, { width: labelW, fontSize: zoom === 'fit' ? 8 : 11 }]}>{row}</Text>
          {sections.map((seats, i) => (
            <View key={i} style={{ flexDirection: 'row', gap, marginHorizontal: aisle / 2 }}>
              {seats.map(renderSeat)}
            </View>
          ))}
          <Text style={[s.rowLabel, { width: labelW, fontSize: zoom === 'fit' ? 8 : 11 }]}>{row}</Text>
        </View>
      ))}
      <Text style={[s.rowLabel, { marginTop: 6 }]}>BACK OF HOUSE · LOBBY ENTRANCE</Text>
    </View>
  );

  return (
    <View style={s.wrap}>
      <View style={{ padding: 10, paddingBottom: 0 }}>
        <Segmented options={['zoom', 'fit'] as const} value={zoom} onChange={setZoom} labels={{ zoom: 'Pick seats', fit: 'Whole house' }} />
      </View>
      {zoom === 'zoom' ? (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator
          onLayout={(e) => {
            viewW.current = e.nativeEvent.layout.width;
            center();
          }}
          onContentSizeChange={(w) => {
            contentW.current = w;
            center();
          }}>
          {map}
        </ScrollView>
      ) : (
        map
      )}
      <Legend />
    </View>
  );
}

export function Legend() {
  const item = (color: string, label: string, filled = false) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: filled ? color : color + '40', borderWidth: 1, borderColor: color }} />
      <Text style={{ color: C.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
  return (
    <View style={s.legend}>
      {(Object.keys(TIER_COLOR) as PriceTier[]).map((t) => item(TIER_COLOR[t], TIER_LABEL[t]))}
      {item('#FFFFFF', 'Your seats', true)}
      {item('#2B2640', 'Sold', true)}
      {item(C.warn, 'In someone’s cart')}
      {item(C.faint, 'Unavailable')}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  stage: { height: 26, backgroundColor: C.curtain, borderBottomLeftRadius: 60, borderBottomRightRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stageText: { color: '#fff', fontWeight: '800', letterSpacing: 6, fontSize: 11 },
  rowLabel: { color: C.faint, fontWeight: '700', textAlign: 'center', fontSize: 11 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderTopWidth: 1, borderTopColor: C.border },
});
