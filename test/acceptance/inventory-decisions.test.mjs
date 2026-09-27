// Acceptance: the inventory details the player decided after the first round
// of inventory tests raised them (SPEC.md › Inventory › "Decided details", and
// the conventions in its Contract). Written before the code, like the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const item = (g, fields) => g.add(M.makeItem(g.db(), fields));
const loadout = (g, fields) => g.add(M.makeLoadout(g.db(), fields));

test('skip: points round to the nearest dollar, money saved keeps the cents ($12.49 → 12 pts, $12.49 saved)', () => {
  const g = game();
  const s = g.add(M.makeSkip(g.db(), { query: 'Tape', price: 12.49, at: T(`${D}T09:00:00`) }));
  assert.equal(s.points, 12);
  assert.equal(s.price, 12.49);
  assert.equal(M.inventory(g.records, T(`${D}T20:00:00`)).moneySaved, 12.49);
  const up = M.makeSkip(game().db(), { query: 'Glue', price: 12.5, at: T(`${D}T09:00:00`) });
  assert.equal(up.points, 13);
});

test('skip: money saved is the full price avoided, even past the cap ($150 → 100 pts, $150 saved)', () => {
  const g = game();
  const s = g.add(M.makeSkip(g.db(), { query: 'Chair', price: 150, at: T(`${D}T09:00:00`) }));
  assert.equal(s.points, 100);
  const inv = M.inventory(g.records, T(`${D}T20:00:00`));
  assert.equal(inv.moneySaved, 150);
  assert.equal(inv.savedThisMonth, 150);
});

test('skip: the cap counts only skips before this one’s own time that day', () => {
  const g = game();
  // Written first but timed later (e.g. synced from another device afterwards).
  const evening = g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 80, at: T(`${D}T18:00:00`) }));
  const morning = g.add(M.makeSkip(g.db(), { query: 'Rug', price: 60, at: T(`${D}T09:00:00`) }));
  assert.equal(evening.points, 80);
  assert.equal(morning.points, 60, 'nothing was skipped before 09:00');
});

test('buy anyway: restockFor adds to the owned item’s quantity, same id', () => {
  const g = game();
  const batteries = item(g, { name: 'AA batteries', category: 'Supplies', qty: 2, price: 8, consumable: true, lowStock: 1 });
  const spend = g.add(M.makeSpend(g.db(), { name: 'AA batteries', price: 8, item: batteries.id, qty: 1, at: T(`${D}T10:00:00`) }));
  const restocked = M.restockFor(g.db(), spend);
  assert.equal(restocked.id, batteries.id);
  assert.equal(restocked.type, 'item');
  assert.equal(restocked.qty, 3);
  assert.equal(restocked.name, 'AA batteries');
});

test('buy anyway: restockFor makes a new item when the spend names none', () => {
  const g = game();
  const spend = g.add(M.makeSpend(g.db(), { name: 'Label maker', price: 35, qty: 1, at: T(`${D}T10:00:00`) }));
  const fresh = M.restockFor(g.db(), spend);
  assert.equal(fresh.type, 'item');
  assert.match(fresh.id, /^item_/);
  assert.equal(fresh.name, 'Label maker');
  assert.equal(fresh.qty, 1);
  assert.equal(fresh.price, 35);
});

test('low stock asks for enough to get back to the usual quantity (have 1, usual 4 → 3)', () => {
  const g = game();
  item(g, { name: 'Paper towels', category: 'Supplies', consumable: true, qty: 1, lowStock: 1, usual: 4 });
  const e = M.shoppingList(g.db()).find((x) => x.name === 'Paper towels');
  assert.ok(e && e.lowStock);
  assert.equal(e.qty, 3);
});

test('low stock with no usual set asks for lowStock + 1 − qty', () => {
  const g = game();
  item(g, { name: 'Coffee beans', category: 'Food', consumable: true, qty: 1, lowStock: 2 }); // usual defaults to 3
  assert.equal(M.shoppingList(g.db()).find((x) => x.name === 'Coffee beans').qty, 2);
});

test('an item slot outside SLOTS is refused', () => {
  assert.throws(() => M.makeItem(game().db(), { name: 'Keys', slot: 'pocket' }), /slot/i);
});

test('several active loadouts: the latest written wins', () => {
  const g = game();
  const shoes = item(g, { name: 'Running shoes', slot: 'feet' });
  const boots = item(g, { name: 'Work boots', slot: 'feet' });
  const gym = loadout(g, { name: 'Gym bag', slots: { feet: shoes.id }, active: true });
  const work = loadout(g, { name: 'Work bag', slots: { feet: boots.id }, active: true });
  // Written one after the other: stamp them in that order.
  gym.updatedAt = 1; work.updatedAt = 2;
  assert.equal(M.activeLoadout(g.db()).id, work.id);
});

test('inventory: inUse is a Set of item ids, stash.place is a place id, equipped items stay in their stash', () => {
  const g = game();
  const shoes = item(g, { name: 'Running shoes', slot: 'feet', place: 'place_bedroom' });
  item(g, { name: 'Tape', place: 'place_bedroom' });
  loadout(g, { name: 'Gym bag', slots: { feet: shoes.id }, active: true });
  const inv = M.inventory(g.records, T(`${D}T12:00:00`));
  assert.ok(inv.inUse instanceof Set);
  assert.ok(inv.inUse.has(shoes.id));
  const bedroom = inv.stashes.find((s) => s.place === 'place_bedroom');
  assert.ok(bedroom, 'stash keyed by place id');
  assert.ok(bedroom.items.some((i) => i.id === shoes.id), 'equipped shoes still listed in the bedroom stash');
});

test('gearBonus with nothing linked equipped is a zero result, not null', () => {
  const g = game();
  const run = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  assert.deepEqual(M.gearBonus(g.db(), run, T(`${D}T09:00:00`)), { item: null, uses: 0, bonus: 0 });
});

test('inventory: skipsToday is today’s skip records; inventory(records) defaults now', () => {
  const g = game();
  g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 10, at: T(`${D}T09:00:00`) }));
  g.add(M.makeSkip(g.db(), { query: 'Rug', price: 10, at: T(`${D}T10:00:00`) }));
  g.add(M.makeSkip(g.db(), { query: 'Mug', price: 10, at: T('2026-09-27T10:00:00') }));
  const inv = M.inventory(g.records, T(`${D}T20:00:00`));
  assert.ok(Array.isArray(inv.skipsToday));
  assert.equal(inv.skipsToday.length, 2);
  assert.ok(inv.skipsToday.every((s) => s.type === 'skip' && s.day === D));
  assert.equal(M.inventory.length, 1);
});
