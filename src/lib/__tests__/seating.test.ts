/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bestAvailable,
  buildLayout,
  commitSale,
  holdSeats,
  orderTotals,
  orphanedSeats,
  releaseHolds,
  releaseSeats,
  seatAvailability,
  SeatUnavailableError,
  seatsAreTogether,
  setBlocked,
  salesSummary,
} from '../seating';
import type { SeatClaim } from '../types';

const now = new Date('2026-12-01T18:00:00Z');
const later = (min: number) => new Date(now.getTime() + min * 60000);

test('layout has unique seat ids and accessible spaces', () => {
  const seats = buildLayout();
  assert.equal(new Set(seats.map((s) => s.id)).size, seats.length);
  assert.equal(seats.length, 16 * 28);
  assert.ok(seats.filter((s) => s.accessible).every((s) => s.tier === 'accessible'));
});

test('sold seats are auto-blocked: cannot be held or sold again', () => {
  let claims: Record<string, SeatClaim> = {};
  claims = commitSale(claims, ['A-C1', 'A-C2'], 'buyer1', 'o1', now);
  assert.equal(seatAvailability(claims, 'A-C1', 'buyer2', now), 'sold');
  assert.throws(() => holdSeats(claims, ['A-C2'], 'buyer2', now), SeatUnavailableError);
  assert.throws(() => commitSale(claims, ['A-C3', 'A-C1'], 'buyer2', 'o2', now), (e: unknown) => {
    assert.ok(e instanceof SeatUnavailableError);
    assert.deepEqual((e as SeatUnavailableError).seatIds, ["A-C1"]);
    return true;
  });
  // the failed sale was atomic: A-C3 is still open
  assert.equal(seatAvailability(claims, 'A-C3', 'buyer2', now), 'available');
});

test('holds block other buyers until they expire', () => {
  let claims = holdSeats({}, ['B-C5'], 'alice', now, 8);
  assert.equal(seatAvailability(claims, 'B-C5', 'alice', now), 'mine');
  assert.equal(seatAvailability(claims, 'B-C5', 'bob', now), 'held');
  assert.throws(() => commitSale(claims, ['B-C5'], 'bob', 'o', now));
  // after expiry bob can take it
  assert.equal(seatAvailability(claims, 'B-C5', 'bob', later(9)), 'available');
  claims = commitSale(claims, ['B-C5'], 'bob', 'o', later(9));
  assert.equal(claims['B-C5'].status, 'sold');
});

test('holder can buy their own held seats and release holds', () => {
  let claims = holdSeats({}, ['C-C1', 'C-C2'], 'alice', now);
  claims = releaseHolds(claims, 'alice', ['C-C2']);
  assert.equal(seatAvailability(claims, 'C-C2', 'bob', now), 'available');
  claims = commitSale(claims, ['C-C1'], 'alice', 'o', now);
  assert.equal(claims['C-C1'].status, 'sold');
});

test('blocking never overrides a sale; refunds free the seat', () => {
  let claims = commitSale({}, ['D-L1'], 'a', 'o', now);
  claims = setBlocked(claims, ['D-L1', 'D-L2'], true, 'house');
  assert.equal(claims['D-L1'].status, 'sold');
  assert.equal(claims['D-L2'].status, 'blocked');
  assert.equal(seatAvailability(claims, 'D-L2', 'x', now), 'blocked');
  claims = releaseSeats(claims, ['D-L1']);
  assert.equal(seatAvailability(claims, 'D-L1', 'x', now), 'available');
  claims = setBlocked(claims, ['D-L2'], false);
  assert.equal(claims['D-L2'], undefined);
});

test('rejects duplicate and unknown seats', () => {
  assert.throws(() => commitSale({}, ['A-C1', 'A-C1'], 'a', 'o', now));
  assert.throws(() => commitSale({}, ['Z-C99'], 'a', 'o', now), SeatUnavailableError);
});

