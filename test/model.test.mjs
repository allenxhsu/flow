// The rules of Flow against SPEC.md. Each describe() names the spec section it checks.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOf, addDays, daysBetween, isDay, isoWeek, index, makeTask, makeReward, makeEnergy, makeReview, makeMoment, makeDone,
  levelFor, masteryFactor, taskStats, actual, chainAt, underdogsOn, priceDone, balanceOf, chargeFor, energyOn,
  pickNext, dailyStreak, weeklyStreak, isDoneFor, isCritical, reworkCandidate, latestPerWeek, play, betterOf,
  stamp, tombstone, newId, placeOfTask, SKILL_STEP, PLAYER_STEP, BONUS_CAP,
} from '../src/model.js';
import { T, game, baseRecords, close, at9 } from './helpers.mjs';

// ─── dates ──────────────────────────────────────────────────────────────────

describe('dates', () => {
  test('dayOf is the local calendar day', () => {
    assert.equal(dayOf(T('2026-09-28T00:00:00')), '2026-09-28');
    assert.equal(dayOf(T('2026-09-28T23:59:59')), '2026-09-28');
  });
  test('addDays and daysBetween cross months and years', () => {
    assert.equal(addDays('2026-09-28', 3), '2026-10-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(daysBetween('2026-09-28', '2026-10-01'), 3);
    assert.equal(daysBetween('2026-10-01', '2026-09-28'), -3);
  });
  test('isDay rejects impossible dates and other shapes', () => {
    assert.ok(isDay('2028-02-29'));
    assert.ok(!isDay('2026-02-30'));
    assert.ok(!isDay('2026-9-28'));
    assert.ok(!isDay(20260928));
  });
  test('isoWeek: Monday start, the week belongs to its Thursday', () => {
    assert.equal(isoWeek('2026-09-28'), '2026-W40'); // Monday
    assert.equal(isoWeek('2026-10-04'), '2026-W40'); // Sunday, same week
    assert.equal(isoWeek('2026-09-27'), '2026-W39');
    assert.equal(isoWeek('2021-01-03'), '2020-W53');
    assert.equal(isoWeek('2024-12-30'), '2025-W01');
    assert.equal(isoWeek('2026-01-01'), '2026-W01');
  });
});

// ─── records ────────────────────────────────────────────────────────────────

describe('records', () => {
  test('index skips tombstones and unknown types, and falls back to the defaults', () => {
    const db = index([
      { id: 'sk_a', type: 'skill', name: 'A', stat: 'stat_body' },
      tombstone({ id: 'sk_b', type: 'skill', name: 'B', stat: 'stat_body' }, { now: 1 }),
      { id: 'x', type: 'from-the-future' },
      null,
    ]);
    assert.deepEqual(db.skills.map((s) => s.id), ['sk_a']);
    assert.equal(db.stats.length, 5);
    assert.ok(db.place.has('place_desk'));
    assert.ok(db.kind.has('kind_drive'));
    assert.equal(db.settings.name, 'Player');
  });
  test('own stats replace the defaults, in order', () => {
    const db = index([{ id: 's2', type: 'stat', name: 'Z', order: 1 }, { id: 's1', type: 'stat', name: 'Y', order: 0 }]);
    assert.deepEqual(db.stats.map((s) => s.id), ['s1', 's2']);
  });
  test('stamp and newId', () => {
    assert.deepEqual(stamp({ id: 'a' }, { now: 5, device: 'mac' }), { id: 'a', updatedAt: 5, origin: 'mac' });
    const a = newId('done', 1000);
    const b = newId('done', 1000);
    assert.match(a, /^done_/);
    assert.notEqual(a, b);
  });
  test('makeTask validates and fills defaults', () => {
    const db = index(baseRecords());
    const t = makeTask(db, { title: 'Run', skill: 'sk_run', stamina: '2', batch: ' pr ' }, { now: T('2026-09-28T09:00:00') });
    assert.equal(t.type, 'task');
    assert.equal(t.created, '2026-09-28');
    assert.equal(t.stamina, 2);
    assert.equal(t.batch, 'pr');
    assert.equal(t.measure, 'time');
    assert.ok(t.id.startsWith('task_'));
    assert.ok(makeTask(db, { id: undefined, title: 'X', skill: 'sk_run' }).id.startsWith('task_'));
    assert.throws(() => makeTask(db, { title: 'X', skill: 'nope' }), /no skill/);
    assert.throws(() => makeTask(db, { skill: 'sk_run' }), /title/);
    assert.throws(() => makeTask(db, { title: 'X', skill: 'sk_run', measure: 'mood' }), /measure/);
    assert.throws(() => makeTask(db, { title: 'X', skill: 'sk_run', cadence: 'hourly' }), /cadence/);
    assert.throws(() => makeTask(db, { title: 'X', skill: 'sk_run', deadline: '2026-02-30' }), /deadline/);
    assert.throws(() => makeTask(db, { title: 'X', skill: 'sk_run', estimate: 0 }), /estimate/);
    assert.throws(() => makeTask(db, { title: 'X', skill: 'sk_run', mana: 11 }), /mana/);
    assert.throws(() => makeTask(db, { title: 'X', skill: 'sk_run', place: 'place_moon' }), /no place/);
  });
  test('critical: flagged, a deadline, for others, or urgent', () => {
    assert.ok(!isCritical({}));
    assert.ok(isCritical({ critical: true }));
    assert.ok(isCritical({ deadline: '2026-10-01' }));
    assert.ok(isCritical({ forOthers: true }));
    assert.ok(isCritical({ urgent: true }));
  });
  test('a task’s place defaults from its skill', () => {
    const db = index(baseRecords());
    assert.equal(placeOfTask(db, { skill: 'sk_mail' }), 'place_desk');
    assert.equal(placeOfTask(db, { skill: 'sk_mail', place: 'place_car' }), 'place_car');
    assert.equal(placeOfTask(db, { skill: 'sk_read' }), null);
  });
  test('betterOf: less time, more count and quality', () => {
    assert.equal(betterOf({ measure: 'time' }), 'less');
    assert.equal(betterOf({ measure: 'count' }), 'more');
    assert.equal(betterOf({ measure: 'quality' }), 'more');
  });
});

// ─── levels ─────────────────────────────────────────────────────────────────

describe('levelFor', () => {
  test('level L to L+1 costs step × L', () => {
    assert.equal(levelFor(0, 100).level, 1);
    assert.equal(levelFor(99, 100).level, 1);
    assert.equal(levelFor(100, 100).level, 2);
    assert.equal(levelFor(299, 100).level, 2);
    assert.equal(levelFor(300, 100).level, 3);
    assert.equal(levelFor(1000, 100).level, 5);
    assert.equal(levelFor(1500, 500).level, 3);
  });
  test('progress into the level and to the next', () => {
    assert.deepEqual(levelFor(150, 100), { level: 2, xp: 150, into: 50, span: 200, toNext: 150 });
  });
  test('levels drop when XP falls, and negative XP is level 1', () => {
    assert.equal(levelFor(300, 100).level, 3);
    assert.equal(levelFor(250, 100).level, 2);
    const neg = levelFor(-40, 100);
    assert.equal(neg.level, 1);
    assert.equal(neg.xp, -40);
    assert.equal(neg.into, 0);
    assert.equal(neg.toNext, 100);
  });
  test('masteryFactor: −7.5% per level down to 0.25', () => {
    assert.equal(masteryFactor(1), 1);
    assert.ok(close(masteryFactor(5), 0.7));
    assert.equal(masteryFactor(11), 0.25);
    assert.equal(masteryFactor(30), 0.25);
  });
});

// ─── pricing ────────────────────────────────────────────────────────────────

describe('pricing', () => {
  test('base = estimate × quality, with no bonus on a first run', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 30 });
    const d = g.done('t_mail', '2026-09-28T09:40:00', 40, { quality: 0.8 });
    assert.equal(d.price.base, 24);
    assert.equal(d.price.estimateFrom, 'you');
    assert.equal(d.price.target, null);
    assert.deepEqual(d.price.bonuses, { flow: 0, pb: 0, underdog: 0, combo: 0, batch: 0 });
    assert.equal(d.price.points, 24);
    assert.equal(d.start, T('2026-09-28T09:00:00'));
    assert.equal(d.day, '2026-09-28');
  });
  test('after 3 runs the estimate is the flow target in minutes, and flow/pb pay', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run', estimate: 30 });
    g.done('t_run', '2026-09-25T09:00:00', 20);
    const second = g.done('t_run', '2026-09-26T09:00:00', 22);
    assert.equal(second.price.estimateFrom, 'you');
    assert.equal(second.price.estimate, 30);
    g.done('t_run', '2026-09-27T09:00:00', 24);
    const st = taskStats(g.db(), g.db().task.get('t_run'));
    assert.equal(st.runs, 3);
    assert.equal(st.best, 20);
    assert.equal(st.target, 20.9); // avg 22, 5% better
    assert.equal(st.estimate, 21);
    assert.equal(st.estimateFrom, 'history');
    // Body earned most last week, so Run is not an underdog; the runs are days apart, so no combo.
    const d = g.done('t_run', '2026-09-28T09:00:00', 19);
    assert.equal(d.price.base, 21);
    assert.equal(d.price.bonuses.flow, 0.2);
    assert.equal(d.price.bonuses.pb, 0.25);
    assert.equal(d.price.bonuses.underdog, 0);
    assert.equal(d.price.multiplier, 1.45);
    assert.equal(d.price.points, 30);
  });
  test('the estimate cannot be inflated: it follows the runs, not the task', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run', estimate: 500 });
    for (const day of ['23', '24', '25']) g.done('t_run', `2026-09-${day}T09:00:00`, 20);
    assert.equal(taskStats(g.db(), g.db().task.get('t_run')).estimate, 19);
  });
  test('the target uses the last 5 runs only', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run' });
    g.done('t_run', '2026-09-20T09:00:00', 100);
    for (const day of ['21', '22', '23', '24', '25']) g.done('t_run', `2026-09-${day}T09:00:00`, 20);
    assert.equal(taskStats(g.db(), g.db().task.get('t_run')).target, 19);
  });
  test('matching the target is flow; matching the best is not a personal best', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run' });
    for (const day of ['23', '24', '25']) g.done('t_run', `2026-09-${day}T09:00:00`, 20);
    const d = g.done('t_run', '2026-09-28T09:00:00', 19);
    assert.equal(d.price.bonuses.flow, 0.2);
    assert.equal(d.price.bonuses.pb, 0.25);
    const e = g.done('t_run', '2026-09-29T09:00:00', 19);
    assert.equal(e.price.bonuses.pb, 0);
  });
  test('count targets go up by 5%, quality targets stop at 100', () => {
    const g = game();
    g.task({ id: 't_pages', title: 'Pages', skill: 'sk_read', measure: 'count' });
    g.task({ id: 't_weld', title: 'Weld', skill: 'sk_run', measure: 'quality' });
    for (const day of ['23', '24', '25']) {
      g.done('t_pages', `2026-09-${day}T09:00:00`, 30, { value: 20 });
      g.done('t_weld', `2026-09-${day}T12:00:00`, 30, { value: 98 });
    }
    const db = g.db();
    assert.equal(taskStats(db, db.task.get('t_pages')).target, 21);
    assert.equal(taskStats(db, db.task.get('t_weld')).target, 100);
  });
  test('a quality task’s value is its quality', () => {
    const g = game();
    g.task({ id: 't_weld', title: 'Weld', skill: 'sk_run', measure: 'quality', estimate: 60 });
    const d = g.done('t_weld', '2026-09-28T10:00:00', 60, { value: 80 });
    assert.equal(d.quality, 0.8);
    assert.equal(d.price.base, 48);
    assert.throws(() => g.done('t_weld', '2026-09-28T12:00:00', 60, { value: 120 }), /quality/);
  });
  test('makeDone rejects bad input', () => {
    const g = game();
    g.task({ id: 't_pages', title: 'Pages', skill: 'sk_read', measure: 'count' });
    assert.throws(() => g.done('t_pages', '2026-09-28T09:00:00', 0, { value: 3 }), /minutes/);
    assert.throws(() => g.done('t_pages', '2026-09-28T09:00:00', 10), /value/);
    assert.throws(() => g.done('t_pages', '2026-09-28T09:00:00', 10, { value: 3, quality: 2 }), /quality/);
    assert.throws(() => g.done('nope', '2026-09-28T09:00:00', 10), /no task/);
  });
  test('underdog: the stat with least XP in the previous 7 days earns +50%', () => {
    const g = game([
      { id: 'st_a', type: 'stat', name: 'A', order: 0 },
      { id: 'st_b', type: 'stat', name: 'B', order: 1 },
      { id: 'sk_a', type: 'skill', name: 'a', stat: 'st_a' },
      { id: 'sk_b', type: 'skill', name: 'b', stat: 'st_b' },
    ]);
    g.task({ id: 't_a', title: 'a', skill: 'sk_a', estimate: 30 });
    g.task({ id: 't_b', title: 'b', skill: 'sk_b', estimate: 30 });
    const first = g.done('t_a', '2026-09-27T09:00:00', 30);
    assert.equal(first.price.bonuses.underdog, 0); // everyone tied at nothing: nobody is the underdog
    assert.deepEqual(underdogsOn(g.db(), '2026-09-27'), []);
    assert.deepEqual(underdogsOn(g.db(), '2026-09-28'), ['st_b']);
    const d = g.done('t_b', '2026-09-28T09:00:00', 30);
    assert.equal(d.price.bonuses.underdog, 0.5);
    assert.equal(d.price.points, 45);
    // Eight days on, the week has forgotten it.
    assert.deepEqual(underdogsOn(g.db(), '2026-10-05'), ['st_a']);
    assert.deepEqual(underdogsOn(g.db(), '2026-10-06'), []);
  });
  test('combo: +10% per chained task, next start within 30 min of the last end', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    const a = g.done('t_mail', '2026-09-28T09:10:00', 10);
    const b = g.done('t_mail', '2026-09-28T09:30:00', 10); // gap 10
    const c = g.done('t_mail', '2026-09-28T10:10:00', 10); // gap 30: still chained
    const d = g.done('t_mail', '2026-09-28T10:51:00', 10); // gap 31: broken
    assert.deepEqual([a, b, c, d].map((x) => x.comboIndex), [0, 1, 2, 0]);
    assert.deepEqual([a, b, c, d].map((x) => x.price.bonuses.combo), [0, 0.1, 0.2, 0]);
    assert.deepEqual([a, b, c, d].map((x) => x.price.points), [10, 11, 12, 10]);
  });
  test('combo tops out at +100%', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    let last;
    for (let i = 0; i < 13; i++) last = g.done('t_mail', at9('2026-09-28', 5 + i * 5), 5);
    assert.equal(last.comboIndex, 12);
    assert.equal(last.price.bonuses.combo, 1);
  });
  test('rest pauses a combo: it neither grows nor breaks it, and the gap counts from its end', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    g.task({ id: 't_rest', title: 'Nap', skill: 'sk_read', estimate: 15, stamina: -2, mana: -2 });
    const a = g.done('t_mail', '2026-09-28T09:10:00', 10);
    const b = g.done('t_mail', '2026-09-28T09:20:00', 10);
    const rest = g.done('t_rest', '2026-09-28T10:40:00', 60); // 20 min after b, an hour long
    const c = g.done('t_mail', '2026-09-28T11:10:00', 10); // 20 min after the rest
    assert.deepEqual([a, b, rest, c].map((x) => x.comboIndex), [0, 1, 1, 2]);
    // Two rests in a row are still one pause.
    const r2 = g.done('t_rest', '2026-09-28T11:30:00', 10);
    const r3 = g.done('t_rest', '2026-09-28T11:50:00', 10);
    const e = g.done('t_mail', '2026-09-28T12:10:00', 10);
    assert.deepEqual([r2.comboIndex, r3.comboIndex, e.comboIndex], [2, 2, 3]);
  });
  test('a rest with nothing before it starts no combo', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    g.task({ id: 't_rest', title: 'Nap', skill: 'sk_read', estimate: 15, stamina: -2 });
    const r = g.done('t_rest', '2026-09-28T08:30:00', 30);
    const a = g.done('t_mail', '2026-09-28T08:50:00', 10);
    assert.equal(r.comboIndex, 0);
    assert.equal(a.comboIndex, 0);
  });
  test('batch: +15% × position, same type, gap ≤ 10 min, and it replaces the combo', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    g.task({ id: 't_pr', title: 'Purchase request', skill: 'sk_mail', estimate: 10, mana: 2, batch: 'pr' });
    g.task({ id: 't_inv', title: 'Invoice', skill: 'sk_mail', estimate: 10, batch: 'invoice' });
    g.done('t_mail', '2026-09-28T09:10:00', 10);
    const p1 = g.done('t_pr', '2026-09-28T09:25:00', 10);
    const p2 = g.done('t_pr', '2026-09-28T09:40:00', 10); // gap 5
    const p3 = g.done('t_pr', '2026-09-28T10:00:00', 10); // gap 10
    const p4 = g.done('t_pr', '2026-09-28T10:21:00', 10); // gap 11: batch over, combo goes on
    assert.deepEqual([p1, p2, p3, p4].map((x) => x.batchIndex), [0, 1, 2, 0]);
    assert.deepEqual([p1, p2, p3, p4].map((x) => x.price.bonuses.batch), [0, 0.15, 0.3, 0]);
    assert.deepEqual([p1, p2, p3, p4].map((x) => x.price.bonuses.combo), [0.1, 0, 0, 0.4]);
    // Later tasks in a batch cost half the mana.
    assert.deepEqual([p1, p2, p3].map((x) => x.price.energy.mana), [2, 1, 1]);
    // Another batch type in between ends it.
    g.done('t_inv', '2026-09-28T10:25:00', 4);
    const p5 = g.done('t_pr', '2026-09-28T10:35:00', 10);
    assert.equal(p5.batchIndex, 0);
  });
  test('chainAt reads the chain as of a start time', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    g.done('t_mail', '2026-09-28T09:10:00', 10);
    g.done('t_mail', '2026-09-28T09:20:00', 10);
    const db = g.db();
    assert.deepEqual(chainAt(db, db.task.get('t_mail'), T('2026-09-28T09:05:00')), { comboIndex: 0, batchIndex: 0 });
    assert.deepEqual(chainAt(db, db.task.get('t_mail'), T('2026-09-28T09:25:00')), { comboIndex: 2, batchIndex: 0 });
  });
  test('bonuses add up but the total is capped at 2.5× base', () => {
    const g = game([
      { id: 'st_a', type: 'stat', name: 'A', order: 0 },
      { id: 'st_b', type: 'stat', name: 'B', order: 1 },
      { id: 'sk_a', type: 'skill', name: 'a', stat: 'st_a' },
      { id: 'sk_b', type: 'skill', name: 'b', stat: 'st_b' },
    ]);
    g.task({ id: 't_fill', title: 'fill', skill: 'sk_a', estimate: 5 });
    g.task({ id: 't_big', title: 'big', skill: 'sk_a', estimate: 200 });
    g.task({ id: 't_x', title: 'x', skill: 'sk_b', estimate: 30 });
    for (const day of ['23', '24', '25']) g.done('t_x', `2026-09-${day}T09:00:00`, 30);
    g.done('t_big', '2026-09-27T12:00:00', 200);
    for (let i = 1; i <= 10; i++) g.done('t_fill', `2026-09-28T09:${String(i * 5).padStart(2, '0')}:00`, 5);
    const d = g.done('t_x', '2026-09-28T10:10:00', 20);
    assert.deepEqual(d.price.bonuses, { flow: 0.2, pb: 0.25, underdog: 0.5, combo: 1, batch: 0 });
    assert.equal(d.price.multiplier, BONUS_CAP);
    assert.equal(d.price.base, 29); // round(30 × 0.95)
    assert.equal(d.price.points, 73); // round(29 × 2.5)
  });
  test('the price never sees rework logged after the run it prices', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run' });
    const runs = ['23', '24', '25'].map((day) => g.done('t_run', `2026-09-${day}T09:00:00`, 20));
    g.rework(runs[0], '2026-09-29T09:00:00', 10);
    const db = g.db();
    const task = db.task.get('t_run');
    assert.equal(taskStats(db, task, T('2026-09-28T00:00:00')).estimate, 19);
    assert.equal(taskStats(db, task).estimate, 22); // (30 + 20 + 20) / 3 × 0.95
  });
  test('the stored price never changes when history grows', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 10 });
    const a = g.done('t_mail', '2026-09-28T09:10:00', 10);
    const before = JSON.stringify(a.price);
    g.done('t_mail', '2026-09-28T09:20:00', 10);
    assert.equal(JSON.stringify(g.db().done.find((d) => d.id === a.id).price), before);
  });
});

