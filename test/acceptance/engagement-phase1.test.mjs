// SPEC.md › Engagement › 1. The friction budget and 2. The real score, straight
// away. Written from the spec and the public contract only, before the code.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkInRate, gradeOf, callOutcome, finishCard, makeCorrection, addDays,
  BASELINE_UNITS, RETURN_WINDOW_DAYS, INSIGHT_WINDOW,
} from '../../src/model.js';
import { boardRecords, BASELINE_WEEKS } from '../../src/board.js';
import { game, T } from '../helpers.mjs';

const DAY0 = '2026-06-01'; // a Monday, long enough ago for the 30-day window to close
const at = (day, hh = '10') => `${day}T${hh}:00:00`;

/** The board, with one iterable task (Shaping) and one one-shot task (Inscription). */
function board() {
  const g = game([...boardRecords()]);
  const part = g.task({ id: 'task_part', title: 'Model a part', skill: 'skill_shaping', estimate: 60 });
  const dwg = g.task({ id: 'task_dwg', title: 'Release drawing', skill: 'skill_inscription', estimate: 60 });
  return { g, part, dwg };
}

/** `n` runs of a task, one every `every` days from `from`, each `minutes` long. */
function runs(g, task, { from, n, every, minutes, call }) {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(g.done(task, at(addDays(from, i * every)), minutes, call ? { call } : {}));
  return out;
}

describe('the constants the spec decided', () => {
  test('baseline minimums, the return window and the Insight window', () => {
    assert.deepEqual(BASELINE_UNITS, { iterable: 10, oneShot: 5 });
    assert.equal(BASELINE_WEEKS, 4);
    assert.equal(RETURN_WINDOW_DAYS, 30);
    assert.equal(INSIGHT_WINDOW, 20);
  });
});

describe('check-in rate', () => {
  test('any record the player wrote makes a check-in day', () => {
    const { g, part } = board();
    g.done(part, at('2026-09-21'), 30);
    g.moment('kind_meal', '2026-09-22T12:00:00', '2026-09-22T12:30:00');
    g.energy('2026-09-23T07:00:00', 7, 6);
    assert.deepEqual(checkInRate(g.db(), '2026-09-27'), { days: 3, of: 7 });
  });

  test('several records on one day are one check-in', () => {
    const { g, part } = board();
    g.done(part, at('2026-09-24', '09'), 30);
    g.done(part, at('2026-09-24', '15'), 30);
    assert.deepEqual(checkInRate(g.db(), '2026-09-27'), { days: 1, of: 7 });
  });

  test('a correction does not attend a day', () => {
    const { g, part } = board();
    const d = g.done(part, at('2026-09-21'), 30);
    g.add(makeCorrection(g.db(), { target: d.id, kind: 'amend', patch: { note: 'typo' }, reason: 'typo', at: T(at('2026-09-25')) }));
    assert.deepEqual(checkInRate(g.db(), '2026-09-27'), { days: 1, of: 7 });
  });

  test('only the window counts, and the window can be 28 days', () => {
    const { g, part } = board();
    g.done(part, at('2026-09-10'), 30);
    g.done(part, at('2026-09-26'), 30);
    assert.deepEqual(checkInRate(g.db(), '2026-09-27'), { days: 1, of: 7 });
    assert.deepEqual(checkInRate(g.db(), '2026-09-27', 28), { days: 2, of: 28 });
  });
});

describe('the right-once call', () => {
  test('a one-shot task needs a call', () => {
    const { g, dwg } = board();
    assert.throws(() => g.done(dwg, at('2026-09-21'), 50));
  });

  test('the call is kept on the completion', () => {
    const { g, dwg } = board();
    const d = g.done(dwg, at('2026-09-21'), 50, { call: 'minor' });
    assert.equal(d.call, 'minor');
  });

  test('only clean, minor and back are calls', () => {
    const { g, dwg } = board();
    assert.throws(() => g.done(dwg, at('2026-09-21'), 50, { call: 'great' }));
  });

  test('an iterable task refuses a call', () => {
    const { g, part } = board();
    assert.throws(() => g.done(part, at('2026-09-21'), 30, { call: 'clean' }));
  });
});

