import { Platform } from 'react-native';

import { alert } from '@/components/alert';
import { Button } from '@/components/ui';
import { buildIcs, icsFileName, type CalendarEventInput } from '@/lib/ics';
import type { Production, ScheduleItem } from '@/lib/types';
import { useStore } from '@/store/useStore';

/** What goes in someone's calendar for a call: "Act 2 blocking · Elf", at the theatre, with the call's notes. */
export function callEvent(item: ScheduleItem, production: Production | undefined, venue: { name: string; address: string }): CalendarEventInput {
  return {
    uid: item.id,
    title: production ? `${item.title} · ${production.title}` : item.title,
    start: item.start,
    end: item.end,
    location: `${venue.name}, ${item.space} · ${venue.address}`,
    notes: [item.kind, item.notes].filter(Boolean).join('\n'),
  };
}

/**
 * Opens the phone's own "new event" screen, filled in, so the person can save it to their calendar.
 * On the website it downloads a calendar file instead.
 */
export async function addToCalendar(e: CalendarEventInput): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(e);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  // loaded only on phones: the module has no web version
  const Calendar = await import('expo-calendar/legacy');
  const event = { title: e.title, startDate: new Date(e.start), endDate: new Date(e.end), location: e.location ?? null, notes: e.notes ?? '' };
  try {
    await Calendar.createEventInCalendarAsync(event);
  } catch {
    // iOS before 17 needs calendar access before it shows the screen
    const { granted } = await Calendar.requestCalendarPermissionsAsync();
    if (!granted) throw new Error('Allow calendar access for Dream Theatre in Settings to add events.');
    await Calendar.createEventInCalendarAsync(event);
  }
}

export function AddToCalendar({ item, production, small = true }: { item: ScheduleItem; production?: Production; small?: boolean }) {
  const venue = useStore((s) => s.venue);
  return (
    <Button
      small={small}
      variant="ghost"
      icon="calendar-outline"
      title={Platform.OS === 'web' ? 'Download for my calendar' : 'Add to my calendar'}
      onPress={() => void addToCalendar(callEvent(item, production, venue)).catch((err) => alert('Couldn’t add it to your calendar', err instanceof Error ? err.message : String(err)))}
    />
  );
}