// ─── energy ─────────────────────────────────────────────────────────────────

describe('energy', () => {
  const world = () => {
    const g = game();
    g.task({ id: 't_lift', title: 'Lift', skill: 'sk_run', stamina: 2, mana: 3 });
    g.task({ id: 't_nap', title: 'Nap', skill: 'sk_read', stamina: -2, mana: -2 });
    g.task({ id: 't_think', title: 'Think', skill: 'sk_read', mana: 8 });
    return g;
  };
  test('makeEnergy validates 0–10 and rounds to halves', () => {
    const e = makeEnergy({ stamina: 7.3, mana: '6', at: T('2026-09-28T07:00:00') });
    assert.equal(e.stamina, 7.5);
    assert.equal(e.mana, 6);
    assert.equal(e.day, '2026-09-28');
    assert.throws(() => makeEnergy({ stamina: 11, mana: 5 }), /stamina/);
    assert.throws(() => makeEnergy({ stamina: 5, mana: -1 }), /mana/);
  });
  test('unrated day: no numbers, nothing empty', () => {
    assert.deepEqual(energyOn(world().db(), '2026-09-28'), { stamina: null, mana: null, rated: false, empty: [] });
  });
  test('the morning rating sets the day; tasks and moments drain; rest restores', () => {
    const g = world();
    g.done('t_lift', '2026-09-28T06:00:00', 30); // before the rating: already in it
    g.energy('2026-09-28T07:00:00', 8, 7);
    g.done('t_lift', '2026-09-28T09:00:00', 30);
    let e = energyOn(g.db(), '2026-09-28');
    assert.deepEqual([e.stamina, e.mana, e.rated], [6, 4, true]);
    g.moment('kind_drive', '2026-09-28T10:00:00', '2026-09-28T12:00:00');
    e = energyOn(g.db(), '2026-09-28');
    assert.deepEqual([e.stamina, e.mana], [5, 2]);
    g.done('t_nap', '2026-09-28T13:00:00', 30);
    e = energyOn(g.db(), '2026-09-28');
    assert.deepEqual([e.stamina, e.mana], [7, 4]);
  });
  test('the latest rating of the day wins', () => {
    const g = world();
    g.energy('2026-09-28T07:00:00', 8, 7);
    g.done('t_lift', '2026-09-28T09:00:00', 30);
    g.energy('2026-09-28T12:00:00', 3, 3);
    const e = energyOn(g.db(), '2026-09-28');
    assert.deepEqual([e.stamina, e.mana], [3, 3]);
  });
  test('clamped to 0–10, and empty is flagged', () => {
    const g = world();
    g.energy('2026-09-28T07:00:00', 9, 5);
    g.moment('kind_meal', '2026-09-28T07:30:00', '2026-09-28T10:30:00'); // restores 6 stamina, 3 mana
    let e = energyOn(g.db(), '2026-09-28');
    assert.deepEqual([e.stamina, e.mana, e.empty], [10, 8, []]);
    g.done('t_think', '2026-09-28T11:00:00', 30);
    g.done('t_think', '2026-09-28T11:30:00', 30);
    e = energyOn(g.db(), '2026-09-28');
    assert.deepEqual([e.stamina, e.mana, e.empty], [10, 0, ['mana']]);
  });
  test('mastery: cost × max(0.25, 1 − 0.075 × (level − 1)), restoring never discounted', () => {
    const g = world();
    g.seed('t_lift', '2026-08-01', 1000); // Run skill at level 5
    const d = g.done('t_lift', '2026-09-28T09:00:00', 30);
    assert.equal(d.price.skillLevel, 5);
    assert.deepEqual(d.price.energy, { stamina: 1.4, mana: 2.1 });
    g.seed('t_lift', '2026-08-02', 4500); // 5500: level 11, the floor
    const f = g.done('t_lift', '2026-09-28T12:00:00', 30);
    assert.equal(f.price.skillLevel, 11);
    assert.deepEqual(f.price.energy, { stamina: 0.5, mana: 0.8 });
    g.seed('t_nap', '2026-08-01', 5500);
    const n = g.done('t_nap', '2026-09-28T15:00:00', 30);
    assert.deepEqual(n.price.energy, { stamina: -2, mana: -2 });
  });
});

