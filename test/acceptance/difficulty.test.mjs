// Acceptance: game difficulty (SPEC.md › Difficulty). Written before the code.
// Push is the default and is exactly the game the other acceptance tests
// describe, so none of them change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const SUN = '2026-09-27'; // the review day
const MON = '2026-09-28'; // the new setting starts
const review = (g, day, difficulty, at = '20:00:00') =>
  g.add(M.makeReview(g.db(), { satisfaction: 7, at: T(`${day}T${at}`), ...(difficulty ? { difficulty } : {}) }));

/** Seed XP on Run so the player (and the Run skill) reach a level. */
function levelled(g, points) {
  const run = g.task({ id: 'task_run', title: 'Run', skill: 'sk_run', estimate: 30 });
  g.seed(run.id, '2026-09-20', points);
  return run;
}
const PLAYER_L3 = 1500;   // 500 + 1000
const PLAYER_L6 = 7500;   // 500 × (1+2+3+4+5)

test('five tiers, easiest first, Push by default', () => {
  assert.deepEqual(M.DIFFICULTY.map((d) => d.id), ['steady', 'push', 'grind', 'relentless', 'legend']);
  assert.deepEqual(M.DIFFICULTY.map((d) => d.name), ['Steady', 'Push', 'Grind', 'Relentless', 'Legend']);
  assert.deepEqual(M.DIFFICULTY.map((d) => d.unlock), [1, 1, 3, 6, 10]);
  assert.equal(M.DEFAULT_DIFFICULTY, 'push');
  const push = M.DIFFICULTY[1];
  assert.equal(push.points, 1); assert.equal(push.targetStep, M.TARGET_STEP); assert.equal(push.reworkAdd, 0);
  assert.equal(push.debt, M.DEBT_MULTIPLIER); assert.equal(push.energy, 1); assert.equal(push.grace, 1);
  const g = game();
  assert.equal(M.difficultyOn(g.db(), MON).id, 'push');
  assert.equal(M.difficultyOn(g.db(), MON, 'sk_read').id, 'push');
});

test('points: the tier multiplies after the bonus cap, and the price keeps its tier', () => {
  const plain = game(); levelled(plain, PLAYER_L3);
  const hard = game(); levelled(hard, PLAYER_L3); review(hard, SUN, { tier: 'grind' });
  const mk = (g) => g.task({ id: 'task_essay', title: 'Essay', skill: 'sk_read', estimate: 60 });
  const p = plain.done(mk(plain), `${MON}T10:00:00`, 60).price;
  const h = hard.done(mk(hard), `${MON}T10:00:00`, 60).price;
  assert.equal(p.difficulty, 'push');
  assert.equal(h.difficulty, 'grind');
  assert.equal(h.base, p.base);
  assert.equal(h.points, Math.round(p.base * Math.min(M.BONUS_CAP, p.multiplier) * 1.25));
});

test('a new setting starts the day after its review, not the same day', () => {
  const g = game(); levelled(g, PLAYER_L3); review(g, SUN, { tier: 'grind' }, '09:00:00');
  const essay = g.task({ id: 'task_essay', title: 'Essay', skill: 'sk_read', estimate: 60 });
  assert.equal(g.done(essay, `${SUN}T12:00:00`, 60).price.difficulty, 'push');
  assert.equal(M.difficultyOn(g.db(), SUN).id, 'push');
  assert.equal(M.difficultyOn(g.db(), MON).id, 'grind');
});

test('target step: Steady aims 3% better, and a repeated task’s estimate follows it', () => {
  const g = game(); review(g, SUN, { tier: 'push', skills: { sk_mail: 'steady' } });
  const mail = g.task({ id: 'task_mail', title: 'Inbox', skill: 'sk_mail', estimate: 100 });
  for (const d of ['2026-09-28', '2026-09-29', '2026-09-30']) g.done(mail, `${d}T10:00:00`, 100);
  const s = M.taskStats(g.db(), mail, T('2026-10-01T09:00:00'));
  assert.equal(s.target, 97);
  const price = g.done(mail, '2026-10-01T11:00:00', 100).price;
  assert.equal(price.target, 97);
  assert.equal(price.estimate, 97);
  assert.equal(price.difficulty, 'steady');
});

