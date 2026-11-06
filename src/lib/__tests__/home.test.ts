/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_LAYOUT, MAX_SHORTCUTS, moveItem, normalizeLayout, WIDGETS, type HomeLayout } from '../home';

test('missing layout falls back to the role default', () => {
  assert.deepEqual(normalizeLayout('owner', undefined), DEFAULT_LAYOUT.owner);
  assert.deepEqual(normalizeLayout('member', undefined), DEFAULT_LAYOUT.member);
});

test('defaults only use widgets that exist for the role', () => {
  for (const role of ['owner', 'renter', 'member'] as const) {
    for (const w of DEFAULT_LAYOUT[role].widgets) assert.ok((WIDGETS[role] as readonly string[]).includes(w), `${role}:${w}`);
  }
});

test('normalize drops unknown, duplicate and wrong-role entries and caps shortcuts', () => {
  const messy = {
    widgets: ['money', 'nextCall', 'money', 'bogus', 'needs'],
    shortcuts: ['booking', 'booking', 'admin', 'calendar', 'rentals', 'shows', 'nope'],
  } as unknown as HomeLayout;
  const n = normalizeLayout('owner', messy);
  assert.deepEqual(n.widgets, ['money', 'needs']);
  assert.equal(n.shortcuts.length, MAX_SHORTCUTS);
  assert.deepEqual(n.shortcuts, ['booking', 'admin', 'calendar', 'rentals']);
});

test('moveItem reorders and ignores moves past the ends', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  const same = ['a', 'b'];
  assert.equal(moveItem(same, 0, -1), same);
  assert.equal(moveItem(same, 1, 1), same);
});
