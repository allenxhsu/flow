// SPEC.md › Day Replay: walks, idle, the finale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayDay, pickNext, ZONES } from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';

/** A factory day: drive in, desk work, the floor, a fix, a treat, drive home. */
function factoryDay() {
  const g = game();
  g.records.push({ id: 'sk_floor', type: 'skill', name: 'Floor', stat: 'stat_work', place: 'place_floor' });
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30, mana: 2 });
  const insp = g.task({ title: 'Inspect line 2', skill: 'sk_floor', estimate: 30, stamina: 2 });
  g.task({ title: 'Plan tomorrow', skill: 'sk_mail', estimate: 15 });
  g.energy(`${D}T06:30:00`, 8, 8);
  g.moment('kind_drive', `${D}T07:30:00`, `${D}T08:00:00`);
  const d1 = g.done(mail, `${D}T09:00:00`, 30);
  g.done(mail, `${D}T10:00:00`, 30); // same place: idle before it
  g.done(insp, `${D}T11:00:00`, 30); // elsewhere: walk before it
  g.rework(d1, `${D}T12:00:00`, 15);
  g.buy(g.reward({ title: 'Cake', price: 20 }), `${D}T13:00:00`);
  g.moment('kind_drive', `${D}T17:00:00`, `${D}T17:30:00`);
  return g;
}

const EVENT = ['done', 'moment', 'rework', 'purchase'];

test('replay: one beat per event, in time order', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  const events = r.beats.filter((b) => EVENT.includes(b.kind));
  assert.deepEqual(events.map((b) => b.kind), ['moment', 'done', 'done', 'done', 'rework', 'purchase', 'moment']);
  for (let i = 1; i < r.beats.length; i++) assert.ok(r.beats[i].start >= r.beats[i - 1].start);
  for (const b of events) assert.equal(typeof b.text, 'string', 'each beat has a text box');
});

test('replay gaps: walk when the next event is elsewhere', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  const i = r.beats.findIndex((b) => b.kind === 'done' && b.title === 'Inspect line 2');
  const gap = r.beats.slice(0, i).reverse();
  const lastEvent = gap.findIndex((b) => EVENT.includes(b.kind));
  assert.ok(gap.slice(0, lastEvent).some((b) => b.kind === 'walk'), 'walked from the desk to the floor');
});

test('replay gaps: otherwise idle — never a walk between two events at the same place', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  const dones = r.beats.map((b, i) => [b, i]).filter(([b]) => b.kind === 'done' && b.title === 'Mail');
  const between = r.beats.slice(dones[0][1] + 1, dones[1][1]);
  assert.ok(between.length > 0 && between.every((b) => b.kind === 'idle'));
});

test('replay gaps: idle is neutral, never judged (no points lost)', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  let last = 0;
  for (const b of r.beats) {
    if (b.kind === 'idle' || b.kind === 'walk') assert.ok(!(b.points < 0), 'no penalty');
    if (b.after) last = b.after.points;
  }
  const events = r.beats.filter((b) => b.after);
  const sum = events.reduce((s, b) => s + b.points, 0);
  assert.equal(last, sum, 'the gem counter moves only on events');
});

test('replay HUD: each event beat carries stamina, mana and points after it', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  for (const b of r.beats.filter((b) => EVENT.includes(b.kind))) {
    for (const k of ['stamina', 'mana', 'points']) assert.equal(typeof b.after[k], 'number', `${b.kind}.after.${k}`);
  }
  const firstDone = r.beats.find((b) => b.kind === 'done');
  assert.equal(firstDone.after.mana, r.beats.find((b) => b.kind === 'moment').after.mana - 2, 'mail drained 2 mana');
});

test('replay finale: day totals', () => {
  const g = factoryDay();
  const r = replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  const earned = g.records.filter((x) => x.type === 'done' && x.day === D).reduce((s, d) => s + d.price.points, 0);
  assert.equal(r.finale.points, earned);
  assert.equal(r.finale.tasks, 3);
});

test('replay finale: energy through the day with drains and restores', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  assert.ok(Array.isArray(r.series) && r.series.length >= 2);
  assert.deepEqual([r.series[0].stamina, r.series[0].mana], [8, 8], 'starts at the morning rating');
  for (const p of r.series) assert.ok(p.stamina >= 0 && p.stamina <= 10 && p.mana >= 0 && p.mana <= 10);
});

test('replay finale: where time went, by zone', () => {
  const r = replayDay(factoryDay().records, D, { now: T(`${D}T21:00:00`) });
  const z = Object.fromEntries(r.finale.zones.map((x) => [x.zone, x.minutes]));
  for (const k of Object.keys(z)) assert.ok(ZONES.includes(k));
  assert.ok(z.road >= 60, 'an hour of driving');
  assert.ok(z.factory >= 90 + 15, 'three tasks and a fix at the factory');
});

test('replay finale: tomorrow’s first task', () => {
  const g = factoryDay();
  const r = replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  assert.ok(r.finale.tomorrow && typeof r.finale.tomorrow.task === 'string');
  assert.equal(r.finale.tomorrow.task, pickNext(g.db(), T('2026-09-29T06:00:00')).next.task);
});

test('replay: named people appear with their moment', () => {
  const g = factoryDay();
  g.moment('kind_chat', `${D}T14:00:00`, `${D}T14:30:00`, { who: 'Whitney' });
  const r = replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  const chat = r.beats.find((b) => b.kind === 'moment' && b.title === 'Chat');
  assert.equal(chat.who, 'Whitney');
  assert.equal(chat.points ?? 0, 0);
});