test('rework: the tier’s add goes on the multiplier, using the completion’s own tier', () => {
  const g = game(); levelled(g, PLAYER_L3); review(g, SUN, { tier: 'grind' });
  const essay = g.task({ id: 'task_essay', title: 'Essay', skill: 'sk_read', estimate: 60 });
  const d = g.done(essay, `${MON}T10:00:00`, 60);
  review(g, '2026-10-04', { tier: 'push' }); // back to Push the next week…
  const r = g.rework(d, '2026-10-06T10:00:00', 30); // …but this job was priced at Grind
  assert.equal(r.difficulty, 'grind');
  assert.equal(r.multiplier, 1.75);
  assert.equal(r.penalty, Math.round(30 * (d.price.points / 60) * 1.75));
});

test('rework: Steady forgives a little, critical work adds the tier too', () => {
  const g = game(); review(g, SUN, { tier: 'steady' });
  const essay = g.task({ id: 'task_essay', title: 'Essay', skill: 'sk_read', estimate: 60 });
  const urgent = g.task({ id: 'task_urgent', title: 'Urgent', skill: 'sk_read', estimate: 60, critical: true });
  assert.equal(g.rework(g.done(essay, `${MON}T10:00:00`, 60), `${MON}T12:00:00`, 10).multiplier, 1.25);
  assert.equal(g.rework(g.done(urgent, `${MON}T14:00:00`, 60), `${MON}T16:00:00`, 10).multiplier, 1.75);
});

test('debt: the tier sets what the part below zero costs', () => {
  assert.equal(M.chargeFor(0, 100), 200);
  assert.equal(M.chargeFor(0, 100, 1.5), 150);
  assert.equal(M.chargeFor(40, 100, 3), 40 + 60 * 3);

  const easy = game(); review(easy, SUN, { tier: 'steady' });
  const cake = easy.reward({ id: 'reward_cake', title: 'Cake', price: 100 });
  const p = easy.buy(cake, `${MON}T18:00:00`);
  assert.equal(p.difficulty, 'steady');
  assert.equal(p.charged, 150);

  const hard = game(); levelled(hard, PLAYER_L6); review(hard, SUN, { tier: 'relentless' });
  const trip = hard.reward({ id: 'reward_trip', title: 'Trip', price: 8000 });
  assert.equal(hard.buy(trip, `${MON}T18:00:00`).charged, 7500 + 500 * 2.5);
});

test('energy: positive costs scale with the tier, restoring never does', () => {
  const g = game(); levelled(g, PLAYER_L3); review(g, SUN, { tier: 'grind', skills: { sk_mail: 'steady' } });
  const lift = g.task({ id: 'task_lift', title: 'Study', skill: 'sk_read', estimate: 30, stamina: 4, mana: -3 });
  const mail = g.task({ id: 'task_mail', title: 'Inbox', skill: 'sk_mail', estimate: 30, mana: 2 });
  const a = g.done(lift, `${MON}T08:00:00`, 30).price.energy;
  assert.equal(a.stamina, 4.6);
  assert.equal(a.mana, -3);
  assert.equal(g.done(mail, `${MON}T12:00:00`, 30).price.energy.mana, 1.7);
});

test('grace days: how many misses a daily streak forgives in 7 days', () => {
  const days = new Set(['2026-09-20', '2026-09-21', '2026-09-23', '2026-09-25', '2026-09-26']); // misses 22 and 24
  assert.equal(M.dailyStreak(days, '2026-09-26').streak, 3, 'Push forgives one');
  assert.equal(M.dailyStreak(days, '2026-09-26', 1).streak, 3);
  assert.equal(M.dailyStreak(days, '2026-09-26', 2).streak, 5, 'Steady forgives two');
  assert.equal(M.dailyStreak(days, '2026-09-26', 0).streak, 2, 'Relentless forgives none');
});