test('orphan detection flags a single stranded seat', () => {
  // L section has 7 seats. Sell L1, then select L3 -> L2 stranded
  const claims = commitSale({}, ['E-L1'], 'a', 'o', now);
  assert.deepEqual(orphanedSeats(claims, ['E-L3'], 'b', now), ['E-L2']);
  assert.deepEqual(orphanedSeats(claims, ['E-L2', 'E-L3'], 'b', now), []);
  // picking seat 2 next to the aisle seat 1 empty -> seat 1 stranded against the aisle
  assert.deepEqual(orphanedSeats({}, ['E-L2'], 'b', now), ['E-L1']);
});

test('best available returns adjacent center seats near the sweet spot', () => {
  const ids = bestAvailable({}, 4, 'a', now)!;
  assert.equal(ids.length, 4);
  assert.ok(seatsAreTogether(ids));
  assert.ok(ids.every((id) => id.startsWith('F-C')));
});

test('best available skips sold seats and respects tier filter', () => {
  let claims: Record<string, SeatClaim> = {};
  const fRow = buildLayout().filter((s) => s.row === 'F' && s.section === 'C').map((s) => s.id);
  claims = commitSale(claims, fRow, 'x', 'o', now);
  const ids = bestAvailable(claims, 2, 'a', now)!;
  assert.ok(ids.every((id) => !id.startsWith('F-')));
  const value = bestAvailable(claims, 2, 'a', now, { tier: 'value' })!;
  assert.ok(value.every((id) => ['N', 'O', 'P'].includes(id[0])));
});

test('seatsAreTogether detects gaps and different rows', () => {
  assert.ok(seatsAreTogether(['A-C1', 'A-C2', 'A-C3']));
  assert.ok(!seatsAreTogether(['A-C1', 'A-C3']));
  assert.ok(!seatsAreTogether(['A-C1', 'B-C2']));
});

test('order totals and sales summary', () => {
  const prices = { premium: 30, standard: 20, value: 10, accessible: 10 };
  const t = orderTotals(['F-C5', 'A-L1', 'P-L2'], prices, 1.5);
  assert.deepEqual(t, { subtotal: 60, fees: 4.5, total: 64.5 });
  let claims = commitSale({}, ['A-C1', 'A-C2'], 'a', 'o', now);
  claims = setBlocked(claims, ['A-C3'], true);
  claims = holdSeats(claims, ['A-C4'], 'h', now);
  const s = salesSummary(claims, now);
  assert.equal(s.sold, 2);
  assert.equal(s.blocked, 1);
  assert.equal(s.held, 1);
  assert.equal(s.available, s.capacity - 4);
});

test('house layout is configurable and protects sold seats', async () => {
  const { claimsOutside, configureHouse, DEFAULT_HOUSE, layoutFor } = await import('../seating');
  const small = { ...DEFAULT_HOUSE, rows: ['A', 'B', 'C'], sectionWidths: { L: 2, C: 4, R: 2 }, accessibleSeats: ['C-C1'] };
  assert.equal(layoutFor(small).length, 3 * 8);
  assert.equal(layoutFor(small).find((s) => s.id === 'C-C1')?.tier, 'accessible');
  const sold = commitSale({}, ['F-C9'], 'a', 'o', now);
  assert.deepEqual(claimsOutside(small, [sold]), ['F-C9']);
  assert.deepEqual(claimsOutside(DEFAULT_HOUSE, [sold]), []);
  // expired/active holds don't block a layout change
  assert.deepEqual(claimsOutside(small, [holdSeats({}, ['F-C9'], 'a', now)]), []);
  configureHouse(small);
  try {
    assert.equal(buildLayout().length, 24);
    assert.throws(() => commitSale({}, ['F-C9'], 'a', 'o', now), SeatUnavailableError);
  } finally {
    configureHouse(DEFAULT_HOUSE);
  }
  assert.equal(buildLayout().length, 448);
});