describe('the call resolves after 30 days', () => {
  test('pending inside the window, clean after it with nothing back', () => {
    const { g, dwg } = board();
    const d = g.done(dwg, at(DAY0), 60, { call: 'clean' });
    assert.equal(callOutcome(g.db(), d.id, T(at(addDays(DAY0, 10)))), 'pending');
    assert.equal(callOutcome(g.db(), d.id, T(at(addDays(DAY0, 31)))), 'clean');
  });

  test('one rework of at most a quarter of the time is minor', () => {
    const { g, dwg } = board();
    const d = g.done(dwg, at(DAY0), 60, { call: 'clean' });
    g.rework(d, at(addDays(DAY0, 5)), 15);
    assert.equal(callOutcome(g.db(), d.id, T(at(addDays(DAY0, 31)))), 'minor');
  });

  test('a bigger rework, or a second one, means it came back', () => {
    const big = board();
    const d1 = big.g.done(big.dwg, at(DAY0), 60, { call: 'clean' });
    big.g.rework(d1, at(addDays(DAY0, 5)), 16);
    assert.equal(callOutcome(big.g.db(), d1.id, T(at(addDays(DAY0, 31)))), 'back');

    const two = board();
    const d2 = two.g.done(two.dwg, at(DAY0), 60, { call: 'clean' });
    two.g.rework(d2, at(addDays(DAY0, 3)), 5);
    two.g.rework(d2, at(addDays(DAY0, 6)), 5);
    assert.equal(callOutcome(two.g.db(), d2.id, T(at(addDays(DAY0, 31)))), 'back');
  });
});

describe('Grade', () => {
  test('Hearth is never graded', () => {
    const { g } = board();
    assert.equal(gradeOf(g.db(), 'skill_covenant', T(at('2026-09-27'))).state, 'ungraded');
  });

  test('the baseline is open until four weeks have passed', () => {
    const { g, part } = board();
    runs(g, part, { from: DAY0, n: 12, every: 1, minutes: 60 });
    const r = gradeOf(g.db(), 'skill_shaping', T(at(addDays(DAY0, 14))));
    assert.equal(r.state, 'baseline');
    assert.equal(r.grade, null);
    assert.equal(r.baseline.units, 12);
    assert.deepEqual(r.baseline.need, { units: 10, weeks: 4 });
  });

  test('…and until it holds 10 units, however long that takes', () => {
    const { g, part } = board();
    runs(g, part, { from: DAY0, n: 6, every: 7, minutes: 60 });
    const r = gradeOf(g.db(), 'skill_shaping', T(at(addDays(DAY0, 60))));
    assert.equal(r.state, 'baseline');
    assert.equal(r.baseline.units, 6);
  });

  test('twice as fast as the baseline is Grade 10', () => {
    const { g, part } = board();
    runs(g, part, { from: DAY0, n: 10, every: 3, minutes: 60 });          // days 0–27
    runs(g, part, { from: addDays(DAY0, 29), n: 10, every: 1, minutes: 30 });
    const r = gradeOf(g.db(), 'skill_shaping', T(at(addDays(DAY0, 40))));
    assert.equal(r.state, 'graded');
    assert.equal(r.grade, 10);
  });

  test('pace now is the last 10 units only', () => {
    const { g, part } = board();
    runs(g, part, { from: DAY0, n: 10, every: 3, minutes: 60 });
    runs(g, part, { from: addDays(DAY0, 29), n: 10, every: 1, minutes: 30 });
    runs(g, part, { from: addDays(DAY0, 40), n: 10, every: 1, minutes: 60 });
    const r = gradeOf(g.db(), 'skill_shaping', T(at(addDays(DAY0, 52))));
    assert.equal(r.grade, 0, 'back at the baseline pace');
  });

  test('a one-shot baseline needs only 5 units', () => {
    const { g, dwg } = board();
    runs(g, dwg, { from: DAY0, n: 5, every: 6, minutes: 60, call: 'clean' }); // days 0–24
    const r = gradeOf(g.db(), 'skill_inscription', T(at(addDays(DAY0, 90))));
    assert.equal(r.state, 'graded');
    assert.equal(r.baseline.units, 5);
  });

  test('one-shot units inside 30 days move the provisional Grade only', () => {
    const { g, dwg } = board();
    runs(g, dwg, { from: DAY0, n: 5, every: 6, minutes: 60, call: 'clean' });
    const late = addDays(DAY0, 120);
    runs(g, dwg, { from: late, n: 5, every: 1, minutes: 30, call: 'clean' });
    const r = gradeOf(g.db(), 'skill_inscription', T(at(addDays(late, 6))));
    assert.equal(r.grade, 0, 'settled: nothing new has cleared its 30 days');
    assert.equal(r.provisionalGrade, 10, 'provisional: the new units count as clean');
  });

  test('a one-shot unit that came back does not count as clean', () => {
    const { g, dwg } = board();
    runs(g, dwg, { from: DAY0, n: 5, every: 6, minutes: 60, call: 'clean' });
    const late = addDays(DAY0, 120);
    const fast = runs(g, dwg, { from: late, n: 5, every: 1, minutes: 30, call: 'clean' });
    g.rework(fast[0], at(addDays(late, 10)), 30);
    const r = gradeOf(g.db(), 'skill_inscription', T(at(addDays(late, 60))));
    assert.ok(r.grade < 10, `a returned unit slows the clean pace (got ${r.grade})`);
  });

  test('Insight is the share of resolved calls that matched', () => {
    const { g, dwg } = board();
    const ds = runs(g, dwg, { from: DAY0, n: 4, every: 2, minutes: 60, call: 'clean' });
    g.rework(ds[3], at(addDays(DAY0, 9)), 40); // called clean, came back
    const r = gradeOf(g.db(), 'skill_inscription', T(at(addDays(DAY0, 60))));
    assert.equal(r.insight, 0.75);
  });
});

