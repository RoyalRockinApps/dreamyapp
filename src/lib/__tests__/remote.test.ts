/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAgenda } from '../agenda';
import * as R from '../remote/rows';
import { stageBusy } from '../scheduling';
import { buildSeed, RENTER_ID } from '../seed';

const seed = buildSeed(new Date(2026, 10, 5, 12));

/** What PostgREST sends back: timestamps with +00:00, numerics possibly as strings. */
const pgTime = (iso: string) => iso.replace('.000Z', '+00:00');
/** Compare as JSON: an absent field and an undefined one are the same to the app. */
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

test('bookings survive the trip to the database and back', () => {
  for (const b of seed.bookings) {
    const row = R.fromBooking(b) as R.BookingRow;
    for (const k of ['starts_at', 'ends_at', 'created_at'] as const) row[k] = pgTime(row[k]);
    const payments: R.PaymentRow[] = b.payments.map((p) => ({ id: p.id, booking_id: b.id, amount: String(p.amount), kind: p.kind, method: p.method, reference: p.reference ?? null, at: pgTime(p.at) }));
    const back = R.toBooking(row, payments);
    assert.deepEqual(json(back), json(b), b.id);
  }
});

test('booking updates only send the fields that changed', () => {
  assert.deepEqual(R.fromBooking({ status: 'confirmed', holdExpiresAt: undefined }), { status: 'confirmed', hold_expires_at: null });
});

test('productions rebuild their company from membership rows', () => {
  const elf = seed.productions[0];
  const members = elf.members.map((m) => R.fromMembership(elf.id, m));
  const back = R.toProduction(R.fromProduction(elf) as R.ProductionRow, [...members, { production_id: 'other', person_id: 'x', group_ids: [], part: null, is_director: false }]);
  assert.deepEqual(back, JSON.parse(JSON.stringify(elf)));
});

test('schedule items rebuild their RSVPs', () => {
  const item = seed.schedule.find((s) => Object.keys(s.rsvps).length)!;
  const rsvps: R.RsvpRow[] = Object.entries(item.rsvps).map(([person_id, answer]) => ({ item_id: item.id, person_id, answer }));
  const { rsvps: _r, ...rest } = item;
  assert.deepEqual(R.toScheduleItem(R.fromScheduleItem(rest), rsvps), JSON.parse(JSON.stringify(item)));
});

test('seat claims become the seat map the seat picker uses', () => {
  const p = seed.performances[0];
  const rows: R.SeatClaimRow[] = Object.entries(p.seats).map(([seat_id, c]) => ({
    performance_id: p.id, seat_id, status: c.status, holder_id: c.holderId ?? null, hold_expires_at: c.holdExpiresAt ?? null, order_id: c.orderId ?? null, note: c.note ?? null,
  }));
  const { seats: _s, ...fields } = p;
  assert.deepEqual(json(R.toPerformance(R.fromPerformance(fields) as R.PerformanceRow, rows)), json(p));
});

test('channels, messages, orders and tickets map cleanly', () => {
  for (const c of seed.channels) assert.deepEqual(R.toChannel(R.fromChannel(c)), c);
  const m = seed.messages[0];
  assert.deepEqual(R.toMessage({ id: m.id, channel_id: m.channelId, person_id: m.userId, body: m.text, at: pgTime(m.at) }), m);
  const t = seed.tickets[0];
  assert.deepEqual(R.toTicket({ id: t.id, order_id: t.orderId, performance_id: t.performanceId, seat_id: t.seatId, code: t.code, price: String(t.price), checked_in_at: null, void: false }), t);
  const o = seed.orders[0];
  assert.equal(R.toOrder({ id: o.id, performance_id: o.performanceId, seat_ids: o.seatIds, buyer_id: null, buyer_name: o.buyerName, buyer_email: o.buyerEmail, subtotal: '44.00', fees: '3.00', total: '47.00', method: 'card', refunded: false, at: pgTime(o.at) }).total, 47);
});

test('someone else’s booking still blocks the stage but shows as Reserved', () => {
  const other = seed.bookings.find((b) => b.renterId !== RENTER_ID && b.status === 'confirmed')!;
  const stub = R.busyToBooking({
    kind: 'booking', id: other.id, title: 'Reserved', starts_at: pgTime(other.start), ends_at: pgTime(other.end),
    status: other.status, hold_expires_at: null, is_public: false, production_id: null, space: null,
  });
  assert.equal(stub.renterId, undefined);
  assert.equal(stub.contactEmail, '');
  assert.ok(stageBusy([stub], [], new Date(2026, 10, 5)).some((x) => x.id === other.id));
  const renter = seed.users.find((u) => u.id === RENTER_ID)!;
  const agenda = buildAgenda({ bookings: [stub], schedule: [], productions: [], performances: [], user: renter, now: new Date(2026, 10, 5) });
  assert.deepEqual(agenda.map((a) => [a.kind, a.title]), [['unavailable', 'Reserved']]);
});

test('server seat errors are turned back into seat ids', () => {
  assert.deepEqual(R.unavailableSeats('seats_unavailable: F-C7, F-C8'), ['F-C7', 'F-C8']);
  assert.deepEqual(R.unavailableSeats('seats_unavailable: someone else just took one of these seats'), []);
  assert.equal(R.unavailableSeats('Limit 10 seats per order.'), null);
});
