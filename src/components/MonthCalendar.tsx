import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dayKey, MONTHS, monthGrid, WEEKDAYS_SHORT } from '@/lib/dates';
import { C, R } from '@/theme';
import { tap } from './ui';

export interface MonthCalendarProps {
  year: number;
  month: number; // 0-11
  onChangeMonth(year: number, month: number): void;
  selected?: string;
  onSelect(key: string): void;
  /** colored dots per day */
  markers?: Record<string, string[]>;
  /** days rendered as fully booked */
  busy?: Set<string>;
  minDate?: string;
}

export function MonthCalendar({ year, month, onChangeMonth, selected, onSelect, markers = {}, busy, minDate }: MonthCalendarProps) {
  const days = monthGrid(year, month);
  const today = dayKey(new Date());
  const shift = (n: number) => {
    const d = new Date(year, month + n, 1);
    tap();
    onChangeMonth(d.getFullYear(), d.getMonth());
  };
  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <Pressable hitSlop={12} onPress={() => shift(-1)}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={s.title}>
          {MONTHS[month]} {year}
        </Text>
        <Pressable hitSlop={12} onPress={() => shift(1)}>
          <Ionicons name="chevron-forward" size={22} color={C.text} />
        </Pressable>
      </View>
      <View style={s.week}>
        {WEEKDAYS_SHORT.map((d) => (
          <Text key={d} style={s.weekday}>
            {d[0]}
          </Text>
        ))}
      </View>
      <View style={s.grid}>
        {days.map((d) => {
          const key = dayKey(d);
          const inMonth = d.getMonth() === month;
          const isSel = key === selected;
          const isToday = key === today;
          const disabled = !!minDate && key < minDate;
          const dots = markers[key] ?? [];
          const isBusy = busy?.has(key);
          return (
            <Pressable
              key={key}
              disabled={disabled}
              onPress={() => {
                tap();
                onSelect(key);
              }}
              style={s.cell}>
              <View
                style={[
                  s.day,
                  isBusy && { backgroundColor: C.surface2 },
                  isToday && { borderColor: C.gold, borderWidth: 1 },
                  isSel && { backgroundColor: C.gold },
                ]}>
                <Text
                  style={{
                    color: isSel ? '#1A1206' : disabled ? C.faint : inMonth ? C.text : C.faint,
                    fontWeight: isSel || isToday ? '800' : '500',
                    fontSize: 15,
                    textDecorationLine: disabled ? 'line-through' : 'none',
                  }}>
                  {d.getDate()}
                </Text>
              </View>
              <View style={s.dots}>
                {dots.slice(0, 3).map((c, i) => (
                  <View key={i} style={[s.dot, { backgroundColor: c, opacity: inMonth ? 1 : 0.4 }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  title: { color: C.text, fontSize: 17, fontWeight: '700' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: C.muted, fontSize: 12, fontWeight: '700', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
