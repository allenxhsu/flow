// replayDay() dresses the hero in the active loadout, for the renderer.
// hero.outfit = { head, body, legs, feet, hands, bag, tech, vehicle } → { id, name, category, color } or null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';
import { game, T } from './helpers.mjs';

const D = '2026-09-28';
const item = (g, fields) => g.add(M.makeItem(g.db(), fields));
const loadout = (g, fields, updatedAt) => g.add({ ...M.makeLoadout(g.db(), fields), ...(updatedAt ? { updatedAt } : {}) });

function dressed() {
  const g = game();
  const hat = item(g, { name: 'Hard hat', category: 'Safety', slot: 'head', color: '#f2c200' });
  const shirt = item(g, { name: 'White shirt', category: 'Clothes', slot: 'body', color: '#ffffff' });
  const jeans = item(g, { name: 'Jeans', category: 'Clothes', slot: 'legs', color: '#2b4c8c' });
  const boots = item(g, { name: 'Work boots', category: 'Shoes', slot: 'feet' });
  return { g, hat, shirt, jeans, boots };
}

test('makeItem: color is optional and defaults to null', () => {
  const g = game();
  assert.equal(M.makeItem(g.db(), { name: 'Mug' }).color, null);
  assert.equal(M.makeItem(g.db(), { name: 'Cap', slot: 'head', color: '#ff0000' }).color, '#ff0000');
});

test('replayDay: hero.outfit has every slot, null when nothing is equipped', () => {
  const g = game();
  const r = M.replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  assert.deepEqual(Object.keys(r.hero.outfit), M.SLOTS);
  for (const s of M.SLOTS) assert.equal(r.hero.outfit[s], null, s);
});

test('replayDay: the hero wears the active loadout — name, category and color per slot', () => {
  const { g, hat, shirt, jeans, boots } = dressed();
  loadout(g, { name: 'Work', slots: { head: hat.id, body: shirt.id, legs: jeans.id, feet: boots.id }, active: true });
  const { outfit } = M.replayDay(g.records, D, { now: T(`${D}T21:00:00`) }).hero;
  assert.deepEqual(outfit.head, { id: hat.id, name: 'Hard hat', category: 'Safety', color: '#f2c200' });
  assert.deepEqual(outfit.body, { id: shirt.id, name: 'White shirt', category: 'Clothes', color: '#ffffff' });
  assert.deepEqual(outfit.legs, { id: jeans.id, name: 'Jeans', category: 'Clothes', color: '#2b4c8c' });
  assert.deepEqual(outfit.feet, { id: boots.id, name: 'Work boots', category: 'Shoes', color: null });
  for (const s of ['hands', 'bag', 'tech', 'vehicle']) assert.equal(outfit[s], null, s);
});

test('replayDay: an inactive loadout does not dress the hero', () => {
  const { g, hat } = dressed();
  loadout(g, { name: 'Work', slots: { head: hat.id } });
  assert.equal(M.replayDay(g.records, D, { now: T(`${D}T21:00:00`) }).hero.outfit.head, null);
});

test('replayDay: the loadout active at the end of that day, not one written afterwards', () => {
  const { g, hat, shirt } = dressed();
  loadout(g, { name: 'Work', slots: { head: hat.id }, active: true }, T(`${D}T07:00:00`));
  loadout(g, { name: 'Weekend', slots: { body: shirt.id }, active: true }, T('2026-09-30T08:00:00'));
  const then = M.replayDay(g.records, D, { now: T('2026-09-30T21:00:00') }).hero.outfit;
  assert.equal(then.head?.name, 'Hard hat');
  assert.equal(then.body, null);
  const later = M.replayDay(g.records, '2026-09-30', { now: T('2026-09-30T21:00:00') }).hero.outfit;
  assert.equal(later.head, null);
  assert.equal(later.body?.name, 'White shirt');
});

test('replayDay: the hero keeps the colours chosen in settings next to the outfit', () => {
  const g = game();
  g.add({ id: 'settings', type: 'settings', name: 'Allen', hero: { hair: '#332211', shirt: '#aa0000' } });
  const { hero } = M.replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  assert.equal(hero.hair, '#332211');
  assert.equal(hero.shirt, '#aa0000');
  assert.ok(hero.outfit);
});
