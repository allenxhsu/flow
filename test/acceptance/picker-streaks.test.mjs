// SPEC.md › The next task; Streaks, reviews, achievements.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNext, play, makeReview, latestPerWeek, weeklyStreak, isoWeek } from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const ids = (p) => [p.next, ...p.alternatives].filter(Boolean).map((o) => o.task);

// ── The next task ──────────────────────────────────────────────────────────

test('next task: one suggestion plus alternatives', () => {
  const g = game();
  g.task({ title: 'A', skill: 'sk_mail', estimate: 10 });
  g.task({ title: 'B', skill: 'sk_read', estimate: 10 });
  g.energy(`${D}T06:30:00`, 8, 8);
  const p = pickNext(g.db(), T(`${D}T08:00:00`));
  assert.ok(p.next && typeof p.next.task === 'string');
  assert.ok(Array.isArray(p.alternatives) && p.alternatives.length === 1);
});

test('next task order: due soon (≤ 2 days) or overdue comes first, even when not affordable', () => {
  const g = game();
  g.task({ title: 'Easy', skill: 'sk_read', estimate: 10 });
  const due = g.task({ title: 'Quote', skill: 'sk_mail', estimate: 60, mana: 9, deadline: '2026-09-30' });
  const overdue = g.task({ title: 'Late PO', skill: 'sk_mail', estimate: 60, mana: 9, deadline: '2026-09-25' });
  const later = g.task({ title: 'Audit', skill: 'sk_mail', estimate: 60, deadline: '2026-10-01' }); // 3 days
  g.energy(`${D}T06:30:00`, 5, 5);
  const order = ids(pickNext(g.db(), T(`${D}T08:00:00`)));
  assert.deepEqual(new Set(order.slice(0, 2)), new Set([due.id, overdue.id]));
  assert.ok(order.indexOf(later.id) > 1, 'a deadline 3 days out is not "due soon"');
});

test('next task order: affordable with today’s energy before unaffordable', () => {
  const g = game();
  const heavy = g.task({ title: 'Heavy', skill: 'sk_mail', estimate: 30, mana: 6 });
  const light = g.task({ title: 'Light', skill: 'sk_mail', estimate: 30, mana: 2 });
  g.energy(`${D}T06:30:00`, 5, 5);
  assert.deepEqual(ids(pickNext(g.db(), T(`${D}T08:00:00`))), [light.id, heavy.id]);
});

test('next task order: then the underdog stat', () => {
  const g = game();
  const seedTask = g.task({ title: 'seed', skill: 'sk_mail', estimate: 1 });
  g.seed(seedTask.id, '2026-09-25', 300);
  g.records.push(
    { id: 'sk_weld', type: 'skill', name: 'Weld', stat: 'stat_craft', place: 'place_floor' },
    { id: 'sk_call', type: 'skill', name: 'Call', stat: 'stat_bonds', place: null },
  );
  for (const [sk, pts] of [['sk_read', 100], ['sk_weld', 120], ['sk_call', 150]]) {
    g.seed(g.task({ title: `seed ${sk}`, skill: sk, estimate: 1, cadence: 'once' }).id, '2026-09-25', pts);
  }
  g.energy(`${D}T06:30:00`, 8, 8);
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30 });
  const jog = g.task({ title: 'Jog', skill: 'sk_run', estimate: 30 }); // Body: 0 XP this week
  const order = ids(pickNext(g.db(), T(`${D}T08:00:00`)));
  assert.ok(order.indexOf(jog.id) < order.indexOf(mail.id));
});

test('next task order: then the skill closest to levelling', () => {
  const g = game();
  // no underdog difference: both stats have XP from long ago only; Mind skill is 5 XP from its next level
  const r = g.task({ title: 'seed read', skill: 'sk_read', estimate: 1, cadence: 'once' });
  g.seed(r.id, '2026-08-01', 95);
  const m = g.task({ title: 'seed mail', skill: 'sk_mail', estimate: 1, cadence: 'once' });
  g.seed(m.id, '2026-08-01', 10);
  g.energy(`${D}T06:30:00`, 8, 8);
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30 });
  const read = g.task({ title: 'Read', skill: 'sk_read', estimate: 30 });
  const order = ids(pickNext(g.db(), T(`${D}T08:00:00`)));
  assert.ok(order.indexOf(read.id) < order.indexOf(mail.id));
});

test('batch: same-type batch tasks wait until 3 are waiting', () => {
  const g = game();
  const other = g.task({ title: 'Other', skill: 'sk_read', estimate: 30 });
  const pr = [1, 2].map((i) => g.task({ title: `PR${i}`, skill: 'sk_mail', estimate: 10, batch: 'purchase request' }));
  const p = pickNext(g.db(), T(`${D}T08:00:00`));
  assert.deepEqual(ids(p), [other.id]);
  assert.equal(p.queued.length, 1);
});

test('batch: with 3 or more waiting they are offered together, once ("Batch: 4 purchase requests")', () => {
  const g = game();
  g.task({ title: 'Other', skill: 'sk_read', estimate: 30 });
  const pr = [1, 2, 3, 4].map((i) => g.task({ title: `PR${i}`, skill: 'sk_mail', estimate: 10, batch: 'purchase request' }));
  const p = pickNext(g.db(), T(`${D}T08:00:00`));
  const offers = [p.next, ...p.alternatives].filter((o) => o.batch);
  assert.equal(offers.length, 1, 'one offer for the whole batch');
  assert.deepEqual(new Set(offers[0].batch), new Set(pr.map((t) => t.id)));
  const singles = ids(p).filter((id) => pr.some((t) => t.id === id));
  assert.ok(singles.length <= 1, 'members are not offered one by one as well');
  assert.equal(p.queued.length, 0);
});

