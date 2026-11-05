import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { MonthCalendar } from '@/components/MonthCalendar';
import { Button, Card, Chips, Divider, Field, KeyValue, Pill, Row, Screen, SectionHeader, Txt, tap } from '@/components/ui';
import { addMinutes, atMinutes, dayKey, fmtDate, fmtMinutes, fmtRange, fmtTime, money } from '@/lib/dates';
import { quoteRental } from '@/lib/pricing';
import { busyDays, findConflicts, stageBusy } from '@/lib/scheduling';
import { EVENT_TYPES, type EventType } from '@/lib/types';
import { useNow } from '@/hooks/useAgenda';
import { useCurrentUser, useStore } from '@/store/useStore';
import { C, R } from '@/theme';

const STEPS = ['Date & time', 'Event', 'Contact', 'Review'];
const START_TIMES = Array.from({ length: 29 }, (_, i) => 8 * 60 + i * 30); // 8:00am – 10:00pm
const HOURLY = 'hourly';

export default function NewBooking() {
  const params = useLocalSearchParams<{ date?: string }>();
  const user = useCurrentUser();
  const isOwner = user.role === 'owner';
  const settings = useStore((s) => s.settings);
  const bookings = useStore((s) => s.bookings);
  const schedule = useStore((s) => s.schedule);
  const createBooking = useStore((s) => s.createBooking);
  const now = useNow(30000);

  const today = dayKey(new Date());
  const initial = params.date && params.date >= today ? params.date : today;
  const [step, setStep] = useState(0);
  const [ym, setYm] = useState(() => {
    const d = atMinutes(initial, 0);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [date, setDate] = useState(initial);
  const [startMin, setStartMin] = useState(17 * 60);
  const [pkg, setPkg] = useState<string>('pkg_half');
  const [hours, setHours] = useState(4);
  const [extra, setExtra] = useState(0);

  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('Concert');
  const [attendance, setAttendance] = useState('');
  const [addOns, setAddOns] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [notes, setNotes] = useState('');

  const [contactName, setContactName] = useState(isOwner ? '' : user.name);
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState(isOwner ? '' : user.email);
  const [phone, setPhone] = useState(isOwner ? '' : user.phone ?? '');
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedPkg = settings.packages.find((p) => p.id === pkg);
  const durationHrs = selectedPkg ? selectedPkg.hours + extra : Math.max(hours, settings.minHours);
  const start = atMinutes(date, startMin);
  const end = addMinutes(start, durationHrs * 60);

  const busy = useMemo(() => stageBusy(bookings, schedule), [bookings, schedule]);
  const fullDays = useMemo(() => busyDays(busy), [busy]);
  const conflicts = findConflicts(start.toISOString(), end.toISOString(), busy, settings.bufferMins);
  const quote = quoteRental(settings, { start: start.toISOString(), end: end.toISOString(), packageId: selectedPkg?.id, addOnIds: addOns });
  const tooSoon = start.getTime() < now.getTime();

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (tooSoon) e.when = 'Pick a time in the future';
      if (conflicts.length) e.when = 'That time overlaps another event';
    }
    if (s === 1) {
      if (!title.trim()) e.title = 'Give your event a name';
      if (!/^\d+$/.test(attendance) || Number(attendance) < 1) e.attendance = 'Estimated audience size';
    }
    if (s === 2) {
      if (!contactName.trim()) e.contactName = 'Required';
      if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Valid email required';
      if (phone.replace(/\D/g, '').length < 10) e.phone = '10-digit phone';
    }
    if (s === 3 && !agree && !isOwner) e.agree = 'Please accept the rental terms';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  const submit = () => {
    const b = createBooking({
      title: title.trim(),
      eventType,
      organization: organization.trim() || undefined,
      contactName: contactName.trim(),
      contactEmail: email.trim(),
      contactPhone: phone.trim(),
      renterId: isOwner ? undefined : user.id,
      start: start.toISOString(),
      end: end.toISOString(),
      attendance: Number(attendance),
      packageId: selectedPkg?.id,
      addOnIds: addOns,
      notes: notes.trim() || undefined,
      ticketed: addOns.includes('add_tickets'),
      isPublic,
      status: isOwner ? 'awaiting_deposit' : undefined,
    });
    if (b.status === 'awaiting_deposit' && !isOwner) {
      router.replace(`/pay?bookingId=${b.id}&kind=deposit` as Href);
    } else {
      router.replace(`/booking/${b.id}`);
      if (!isOwner) Alert.alert('Request sent!', `We'll review "${b.title}" and get back to you shortly. You'll be able to pay the deposit here once it's approved.`);
    }
  };

  const toggleAddOn = (id: string) => setAddOns((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stepper step={step} onJump={(i) => i < step && setStep(i)} />
      <Screen>
        {step === 0 && (
          <>
            <MonthCalendar year={ym.y} month={ym.m} onChangeMonth={(y, m) => setYm({ y, m })} selected={date} onSelect={setDate} busy={fullDays} minDate={today} />
            <Txt v="small">Shaded days already have something booked — partial-day slots may still be open.</Txt>

            <SectionHeader title="Package" />
            <Chips
              options={[HOURLY, ...settings.packages.map((p) => p.id)]}
              value={pkg}
              onChange={(v) => {
                setPkg(v);
                setExtra(0);
              }}
              labels={Object.fromEntries([[HOURLY, `Hourly · ${money(settings.hourlyRate)}/hr`], ...settings.packages.map((p) => [p.id, `${p.name} · ${money(p.price)}`])])}
            />
            {selectedPkg ? <Txt v="small">{`${selectedPkg.hours} hrs · ${selectedPkg.description}`}</Txt> : null}
            <Stepper2
              label={selectedPkg ? 'Extra hours' : 'Hours'}
              value={selectedPkg ? extra : hours}
              min={selectedPkg ? 0 : settings.minHours}
              onChange={(v) => (selectedPkg ? setExtra(v) : setHours(v))}
            />

            <SectionHeader title="Start time (including load-in)" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {START_TIMES.map((m) => {
                const s = atMinutes(date, m);
                const clash = findConflicts(s.toISOString(), addMinutes(s, durationHrs * 60).toISOString(), busy, settings.bufferMins).length > 0;
                const on = m === startMin;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      tap();
                      setStartMin(m);
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: R.md,
                      borderWidth: 1,
                      borderColor: on ? C.gold : C.border,
                      backgroundColor: on ? C.goldSoft : clash ? '#140F24' : C.surface,
                    }}>
                    <Text style={{ color: clash ? C.faint : on ? C.gold : C.text, fontWeight: '700', textDecorationLine: clash ? 'line-through' : 'none' }}>{fmtMinutes(m)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Card accent={conflicts.length || tooSoon ? C.danger : C.green}>
              <Row>
                <Ionicons name={conflicts.length || tooSoon ? 'close-circle' : 'checkmark-circle'} size={22} color={conflicts.length || tooSoon ? C.danger : C.green} />
                <Txt v="h3">{conflicts.length ? 'Not available' : tooSoon ? 'That time has passed' : 'Available!'}</Txt>
              </Row>
              <Txt v="muted">{fmtRange(start.toISOString(), end.toISOString())}</Txt>
              {conflicts.map((c) => (
                <Txt key={c.id} v="small" color={C.danger}>{`Overlaps ${isOwner || c.kind === 'booking' ? (isOwner ? c.title : 'another booking') : 'a reserved block'} (${fmtTime(c.start)}–${fmtTime(c.end)}, +${settings.bufferMins}m turnover)`}</Txt>
              ))}
              <Divider />
              <KeyValue k="Estimated rental" v={money(quote.rentalTotal)} strong />
              {errors.when ? <Txt v="small" color={C.danger}>{errors.when}</Txt> : null}
            </Card>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Event name" value={title} onChangeText={setTitle} placeholder="e.g. Spring Dance Recital" error={errors.title} />
            <Txt v="label">Event type</Txt>
            <Chips options={EVENT_TYPES} value={eventType} onChange={setEventType} />
            <Field label="Expected audience" value={attendance} onChangeText={(t) => setAttendance(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="300" error={errors.attendance} />
            <SectionHeader title="Add-ons" />
            {settings.addOns.map((a) => {
              const on = addOns.includes(a.id);
              return (
                <Card key={a.id} onPress={() => toggleAddOn(a.id)} style={on ? { borderColor: C.gold } : undefined}>
                  <Row>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? C.gold : C.faint} />
                    <Txt v="h3" style={{ flex: 1 }}>{a.name}</Txt>
                    <Txt v="h3" color={C.gold}>{`${money(a.price)}${a.per === 'hour' ? '/hr' : ''}`}</Txt>
                  </Row>
                  <Txt v="small">{a.description}</Txt>
                </Card>
              );
            })}
            <Card>
              <Row>
                <View style={{ flex: 1 }}>
                  <Txt v="h3">List on the public calendar</Txt>
                  <Txt v="small">Show the event name to other visitors of the app.</Txt>
                </View>
                <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: C.gold, false: C.surface2 }} />
              </Row>
            </Card>
            <Field label="Notes for the theatre" value={notes} onChangeText={setNotes} multiline placeholder="Stage needs, rehearsal time, special requests…" />
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Contact name" value={contactName} onChangeText={setContactName} error={errors.contactName} />
            <Field label="Organization (optional)" value={organization} onChangeText={setOrganization} placeholder="Studio, church, school…" />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} />
          </>
        )}

        {step === 3 && (
          <>
            <Card>
              <Txt v="h2">{title}</Txt>
              <Txt v="muted">{fmtRange(start.toISOString(), end.toISOString())}</Txt>
              <Row>
                <Pill label={eventType} />
                <Pill label={`${attendance} guests`} />
              </Row>
            </Card>
            <Card>
              <Txt v="label">Quote</Txt>
              {quote.lines.map((l) => (
                <KeyValue key={l.label} k={l.label} v={money(l.amount, true)} />
              ))}
              <Divider />
              <KeyValue k="Rental total" v={money(quote.rentalTotal, true)} strong />
              <KeyValue k="Refundable security deposit" v={money(quote.securityDeposit, true)} />
              <Divider />
              <KeyValue k="Due to reserve" v={money(quote.depositDue, true)} strong color={C.gold} />
              <KeyValue k={`Balance due by ${fmtDate(quote.balanceDueDate, { year: true })}`} v={money(quote.balanceDue, true)} />
            </Card>
            {!isOwner && (
              <Card onPress={() => setAgree(!agree)} style={errors.agree ? { borderColor: C.danger } : undefined}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? C.gold : C.faint} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Txt v="h3">I agree to the rental terms</Txt>
                    <Txt v="small">{settings.cancellationPolicy}</Txt>
                  </View>
                </Row>
              </Card>
            )}
            <Txt v="small">
              {isOwner
                ? 'This booking will be created as approved and held for the deposit. You can record cash or check payments from the booking page.'
                : settings.autoApprove
                  ? 'Next you’ll pay the reservation deposit to lock in your date.'
                  : 'Your request goes to the theatre owner for approval. Once approved, you can pay the deposit right here in the app.'}
            </Txt>
          </>
        )}
      </Screen>
      <View style={{ flexDirection: 'row', gap: 12, padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg }}>
        {step > 0 && <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />}
        <Button
          title={step < STEPS.length - 1 ? 'Continue' : isOwner ? 'Create booking' : settings.autoApprove ? 'Continue to deposit' : 'Send request'}
          icon={step === STEPS.length - 1 ? 'checkmark' : 'arrow-forward'}
          onPress={next}
          style={{ flex: 2 }}
        />
      </View>
    </View>
  );
}

function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 6 }}>
      {STEPS.map((s, i) => (
        <Pressable key={s} onPress={() => onJump(i)} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= step ? C.gold : C.surface2 }} />
          <Text style={{ color: i === step ? C.gold : C.faint, fontSize: 11, fontWeight: '700' }}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Stepper2({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return (
    <Row style={{ backgroundColor: C.surface, borderRadius: R.md, padding: 10, borderWidth: 1, borderColor: C.border }}>
      <Txt v="h3" style={{ flex: 1 }}>{label}</Txt>
      <Pressable hitSlop={8} onPress={() => value > min && onChange(value - 1)}>
        <Ionicons name="remove-circle" size={30} color={value > min ? C.gold : C.faint} />
      </Pressable>
      <Txt v="h2" style={{ minWidth: 36, textAlign: 'center' }}>{String(value)}</Txt>
      <Pressable hitSlop={8} onPress={() => value < 72 && onChange(value + 1)}>
        <Ionicons name="add-circle" size={30} color={C.gold} />
      </Pressable>
    </Row>
  );
}
