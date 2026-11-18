import { useState } from 'react';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Button, Collapsible } from '@/components/ui';
import { atMinutes, fmtDate } from '@/lib/dates';

export const formatProductionDay = (day: string) => fmtDate(atMinutes(day, 12 * 60), { weekday: true, year: true });

export function ProductionDatePicker({ label, value, onChange, minDate, clearable }: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  minDate?: string;
  clearable?: boolean;
}) {
  const date = value ?? minDate;
  const initial = date ? atMinutes(date, 12 * 60) : new Date();
  const [month, setMonth] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  return (
    <Collapsible title={label} subtitle={value ? formatProductionDay(value) : 'No date set'} icon="calendar-outline">
      <MonthCalendar
        year={month.y}
        month={month.m}
        onChangeMonth={(y, m) => setMonth({ y, m })}
        selected={value || undefined}
        onSelect={onChange}
        minDate={minDate || undefined}
      />
      {clearable && !!value && <Button small variant="ghost" title="Clear date" onPress={() => onChange('')} />}
    </Collapsible>
  );
}

export function ProductionRunFields({ opening, closing, setOpening, setClosing }: {
  opening: string;
  closing: string;
  setOpening: (value: string) => void;
  setClosing: (value: string) => void;
}) {
  return (
    <>
      <ProductionDatePicker label="Opening night" value={opening} onChange={(day) => {
        setOpening(day);
        if (!day || closing < day) setClosing(day);
      }} clearable />
      {!!opening && <ProductionDatePicker label="Final performance date" value={closing} onChange={setClosing} minDate={opening} />}
    </>
  );
}
