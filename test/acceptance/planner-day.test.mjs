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
  // plannerDay still reports it faithfully — the caller decides what to do.
  assert.deepEqual(plannerDay([...RECORDS, agenda([])], DAY, opts), [], 'published and empty is reported as empty');
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

test('an empty published day is a day with nothing on it, not a missing day', () => {
  // This assertion used to say the opposite, and it was wrong. Flow fell back
  // to the whole backlog whenever the day named nothing, so at 8 pm — when
  // Planner had rolled the rest of the day to tomorrow and published an empty
  // today, truthfully — 403 Planner tasks going back to 2024 came back. An
  // empty day is a real answer. Only a day Planner has never published (null)
  // is "I do not know", and only that falls back.
  const empty = plannerDay([...RECORDS, agenda([])], DAY, opts);
  assert.deepEqual(empty, [], 'published and empty');
  assert.equal(plannerDay(RECORDS, DAY, opts), null, 'never published');
});

// ── catching up earns nothing ───────────────────────────────────────────────
// Ninety-one tasks ticked off in Planner one morning arrived in Flow as ninety
// -one completions, 2,943 points and two levels. Planner had already stopped
// listing them under "Completed today"; Flow has to stop paying for them.
import { caughtUpFinishes, CAUGHT_UP_DAYS } from '../../src/planner.js';