// ─── rework ─────────────────────────────────────────────────────────────────

describe('rework', () => {
  test('the spec’s example: 90 pts in 90 min, a 60-min fix → 90', () => {
    const g = game();
    g.task({ id: 't_report', title: 'Report', skill: 'sk_mail', estimate: 90 });
    const d = g.done('t_report', '2026-09-28T10:30:00', 90);
    assert.equal(d.price.points, 90);
    const r = g.rework(d, '2026-09-28T13:00:00', 60);
    assert.equal(r.multiplier, 1.5);
    assert.equal(r.perMinute, 1);
    assert.equal(r.penalty, 90);
    assert.equal(r.charged, 90);
    assert.equal(r.repeat, 1);
    assert.equal(r.day, '2026-09-28');
  });
  test('normal rework escalates 1.5, 1.75, 2, 2 — and the part below zero is doubled', () => {
    const g = game();
    g.task({ id: 't_report', title: 'Report', skill: 'sk_mail', estimate: 90 });
    const d = g.done('t_report', '2026-09-28T10:30:00', 90);
    const rs = [60, 30, 10, 10].map((m, i) => g.rework(d, `2026-09-28T1${3 + i}:00:00`, m));
    assert.deepEqual(rs.map((r) => r.multiplier), [1.5, 1.75, 2, 2]);
    assert.deepEqual(rs.map((r) => r.penalty), [90, 53, 20, 20]);
    assert.deepEqual(rs.map((r) => r.charged), [90, 106, 40, 40]);
    assert.equal(balanceOf(g.db()), 90 - 90 - 106 - 40 - 40);
  });
  test('critical work always pays 2×', () => {
    const g = game();
    g.task({ id: 't_urgent', title: 'Urgent', skill: 'sk_mail', estimate: 60, deadline: '2026-10-01' });
    const d = g.done('t_urgent', '2026-09-28T10:00:00', 60);
    assert.equal(d.critical, true);
    const r = g.rework(d, '2026-09-28T12:00:00', 30);
    assert.equal(r.multiplier, 2);
    assert.equal(r.penalty, 60);
  });
  test('rework takes XP away, and the level can drop', () => {
    const g = game();
    g.task({ id: 't_report', title: 'Report', skill: 'sk_mail', estimate: 120 });
    const d = g.done('t_report', '2026-09-28T11:00:00', 120);
    let p = play(g.records, T('2026-09-28T12:00:00'));
    assert.equal(p.skills.find((s) => s.id === 'sk_mail').level, 2);
    g.rework(d, '2026-09-28T13:00:00', 60);
    p = play(g.records, T('2026-09-28T14:00:00'));
    const mail = p.skills.find((s) => s.id === 'sk_mail');
    assert.equal(mail.xp, 30);
    assert.equal(mail.level, 1);
    assert.equal(p.balance, 30);
    assert.equal(p.tasks.find((t) => t.id === 't_report').reworks, 1);
  });
  test('the true run: time adds the fix, quality loses the share redone', () => {
    const a = actual({ minutes: 90, value: 90, quality: 1, measure: 'time' }, [{ minutes: 30 }]);
    assert.deepEqual([a.minutes, a.value, a.reworked], [120, 120, true]);
    assert.ok(close(a.quality, 2 / 3));
    const q = actual({ minutes: 60, value: 80, quality: 0.8, measure: 'quality' }, [{ minutes: 15 }]);
    assert.deepEqual([q.minutes, q.value], [75, 60]);
    assert.ok(close(q.quality, 0.6));
    assert.equal(actual({ minutes: 10, value: 10, quality: 1, measure: 'time' }, [{ minutes: 30 }]).quality, 0);
    assert.deepEqual(actual({ minutes: 10, value: 5, quality: 1, measure: 'count' }), { minutes: 10, quality: 1, value: 5, reworked: false });
  });
  test('bests and targets use the true time', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run' });
    const a = g.done('t_run', '2026-09-23T09:00:00', 10);
    g.done('t_run', '2026-09-24T09:00:00', 20);
    g.done('t_run', '2026-09-25T09:00:00', 20);
    g.rework(a, '2026-09-26T09:00:00', 20);
    const st = taskStats(g.db(), g.db().task.get('t_run'));
    assert.equal(st.best, 20);
    assert.equal(st.target, 22.2); // runs of 30, 20, 20: avg 23.3, 5% better
  });
  test('bad rework input', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run' });
    const d = g.done('t_run', '2026-09-23T09:00:00', 10);
    assert.throws(() => g.rework('nope', '2026-09-23T10:00:00', 5), /no completion/);
    assert.throws(() => g.rework(d, '2026-09-23T10:00:00', 0), /minutes/);
  });
  test('the timer asks about rework for the same task finished in the last 14 days', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run' });
    const d = g.done('t_run', '2026-09-20T09:00:00', 10);
    assert.equal(reworkCandidate(g.db(), 't_run', T('2026-10-04T09:00:00'))?.id, d.id);
    assert.equal(reworkCandidate(g.db(), 't_run', T('2026-10-05T09:00:00')), null);
    assert.equal(reworkCandidate(g.db(), 't_other', T('2026-09-21T09:00:00')), null);
  });
});

