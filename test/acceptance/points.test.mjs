// SPEC.md › Points (= XP). Black-box: written from the spec and docs/API.md only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDone, makeMoment, taskStats, play, BONUS_CAP } from '../../src/model.js';
import { game, T, at9 } from '../helpers.mjs';

const D = '2026-09-28';
const near = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} (±${eps})`);

/** All five default stats have a skill, and every stat but Body earned XP in the previous 7 days. */
function world() {
  const g = game();
  g.records.push(
    { id: 'sk_weld', type: 'skill', name: 'Weld', stat: 'stat_craft', place: 'place_floor' },
    { id: 'sk_call', type: 'skill', name: 'Call', stat: 'stat_bonds', place: null },
  );
  const seedT = {
    work: g.task({ title: 'seed work', skill: 'sk_mail', estimate: 1 }),
    mind: g.task({ title: 'seed mind', skill: 'sk_read', estimate: 1 }),
    craft: g.task({ title: 'seed craft', skill: 'sk_weld', estimate: 1 }),
    bonds: g.task({ title: 'seed bonds', skill: 'sk_call', estimate: 1 }),
  };
  g.seed(seedT.work.id, '2026-09-25', 200);
  g.seed(seedT.mind.id, '2026-09-25', 100);
  g.seed(seedT.craft.id, '2026-09-25', 150);
  g.seed(seedT.bonds.id, '2026-09-25', 120);
  return g;
}

test('base points = estimated minutes × quality × 1 point/min', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  const full = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 45 });
  assert.equal(full.price.base, 60, 'base is the estimate, not the minutes taken');
  assert.equal(full.price.points, 60);
  const half = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 60, quality: 0.5 });
  assert.equal(half.price.base, 30, '60 min × quality 0.5 = 30');
});

test('estimate: fewer than 3 runs uses the task’s own estimate', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  g.done(t, '2026-09-10T10:00:00', 40);
  g.done(t, '2026-09-11T10:00:00', 40);
  const third = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 40 });
  assert.equal(third.price.base, 60);
});

test('estimate: a repeated task (≥ 3 runs) uses its flow target (recent average − 5%), so it cannot be inflated', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 200 });
  g.done(t, '2026-09-10T10:00:00', 40);
  g.done(t, '2026-09-11T10:00:00', 50);
  g.done(t, '2026-09-12T10:00:00', 60);
  // avg 50 → target 47.5; the inflated 200-min estimate is ignored
  const fourth = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 55 });
  near(fourth.price.base, 47.5);
});

test('target = recent average of the last 5 runs, 5% better; needs ≥ 3 runs', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  g.done(t, '2026-09-10T10:00:00', 50);
  g.done(t, '2026-09-11T10:00:00', 50);
  assert.equal(taskStats(g.db(), t).target, null, 'no target after 2 runs');
  g.done(t, '2026-09-12T10:00:00', 50);
  near(taskStats(g.db(), t).target, 47.5, 0.05);
  // six runs: the oldest (200) falls out of the last five
  const g2 = world();
  const t2 = g2.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  [200, 50, 50, 50, 50, 50].forEach((m, i) => g2.done(t2, `2026-09-1${i}T10:00:00`, m));
  near(taskStats(g2.db(), t2).target, 47.5, 0.05);
});

test('flow bonus +20% for hitting the target', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  [40, 40, 40].forEach((m, i) => g.done(t, `2026-09-1${i}T10:00:00`, m));
  // avg 40 → target 38: 38 min hits it, 39 min misses it
  const hit = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 38 });
  assert.equal(hit.price.bonuses.flow, 0.2);
  const miss = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 39 });
  assert.equal(miss.price.bonuses.flow, 0);
});

test('personal best bonus +25% for beating the best', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  g.done(t, '2026-09-10T10:00:00', 40);
  const pb = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 35 });
  assert.equal(pb.price.bonuses.pb, 0.25);
  // The bonus is unchanged; what changed is where it lands. Points are the
  // minutes (SPEC.md › Points), and the bonus is style beside them.
  near(pb.price.points, pb.price.base);
  near(pb.price.style, pb.price.base * 0.25);
  const slower = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 45 });
  assert.equal(slower.price.bonuses.pb, 0);
});

test('underdog bonus +50% for the stat with least XP in the previous 7 days', () => {
  const g = world();
  const jog = g.task({ title: 'Jog', skill: 'sk_run', estimate: 30 });
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30 });
  const j = makeDone(g.db(), jog.id, { end: T(`${D}T08:00:00`), minutes: 30 });
  assert.equal(j.price.bonuses.underdog, 0.5, 'Body had 0 XP in the last 7 days');
  near(j.price.points, j.price.base);
  near(j.price.style, j.price.base * 0.5);
  const m = makeDone(g.db(), mail.id, { end: T(`${D}T08:00:00`), minutes: 30 });
  assert.equal(m.price.bonuses.underdog, 0, 'Work had the most XP');
});

test('underdog: only the previous 7 days count', () => {
  const g = world();
  const jog = g.task({ title: 'Jog', skill: 'sk_run', estimate: 30 });
  g.seed(jog.id, '2026-09-20', 1000); // 8 days before: ignored
  const old = makeDone(g.db(), jog.id, { end: T(`${D}T08:00:00`), minutes: 30 });
  assert.equal(old.price.bonuses.underdog, 0.5);
  g.seed(jog.id, '2026-09-21', 1000); // 7 days before: counts
  const recent = makeDone(g.db(), jog.id, { end: T(`${D}T08:00:00`), minutes: 30 });
  assert.equal(recent.price.bonuses.underdog, 0);
});

test('combo +10% per chained task (next start ≤ 30 min after last end), up to +100%', () => {
  const g = world();
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 10 });
  const combos = [];
  for (let i = 0; i < 12; i++) { // 10-min tasks, 30-min gaps: start at 09:00, 09:40, 10:20, …
    const d = g.done(t, at9(D, i * 40 + 10), 10);
    combos.push(d.price.bonuses.combo);
  }
  combos.forEach((c, i) => near(c, Math.min(1, 0.1 * i), 1e-9));
  const after31 = makeDone(g.db(), t.id, { end: T(at9(D, 11 * 40 + 10 + 31 + 10)), minutes: 10 });
  assert.equal(after31.price.bonuses.combo, 0, 'a 31-min gap breaks the combo');
});

test('rest pauses a combo, never breaks it (a rest task in the gap)', () => {
  const g = world();
  g.records.push({ id: 'sk_rest', type: 'skill', name: 'Rest', stat: 'stat_body', place: 'place_bedroom' });
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 10 });
  const nap = g.task({ title: 'Nap', skill: 'sk_rest', estimate: 60, stamina: -3, mana: -3 });
  g.done(t, `${D}T09:10:00`, 10);
  g.done(t, `${D}T09:30:00`, 10); // combo ×2 (+10%)
  g.done(nap, `${D}T10:35:00`, 60);
  const next = makeDone(g.db(), t.id, { end: T(`${D}T10:55:00`), minutes: 10 });
  assert.ok(next.price.bonuses.combo >= 0.2 - 1e-9, `combo kept after rest, got ${next.price.bonuses.combo}`);
});

test('rest pauses a combo, never breaks it (a Rest moment in the gap)', () => {
  const g = world();
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 10 });
  g.done(t, `${D}T09:10:00`, 10);
  g.done(t, `${D}T09:30:00`, 10);
  g.moment('kind_rest', `${D}T09:35:00`, `${D}T10:35:00`);
  const next = makeDone(g.db(), t.id, { end: T(`${D}T10:55:00`), minutes: 10 });
  assert.ok(next.price.bonuses.combo >= 0.2 - 1e-9, `combo kept after rest, got ${next.price.bonuses.combo}`);
});

test('batch +15% × position (same batch type, gap ≤ 10 min)', () => {
  const g = world();
  const po = g.task({ title: 'Purchase request', skill: 'sk_mail', estimate: 10, batch: 'purchase' });
  const a = g.done(po, `${D}T09:10:00`, 10);
  const b = g.done(po, `${D}T09:30:00`, 10); // gap exactly 10
  const c = g.done(po, `${D}T09:45:00`, 10); // gap 5
  assert.equal(a.price.bonuses.batch, 0);
  near(b.price.bonuses.batch, 0.15, 1e-9);
  near(c.price.bonuses.batch, 0.30, 1e-9);
  const late = makeDone(g.db(), po.id, { end: T(`${D}T10:06:00`), minutes: 10 }); // gap 11
  assert.equal(late.price.bonuses.batch, 0, 'an 11-min gap ends the batch');
});

test('batch: a different batch type is not the same batch', () => {
  const g = world();
  const po = g.task({ title: 'PO', skill: 'sk_mail', estimate: 10, batch: 'purchase' });
  const inv = g.task({ title: 'Invoice', skill: 'sk_mail', estimate: 10, batch: 'invoice' });
  g.done(po, `${D}T09:10:00`, 10);
  const d = makeDone(g.db(), inv.id, { end: T(`${D}T09:25:00`), minutes: 10 });
  assert.equal(d.price.bonuses.batch, 0);
});

test('in a batch the batch bonus replaces the combo bonus', () => {
  const g = world();
  const po = g.task({ title: 'PO', skill: 'sk_mail', estimate: 10, batch: 'purchase' });
  g.done(po, `${D}T09:10:00`, 10);
  g.done(po, `${D}T09:25:00`, 10);
  const c = g.done(po, `${D}T09:40:00`, 10);
  near(c.price.bonuses.batch, 0.30, 1e-9);
  assert.equal(c.price.bonuses.combo, 0);
  assert.equal(c.price.points, c.price.base, 'the batch is style, not points');
  near(c.price.style, Math.round(c.price.base * 0.30));
});

test('bonuses add up, capped at 2.5× base', () => {
  const g = world();
  const jog = g.task({ title: 'Jog', skill: 'sk_run', estimate: 60 });
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 5 });
  // three runs more than a week ago: target 38, best 40, and Body still the underdog
  [40, 40, 40].forEach((m, i) => g.done(jog, `2026-09-1${i}T07:00:00`, m));
  for (let i = 0; i < 7; i++) g.done(mail, at9(D, i * 10 + 5), 5); // 7 chained tasks
  // flow .2 + pb .25 + underdog .5 + combo .7 = 1 + 1.65 → capped
  const d = makeDone(g.db(), jog.id, { end: T(at9(D, 70 + 30)), minutes: 30 });
  assert.equal(BONUS_CAP, 2.5);
  assert.ok(d.price.bonuses.flow > 0 && d.price.bonuses.pb > 0 && d.price.bonuses.underdog > 0 && d.price.bonuses.combo > 0);
  assert.equal(d.price.multiplier, 2.5, 'the bonuses still cap at 2.5x');
  assert.equal(d.price.points, d.price.base, 'but they buy style now, not points');
  near(d.price.style, Math.round(d.price.base * 1.5));
});

test('every completion stores the price it earned; points never change later', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 90 });
  const d = g.done(t, `${D}T10:30:00`, 90);
  const before = play(g.records, T(`${D}T12:00:00`));
  const pts = d.price.points;
  // later: the task is re-estimated and done faster several times
  g.records.push({ ...t, estimate: 10, updatedAt: T(`${D}T12:00:00`) });
  g.done(t, `${D}T13:00:00`, 20); g.done(t, `${D}T14:00:00`, 20); g.done(t, `${D}T15:00:00`, 20);
  const after = play(g.records, T(`${D}T18:00:00`));
  const stored = after.history.find((h) => h.id === d.id);
  assert.equal(stored.price.points, pts);
  const later = after.history.filter((h) => h.task === t.id && h.id !== d.id).reduce((s, h) => s + h.price.points, 0);
  assert.equal(after.player.xp - before.player.xp, later, 'XP moved only by the new completions');
});

test('personal best: the first run has no best to beat', () => {
  const g = world();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 60 });
  const first = makeDone(g.db(), t.id, { end: T(`${D}T10:00:00`), minutes: 30 });
  assert.equal(first.price.bonuses.pb, 0);
});

test('underdog: when no stat earned XP in the previous 7 days, nobody is the underdog', () => {
  // Decided by the player: an all-zero week (first week, after a holiday) gives no +50% to anything.
  const g = game();
  const jog = g.task({ title: 'Jog', skill: 'sk_run', estimate: 30 });
  const d = makeDone(g.db(), jog.id, { end: T(`${D}T08:00:00`), minutes: 30 });
  assert.equal(d.price.bonuses.underdog, 0);
});
