/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localIso } from '../dates';
import { PRODUCTION_STATUSES, productionStageLabel, STAGE_FEATURES, STAGE_GUIDE, stageHas, SUGGESTED_MILESTONES, suggestedMilestones, type StageFeature } from '../production';
import { PRODUCTION_STAGES, type Production } from '../types';

const show = (opening?: [number, number, number], closing?: [number, number, number]): Production => ({
  id: 'p_test', title: 'Test', color: '#fff', groups: [], members: [],
  ...(opening ? { openingDate: localIso(...opening, 19, 0) } : {}),
  ...(closing ? { closingDate: localIso(...closing, 19, 0) } : {}),
});

test('stages run Concept to Wrap, numbered from 1, then Completed', () => {
  assert.deepEqual([...PRODUCTION_STATUSES], ['concept', 'casting', 'preparation', 'tech', 'performances', 'wrap', 'completed']);
  assert.equal(productionStageLabel('concept'), 'Stage 1 · Concept');
  assert.equal(productionStageLabel('tech'), 'Stage 4 · Tech & dress');
  assert.equal(productionStageLabel('wrap'), 'Stage 6 · Wrap');
  assert.equal(productionStageLabel('completed'), 'Completed');
  for (const stage of PRODUCTION_STAGES) {
    assert.ok(STAGE_GUIDE[stage], `${stage} has a guide`);
    assert.ok(SUGGESTED_MILESTONES[stage].length > 0, `${stage} has suggestions`);
  }
});

test('suggested milestones are dated from the run, and past dates are left off', () => {
  const p = show([2027, 5, 1], [2027, 5, 9]);
  const concept = suggestedMilestones('concept', p, '2026-01-01');
  assert.deepEqual(concept[0], { stage: 'concept', title: 'Performance rights secured', dueDate: '2027-01-01' }, '120 days before opening');
  const wrap = suggestedMilestones('wrap', p, '2026-01-01');
  assert.equal(wrap.find((m) => m.title === 'Strike')?.dueDate, '2027-05-10', 'the day after closing');
  const performances = suggestedMilestones('performances', p, '2026-01-01');
  assert.deepEqual(performances.map((m) => m.dueDate), ['2027-05-01', '2027-05-09']);

  const lateStart = suggestedMilestones('concept', p, '2027-04-01');
  assert.ok(lateStart.every((m) => m.dueDate === undefined), 'a show already under way gets no overdue suggestions');
  assert.ok(suggestedMilestones('casting', show(), '2026-01-01').every((m) => m.dueDate === undefined), 'no run dates, no due dates');
});

test('each stage reveals only its own tools', () => {
  const stagesWith = (f: StageFeature) => PRODUCTION_STATUSES.filter((s) => stageHas(s, f));
  assert.deepEqual(stagesWith('conceptWorkspace'), ['concept']);
  assert.deepEqual(stagesWith('auditions'), ['casting'], 'auditions open and close with Casting');
  assert.deepEqual(stagesWith('pitch'), ['concept', 'casting']);
  assert.deepEqual(stagesWith('conflicts'), ['preparation', 'tech', 'performances'], 'conflicts while there are rehearsals and shows');
  assert.deepEqual(stagesWith('attendance'), ['preparation', 'tech', 'performances', 'wrap'], 'roll from the first rehearsal to strike');
  assert.deepEqual(stagesWith('tickets'), ['preparation', 'tech', 'performances', 'wrap', 'completed'], 'sales from the day tickets go on sale');
  assert.deepEqual(stagesWith('addPerformances'), ['preparation', 'tech', 'performances']);
  assert.deepEqual(stagesWith('milestones'), [...PRODUCTION_STAGES], 'every working stage has its own milestones');
  assert.deepEqual(STAGE_FEATURES.completed, ['tickets'], 'a finished show is a record: just how it sold');
});