describe('the finish card', () => {
  test('a repeated task shows its pace against target', () => {
    const { g, part } = board();
    runs(g, part, { from: '2026-09-14', n: 3, every: 1, minutes: 40 });
    const d = g.done(part, at('2026-09-20'), 30);
    const card = finishCard(g.db(), d.id);
    const pace = card.find((l) => l.kind === 'pace');
    assert.ok(pace, 'a pace line');
    assert.match(pace.text, /30 min/);
    assert.match(pace.text, /under target/);
  });

  test('during the baseline it shows progress and no Grade', () => {
    const { g, part } = board();
    runs(g, part, { from: '2026-09-14', n: 2, every: 1, minutes: 40 });
    const d = g.done(part, at('2026-09-16'), 40);
    const card = finishCard(g.db(), d.id);
    const base = card.find((l) => l.kind === 'baseline');
    assert.ok(base, 'a baseline line');
    assert.match(base.text, /3\/10 units/);
    assert.match(base.text, /week 1 of 4/);
    assert.equal(card.find((l) => l.kind === 'grade'), undefined);
  });

  test('a personal best gets its own line', () => {
    const { g, part } = board();
    runs(g, part, { from: '2026-09-14', n: 3, every: 1, minutes: 40 });
    const d = g.done(part, at('2026-09-20'), 25);
    assert.ok(finishCard(g.db(), d.id).some((l) => l.kind === 'best'));
  });

  test('Toil shows none of it', () => {
    const { g } = board();
    g.add({ id: 'task_toil', type: 'task', title: 'Expense report', skill: null, measure: 'time', cadence: 'anytime', estimate: 10, stamina: 0, mana: 0 });
    const d = g.add({
      id: 'done_toil', type: 'done', task: 'task_toil', day: '2026-09-20', start: T('2026-09-20T09:00:00'), end: T('2026-09-20T09:12:00'),
      minutes: 12, measure: 'time', value: 12, quality: 1, price: { points: 10, base: 10, energy: {} },
    });
    assert.deepEqual(finishCard(g.db(), d.id), []);
  });
});
