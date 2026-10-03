// Points are fuel (SPEC.md › Points): minutes × difficulty, capped at 720 a
// day, and the bonuses stop multiplying them.
//
// From the day that forced it: "Reimbursement" — an expense report — earned
// +18 for twelve minutes because it happened to be chained, and "Walk around
// the Building" earned +72 for forty-five. Combo rewards not stopping, which
// has nothing to do with throughput or quality, and a day capped at 720 is
// incoherent while a single task can pay 2.5×.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { play, priceDone, DAILY_POINTS_CAP, POINTS_PER_MINUTE, pointsToday } from '../../src/model.js';
import { game, T, at9 } from '../helpers.mjs';

const MON = '2026-09-21';

/** A world with one estimate-30 task, run whenever asked. */
function world() {
  const g = game();
  const task = g.task({ id: 'task_mail', title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 30 });
  return { g, task };
}

describe('points are minutes', () => {
  test('a point a minute, and nothing else', () => {
    assert.equal(POINTS_PER_MINUTE, 1);
    const { g, task } = world();
    const d = g.done(task, `${MON}T10:00:00`, 30);
    assert.equal(d.price.points, 30);
  });

  test('forty-five minutes is forty-five points', () => {
    const { g } = world();
    const t = g.task({ id: 'task_jeff', title: 'Talk to Jeffery', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 45 });
    assert.equal(g.done(t, `${MON}T10:00:00`, 45).price.points, 45);
  });

  test('a chain of tasks does not inflate any of them', () => {
    const { g, task } = world();
    const runs = [];
    // Five in a row, each starting inside the combo window.
    for (let i = 0; i < 5; i++) runs.push(g.done(task, at9(MON, 30 + i * 35), 30));
    // The first three are the task's own estimate; from the fourth the estimate
    // is the flow target in minutes (recent average − 5%), which is the
    // anti-inflation rule and makes them fall, never rise.
    for (const d of runs.slice(0, 3)) assert.equal(d.price.points, 30);
    for (const d of runs) assert.ok(d.price.points <= 30, 'a chain never pays more than the minutes');
    assert.ok(runs[4].price.points < 30, 'it ratchets down, which is the point');
    assert.ok(runs[4].comboIndex > 0, 'the combo is still counted, just not paid in points');
  });

  test('an expense report earns its twelve minutes and not a point more', () => {
    const g = game();
    const t = g.task({ id: 'task_reimb', title: 'Reimbursement', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 12 });
    const before = g.task({ id: 'task_x', title: 'Something', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 30 });
    g.done(before, at9(MON, 0), 30);
    const d = g.done(t, at9(MON, 35), 12);
    assert.equal(d.price.points, 12);
  });
});

describe('difficulty still scales, because it is the one multiplier left', () => {
  test('a tier multiplies the minutes', () => {
    const { g, task } = world();
    const db = g.db();
    const price = priceDone({ ...db, reviews: [{ id: 'r', type: 'review', day: '2026-09-20', week: '2026-W38', at: T('2026-09-20T18:00:00'), satisfaction: 7, ratings: {}, difficulty: { tier: 'steady', skills: {} } }] },
      task, { start: T(`${MON}T09:30:00`), end: T(`${MON}T10:00:00`), minutes: 30, value: 30, quality: 1 });
    assert.equal(price.points, Math.round(30 * 0.8), 'Steady pays 0.8');
  });
});

describe('the bonuses become their own score', () => {
  test('a price carries style, and style is not points', () => {
    const { g, task } = world();
    const first = g.done(task, at9(MON, 0), 30);
    const second = g.done(task, at9(MON, 35), 30);
    assert.equal(second.price.points, 30);
    assert.ok('style' in second.price, 'the price carries a style figure');
    assert.ok(second.price.style > 0, 'a chained run has style');
    assert.equal(first.price.style, 0, 'the first of the day has none');
  });

  test('the bonuses are still recorded, so achievements still work', () => {
    const { g, task } = world();
    g.done(task, at9(MON, 0), 30);
    const d = g.done(task, at9(MON, 35), 30);
    assert.ok(d.price.bonuses, 'bonuses are kept');
    assert.ok(d.price.bonuses.combo > 0);
  });

  test("the day's style is totted up beside the day's points", () => {
    const { g, task } = world();
    g.done(task, at9(MON, 0), 30);
    g.done(task, at9(MON, 35), 30);
    const t = play(g.db(), T(`${MON}T18:00:00`)).today;
    assert.equal(t.points, 60, 'two thirty-minute runs');
    assert.ok(t.style > 0, 'and the chain shows as style');
  });
});

describe('the day is capped', () => {
  test('the cap is 720: twelve hours at a point a minute', () => {
    assert.equal(DAILY_POINTS_CAP, 720);
  });

  test('a day cannot earn past the cap', () => {
    const g = game();
    const t = g.task({ id: 'task_long', title: 'Long', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 300 });
    for (let i = 0; i < 3; i++) g.done(t, at9(MON, i * 310), 300);
    const total = g.db().done.reduce((n, d) => n + d.price.points, 0);
    assert.equal(total, DAILY_POINTS_CAP, '900 minutes of work, 720 points');
  });

  test('the run that crosses the cap gets what is left of it, not zero', () => {
    const g = game();
    const t = g.task({ id: 'task_long', title: 'Long', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 400 });
    const a = g.done(t, at9(MON, 0), 400);
    const b = g.done(t, at9(MON, 410), 400);
    assert.equal(a.price.points, 400);
    assert.equal(b.price.points, 320, '720 − 400');
    assert.equal(b.price.capped, true, 'and it says it was capped');
  });

  test('past the cap a run earns nothing, and says so', () => {
    const g = game();
    const t = g.task({ id: 'task_long', title: 'Long', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 400 });
    g.done(t, at9(MON, 0), 400);
    g.done(t, at9(MON, 410), 400);
    const third = g.done(t, at9(MON, 820), 60);
    assert.equal(third.price.points, 0);
    assert.equal(third.price.capped, true);
  });

  test('the cap is a day, not a life: tomorrow starts again', () => {
    const g = game();
    const t = g.task({ id: 'task_long', title: 'Long', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 400 });
    g.done(t, at9(MON, 0), 400);
    g.done(t, at9(MON, 410), 400);
    const next = g.done(t, at9('2026-09-22', 0), 400);
    assert.equal(next.price.points, 400);
  });

  test('pointsToday says how much of the day is spent', () => {
    const g = game();
    const t = g.task({ id: 'task_long', title: 'Long', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 300 });
    g.done(t, at9(MON, 0), 300);
    assert.equal(pointsToday(g.db(), MON), 300);
    assert.equal(pointsToday(g.db(), '2026-09-22'), 0);
  });

  test('a completion already priced keeps its price: the cap never rewrites the past', () => {
    const g = game();
    const t = g.task({ id: 'task_long', title: 'Long', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 400 });
    const a = g.done(t, at9(MON, 0), 400);
    g.done(t, at9(MON, 410), 400);
    assert.equal(g.db().done.find((d) => d.id === a.id).price.points, 400);
  });
});
