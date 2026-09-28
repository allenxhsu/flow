// Corrections (SPEC.md › Corrections): a record that should never have counted
// is withdrawn by its own write-once event, and everything derived follows.
//
// Written from the spec, not the implementation: nothing here reaches past
// makeCorrection / index / play / balanceOf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeCorrection, AMENDABLE, index, play, balanceOf, makeReward, makePurchase, makeRework,
} from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const MON = '2026-09-21';
const reason = 'ticked off, nothing was done';

/** A world with one 60-minute completion. */
function one() {
  const g = game();
  const task = g.task({ title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 60 });
  const done = g.done(task, `${MON}T10:00:00`, 60);
  return { g, task, done };
}

test('void: the completion counts for nothing, and is in no list', () => {
  const { g, done } = one();
  const before = play(g.db(), T(`${MON}T18:00:00`));
  assert.ok(before.balance > 0, 'it earned something to withdraw');

  g.add(makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:00:00`) }));
  const db = g.db();
  assert.equal(db.done.length, 0, 'in no list');
  const after = play(db, T(`${MON}T20:00:00`));
  assert.equal(after.balance, 0);
  assert.equal(after.player.xp, 0);
  assert.equal(after.player.level, 1);
  assert.equal(after.stats.reduce((n, s) => n + s.xp, 0), 0);
  assert.equal(balanceOf(db), 0);
});

test('void: the original record stays in the store, with the reason beside it', () => {
  const { g, done } = one();
  const rec = makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:00:00`) });
  g.add(rec);
  assert.ok(g.records.some((r) => r.id === done.id), 'history is not rewritten');
  const db = g.db();
  assert.deepEqual(db.corrections.map((c) => [c.target, c.kind, c.reason]), [[done.id, 'void', reason]]);
  assert.deepEqual(db.correction.get(done.id).map((c) => c.id), [rec.id]);
});

test('a correction is a write-once event with an id, a day and a time', () => {
  const { g, done } = one();
  const rec = makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:30:00`) });
  assert.equal(rec.type, 'correction');
  assert.match(rec.id, /^correction_/);
  assert.equal(rec.day, MON);
  assert.equal(rec.at, T(`${MON}T19:30:00`));
  assert.equal(rec.target, done.id);
});

test('amend: points and minutes become the numbers the player typed', () => {
  const { g, done } = one();
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'amend', patch: { minutes: 15, points: 15 }, reason: 'it took a quarter hour', at: T(`${MON}T19:00:00`) }));
  const db = g.db();
  assert.equal(db.done.length, 1);
  assert.equal(db.done[0].minutes, 15);
  assert.equal(db.done[0].price.points, 15);
  assert.equal(db.done[0].corrected, true);
  assert.equal(balanceOf(db), 15);
});

test('amend: a field the correction leaves out is untouched', () => {
  const { g, done } = one();
  const was = g.db().done[0];
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'amend', patch: { points: 10 }, reason: 'half of it was a meeting', at: T(`${MON}T19:00:00`) }));
  const now = g.db().done[0];
  assert.equal(now.minutes, was.minutes);
  assert.equal(now.task, was.task);
  assert.equal(now.end, was.end);
  assert.equal(now.price.base, was.price.base, 'the price it was originally given is still on the record');
  assert.equal(now.price.points, 10);
});

test('only minutes, points and note can be amended', () => {
  const { g, done } = one();
  assert.deepEqual(AMENDABLE, ['minutes', 'points', 'note']);
  for (const patch of [{ task: 'sk_other' }, { end: 1 }, { quality: 0.5 }, { day: MON }]) {
    assert.throws(() => makeCorrection(g.db(), { target: done.id, kind: 'amend', patch, reason }), /amend/i);
  }
  assert.throws(() => makeCorrection(g.db(), { target: done.id, kind: 'amend', patch: {}, reason }), /amend/i);
});

test('a reason is required, and so is a kind that exists', () => {
  const { g, done } = one();
  for (const bad of ['', '   ', undefined, null]) {
    assert.throws(() => makeCorrection(g.db(), { target: done.id, kind: 'void', reason: bad }), /reason/i);
  }
  assert.throws(() => makeCorrection(g.db(), { target: done.id, kind: 'delete', reason }), /kind/i);
});

test('the target must be an event that exists', () => {
  const { g } = one();
  assert.throws(() => makeCorrection(g.db(), { target: 'done_nope', kind: 'void', reason }), /no .*done_nope|not found|no such/i);
  assert.throws(() => makeCorrection(g.db(), { target: 'sk_mail', kind: 'void', reason }), /event/i);
});

test('an event is not voided twice', () => {
  const { g, done } = one();
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:00:00`) }));
  assert.throws(() => makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T20:00:00`) }), /already/i);
});

test('the latest correction on one event wins, field by field', () => {
  const { g, done } = one();
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'amend', patch: { minutes: 30, points: 30 }, reason: 'first guess', at: T(`${MON}T19:00:00`) }));
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'amend', patch: { points: 20 }, reason: 'closer', at: T(`${MON}T20:00:00`) }));
  const d = g.db().done[0];
  assert.equal(d.price.points, 20, 'the later points win');
  assert.equal(d.minutes, 30, 'the earlier minutes stand');
});

test('an amended event can then be voided', () => {
  const { g, done } = one();
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'amend', patch: { points: 20 }, reason: 'less', at: T(`${MON}T19:00:00`) }));
  g.add(makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T20:00:00`) }));
  assert.equal(g.db().done.length, 0);
  assert.equal(balanceOf(g.db()), 0);
});