const at = (h, m) => Date.parse(`2026-09-28T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
const fin = (id, doneAt, deadline = null) => ({ task: { id, deadline }, doneAt });

test('a finish long after its deadline is catching up', () => {
  const old = Date.parse('2025-03-01T00:00:00');
  const hit = caughtUpFinishes([fin('a', at(9, 3), '2025-03-01'), fin('b', at(14, 0), '2026-09-20')]);
  assert.equal(hit.has('a'), true, 'eighteen months overdue');
  assert.equal(hit.has('b'), false, 'last week is real work');
  void old;
});

test('a burst is catching up whatever the deadlines say', () => {
  // The actual shape: nineteen ticks between 9:03 and 9:07, deadlines recent.
  const burst = Array.from({ length: 19 }, (_, i) => fin(`t${i}`, at(9, 3) + i * 12000, '2026-09-20'));
  const hit = caughtUpFinishes(burst);
  assert.equal(hit.size, 19, 'every tick in the run, recent deadlines and all');
});

test('a real day of work is paid for', () => {
  const day = [fin('a', at(9, 36), null), fin('b', at(9, 37), null), fin('c', at(10, 21), null)];
  assert.equal(caughtUpFinishes(day).size, 0, 'three things finished across a morning');
});

test('the boundary is six months, and no deadline is never catching up', () => {
  const day = Date.parse('2026-09-28T09:00:00');
  const just = new Date(day - (CAUGHT_UP_DAYS - 1) * 86400000).toISOString().slice(0, 10);
  const over = new Date(day - (CAUGHT_UP_DAYS + 2) * 86400000).toISOString().slice(0, 10);
  assert.equal(caughtUpFinishes([fin('x', day, just)]).has('x'), false);
  assert.equal(caughtUpFinishes([fin('y', day, over)]).has('y'), true);
  assert.equal(caughtUpFinishes([fin('z', day, null)]).has('z'), false, 'nothing says it is old');
});

// ─── everywhere, not only the Tasks screen ─────────────────────────────────
// SPEC.md › Planner tasks › Today is Planner's Today: "not on Now, not in
// Tasks, not in Play's Start menu, not in the Terminal, and the picker never
// suggests it". The Play menu kept offering the 2024 coursework long after
// the Tasks screen stopped, because the filter lived in the Tasks screen.
import { play, index } from '../../src/model.js';
import { plannerTasks, projectList } from '../../src/planner.js';
import { menuTasks } from '../../src/game/actions.js';

/** A Flow db holding derived Planner tasks, two of them laid on today. */
function world() {
  const on = [{ plan: 'alcon', task: 'call_aris', start: 585, minutes: 60 }, { plan: 'l3', task: 'rotary', start: 645, minutes: 58 }];
  const records = [...RECORDS, agenda(on)];
  const { tasks, skills } = plannerTasks(records, opts);
  const laid = new Map(plannerDay(records, DAY, opts).map((t) => [t.id, t]));
  const derived = tasks.map((t) => (laid.has(t.id)
    ? { ...t, laidAt: laid.get(t.id).laidAt, laidMinutes: laid.get(t.id).laidMinutes }
    : { ...t, offToday: true }));
  return index([...STATS, ...skills, ...derived]);
}

test("nothing off the day is offered: the model's task list, the picker and Play's menu", () => {
  const db = world();
  const g = play(db, NOW);
  const titles = g.tasks.map((t) => t.title).sort();
  assert.deepEqual(titles, ['Call Aris on Schedule', 'Other Rotary Designs'], 'the model hands the screens the day, not the backlog');

  const suggested = [g.next.next, ...g.next.alternatives].filter(Boolean).map((s) => s.title);
  assert.ok(!suggested.some((t) => t.startsWith('- ')), `the picker suggested backlog: ${suggested.join(', ')}`);

  const menu = menuTasks(g).map((x) => x.title).sort();
  assert.deepEqual(menu, titles, "Play's Start menu is the same list");
});

test('a Flow task of the player\'s own is never hidden by Planner\'s day', () => {
  const db = world();
  const mine = { id: 'task_mine', type: 'task', title: 'Shower and Meds', skill: db.skills[0]?.id, measure: 'time', cadence: 'daily', estimate: 15, stamina: 0, mana: 0 };
  const g = play(index([...STATS, ...db.skills, ...db.tasks, mine]), NOW);
  assert.ok(g.tasks.some((t) => t.title === 'Shower and Meds'), "Flow's own tasks are not Planner's to schedule");
});

test('Planner has not published the day: nothing is hidden', () => {
  const { tasks, skills } = plannerTasks(RECORDS, opts);
  const g = play(index([...STATS, ...skills, ...tasks]), NOW);
  assert.ok(g.tasks.length >= 5, 'without an agenda the whole backlog is still offered');
  assert.deepEqual(g.backlog, [], 'nothing is off the day, so nothing is in the backlog');
});

test('a day with nothing on it empties the Planner list, and the backlog is kept aside', () => {
  const { tasks, skills } = plannerTasks(RECORDS, opts);
  // What sync.js does when the day is published and names nothing: every
  // Planner task is off today.
  const off = tasks.map((t) => ({ ...t, offToday: true }));
  const g = play(index([...STATS, ...skills, ...off]), NOW);
  assert.deepEqual(g.tasks, [], 'nothing is on today');
  assert.equal(g.backlog.length, tasks.length, 'the screens can still show it behind a toggle');
  assert.ok(g.backlog.every((t) => t.title), 'the backlog carries the same shape as a task');
  assert.equal(g.next.next, null, 'and the picker suggests nothing');
});

test('the Terminal lists the day too', () => {
  const on = [{ plan: 'alcon', task: 'call_aris', start: 585, minutes: 60 }, { plan: 'l3', task: 'rotary', start: 645, minutes: 58 }];
  const records = [...RECORDS, agenda(on)];
  const out = projectList(index(STATS), records, opts);
  const titles = out.flatMap((p) => p.tasks.map((t) => t.title));
  assert.deepEqual(titles.sort(), ['Call Aris on Schedule', 'Other Rotary Designs'], 'the 2024 backlog is not in the Terminal');
  // The plan itself stays listed: SPEC.md › Terminal says Projects are the
  // plans with at least one task for the player, and it says nothing about
  // the day. Only its open tasks are today's.
  assert.deepEqual(out.find((p) => p.id === 'cs605').tasks, [], 'nothing of the 2024 backlog is open work');
  assert.equal(out.find((p) => p.id === 'cs605').open, 0);
});

test('the Terminal without a published day still lists everything', () => {
  const out = projectList(index(STATS), RECORDS, opts);
  assert.ok(out.some((p) => p.id === 'cs605'));
});