// ─── shop and debt ──────────────────────────────────────────────────────────

describe('shop and debt', () => {
  test('chargeFor: only the part below zero costs double', () => {
    assert.equal(chargeFor(100, 50), 50);
    assert.equal(chargeFor(30, 50), 70);
    assert.equal(chargeFor(0, 50), 100);
    assert.equal(chargeFor(-10, 50), 100);
    assert.equal(chargeFor(50, 0), 0);
  });
  test('makeReward validates', () => {
    assert.throws(() => makeReward({ title: 'Cake', price: 0 }), /more than 0/);
    assert.throws(() => makeReward({ price: 5 }), /title/);
    assert.equal(makeReward({ title: 'Cake', price: '12.4' }).price, 12);
  });
  test('purchases: debt allowed, charged at the balance of their moment, one-offs once', () => {
    const g = game();
    g.task({ id: 't_report', title: 'Report', skill: 'sk_mail', estimate: 60 });
    const cake = g.reward({ id: 'rw_cake', title: 'Cake', price: 50 });
    const trip = g.reward({ id: 'rw_trip', title: 'Trip', price: 100, repeatable: false });
    g.done('t_report', '2026-09-28T10:00:00', 60);
    const p1 = g.buy(cake, '2026-09-28T11:00:00');
    assert.equal(p1.charged, 50);
    const p2 = g.buy(cake, '2026-09-28T12:00:00');
    assert.equal(p2.charged, 10 + 40 * 2);
    const p3 = g.buy(trip, '2026-09-28T13:00:00');
    assert.equal(p3.charged, 200);
    assert.throws(() => g.buy(trip, '2026-09-28T14:00:00'), /one-off/);
    assert.equal(balanceOf(g.db()), 60 - 50 - 90 - 200);
    assert.equal(balanceOf(g.db(), T('2026-09-28T11:30:00')), 10);
    // A purchase logged late is charged at the balance it happened at, not today's debt.
    const late = g.buy(cake, '2026-09-28T10:30:00');
    assert.equal(late.charged, 50);
  });
  test('archived rewards cannot be bought', () => {
    const g = game();
    g.add({ ...makeReward({ title: 'Old', price: 5 }), id: 'rw_old', archived: true });
    assert.throws(() => g.buy('rw_old', '2026-09-28T10:00:00'), /no reward/);
  });
  test('play shows affordability and counts', () => {
    const g = game();
    g.task({ id: 't_report', title: 'Report', skill: 'sk_mail', estimate: 60 });
    g.reward({ id: 'rw_cake', title: 'Cake', price: 50 });
    g.reward({ id: 'rw_trip', title: 'Trip', price: 100 });
    g.done('t_report', '2026-09-28T10:00:00', 60);
    g.buy('rw_cake', '2026-09-28T11:00:00');
    const p = play(g.records, T('2026-09-28T12:00:00'));
    assert.equal(p.balance, 10);
    assert.deepEqual(p.rewards.map((r) => [r.id, r.affordable, r.bought]), [['rw_cake', false, 1], ['rw_trip', false, 0]]);
    assert.equal(p.purchases[0].title, 'Cake');
    assert.ok(p.achievements.find((a) => a.id === 'treat').earned);
  });
});

