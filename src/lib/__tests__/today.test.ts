/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAgenda } from '../agenda';
import { dayKey } from '../dates';
import { buildIcs, icsFileName, icsText } from '../ics';
import { buildSeed, MEMBER_ID, OWNER_ID } from '../seed';
import { assignedTo, dueState } from '../tasks';
import { needsYou } from '../today';
import type { Task } from '../types';

const now = new Date(2026, 10, 19, 12);
const seed = buildSeed(now);
const who = (id: string) => seed.users.find((u) => u.id === id)!;
const card = (over: Partial<Task>): Task => ({ id: 't', title: 'Card', notes: '', status: 'not_started', createdAt: now.toISOString(), updatedAt: now.toISOString(), ...over });

test('a card is overdue before today and due soon within three days', () => {
  const today = dayKey(now); // 2026-11-19
  assert.equal(dueState(card({ dueDate: '2026-11-18' }), today), 'overdue');
  assert.equal(dueState(card({ dueDate: '2026-11-19' }), today), 'soon');
  assert.equal(dueState(card({ dueDate: '2026-11-22' }), today), 'soon');
  assert.equal(dueState(card({ dueDate: '2026-11-23' }), today), undefined);
  assert.equal(dueState(card({ dueDate: '2026-11-01', status: 'completed' }), today), undefined, 'completed cards are never late');
  assert.equal(dueState(card({}), today), undefined);
});

test('assigned to me lists open cards soonest first, then completed ones', () => {
  const tasks = [
    card({ id: 'a', assigneeId: 'me', dueDate: '2026-11-25' }),
    card({ id: 'b', assigneeId: 'me', dueDate: '2026-11-20' }),
    card({ id: 'c', assigneeId: 'me', status: 'completed' }),
    card({ id: 'd', assigneeId: 'someone else' }),
  ];
  const mine = assignedTo(tasks, 'me');
  assert.deepEqual(mine.open.map((t) => t.id), ['b', 'a']);
  assert.deepEqual(mine.completed.map((t) => t.id), ['c']);
});

test('needs you: the owner sees requests and accounts; cast see RSVPs, due cards and announcements', () => {
  const base = { bookings: seed.bookings, linkRequests: [{ authUserId: 'a', personId: 'p', email: 'x@example.com', declined: false, requestedAt: now.toISOString() }], schedule: seed.schedule, productions: seed.productions, announcements: [], now };
  const owner = needsYou({ ...base, user: who(OWNER_ID), tasks: [] });
  assert.ok(owner.some((n) => n.kind === 'account'), 'accounts to confirm');
  assert.ok(owner.some((n) => n.kind === 'request' || n.kind === 'deposit'), 'booking work from the seed');
  assert.deepEqual([...owner].sort((a, b) => a.rank - b.rank), owner, 'most urgent first');

  const tasks = [card({ id: 'late', assigneeId: MEMBER_ID, dueDate: '2026-11-17', title: 'Fix the sleigh' })];
  const maya = needsYou({ ...base, user: who(MEMBER_ID), tasks, announcements: [{ channelId: 'c1', production: 'Elf', unread: 2 }] });
  assert.ok(!maya.some((n) => n.kind === 'account' || n.kind === 'request'), 'cast never see the business');
  assert.equal(maya[0].kind, 'card', 'an overdue card comes first');
  assert.match(maya[0].detail, /^Overdue since Nov 17 · /);
  assert.ok(maya.some((n) => n.kind === 'announcement' && n.title === 'New announcements · Elf'));
  // Maya hasn't answered any calls in the demo: several in two weeks become one line for the show
  const rsvps = maya.filter((x) => x.kind === 'rsvp');
  assert.equal(rsvps.length, 1);
  assert.match(rsvps[0].title, /^RSVP to \d+ calls$/);
  assert.equal(rsvps[0].href, '/production/p_elf?tab=schedule');

  // two or fewer are listed one by one, without the call that has its own card
  const soon = seed.schedule.filter((s) => s.productionId === 'p_elf' && new Date(s.start) > now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3);
  const few = needsYou({ ...base, schedule: soon, user: who(MEMBER_ID), tasks: [], skipCallId: soon[0].id }).filter((n) => n.kind === 'rsvp');
  const calledTo = soon.slice(1).filter((s) => s.groupIds.length === 0 || s.groupIds.includes('g_leads'));
  assert.deepEqual(few.map((n) => n.key), calledTo.map((s) => `rsvp:${s.id}`));
  assert.ok(few.every((n) => n.title.startsWith('RSVP: ')));
});

test('the calendar shows each person their calls, and their cards on the day they are due', () => {
  const maya = who(MEMBER_ID);
  const tasks = [card({ id: 'mine', assigneeId: MEMBER_ID, dueDate: '2026-11-21' }), card({ id: 'theirs', assigneeId: 'u_ben', dueDate: '2026-11-21' })];
  const agenda = buildAgenda({ bookings: seed.bookings, schedule: seed.schedule, productions: seed.productions, performances: seed.performances, tasks, user: maya, now });
  const due = agenda.filter((a) => a.kind === 'task');
  assert.deepEqual(due.map((a) => a.id), ['mine']);
  assert.equal(due[0].allDay, true);
  assert.equal(dayKey(due[0].start), '2026-11-21');
  assert.ok(agenda.some((a) => a.kind === 'rehearsal'), 'Maya sees the calls she is on');
  assert.ok(!agenda.some((a) => a.kind === 'rental' || a.kind === 'unavailable'), 'cast don’t see rentals');

  // a director who rents the theatre (role renter) still sees every call of their show
  const ben = who('u_ben');
  const elfCalls = seed.schedule.filter((s) => s.productionId === seed.productions[0].id).length;
  const bens = buildAgenda({ bookings: [], schedule: seed.schedule, productions: seed.productions, performances: [], user: ben, now }).filter((a) => a.kind === 'rehearsal');
  assert.equal(bens.length, elfCalls);
});

test('a calendar file escapes text and uses UTC times', () => {
  const ics = buildIcs({ uid: 's1', title: 'Act 2, blocking; notes', start: '2026-11-22T23:00:00.000Z', end: '2026-11-23T01:30:00.000Z', location: 'Main Stage', notes: 'Bring scripts\nBe on time' }, now);
  assert.match(ics, /DTSTART:20261122T230000Z\r\n/);
  assert.match(ics, /DTEND:20261123T013000Z\r\n/);
  assert.match(ics, /SUMMARY:Act 2\\, blocking\\; notes\r\n/);
  assert.match(ics, /DESCRIPTION:Bring scripts\\nBe on time\r\n/);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
  assert.ok(ics.split('\r\n').every((l) => l.length <= 75), 'long lines are folded');
  assert.equal(icsText('a\\b'), 'a\\\\b');
  assert.equal(icsFileName({ title: 'Act 2: Blocking!', start: '2026-11-22T23:00:00.000Z' }), 'act-2-blocking-2026-11-22.ics');
});