test('the dashboard’s daily streaks use the global tier’s grace', () => {
  const g = game(); levelled(g, PLAYER_L6); review(g, '2026-09-20', { tier: 'relentless' });
  const floss = g.task({ id: 'task_floss', title: 'Floss', skill: 'sk_read', estimate: 2, cadence: 'daily' });
  for (const d of ['2026-09-20', '2026-09-21', '2026-09-23', '2026-09-24']) g.done(floss, `${d}T21:00:00`, 2);
  const t = M.play(g.records, T('2026-09-24T22:00:00')).tasks.find((x) => x.id === floss.id);
  assert.equal(t.streak, 2);
});

test('unlocks: raising needs the level, lowering never does, unknown tiers are refused', () => {
  const g = game();
  assert.throws(() => M.makeReview(g.db(), { satisfaction: 7, at: T(`${SUN}T20:00:00`), difficulty: { tier: 'grind' } }), /level|unlock/i);
  assert.throws(() => M.makeReview(g.db(), { satisfaction: 7, at: T(`${SUN}T20:00:00`), difficulty: { tier: 'nightmare' } }), /tier|difficulty/i);
  assert.throws(() => M.makeReview(g.db(), { satisfaction: 7, at: T(`${SUN}T20:00:00`), difficulty: { tier: 'push', skills: { sk_nope: 'steady' } } }), /skill/i);
  const r = M.makeReview(g.db(), { satisfaction: 7, at: T(`${SUN}T20:00:00`), difficulty: { tier: 'steady' } });
  assert.deepEqual(r.difficulty, { tier: 'steady', skills: {} });

  // Player level 3 from Run alone: the player may pick Grind, but Read (level 1) may not override to it.
  const h = game(); levelled(h, PLAYER_L3);
  assert.ok(M.makeReview(h.db(), { satisfaction: 7, at: T(`${SUN}T20:00:00`), difficulty: { tier: 'grind', skills: { sk_run: 'grind', sk_read: 'steady' } } }));
  assert.throws(() => M.makeReview(h.db(), { satisfaction: 7, at: T(`${SUN}T20:00:00`), difficulty: { tier: 'push', skills: { sk_read: 'grind' } } }), /level|unlock/i);
});

test('a review without difficulty keeps the setting; one with it replaces the whole setting', () => {
  const g = game(); levelled(g, PLAYER_L3);
  review(g, '2026-09-20', { tier: 'grind', skills: { sk_mail: 'steady' } });
  review(g, SUN, null);
  assert.equal(M.difficultyOn(g.db(), MON, 'sk_mail').id, 'steady');
  assert.equal(M.difficultyOn(g.db(), MON, 'sk_read').id, 'grind');
  review(g, '2026-10-04', { tier: 'grind' });
  assert.equal(M.difficultyOn(g.db(), '2026-10-05', 'sk_mail').id, 'grind', 'the override was dropped');
});

test('play() shows the setting, what is unlocked and what unlocks next', () => {
  const fresh = M.play(game().records, T(`${MON}T12:00:00`)).difficulty;
  assert.equal(fresh.tier, 'push');
  assert.equal(fresh.name, 'Push');
  assert.deepEqual(fresh.skills, {});
  assert.deepEqual(fresh.unlocked, ['steady', 'push']);
  assert.deepEqual(fresh.next, { id: 'grind', name: 'Grind', unlock: 3 });
  assert.equal(fresh.changesAt, 'review');

  const g = game(); levelled(g, PLAYER_L6); review(g, SUN, { tier: 'relentless', skills: { sk_run: 'grind' } });
  const d = M.play(g.records, T(`${MON}T12:00:00`)).difficulty;
  assert.equal(d.tier, 'relentless');
  assert.deepEqual(d.skills, { sk_run: 'grind' });
  assert.deepEqual(d.unlocked, ['steady', 'push', 'grind', 'relentless']);
  assert.deepEqual(d.next, { id: 'legend', name: 'Legend', unlock: 10 });
});