// ─── the next task ──────────────────────────────────────────────────────────

describe('pickNext', () => {
  const NOW = T('2026-09-28T09:00:00');
  test('due soon (≤ 2 days) or overdue comes first, earliest deadline first', () => {
    const g = game();
    g.task({ id: 't_a', title: 'A', skill: 'sk_mail' });
    g.task({ id: 't_soon', title: 'Soon', skill: 'sk_mail', deadline: '2026-09-30' });
    g.task({ id: 't_late', title: 'Late', skill: 'sk_mail', deadline: '2026-09-20' });
    g.task({ id: 't_far', title: 'Far', skill: 'sk_mail', deadline: '2026-10-01' });
    const n = pickNext(g.db(), NOW);
    assert.equal(n.next.task, 't_late');
    assert.deepEqual(n.next.why, ['overdue']);
    assert.equal(n.alternatives[0].task, 't_soon');
  });
  test('a far deadline does not jump the energy order', () => {
    const g = game();
    g.energy('2026-09-28T07:00:00', 1, 5);
    g.task({ id: 't_far', title: 'Far', skill: 'sk_run', stamina: 5, deadline: '2026-10-20' });
    g.task({ id: 't_easy', title: 'Easy', skill: 'sk_read' });
    const n = pickNext(g.db(), NOW);
    assert.equal(n.next.task, 't_easy');
    assert.ok(n.alternatives[0].why.includes('more energy than you have'));
  });
  test('due soon wins even when unaffordable', () => {
    const g = game();
    g.energy('2026-09-28T07:00:00', 1, 5);
    g.task({ id: 't_soon', title: 'Soon', skill: 'sk_run', stamina: 5, deadline: '2026-09-29' });
    g.task({ id: 't_easy', title: 'Easy', skill: 'sk_read' });
    assert.equal(pickNext(g.db(), NOW).next.task, 't_soon');
  });
  test('then the underdog stat, then the skill closest to levelling', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run', estimate: 60 });
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail' });
    g.task({ id: 't_read', title: 'Read', skill: 'sk_read' });
    g.done('t_run', '2026-09-27T09:00:00', 60); // Body leads: the rest are underdogs
    g.seed('t_read', '2026-08-01', 90); // Read is 10 XP from level 2
    const n = pickNext(g.db(), NOW);
    assert.deepEqual([n.next.task, ...n.alternatives.map((a) => a.task)], ['t_read', 't_mail', 't_run']);
    assert.ok(n.next.why.includes('underdog stat'));
  });
  test('done for the period is not offered; anytime always is', () => {
    const g = game();
    g.task({ id: 't_daily', title: 'Daily', skill: 'sk_run', cadence: 'daily' });
    g.task({ id: 't_weekly', title: 'Weekly', skill: 'sk_run', cadence: 'weekly' });
    g.task({ id: 't_once', title: 'Once', skill: 'sk_run', cadence: 'once' });
    g.task({ id: 't_any', title: 'Any', skill: 'sk_run', cadence: 'anytime' });
    g.task({ id: 't_old', title: 'Old', skill: 'sk_run', archived: true });
    for (const t of ['t_daily', 't_weekly', 't_once', 't_any']) g.done(t, '2026-09-28T08:00:00', 10);
    const db = g.db();
    const ids = (n) => [n.next, ...n.alternatives].filter(Boolean).map((x) => x.task);
    assert.deepEqual(ids(pickNext(db, NOW)), ['t_any']);
    assert.deepEqual(ids(pickNext(db, T('2026-09-29T09:00:00'))).sort(), ['t_any', 't_daily']);
    assert.deepEqual(ids(pickNext(db, T('2026-10-05T09:00:00'))).sort(), ['t_any', 't_daily', 't_weekly']);
    assert.ok(isDoneFor(db, db.task.get('t_once'), '2027-01-01'));
  });
  test('batch tasks wait until 3 are waiting, then come as one offer', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail' });
    g.task({ id: 't_pr1', title: 'PR 1', skill: 'sk_mail', batch: 'purchase request', cadence: 'once' });
    g.task({ id: 't_pr2', title: 'PR 2', skill: 'sk_mail', batch: 'purchase request', cadence: 'once' });
    let n = pickNext(g.db(), NOW);
    assert.equal(n.next.task, 't_mail');
    assert.equal(n.alternatives.length, 0);
    assert.deepEqual(n.queued, [{ batch: 'purchase request', waiting: 2, need: 3 }]);
    g.task({ id: 't_pr3', title: 'PR 3', skill: 'sk_mail', batch: 'purchase request', cadence: 'once' });
    n = pickNext(g.db(), NOW);
    assert.deepEqual(n.queued, []);
    const offer = [n.next, ...n.alternatives].find((x) => x.batch);
    assert.deepEqual(offer.batch, ['t_pr1', 't_pr2', 't_pr3']);
    assert.ok(offer.why.includes('batch: 3 × purchase request'));
    assert.equal([n.next, ...n.alternatives].filter((x) => x.batch).length, 1);
  });
  test('a batch due soon is released early', () => {
    const g = game();
    g.task({ id: 't_pr1', title: 'PR 1', skill: 'sk_mail', batch: 'pr', cadence: 'once', deadline: '2026-09-30' });
    g.task({ id: 't_pr2', title: 'PR 2', skill: 'sk_mail', batch: 'pr', cadence: 'once' });
    const n = pickNext(g.db(), NOW);
    assert.equal(n.next.task, 't_pr1');
    assert.deepEqual(n.next.batch, ['t_pr1', 't_pr2']);
    assert.deepEqual(n.queued, []);
  });
  test('empty energy: only rest, free and due-soon tasks, and no penalty', () => {
    const g = game();
    g.energy('2026-09-28T07:00:00', 0, 5);
    g.task({ id: 't_lift', title: 'Lift', skill: 'sk_run', stamina: 2 });
    g.task({ id: 't_nap', title: 'Nap', skill: 'sk_read', stamina: -2 });
    g.task({ id: 't_free', title: 'Free', skill: 'sk_read' });
    g.task({ id: 't_due', title: 'Due', skill: 'sk_run', stamina: 3, deadline: '2026-09-29' });
    const n = pickNext(g.db(), NOW);
    assert.equal(n.exhausted, true);
    assert.deepEqual(n.empty, ['stamina']);
    assert.deepEqual([n.next, ...n.alternatives].map((x) => x.task), ['t_due', 't_free', 't_nap']);
    assert.ok(n.alternatives[1].why.includes('restores energy'));
  });
  test('unrated: everything is affordable', () => {
    const g = game();
    g.task({ id: 't_lift', title: 'Lift', skill: 'sk_run', stamina: 9, mana: 9 });
    const n = pickNext(g.db(), NOW);
    assert.equal(n.exhausted, false);
    assert.deepEqual(n.next.why, []);
  });
  test('cost shown is after mastery', () => {
    const g = game();
    g.task({ id: 't_lift', title: 'Lift', skill: 'sk_run', stamina: 2 });
    g.seed('t_lift', '2026-08-01', 1000);
    const c = pickNext(g.db(), NOW).next.cost;
    assert.ok(close(c.stamina, 1.4));
  });
});

