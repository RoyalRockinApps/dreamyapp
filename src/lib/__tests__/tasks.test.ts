/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSeed, MEMBER_ID, OWNER_ID, RENTER_ID } from '../seed';
import { boardPeople, canAddTasks, canManageTask, canSeeBoard, managedGroups, sortTasks, updatesByTask } from '../tasks';

const seed = buildSeed(new Date(2026, 10, 19, 12));
const elf = seed.productions[0];
const who = (id: string) => seed.users.find((u) => u.id === id)!;

test('a show’s board is for its company; the theatre board for owners, staff and theatre Team Leads', () => {
  assert.equal(canSeeBoard(who(MEMBER_ID), elf), true);
  assert.equal(canSeeBoard(who(RENTER_ID), elf), false);
  assert.equal(canSeeBoard(who(OWNER_ID)), true);
  assert.equal(canSeeBoard(who('u_ben')), true, 'Ben is a theatre Team Lead');
  assert.equal(canSeeBoard(who(MEMBER_ID)), false);
  assert.deepEqual(boardPeople(seed.users).map((u) => u.id).sort(), [OWNER_ID, 'u_ben'].sort(), 'theatre cards go to owners and Team Leads');
});

test('directors manage every card; a group’s Team Lead manages that group’s cards', () => {
  assert.equal(managedGroups(who('u_ben'), elf).length, elf.groups.length, 'Ben directs Elf');
  assert.deepEqual(managedGroups(who(MEMBER_ID), elf).map((g) => g.id), ['g_leads']);
  assert.equal(canManageTask(who(MEMBER_ID), elf, 'g_leads'), true);
  assert.equal(canManageTask(who(MEMBER_ID), elf, 'g_crew'), false);
  assert.equal(canManageTask(who(MEMBER_ID), elf), false, 'ungrouped cards are for directors');
  assert.equal(canAddTasks(who(MEMBER_ID), elf), true);
  assert.equal(canAddTasks(who('u_hannah'), elf), false, 'cast without a lead role only read and post updates');
  assert.equal(canManageTask(who('u_ben'), undefined), true);
  assert.equal(canManageTask(who(MEMBER_ID), undefined), false);
});

test('cards sort by due date, and each card knows who posted last', () => {
  const sorted = sortTasks(seed.tasks.filter((t) => t.productionId === elf.id && t.status === 'in_progress'));
  assert.deepEqual(sorted.map((t) => t.id), ['task_blocking', 'task_lights']);
  const latest = updatesByTask(seed.taskUpdates).get('task_lights');
  assert.equal(latest?.count, 2);
  assert.equal(latest?.last.authorName, 'Ben Okafor');
});
