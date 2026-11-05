import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AgendaRow } from '@/components/AgendaRow';
import { MonthCalendar } from '@/components/MonthCalendar';
import { Button, Card, Pill, Row, Screen, SectionHeader, Txt } from '@/components/ui';
import { KIND_COLOR, KIND_LABEL, useAgenda } from '@/hooks/useAgenda';
import { agendaByDay } from '@/lib/agenda';
import { atMinutes, dayKey, fmtDate, fmtTime } from '@/lib/dates';
import { openWindows, stageBusy } from '@/lib/scheduling';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C } from '@/theme';

export default function CalendarScreen() {
  const user = useCurrentUser();
  const isOwner = user.role === 'owner';
  const agenda = useAgenda();
  const bookings = useStore((s) => s.bookings);
  const schedule = useStore((s) => s.schedule);
  const bufferMins = useStore((s) => s.settings.bufferMins);
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(dayKey(today));

  const byDay = useMemo(() => agendaByDay(agenda), [agenda]);
  const markers = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [k, items] of Object.entries(byDay)) out[k] = [...new Set(items.map((i) => KIND_COLOR[i.kind]))];
    return out;
  }, [byDay]);

  const dayItems = byDay[selected] ?? [];
  const windows = useMemo(() => openWindows(selected, stageBusy(bookings, schedule), bufferMins), [selected, bookings, schedule, bufferMins]);
  const isPast = selected < dayKey(today);
  const kinds = isOwner ? (['rental', 'tentative', 'rehearsal', 'performance'] as const) : (['rental', 'tentative', 'unavailable', 'performance'] as const);

  return (
    <Screen>
      <MonthCalendar
        year={ym.y}
        month={ym.m}
        onChangeMonth={(y, m) => setYm({ y, m })}
        selected={selected}
        onSelect={setSelected}
        markers={markers}
      />
      <Row style={{ flexWrap: 'wrap' }}>
        {kinds.map((k) => (
          <Pill key={k} label={KIND_LABEL[k]} color={KIND_COLOR[k]} bg={KIND_COLOR[k] + '22'} />
        ))}
      </Row>

      <SectionHeader title={fmtDate(atMinutes(selected, 0), { weekday: true, year: true })} />
      {dayItems.length === 0 && <Txt v="muted">Nothing on the books — the stage is open.</Txt>}
      {dayItems.map((it) => (
        <AgendaRow key={it.id} item={it} showDate={false} />
      ))}

      {!isPast && (
        <Card>
          <Txt v="label">Stage availability</Txt>
          {windows.length === 0 ? (
            <Txt v="muted">Fully booked (includes a {bufferMins}-minute turnover buffer).</Txt>
          ) : (
            <Row style={{ flexWrap: 'wrap' }}>
              {windows.map((w) => (
                <Pill key={w.start.toISOString()} icon="time-outline" label={`${fmtTime(w.start)} – ${fmtTime(w.end)}`} color={C.green} bg={C.greenSoft} />
              ))}
            </Row>
          )}
          <View style={{ gap: 8, marginTop: 4 }}>
            {windows.length > 0 && (
              <Button icon="add" title={isOwner ? 'New booking on this day' : 'Request this date'} onPress={() => router.push(`/booking/new?date=${selected}` as Href)} />
            )}
            {isOwner && (
              <Button icon="musical-notes" variant="secondary" title="Schedule a rehearsal" onPress={() => router.push(`/rehearsal/edit?date=${selected}` as Href)} />
            )}
          </View>
        </Card>
      )}
    </Screen>
  );
}