// ─── streaks ────────────────────────────────────────────────────────────────

describe('streaks', () => {
  const days = (...xs) => new Set(xs.map((d) => `2026-09-${String(d).padStart(2, '0')}`));
  test('days in a row', () => {
    assert.deepEqual(dailyStreak(days(24, 25, 26, 27, 28), '2026-09-28'), { streak: 5, atRisk: false });
    assert.deepEqual(dailyStreak(new Set(), '2026-09-28'), { streak: 0, atRisk: false });
  });
  test('today not yet done does not break it, but puts it at risk', () => {
    assert.deepEqual(dailyStreak(days(24, 25, 26, 27), '2026-09-28'), { streak: 4, atRisk: true });
  });
  test('one missed day per week is forgiven', () => {
    assert.equal(dailyStreak(days(20, 21, 22, 24, 25, 26, 27, 28), '2026-09-28').streak, 8);
    // Yesterday missed, today not done yet: the grace day holds it.
    assert.deepEqual(dailyStreak(days(25, 26), '2026-09-28'), { streak: 2, atRisk: true });
  });
  test('a second miss within the week breaks it', () => {
    assert.equal(dailyStreak(days(20, 21, 22, 24, 25, 27, 28), '2026-09-28').streak, 4);
    assert.equal(dailyStreak(days(25, 26), '2026-09-29').streak, 0);
  });
  test('misses a week apart are both forgiven', () => {
    assert.equal(dailyStreak(days(14, 15, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28), '2026-09-28').streak, 13);
  });
  test('weekly streaks count ISO weeks', () => {
    const w = new Set(['2026-W38', '2026-W39', '2026-W40']);
    assert.deepEqual(weeklyStreak(w, '2026-09-28'), { streak: 3, atRisk: false });
    assert.deepEqual(weeklyStreak(new Set(['2026-W38', '2026-W39']), '2026-10-04'), { streak: 2, atRisk: true });
    assert.deepEqual(weeklyStreak(new Set(['2026-W37', '2026-W39']), '2026-09-28'), { streak: 1, atRisk: true });
  });
  test('play puts streaks on tasks', () => {
    const g = game();
    g.task({ id: 't_daily', title: 'Daily', skill: 'sk_run', cadence: 'daily' });
    g.task({ id: 't_weekly', title: 'Weekly', skill: 'sk_run', cadence: 'weekly' });
    for (const d of [26, 27, 28]) g.done('t_daily', `2026-09-${d}T09:00:00`, 10);
    g.done('t_weekly', '2026-09-22T09:00:00', 10);
    const p = play(g.records, T('2026-09-28T12:00:00'));
    assert.equal(p.tasks.find((t) => t.id === 't_daily').streak, 3);
    const w = p.tasks.find((t) => t.id === 't_weekly');
    assert.deepEqual([w.streak, w.atRisk], [1, true]);
  });
});

