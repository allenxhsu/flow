// SPEC.md › Shop and debt, Energy, Moments and places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeDone, makePurchase, makeReward, makeMoment, makePlace, placeOfTask, energyOn, balanceOf, play, pickNext,
  DEFAULT_KINDS, ZONES,
} from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} (±${eps})`);

// ── Shop and debt ──────────────────────────────────────────────────────────

test('purchase: a reward’s price comes off the balance', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 90 });
  g.done(t, `${D}T10:30:00`, 90);
  const cake = g.reward({ title: 'Cake', price: 40 });
  g.buy(cake, `${D}T15:00:00`);
  assert.equal(balanceOf(g.db()), 50);
});

test('debt: debt is allowed and the part of a purchase below zero costs double', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 30 });
  g.done(t, `${D}T10:00:00`, 30);
  const cake = g.reward({ title: 'Cake', price: 50 });
  const p = g.buy(cake, `${D}T15:00:00`); // 30 covered, 20 below zero → 40
  assert.equal(balanceOf(g.db()), -40);
  assert.equal(p.charged, 70);
  const tea = g.reward({ title: 'Bubble tea', price: 10 });
  g.buy(tea, `${D}T16:00:00`); // all below zero → 20
  assert.equal(balanceOf(g.db()), -60);
});

test('debt: buying does not touch XP', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 30 });
  g.done(t, `${D}T10:00:00`, 30);
  g.buy(g.reward({ title: 'Cake', price: 500 }), `${D}T15:00:00`);
  assert.equal(play(g.records, T(`${D}T18:00:00`)).player.xp, 30);
});

test('rewards: a one-off can be bought once, a repeatable any number of times', () => {
  const g = game();
  const concert = g.reward({ title: 'Concert', price: 5, repeatable: false });
  const ice = g.reward({ title: 'Ice cream', price: 5 });
  assert.equal(ice.repeatable, true, 'repeatable by default');
  g.buy(concert, `${D}T10:00:00`);
  assert.throws(() => makePurchase(g.db(), concert.id, { at: T(`${D}T11:00:00`) }));
  g.buy(ice, `${D}T10:00:00`); g.buy(ice, `${D}T11:00:00`); g.buy(ice, `${D}T12:00:00`);
  const rewards = play(g.records, T(`${D}T13:00:00`)).rewards;
  assert.equal(rewards.find((r) => r.id === ice.id).bought, 3);
  assert.equal(rewards.find((r) => r.id === concert.id).bought, 1);
});

test('socializing (reaching out to Whitney) costs energy only, never points', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 30 });
  g.done(t, `${D}T10:00:00`, 30);
  g.energy(`${D}T07:00:00`, 8, 8);
  const before = play(g.records, T(`${D}T11:00:00`));
  const chat = g.moment('kind_chat', `${D}T12:00:00`, `${D}T13:00:00`, { who: 'Whitney' });
  assert.equal(chat.who, 'Whitney');
  const after = play(g.records, T(`${D}T14:00:00`));
  assert.equal(after.player.xp, before.player.xp);
  assert.equal(after.balance, before.balance);
  assert.ok(after.energy.mana < before.energy.mana, 'chatting drained mana');
});

test('meals and rest are never behind a paywall: logging them never costs points, even in debt', () => {
  const g = game();
  g.buy(g.reward({ title: 'Cake', price: 50 }), `${D}T09:00:00`);
  const bal = balanceOf(g.db());
  assert.ok(bal < 0);
  g.moment('kind_meal', `${D}T12:00:00`, `${D}T12:30:00`);
  g.moment('kind_rest', `${D}T13:00:00`, `${D}T14:00:00`);
  assert.equal(balanceOf(g.db()), bal);
});

// ── Energy ─────────────────────────────────────────────────────────────────

test('energy: the morning rating sets the day (stamina and mana, 0–10)', () => {
  const g = game();
  assert.equal(energyOn(g.db(), D).rated, false);
  g.energy(`${D}T06:30:00`, 7, 6);
  const e = energyOn(g.db(), D);
  assert.deepEqual([e.stamina, e.mana, e.rated], [7, 6, true]);
  assert.equal(energyOn(g.db(), '2026-09-29').rated, false, 'a rating is for its own day');
});

test('energy: tasks drain by their stamina/mana cost', () => {
  const g = game();
  const t = g.task({ title: 'Inspect', skill: 'sk_run', estimate: 30, stamina: 2, mana: 1 });
  g.energy(`${D}T06:30:00`, 7, 6);
  g.done(t, `${D}T09:00:00`, 30);
  const e = energyOn(g.db(), D);
  assert.deepEqual([e.stamina, e.mana], [5, 5]);
});

test('energy: moments drain per hour of their kind', () => {
  const g = game();
  g.energy(`${D}T06:30:00`, 8, 8);
  const drive = DEFAULT_KINDS.find((k) => k.title === 'Drive');
  g.moment(drive.id, `${D}T07:00:00`, `${D}T09:00:00`); // two hours
  const e = energyOn(g.db(), D);
  near(e.stamina, 8 - 2 * drive.staminaPerHour, 0.05);
  near(e.mana, 8 - 2 * drive.manaPerHour, 0.05);
});

test('energy: rest and meals restore, capped at 10', () => {
  const g = game();
  g.records.push({ id: 'sk_rest', type: 'skill', name: 'Rest', stat: 'stat_body', place: 'place_bedroom' });
  const work = g.task({ title: 'Haul', skill: 'sk_run', estimate: 60, stamina: 5, mana: 5 });
  const nap = g.task({ title: 'Nap', skill: 'sk_rest', estimate: 20, stamina: -2, mana: -1 });
  g.energy(`${D}T06:30:00`, 8, 8);
  g.done(work, `${D}T09:00:00`, 60); // 3 / 3
  g.done(nap, `${D}T10:00:00`, 20); // 5 / 4
  let e = energyOn(g.db(), D);
  assert.deepEqual([e.stamina, e.mana], [5, 4]);
  g.moment('kind_meal', `${D}T12:00:00`, `${D}T13:00:00`);
  e = energyOn(g.db(), D);
  const meal = DEFAULT_KINDS.find((k) => k.title === 'Meal');
  near(e.stamina, 5 - meal.staminaPerHour, 0.05);
  near(e.mana, 4 - meal.manaPerHour, 0.05);
  g.moment('kind_rest', `${D}T14:00:00`, `${D}T18:00:00`); // plenty
  e = energyOn(g.db(), D);
  assert.deepEqual([e.stamina, e.mana], [10, 10], 'never above 10');
});

test('energy: never below 0', () => {
  const g = game();
  const t = g.task({ title: 'Haul', skill: 'sk_run', estimate: 30, stamina: 4, mana: 4 });
  g.energy(`${D}T06:30:00`, 1, 1);
  g.done(t, `${D}T09:00:00`, 30);
  const e = energyOn(g.db(), D);
  assert.deepEqual([e.stamina, e.mana], [0, 0]);
});

test('energy: task cost falls with skill level × max(0.25, 1 − 0.075 × (level − 1))', () => {
  for (const xp of [1000, 100000]) {
    const g = game();
    const t = g.task({ title: 'Haul', skill: 'sk_run', estimate: 30, stamina: 4 });
    g.seed(t.id, '2026-08-01', xp);
    const level = play(g.records, T(`${D}T06:00:00`)).skills.find((s) => s.id === 'sk_run').level;
    assert.ok(level > 1);
    g.energy(`${D}T06:30:00`, 10, 10);
    g.done(t, `${D}T09:00:00`, 30);
    const factor = Math.max(0.25, 1 - 0.075 * (level - 1));
    near(energyOn(g.db(), D).stamina, 10 - 4 * factor, 0.05);
    if (xp === 100000) assert.equal(factor, 0.25, 'the mastery floor');
  }
});

test('energy: later tasks in a batch cost half the mana', () => {
  const g = game();
  const po = g.task({ title: 'PO', skill: 'sk_mail', estimate: 10, mana: 2, batch: 'purchase' });
  g.energy(`${D}T06:30:00`, 10, 10);
  const a = g.done(po, `${D}T09:10:00`, 10);
  const b = g.done(po, `${D}T09:25:00`, 10);
  const c = g.done(po, `${D}T09:40:00`, 10);
  assert.equal(a.price.energy.mana, 2);
  assert.equal(b.price.energy.mana, 1);
  assert.equal(c.price.energy.mana, 1);
  near(energyOn(g.db(), D).mana, 10 - 4);
});

test('energy: empty → warning, no penalty on points', () => {
  const g = game();
  const t = g.task({ title: 'Report', skill: 'sk_mail', estimate: 30, mana: 3 });
  g.energy(`${D}T06:30:00`, 5, 0);
  const e = energyOn(g.db(), D);
  assert.ok(e.empty.includes('mana'));
  assert.ok(!e.empty.includes('stamina'));
  const d = makeDone(g.db(), t.id, { end: T(`${D}T09:00:00`), minutes: 30 });
  assert.equal(d.price.points, d.price.base * d.price.multiplier, 'priced as usual');
  assert.equal(d.price.base, 30);
});

test('energy: empty → the picker offers only rest/free (or due-soon) tasks', () => {
  const g = game();
  g.records.push({ id: 'sk_rest', type: 'skill', name: 'Rest', stat: 'stat_body', place: 'place_bedroom' });
  const report = g.task({ title: 'Report', skill: 'sk_mail', estimate: 30, mana: 3 });
  const jog = g.task({ title: 'Jog', skill: 'sk_run', estimate: 30, stamina: 4 });
  const nap = g.task({ title: 'Nap', skill: 'sk_rest', estimate: 20, stamina: -2, mana: -2 });
  const tidy = g.task({ title: 'Tidy desk', skill: 'sk_read', estimate: 5 });
  const due = g.task({ title: 'Quote for customer', skill: 'sk_mail', estimate: 30, mana: 3, deadline: '2026-09-30' });
  g.energy(`${D}T06:30:00`, 0, 0);
  const p = pickNext(g.db(), T(`${D}T08:00:00`));
  assert.equal(p.exhausted, true);
  const offered = [p.next, ...p.alternatives].filter(Boolean).map((o) => o.task);
  assert.ok(!offered.includes(report.id) && !offered.includes(jog.id), 'no costly tasks');
  for (const id of [nap.id, tidy.id, due.id]) assert.ok(offered.includes(id));
});

// ── Moments and places ─────────────────────────────────────────────────────

test('moments: a kind, a place, start/end, optional who — and no points', () => {
  const g = game();
  const m = makeMoment(g.db(), 'kind_drive', { start: T(`${D}T07:00:00`), end: T(`${D}T07:45:00`) });
  assert.equal(m.type, 'moment');
  assert.equal(m.kind, 'kind_drive');
  assert.equal(m.place, 'place_car', 'defaults to the kind’s place');
  assert.equal(m.start, T(`${D}T07:00:00`));
  assert.equal(m.end, T(`${D}T07:45:00`));
  assert.equal(m.points ?? 0, 0);
  const w = makeMoment(g.db(), 'kind_walk', { start: T(`${D}T10:00:00`), end: T(`${D}T10:20:00`), place: 'place_warehouse', who: 'Sam' });
  assert.equal(w.place, 'place_warehouse');
  assert.equal(w.who, 'Sam');
  g.add(m, w);
  assert.equal(play(g.records, T(`${D}T12:00:00`)).player.xp, 0);
});

test('places belong to zones: home, road, factory, town, elsewhere', () => {
  const g = game();
  assert.deepEqual(ZONES, ['home', 'road', 'factory', 'town', 'elsewhere']);
  assert.equal(makePlace(g.db(), { name: 'Lab', zone: 'factory', now: T(`${D}T00:00:00`) }).zone, 'factory');
  assert.equal(makePlace(g.db(), { name: 'Cabin', now: T(`${D}T00:00:00`) }).zone, 'elsewhere');
});

test('a task’s place defaults from its skill', () => {
  const g = game();
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 10 });
  const moved = g.task({ title: 'Mail from the floor', skill: 'sk_mail', estimate: 10, place: 'place_floor' });
  assert.equal(placeOfTask(g.db(), mail), 'place_desk');
  assert.equal(placeOfTask(g.db(), moved), 'place_floor');
});
