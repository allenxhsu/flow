// SPEC.md › Rework (heavily penalized), and the debt rule as it applies to rework.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRework, taskStats, actual, play, reworkCandidate, balanceOf } from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} (±${eps})`);

test('rework penalty — the spec example: 90 pts in 90 min, 60-min fix → 60 × 1 × 1.5 = 90', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 90 });
  const d = g.done(t, `${D}T10:30:00`, 90);
  assert.equal(d.price.points, 90);
  const rw = makeRework(g.db(), d.id, { minutes: 60, at: T(`${D}T14:00:00`) });
  assert.equal(rw.penalty, 90);
});

test('rework penalty = fix minutes × (points earned ÷ original minutes) × multiplier', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  const d = g.done(t, `${D}T10:30:00`, 30); // 60 pts earned in 30 min → 2 pts/min
  const rw = makeRework(g.db(), d.id, { minutes: 10, at: T(`${D}T14:00:00`) });
  near(rw.penalty, 10 * 2 * 1.5);
});

test('rework multiplier: 1.5×, 1.75×, 2× for the 1st, 2nd, 3rd+ rework of that completion', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  const d = g.done(t, `${D}T10:00:00`, 60);
  const penalties = [];
  for (let i = 0; i < 4; i++) penalties.push(g.rework(d, `${D}T1${2 + i}:00:00`, 20).penalty);
  [30, 35, 40, 40].forEach((p, i) => near(penalties[i], p));
  // counted per completion: a different completion of the same task starts again at 1.5×
  const d2 = g.done(t, `${D}T17:00:00`, 60);
  near(g.rework(d2, `${D}T18:00:00`, 20).penalty, 20 * (d2.price.points / 60) * 1.5);
});

for (const [why, fields] of [['flagged', { critical: true }], ['has a deadline', { deadline: '2026-10-15' }], ['for someone else', { forOthers: true }]]) {
  test(`rework multiplier: critical (${why}) is 2×, from the first rework`, () => {
    const g = game();
    const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60, ...fields });
    const d = g.done(t, `${D}T10:00:00`, 60);
    near(g.rework(d, `${D}T12:00:00`, 20).penalty, 40);
    near(g.rework(d, `${D}T13:00:00`, 20).penalty, 40);
  });
}

test('rework subtracts the penalty from XP', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 90 });
  const d = g.done(t, `${D}T10:30:00`, 90);
  const before = play(g.records, T(`${D}T12:00:00`)).player.xp;
  g.rework(d, `${D}T14:00:00`, 60);
  assert.equal(play(g.records, T(`${D}T15:00:00`)).player.xp, before - 90);
});

test('rework: levels can drop (player and skill)', () => {
  const g = game();
  const t = g.task({ title: 'Big job', skill: 'sk_mail', estimate: 600 });
  const d = g.done(t, `${D}T16:00:00`, 600);
  const up = play(g.records, T(`${D}T17:00:00`));
  const skillUp = up.skills.find((s) => s.id === 'sk_mail').level;
  assert.ok(up.player.level >= 2 && skillUp >= 2, 'the job levelled the player and the skill');
  g.rework(d, `${D}T18:00:00`, 400); // 400 × 1 × 1.5 = 600: back to zero
  const down = play(g.records, T(`${D}T19:00:00`));
  assert.equal(down.player.level, 1);
  assert.equal(down.skills.find((s) => s.id === 'sk_mail').level, 1);
});

test('rework subtracts the charge from the balance', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 90 });
  const d = g.done(t, `${D}T10:30:00`, 90);
  const cheap = g.task({ title: 'More', skill: 'sk_mail', estimate: 60 });
  g.done(cheap, `${D}T11:30:00`, 60); // balance well above the penalty
  const bal = balanceOf(g.db());
  const rw = g.rework(d, `${D}T14:00:00`, 20); // 30 pts, balance stays positive
  assert.equal(balanceOf(g.db()), bal - 30);
  assert.equal(rw.charged ?? 30, 30);
});

test('debt: the part of a rework charge below zero costs double', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 30 });
  const d = g.done(t, `${D}T10:00:00`, 30); // balance 30
  g.rework(d, `${D}T14:00:00`, 40); // penalty 40 × 1 × 1.5 = 60: 30 from the balance, 30 below zero → 60
  assert.equal(balanceOf(g.db()), 30 - 30 - 2 * 30);
  g.rework(d, `${D}T15:00:00`, 20); // penalty 35, all below zero → 70
  assert.equal(balanceOf(g.db()), -60 - 70);
});

test('rework: the task’s true time becomes original + fix (for bests and targets)', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  const fast = g.done(t, '2026-09-20T10:00:00', 20);
  g.done(t, '2026-09-21T10:00:00', 30);
  g.done(t, '2026-09-22T10:00:00', 30);
  assert.equal(taskStats(g.db(), t).best, 20);
  g.rework(fast, '2026-09-23T10:00:00', 30); // 20 + 30 = 50
  const s = taskStats(g.db(), t);
  assert.equal(s.best, 30, 'the reworked run is no longer the best');
  near(s.target, ((50 + 30 + 30) / 3) * 0.95, 0.05);
  assert.equal(actual(fast, [g.records.at(-1)]).minutes, 50);
});

test('rework: the completion’s quality drops by the share redone', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 90 });
  const d = g.done(t, `${D}T10:30:00`, 90);
  const rw = g.rework(d, `${D}T14:00:00`, 30);
  const a = actual(d, [rw]);
  assert.ok(a.quality < 1, 'quality dropped');
  // reading: 30 of the original 90 minutes were redone → a third of the quality is lost
  near(a.quality, 1 - 30 / 90, 1e-9);
});

test('rework: the timer asks "is this rework of X?" for a task finished in the last 14 days', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  const d = g.done(t, `${D}T10:00:00`, 60);
  assert.equal(reworkCandidate(g.db(), t.id, T('2026-10-05T09:00:00'))?.id, d.id);
  assert.equal(reworkCandidate(g.db(), t.id, T('2026-10-20T09:00:00')), null, 'more than 14 days later: no question');
});