// ─── reviews ────────────────────────────────────────────────────────────────

describe('reviews', () => {
  test('makeReview validates and rounds to halves', () => {
    const db = index(baseRecords());
    const r = makeReview(db, { satisfaction: 7.3, ratings: { stat_body: 6, stat_mind: '' }, win: 'w', at: T('2026-09-27T20:00:00') });
    assert.equal(r.satisfaction, 7.5);
    assert.deepEqual(r.ratings, { stat_body: 6 });
    assert.equal(r.week, '2026-W39');
    assert.throws(() => makeReview(db, { satisfaction: 11 }), /satisfaction/);
    assert.throws(() => makeReview(db, { satisfaction: 5, ratings: { nope: 3 } }), /no stat/);
  });
  test('a second review in the same ISO week replaces the first', () => {
    const g = game();
    const db = g.db();
    g.add(
      makeReview(db, { satisfaction: 5, at: T('2026-09-20T20:00:00') }), // W38
      makeReview(db, { satisfaction: 6, at: T('2026-09-27T20:00:00') }), // W39
      makeReview(db, { satisfaction: 4, at: T('2026-09-28T20:00:00') }), // W40
      makeReview(db, { satisfaction: 8, at: T('2026-10-01T20:00:00') }), // W40 again
    );
    const weekly = latestPerWeek(g.db().reviews);
    assert.deepEqual(weekly.map((r) => r.satisfaction), [5, 6, 8]);
    const p = play(g.records, T('2026-10-02T09:00:00'));
    assert.equal(p.satisfaction.history.length, 3);
    assert.equal(p.satisfaction.latest.satisfaction, 8);
    assert.equal(p.satisfaction.trend, 8 - 5.5);
    assert.equal(p.satisfaction.due, false);
    assert.equal(p.achievements.find((a) => a.id === 'reflective').earned, false);
  });
  test('a review is due a week after the last', () => {
    const g = game();
    g.add(makeReview(g.db(), { satisfaction: 5, at: T('2026-09-20T20:00:00') }));
    assert.equal(play(g.records, T('2026-09-26T09:00:00')).satisfaction.due, false);
    assert.equal(play(g.records, T('2026-09-27T09:00:00')).satisfaction.due, true);
    assert.equal(play(game().records, T('2026-09-27T09:00:00')).satisfaction.due, true);
  });
});

