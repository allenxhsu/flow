// Flow's list is Planner's Today — the same tasks, in the same order.
//
// Flow used to show the open backlog sorted alphabetically. On a real planner
// that is hundreds of tasks going back years: coursework due in 2024 sat
// above the call at 9:30 this morning. Planner publishes the day its calendar
// laid (its model/dayplan.js), and Flow shows that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannerDay, AGENDA_TYPE } from '../../src/planner.js';
import { DEFAULT_STATS } from '../../src/model.js';

const ME = 'Allen Xu';
const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));
const DAY = '2026-09-28';
const NOW = Date.parse('2026-09-28T12:00:00');

const ptask = (fields) => ({
  name: 'New task', level: 1, duration: 1, milestone: false, work: 1, percent: 0, urgency: 'normal',
  deadline: null, archived: false, stageId: null, assignments: [], ...fields,
});

/** A plan as Planner syncs it. */
const plan = (id, name, tasks) => ({
  id, type: 'document', format: 'project-planner', name, deletedAt: null, updatedAt: 1,
  body: JSON.stringify({ id, name, tasks, resources: [], timesheets: [], format: 'project-planner', version: 1 }),
});

/** The day, as Planner publishes it. */
const agenda = (tasks) => ({ id: `agenda_${DAY}`, type: AGENDA_TYPE, day: DAY, person: ME, tasks, deletedAt: null, updatedAt: 1 });

const RECORDS = [
  plan('alcon', 'Alcon', [ptask({ id: 'call_aris', name: 'Call Aris on Schedule' })]),
  plan('l3', 'L3 Harris', [ptask({ id: 'rotary', name: 'Other Rotary Designs' }), ptask({ id: 'bruce', name: 'Discuss with Bruce on Rotary Design' })]),
  plan('blue', 'Blue Origin', [ptask({ id: 'reimburse', name: 'Reimbursement' })]),
  // The 2024 coursework that used to sort to the top of Flow's list.
  plan('cs605', 'CS605.202 - Data Structure', [
    ptask({ id: 'assignment13', name: '- Assignment 13', deadline: '2024-11-22' }),
    ptask({ id: 'final', name: '- Final', deadline: '2024-12-13' }),
  ]),
];

const opts = { me: ME, skills: [], stats: STATS, now: NOW };

test("Flow's day is Planner's day, in Planner's order", () => {
  const day = plannerDay([...RECORDS, agenda([
    { plan: 'alcon', task: 'call_aris', start: 585, minutes: 60 },
    { plan: 'l3', task: 'rotary', start: 645, minutes: 58 },
    { plan: 'blue', task: 'reimburse', start: 690, minutes: 30 },
    { plan: 'l3', task: 'bruce', start: 850, minutes: 120 },
  ])], DAY, opts);

  assert.deepEqual(day.map((t) => t.title), [
    'Call Aris on Schedule', 'Other Rotary Designs', 'Reimbursement', 'Discuss with Bruce on Rotary Design',
  ]);
  assert.deepEqual(day.map((t) => t.laidAt), [585, 645, 690, 850], 'the minute each was laid at');
  assert.equal(day[1].laidMinutes, 58);
});

test('nothing the day does not name — the 2024 backlog stays out', () => {
  const day = plannerDay([...RECORDS, agenda([{ plan: 'alcon', task: 'call_aris', start: 585, minutes: 60 }])], DAY, opts);
  assert.deepEqual(day.map((t) => t.title), ['Call Aris on Schedule']);
  assert.ok(!day.some((t) => t.title.includes('Assignment')), 'coursework due in 2024 is not today');
});

test('a day Planner has not published is null, not empty', () => {
  // The caller falls back to the backlog rather than showing an empty screen.
  assert.equal(plannerDay(RECORDS, DAY, opts), null);
  assert.deepEqual(plannerDay([...RECORDS, agenda([])], DAY, opts), [], 'published and empty is a real answer');
});

test('a day naming a task this player cannot see skips it rather than breaking', () => {
  const day = plannerDay([...RECORDS, agenda([
    { plan: 'alcon', task: 'call_aris', start: 585, minutes: 60 },
    { plan: 'gone', task: 'nowhere', start: 600, minutes: 30 },
  ])], DAY, opts);
  assert.deepEqual(day.map((t) => t.title), ['Call Aris on Schedule']);
});

test('a deleted day record is ignored', () => {
  const dead = { ...agenda([{ plan: 'alcon', task: 'call_aris', start: 585, minutes: 60 }]), deletedAt: 2 };
  assert.equal(plannerDay([...RECORDS, dead], DAY, opts), null);
});

test("another day's record is not today's", () => {
  const other = { ...agenda([{ plan: 'alcon', task: 'call_aris', start: 1, minutes: 5 }]), id: 'agenda_2026-09-29', day: '2026-09-29' };
  assert.equal(plannerDay([...RECORDS, other], DAY, opts), null);
  assert.equal(plannerDay([...RECORDS, other], '2026-09-29', opts).length, 1);
});
