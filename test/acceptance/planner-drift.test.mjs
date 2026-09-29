// SPEC.md › Planner tasks › Planner changed its mind. Correcting a plan after
// Flow has logged the completion cannot reach back into a write-once event, so
// Flow notices the disagreement and offers the amendment instead.
//
// From the real case: "Receive hose" was logged at Planner's 2 hours, then the
// hours were withdrawn in Planner and its estimate set to nothing. Flow went
// on showing 2 hours in the week, because nothing had told it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannerDrift } from '../../src/planner.js';
import { index, makeCorrection, DEFAULT_STATS } from '../../src/model.js';

const ME = 'Allen Xu';
const STATS = DEFAULT_STATS.map((s) => ({ ...s, type: 'stat' }));
const NOW = Date.parse('2026-09-28T21:00:00');
const DONE_AT = Date.parse('2026-09-28T17:30:00');

const ptask = (fields) => ({
  name: 'New task', level: 1, duration: 1, milestone: false, work: 1, percent: 100, urgency: 'normal',
  deadline: null, archived: false, stageId: null, assignments: [], doneAt: new Date(DONE_AT).toISOString(), ...fields,
});
const plan = (id, name, tasks) => ({
  id, type: 'document', format: 'project-planner', name, deletedAt: null, updatedAt: 1,
  body: JSON.stringify({ id, name, tasks, resources: [], timesheets: [], format: 'project-planner', version: 1 }),
});

/** Planner says the task is worth `hours` now; Flow logged `logged` minutes for it. */
function world(hours, logged, extra = {}) {
  const records = [plan('ge', 'GE SO 278078', [ptask({ id: 'hose', name: 'Receive hose', work: hours })])];
  const done = {
    id: `done_pl_ge_hose_${DONE_AT}`, type: 'done', task: 'task_pl_ge_hose', day: '2026-09-28',
    start: DONE_AT - logged * 60000, end: DONE_AT, minutes: logged, measure: 'time', value: logged, quality: 1,
    planner: new Date(DONE_AT).toISOString(), price: { points: logged, base: logged, energy: {} }, ...extra,
  };
  return { records, done, db: (more = []) => index([...STATS, done, ...more]) };
}

const opts = { me: ME, now: NOW };

test('Planner now says less than Flow logged: the amendment is offered', () => {
  const w = world(0, 120);
  const out = plannerDrift(w.db(), w.records, opts);
  assert.equal(out.length, 1);
  assert.equal(out[0].done, w.done.id);
  assert.equal(out[0].title, 'Receive hose');
  assert.equal(out[0].logged, 120);
  assert.ok(out[0].minutes < 120, 'what Planner says now');
  assert.match(out[0].reason, /Planner/, 'the reason writes itself, in Planner\'s numbers');
});

test('the offer carries a correction that can be written as it is', () => {
  const w = world(0, 120);
  const [offer] = plannerDrift(w.db(), w.records, opts);
  const rec = makeCorrection(w.db(), { target: offer.done, kind: 'amend', patch: { minutes: offer.minutes, points: offer.minutes }, reason: offer.reason, at: NOW });
  const after = index([...STATS, w.done, rec]);
  assert.equal(after.done[0].minutes, offer.minutes);
  assert.equal(after.done[0].corrected, true);
});

test('agreement is not an offer', () => {
  const w = world(2, 120);
  assert.deepEqual(plannerDrift(w.db(), w.records, opts), []);
});

test('Planner now says more: that is offered too, not only less', () => {
  const w = world(4, 120);
  const out = plannerDrift(w.db(), w.records, opts);
  assert.equal(out.length, 1);
  assert.equal(out[0].minutes, 240);
});

test('a completion the player timed is what really happened, whatever the plan says', () => {
  const w = world(0, 120, { timed: true });
  assert.deepEqual(plannerDrift(w.db(), w.records, opts), []);
});

test('a completion already corrected by hand is left alone', () => {
  const w = world(0, 120);
  const fix = makeCorrection(w.db(), { target: w.done.id, kind: 'amend', patch: { minutes: 90 }, reason: 'it took an hour and a half', at: NOW - 1000 });
  assert.deepEqual(plannerDrift(w.db([fix]), w.records, opts), []);
});

test('a withdrawn completion is not offered: it counts for nothing already', () => {
  const w = world(0, 120);
  const fix = makeCorrection(w.db(), { target: w.done.id, kind: 'void', reason: 'never happened', at: NOW - 1000 });
  assert.deepEqual(plannerDrift(w.db([fix]), w.records, opts), []);
});

test("Flow's own completions are none of Planner's business", () => {
  const w = world(0, 120);
  const mine = { id: 'done_mine', type: 'done', task: 'task_mine', day: '2026-09-28', end: DONE_AT, minutes: 60, measure: 'time', value: 60, quality: 1, price: { points: 60, energy: {} } };
  const db = index([...STATS, w.done, mine, { id: 'task_mine', type: 'task', title: 'CYCLE', skill: 'sk_x', measure: 'time', cadence: 'daily', estimate: 60 }]);
  assert.deepEqual(plannerDrift(db, w.records, opts).map((o) => o.done), [w.done.id]);
});

test('no Planner records at all is no offer, not a throw', () => {
  const w = world(0, 120);
  assert.deepEqual(plannerDrift(w.db(), [], opts), []);
});