// ─── achievements ───────────────────────────────────────────────────────────

describe('achievements', () => {
  const earned = (p) => p.achievements.filter((a) => a.earned).map((a) => a.id).sort();
  test('none at the start', () => {
    assert.deepEqual(earned(play([], T('2026-09-28T09:00:00'))), []);
  });
  test('first step, combo ×5, batched, clean week', () => {
    const g = game();
    g.task({ id: 't_pr', title: 'PR', skill: 'sk_mail', estimate: 5, batch: 'pr' });
    for (let i = 1; i <= 10; i++) g.done('t_pr', `2026-09-28T09:${String(i * 5).padStart(2, '0')}:00`, 5);
    const e = earned(play(g.records, T('2026-09-28T12:00:00')));
    assert.deepEqual(e, ['batch-3', 'batch-5', 'clean-week', 'combo-5', 'first-step']);
  });
  test('rework spoils the clean week', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 5 });
    let d;
    for (let i = 0; i < 10; i++) d = g.done('t_mail', `2026-09-28T${String(8 + i).padStart(2, '0')}:00:00`, 5);
    g.rework(d, '2026-10-06T09:00:00', 5);
    assert.ok(!earned(play(g.records, T('2026-10-06T12:00:00'))).includes('clean-week'));
  });
  test('in the zone, personal best, seven days, journeyman', () => {
    const g = game();
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run', cadence: 'daily' });
    for (let d = 22; d <= 28; d++) g.done('t_run', `2026-09-${d}T09:00:00`, 30 - d + 22);
    g.seed('t_run', '2026-08-01', 1000);
    const e = earned(play(g.records, T('2026-09-28T12:00:00')));
    for (const id of ['in-the-zone', 'personal-best', 'week-streak', 'skill-5']) assert.ok(e.includes(id), id);
    assert.ok(!e.includes('mastery'));
  });
});

// ─── moments ────────────────────────────────────────────────────────────────

describe('moments', () => {
  test('energy per hour, a place from the kind, no points', () => {
    const g = game();
    const m = g.moment('kind_drive', '2026-09-28T07:00:00', '2026-09-28T08:30:00', { who: 'Whitney' });
    assert.equal(m.place, 'place_car');
    assert.equal(m.day, '2026-09-28');
    assert.deepEqual(m.energy, { stamina: 0.8, mana: 1.5 });
    assert.equal(m.who, 'Whitney');
    const p = play(g.records, T('2026-09-28T09:00:00'));
    assert.equal(p.balance, 0);
    assert.equal(p.player.xp, 0);
    assert.equal(p.moments.length, 1);
  });
  test('own place, and bad input', () => {
    const db = index(baseRecords());
    const m = makeMoment(db, 'kind_chat', { start: T('2026-09-28T10:00:00'), end: T('2026-09-28T10:30:00'), place: 'place_desk' });
    assert.equal(m.place, 'place_desk');
    assert.deepEqual(m.energy, { stamina: 0, mana: 1 });
    assert.throws(() => makeMoment(db, 'kind_nope', { start: 1, end: 2 }), /no moment kind/);
    assert.throws(() => makeMoment(db, 'kind_chat', { start: 2, end: 2 }), /ends after/);
    assert.throws(() => makeMoment(db, 'kind_chat', { start: 1, end: 2, place: 'place_moon' }), /no place/);
  });
});

// ─── play ───────────────────────────────────────────────────────────────────

describe('play', () => {
  test('player, stats and today add up', () => {
    const g = game();
    g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 300 });
    g.task({ id: 't_run', title: 'Run', skill: 'sk_run', estimate: 300 });
    g.done('t_mail', '2026-09-28T10:00:00', 60);
    g.done('t_run', '2026-09-28T12:00:00', 60);
    const p = play(g.records, T('2026-09-28T13:00:00'));
    assert.equal(p.player.xp, 600);
    assert.equal(p.player.level, levelFor(600, PLAYER_STEP).level);
    assert.equal(p.stats.find((s) => s.id === 'stat_work').xp, 300);
    assert.equal(p.stats.find((s) => s.id === 'stat_work').lastWeek, 300);
    assert.equal(p.skills.find((s) => s.id === 'sk_mail').level, levelFor(300, SKILL_STEP).level);
    assert.deepEqual(p.today, { points: 600, done: 2, minutes: 120 });
    assert.equal(p.history[0].title, 'Run');
    assert.equal(p.week, '2026-W40');
  });
  test('combo and batch banners count down', () => {
    const g = game();
    g.task({ id: 't_pr', title: 'PR', skill: 'sk_mail', batch: 'pr' });
    g.done('t_pr', '2026-09-28T09:00:00', 10);
    g.done('t_pr', '2026-09-28T09:15:00', 10);
    let p = play(g.records, T('2026-09-28T09:20:00'));
    assert.deepEqual(p.combo, { index: 1, minutesLeft: 25 });
    assert.deepEqual(p.batch, { name: 'pr', index: 1, minutesLeft: 5 });
    p = play(g.records, T('2026-09-28T09:50:00'));
    assert.deepEqual(p.combo, { index: 0, minutesLeft: 0 });
    assert.equal(p.batch, null);
  });
  test('overdue tasks are flagged', () => {
    const g = game();
    g.task({ id: 't_late', title: 'Late', skill: 'sk_mail', deadline: '2026-09-20', cadence: 'once' });
    const p = play(g.records, T('2026-09-28T09:00:00'));
    assert.equal(p.tasks[0].overdue, true);
    assert.equal(p.tasks[0].critical, true);
  });
});

// Keep the direct pricing call covered too: it is what the timer uses to preview a price.
test('priceDone previews what makeDone stores', () => {
  const g = game();
  g.task({ id: 't_mail', title: 'Mail', skill: 'sk_mail', estimate: 20 });
  const db = g.db();
  const p = priceDone(db, db.task.get('t_mail'), { start: T('2026-09-28T09:00:00'), end: T('2026-09-28T09:20:00'), minutes: 20, value: 20, quality: 1 });
  const d = makeDone(db, 't_mail', { end: T('2026-09-28T09:20:00'), minutes: 20 });
  assert.deepEqual(d.price, p);
});