test('batch: fewer than 3 are offered when one is due soon', () => {
  const g = game();
  g.task({ title: 'Other', skill: 'sk_read', estimate: 30 });
  const a = g.task({ title: 'PR1', skill: 'sk_mail', estimate: 10, batch: 'purchase request', deadline: '2026-09-29' });
  const b = g.task({ title: 'PR2', skill: 'sk_mail', estimate: 10, batch: 'purchase request' });
  const p = pickNext(g.db(), T(`${D}T08:00:00`));
  const offered = [p.next, ...p.alternatives].flatMap((o) => o.batch ?? [o.task]);
  assert.ok(offered.includes(a.id) && offered.includes(b.id));
});

// ── Streaks ────────────────────────────────────────────────────────────────

function dailyWith(days) {
  const g = game();
  const t = g.task({ title: 'Stretch', skill: 'sk_run', estimate: 10, cadence: 'daily' });
  for (const d of days) g.done(t, `${d}T07:10:00`, 10);
  return play(g.records, T(`${D}T20:00:00`)).tasks.find((x) => x.id === t.id).streak;
}

test('streaks: a daily streak counts consecutive days', () => {
  assert.equal(dailyWith(['2026-09-25', '2026-09-26', '2026-09-27', D]), 4);
});

test('streaks: daily streaks forgive one missed day per week', () => {
  // 21 … 28 with the 24th missed: the streak survives
  assert.equal(dailyWith(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-25', '2026-09-26', '2026-09-27', D]), 7);
});

test('streaks: a second missed day in the same week breaks it', () => {
  // 23rd and 24th both missed → only 25…28 count
  assert.equal(dailyWith(['2026-09-21', '2026-09-22', '2026-09-25', '2026-09-26', '2026-09-27', D]), 4);
});

test('streaks: weekly streaks count ISO weeks (across the year end)', () => {
  assert.equal(isoWeek('2026-12-31'), '2026-W53');
  assert.equal(isoWeek('2027-01-04'), '2027-W01');
  const g = game();
  const t = g.task({ title: 'Plan week', skill: 'sk_read', estimate: 30, cadence: 'weekly' });
  g.done(t, '2026-12-22T10:00:00', 30); // W52
  g.done(t, '2026-12-29T10:00:00', 30); // W53
  g.done(t, '2027-01-05T10:00:00', 30); // W01
  assert.equal(play(g.records, T('2027-01-05T20:00:00')).tasks.find((x) => x.id === t.id).streak, 3);
  assert.equal(weeklyStreak(new Set(['2026-W38', '2026-W39', '2026-W40']), D).streak, 3);
});

// ── Weekly review ──────────────────────────────────────────────────────────

test('review: satisfaction + per-stat 0–10, win, lesson, one change', () => {
  const g = game();
  const r = makeReview(g.db(), { satisfaction: 7, ratings: { stat_body: 6, stat_work: 8 }, win: 'shipped', lesson: 'batch POs', next: 'gym twice', at: T('2026-09-27T20:00:00') });
  assert.equal(r.type, 'review');
  assert.equal(r.satisfaction, 7);
  assert.deepEqual(r.ratings, { stat_body: 6, stat_work: 8 });
  assert.deepEqual([r.win, r.lesson, r.next], ['shipped', 'batch POs', 'gym twice']);
  assert.throws(() => makeReview(g.db(), { satisfaction: 11, at: T('2026-09-27T20:00:00') }));
  assert.throws(() => makeReview(g.db(), { satisfaction: -1, at: T('2026-09-27T20:00:00') }));
  assert.throws(() => makeReview(g.db(), { satisfaction: 5, ratings: { stat_body: 12 }, at: T('2026-09-27T20:00:00') }));
});

test('review: weekly — the latest review in a week is that week’s score', () => {
  const g = game();
  const a = makeReview(g.db(), { satisfaction: 5, at: T('2026-09-20T20:00:00') });
  const b = makeReview(g.db(), { satisfaction: 6, at: T('2026-09-27T09:00:00') });
  const c = makeReview(g.db(), { satisfaction: 8, at: T('2026-09-27T20:00:00') });
  const weeks = latestPerWeek([a, c, b]);
  assert.deepEqual(weeks.map((r) => r.satisfaction), [5, 8]);
});

test('review: life satisfaction is separate — XP cannot buy it, a review earns no XP', () => {
  const g = game();
  const t = g.task({ title: 'Big job', skill: 'sk_mail', estimate: 600 });
  g.add(makeReview(g.db(), { satisfaction: 6, at: T('2026-09-27T20:00:00') }));
  const before = play(g.records, T(`${D}T08:00:00`));
  g.done(t, `${D}T18:00:00`, 600);
  const after = play(g.records, T(`${D}T20:00:00`));
  assert.equal(after.satisfaction.latest.satisfaction, 6);
  assert.deepEqual(after.satisfaction.history, before.satisfaction.history);
  assert.equal(before.player.xp, 0, 'the review itself earned nothing');
});
