/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attendanceCounts, canTakeAttendance, countsLabel, marksFor, rollFor, rollOpen, takesRoll } from '../attendance';
import { buildSeed, MEMBER_ID, OWNER_ID } from '../seed';
import type { Attendance } from '../types';

const now = new Date(2026, 10, 19, 12);
const seed = buildSeed(now);
const elf = seed.productions[0];
const who = (id: string) => seed.users.find((u) => u.id === id)!;

test('directors and the owner take roll for anyone; a Team Lead for the people in their groups', () => {
  const crew = elf.members.find((m) => m.groupIds.includes('g_crew') && !m.groupIds.includes('g_leads') && !m.isDirector)!;
  const lead = elf.members.find((m) => m.groupIds.includes('g_leads') && m.userId !== MEMBER_ID)!;
  assert.equal(canTakeAttendance(who(OWNER_ID), elf, crew.userId), true);
  assert.equal(canTakeAttendance(who('u_ben'), elf, crew.userId), true, 'Ben directs Elf');
  assert.equal(canTakeAttendance(who(MEMBER_ID), elf, lead.userId), true, 'Maya leads the Leads');
  assert.equal(canTakeAttendance(who(MEMBER_ID), elf, crew.userId), false);
  assert.equal(takesRoll(who(MEMBER_ID), elf), true);
  assert.equal(takesRoll(who('u_hannah'), elf), false, 'cast without a lead role don’t take roll');

  const fullCompany = seed.schedule.find((s) => s.productionId === elf.id && s.groupIds.length === 0)!;
  const roll = rollFor(fullCompany, elf, who(MEMBER_ID), seed.users).map((u) => u.id);
  assert.ok(roll.includes(lead.userId) && !roll.includes(crew.userId), 'a lead’s roll is their groups');
  assert.deepEqual([...roll].sort((a, b) => who(a).name.localeCompare(who(b).name)), roll, 'by name');
});

test('roll opens half an hour before a call', () => {
  const start = new Date(2026, 10, 19, 18).toISOString();
  assert.equal(rollOpen({ start }, new Date(2026, 10, 19, 17, 29)), false);
  assert.equal(rollOpen({ start }, new Date(2026, 10, 19, 17, 30)), true);
});

test('a person’s record counts their marks', () => {
  const r = (itemId: string, status: Attendance['status']): Attendance => ({ itemId, userId: 'u', status, note: '', markedAt: now.toISOString() });
  const records = [r('a', 'present'), r('b', 'present'), r('c', 'late'), r('d', 'absent'), { ...r('a', 'late'), userId: 'v' }];
  const c = attendanceCounts(records, 'u');
  assert.deepEqual(c, { present: 2, late: 1, absent: 1, excused: 0, marked: 4 });
  assert.equal(countsLabel(c), '2 present · 1 late · 1 absent');
  assert.equal(attendanceCounts(records, 'u', new Set(['a'])).marked, 1, 'limited to one production’s calls');
  assert.equal(countsLabel(attendanceCounts([], 'u')), undefined);
  assert.equal(marksFor(records, 'a').get('v')?.status, 'late');
});

test('the demo has roll for past calls only, and excuses anyone with a conflict', () => {
  const past = new Set(seed.schedule.filter((s) => new Date(s.end) < now).map((s) => s.id));
  assert.ok(seed.attendance.length > 0);
  assert.ok(seed.attendance.every((a) => past.has(a.itemId)));
  const caleb = seed.attendance.filter((a) => a.userId === 'u_caleb' && a.status === 'excused');
  assert.ok(caleb.length > 0, 'Caleb’s work travel on Nov 17 is excused');
});