test('deleting the correction puts the event back', () => {
  const { g, done } = one();
  const rec = makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:00:00`) });
  g.add(rec);
  assert.equal(g.db().done.length, 0);
  g.records = g.records.map((r) => (r.id === rec.id ? { ...r, deletedAt: T(`${MON}T21:00:00`) } : r));
  assert.equal(g.db().done.length, 1);
  assert.ok(balanceOf(g.db()) > 0);
  assert.equal(g.db().corrections.length, 0);
});

test('voiding a completion withdraws the rework logged against it', () => {
  const { g, done } = one();
  g.rework(done, `${MON}T14:00:00`, 30);
  const withRework = balanceOf(g.db());
  assert.ok(withRework < 60, 'the rework charged something');

  g.add(makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:00:00`) }));
  const db = g.db();
  assert.equal(db.rework.length, 0, 'a penalty for a completion that never happened is not a debt');
  assert.equal(balanceOf(db), 0);
});

test('any event can be corrected: a purchase voided gives the points back', () => {
  const g = game();
  const task = g.task({ title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 60 });
  g.done(task, `${MON}T10:00:00`, 60);
  const reward = g.reward({ title: 'Ice cream', price: 30 });
  const buy = g.buy(reward, `${MON}T15:00:00`);
  const spent = balanceOf(g.db());
  g.add(makeCorrection(g.db(), { target: buy.id, kind: 'void', reason: 'never bought it', at: T(`${MON}T19:00:00`) }));
  assert.equal(balanceOf(g.db()), spent + buy.charged);
  assert.equal(g.db().purchases.length, 0);
});

test('a voided completion is not a run: targets and bests forget it', () => {
  const g = game();
  const task = g.task({ title: 'Mail', skill: 'sk_mail', measure: 'time', cadence: 'anytime', estimate: 60 });
  g.done(task, `${MON}T10:00:00`, 60);
  g.done(task, `2026-09-22T10:00:00`, 60);
  const wrong = g.done(task, `2026-09-23T10:00:00`, 5);
  const withWrong = play(g.db(), T('2026-09-24T09:00:00')).tasks.find((t) => t.id === task.id);
  g.add(makeCorrection(g.db(), { target: wrong.id, kind: 'void', reason: 'logged by accident', at: T('2026-09-23T19:00:00') }));
  const fixed = play(g.db(), T('2026-09-24T09:00:00')).tasks.find((t) => t.id === task.id);
  assert.notEqual(fixed.best, withWrong.best, 'the 5-minute best goes with it');
  assert.equal(fixed.best, 60);
});

test('a correction of a correction is refused: they are not events to fix', () => {
  const { g, done } = one();
  const rec = makeCorrection(g.db(), { target: done.id, kind: 'void', reason, at: T(`${MON}T19:00:00`) });
  g.add(rec);
  assert.throws(() => makeCorrection(g.db(), { target: rec.id, kind: 'void', reason: 'undo it' }), /correction/i);
});
