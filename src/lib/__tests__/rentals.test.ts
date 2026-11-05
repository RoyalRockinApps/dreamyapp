/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localIso } from '../dates';
import { normalizeCode, ticketCode } from '../ids';
import { expiryValid, luhnValid, validateCard } from '../payments';
import { amountPaid, depositPaid, outstanding, quoteRental } from '../pricing';
import { bookingBlocksStage, findConflicts, memberConflictsFor, openWindows, stageBusy } from '../scheduling';
import { buildSeed, DEFAULT_SETTINGS } from '../seed';
import type { Booking } from '../types';

const S = DEFAULT_SETTINGS;

test('hourly quote applies the minimum', () => {
  const q = quoteRental(S, { start: localIso(2027, 2, 1, 10), end: localIso(2027, 2, 1, 12), addOnIds: [] });
  assert.equal(q.hours, 2);
  assert.equal(q.rentalTotal, S.minHours * S.hourlyRate);
  assert.equal(q.depositDue, Math.ceil(q.rentalTotal * S.depositPercent) + S.securityDeposit);
  assert.equal(q.balanceDue + (q.depositDue - S.securityDeposit), q.rentalTotal);
});

test('package quote bills overtime and hourly add-ons', () => {
  const q = quoteRental(S, {
    start: localIso(2027, 2, 1, 12),
    end: localIso(2027, 2, 1, 20), // 8h on a 6h package
    packageId: 'pkg_half',
    addOnIds: ['add_sound', 'add_tickets'],
  });
  assert.equal(q.rentalTotal, 850 + 2 * 150 + 8 * 35 + 150);
  assert.equal(q.lines.length, 4);
});

test('balance due date is N days before the event', () => {
  const q = quoteRental(S, { start: localIso(2027, 3, 20, 18), end: localIso(2027, 3, 20, 22), addOnIds: [] });
  const due = new Date(q.balanceDueDate);
  assert.equal(due.getDate(), 6);
  assert.equal(due.getMonth(), 2);
});

test('conflicts honour the turnover buffer', () => {
  const busy = [{ id: 'x', kind: 'booking' as const, title: 'X', start: localIso(2027, 1, 5, 18), end: localIso(2027, 1, 5, 21) }];
  assert.equal(findConflicts(localIso(2027, 1, 5, 21, 30), localIso(2027, 1, 5, 23), busy, 0).length, 0);
  assert.equal(findConflicts(localIso(2027, 1, 5, 21, 30), localIso(2027, 1, 5, 23), busy, 60).length, 1);
  assert.equal(findConflicts(localIso(2027, 1, 5, 9), localIso(2027, 1, 5, 12), busy, 60).length, 0);
});

test('open windows carve out busy time', () => {
  const busy = [{ id: 'x', kind: 'booking' as const, title: 'X', start: localIso(2027, 1, 5, 12), end: localIso(2027, 1, 5, 15) }];
  const w = openWindows('2027-01-05', busy, 0, 8 * 60, 23 * 60);
  assert.equal(w.length, 2);
  assert.equal(w[0].end.getHours(), 12);
  assert.equal(w[1].start.getHours(), 15);
});

test('expired deposit holds release the date; cancelled bookings never block', () => {
  const now = new Date(2026, 10, 5);
  const base = { status: 'awaiting_deposit', holdExpiresAt: new Date(2026, 10, 4).toISOString() } as Booking;
  assert.equal(bookingBlocksStage(base, now), false);
  assert.equal(bookingBlocksStage({ ...base, holdExpiresAt: new Date(2026, 10, 7).toISOString() }, now), true);
  assert.equal(bookingBlocksStage({ ...base, status: 'cancelled' }, now), false);
  assert.equal(bookingBlocksStage({ ...base, status: 'confirmed' }, now), true);
});

test('seed data is internally consistent', () => {
  const seed = buildSeed(new Date(2026, 10, 5));
  // every sold seat has exactly one live ticket
  for (const p of seed.performances) {
    const sold = Object.entries(p.seats).filter(([, c]) => c.status === 'sold').map(([id]) => id);
    const tix = seed.tickets.filter((t) => t.performanceId === p.id).map((t) => t.seatId);
    assert.deepEqual([...sold].sort(), [...tix].sort(), p.id);
  }
  assert.equal(new Set(seed.tickets.map((t) => t.code)).size, seed.tickets.length);
  // the owner's main-stage rehearsals never collide with confirmed rentals
  const confirmed = seed.bookings.filter((b) => b.status === 'confirmed');
  const busy = stageBusy(confirmed, [], new Date(2026, 10, 5));
  for (const s of seed.schedule.filter((x) => x.space === 'Main Stage')) {
    assert.equal(findConflicts(s.start, s.end, busy, 0).length, 0, s.title + ' ' + s.start);
  }
  const reddick = seed.bookings.find((b) => b.id === 'b_reddick')!;
  assert.equal(outstanding(reddick), 0);
  assert.ok(depositPaid(reddick));
  assert.equal(amountPaid(seed.bookings.find((b) => b.id === 'b_recital')!), 0);
});

test('member conflicts surface for called groups only', () => {
  const seed = buildSeed(new Date(2026, 10, 5));
  const elf = seed.productions[0];
  const item = { groupIds: ['g_leads'], start: localIso(2026, 11, 17, 18), end: localIso(2026, 11, 17, 21) };
  assert.deepEqual(memberConflictsFor(item, elf, seed.conflicts).map((c) => c.userId), ['u_caleb']);
  assert.equal(memberConflictsFor({ ...item, groupIds: ['g_crew'] }, elf, seed.conflicts).length, 0);
});

test('card validation', () => {
  assert.ok(luhnValid('4242 4242 4242 4242'));
  assert.ok(!luhnValid('4242 4242 4242 4241'));
  assert.ok(expiryValid('12/30', new Date(2026, 10, 5)));
  assert.ok(!expiryValid('10/26', new Date(2026, 10, 5)));
  assert.ok(expiryValid('11/26', new Date(2026, 10, 5)));
  const errs = validateCard({ name: 'A', number: '4242424242424242', expiry: '12/30', cvc: '123', zip: '35816' }, new Date(2026, 10, 5));
  assert.deepEqual(errs, {});
});

test('ticket codes are readable and normalise from sloppy input', () => {
  const c = ticketCode();
  assert.match(c, /^DT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizeCode(c.toLowerCase().replace(/-/g, ' ')), c);
});
