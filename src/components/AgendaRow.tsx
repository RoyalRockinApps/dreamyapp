import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { KIND_COLOR, KIND_LABEL } from '@/hooks/useAgenda';
import type { AgendaItem } from '@/lib/agenda';
import { fmtDate, fmtTime, relativeDay, sameDay } from '@/lib/dates';
import { C, R } from '@/theme';
import { Pill, Txt } from './ui';

export function AgendaRow({ item, showDate = true }: { item: AgendaItem; showDate?: boolean }) {
  const color = KIND_COLOR[item.kind];
  const multi = !sameDay(item.start, item.end) && new Date(item.end).getTime() - new Date(item.start).getTime() > 12 * 3600000;
  return (
    <Pressable
      disabled={!item.href}
      onPress={() => item.href && router.push(item.href as Href)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        backgroundColor: C.surface,
        borderRadius: R.md,
        padding: 12,
        borderWidth: 1,
        borderColor: C.border,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ width: 4, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: 64 }}>
        {showDate && <Txt v="small" color={C.accent}>{relativeDay(item.start)}</Txt>}
        <Txt v="h3">{fmtTime(item.start)}</Txt>
        <Txt v="small">{multi ? `→ ${fmtDate(item.end)}` : `to ${fmtTime(item.end)}`}</Txt>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt v="h3" numberOfLines={2}>{item.title}</Txt>
        {item.subtitle ? <Txt v="small" numberOfLines={1}>{item.subtitle}</Txt> : null}
        <Pill label={KIND_LABEL[item.kind]} color={color} bg={color + '22'} />
      </View>
    </Pressable>
  );
}
