// Acceptance: Inventory (phase 1.5). Spec-derived, black-box.
// Written from SPEC.md "Inventory (phase 1.5)" and its Contract, plus docs/API.md.
// Every instant is a fixed local time, never the real clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T, close } from '../helpers.mjs';

const D = '2026-09-28';
const idOf = (x) => (x && typeof x === 'object' ? x.id : x);
const placeIdOf = (p) => (p && typeof p === 'object' ? p.id : p);

/** Add an item through the real constructor. */
const item = (g, fields) => g.add(M.makeItem(g.db(), fields));
/** Add a loadout through the real constructor. */
const loadout = (g, fields) => g.add(M.makeLoadout(g.db(), fields));

/**
 * `n` bare completions of `task` in August (outside every 7-day window), each
 * recording `gear` as the items equipped at the time — the fact the gear bonus counts.
 */
function seedUses(g, task, n, gear, tag = 'x') {
  for (let i = 0; i < n; i++) {
    const day = M.addDays('2026-08-01', Math.floor(i / 10));
    const h = String(6 + (i % 10)).padStart(2, '0');
    g.add({
      id: `done_seed_${tag}_${i}`, type: 'done', task: task.id ?? task, day,
      start: T(`${day}T${h}:00:00`), end: T(`${day}T${h}:20:00`), minutes: 20, measure: 'time', value: 20, quality: 1,
      gear: [...gear], price: { points: 20, base: 20, energy: {} },
    });
  }
}

/** A world with a Run task, a pair of running shoes linked to Run, and an active Gym bag wearing them. */
function gym() {
  const g = game();
  const run = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const mail = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30 });
  const shoes = item(g, { name: 'Running shoes', category: 'Shoes', skills: ['sk_run'], slot: 'feet', price: 120 });
  const bag = loadout(g, { name: 'Gym bag', slots: { feet: shoes.id }, active: true });
  return { g, run, mail, shoes, bag };
}

// ─── Items and search ──────────────────────────────────────────────────────

test('makeItem: an item record with the contract defaults', () => {
  const g = game();
  const it = M.makeItem(g.db(), { name: 'HDMI cable' });
  assert.equal(it.type, 'item');
  assert.match(it.id, /^item_/);
  assert.equal(it.name, 'HDMI cable');
  assert.equal(it.category, '');
  assert.deepEqual(it.aliases, []);
  assert.equal(it.place, null);
  assert.equal(it.qty, 1);
  assert.equal(it.price, 0);
  assert.equal(it.consumable, false);
  assert.equal(it.lowStock, 0);
  assert.equal(it.usual, 1, 'usual defaults to lowStock + 1');
  assert.deepEqual(it.skills, []);
  assert.equal(it.slot, null);
  assert.equal(it.photo, null);

  const full = M.makeItem(g.db(), { name: 'Coffee beans', category: 'Food', aliases: ['coffee'], place: 'place_kitchen',
    qty: 3, price: 14, consumable: true, lowStock: 1 });
  assert.equal(full.category, 'Food');
  assert.deepEqual(full.aliases, ['coffee']);
  assert.equal(full.place, 'place_kitchen');
  assert.equal(full.qty, 3);
  assert.equal(full.price, 14);
  assert.equal(full.consumable, true);
  assert.equal(full.lowStock, 1);
});

function shelf() {
  const g = game();
  const hdmi = item(g, { name: 'HDMI cable', category: 'Cables', aliases: ['display lead'], place: 'place_desk', price: 15 });
  const usb = item(g, { name: 'USB-C cable', category: 'Cables', place: 'place_desk', price: 12 });
  const drill = item(g, { name: 'Drill', category: 'Tools', aliases: ['power drill'], place: 'place_warehouse', price: 90 });
  return { g, hdmi, usb, drill };
}

test('findItems: "hdmi" finds "HDMI cable" (case-insensitive, partial name)', () => {
  const { g, hdmi } = shelf();
  const r = M.findItems(g.db(), 'hdmi');
  assert.ok(r.length >= 1);
  assert.equal(idOf(r[0].item), hdmi.id);
  assert.equal(typeof r[0].score, 'number');
});

test('findItems: matches aliases', () => {
  const { g, hdmi, drill } = shelf();
  assert.equal(idOf(M.findItems(g.db(), 'display lead')[0]?.item), hdmi.id);
  assert.equal(idOf(M.findItems(g.db(), 'power drill')[0]?.item), drill.id);
});

test('findItems: matches category', () => {
  const { g, drill } = shelf();
  const r = M.findItems(g.db(), 'tools');
  assert.deepEqual(r.map((x) => idOf(x.item)), [drill.id]);
});

test('findItems: ranked best-first — the exact name beats a partial match', () => {
  const { g, hdmi, usb } = shelf();
  const r = M.findItems(g.db(), 'HDMI cable');
  assert.equal(idOf(r[0].item), hdmi.id, 'exact name first');
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score, 'scores never increase');
  const cable = M.findItems(g.db(), 'cable').map((x) => idOf(x.item));
  assert.ok(cable.includes(hdmi.id) && cable.includes(usb.id), 'both cables found by "cable"');
});

test('findItems: an unrelated query finds nothing', () => {
  const { g } = shelf();
  assert.deepEqual(M.findItems(g.db(), 'banana'), []);
});

// ─── Skip ("I have it") ────────────────────────────────────────────────────

test('skip: 1 point per dollar avoided', () => {
  const g = game();
  const s = M.makeSkip(g.db(), { query: 'HDMI cable', price: 15, at: T(`${D}T09:00:00`) });
  assert.equal(s.type, 'skip');
  assert.match(s.id, /^skip_/);
  assert.equal(s.day, D);
  assert.equal(s.query, 'HDMI cable');
  assert.equal(s.price, 15);
  assert.equal(s.points, 15 * M.SKIP_POINTS_PER_DOLLAR);
  assert.equal(s.points, 15);
  // Decided — see inventory-decisions.test.mjs: a fractional price
});

test('skip: capped at 100 points per day across all skips ($60 + $70 → 60 + 40, then 0)', () => {
  const g = game();
  const a = g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 60, at: T(`${D}T09:00:00`) }));
  const b = g.add(M.makeSkip(g.db(), { query: 'Rug', price: 70, at: T(`${D}T12:00:00`) }));
  const c = g.add(M.makeSkip(g.db(), { query: 'Mug', price: 10, at: T(`${D}T18:00:00`) }));
  assert.equal(a.points, 60);
  assert.equal(b.points, 40);
  assert.equal(c.points, 0);
  assert.equal(b.price, 70, 'the price avoided is still recorded in full');
  const big = M.makeSkip(game().db(), { query: 'Chair', price: 150, at: T(`${D}T09:00:00`) });
  assert.equal(big.points, M.SKIP_DAILY_CAP);
});

test('skip: the daily cap resets the next day', () => {
  const g = game();
  g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 60, at: T(`${D}T09:00:00`) }));
  g.add(M.makeSkip(g.db(), { query: 'Rug', price: 70, at: T(`${D}T23:30:00`) }));
  const next = g.add(M.makeSkip(g.db(), { query: 'Rug', price: 70, at: T('2026-09-29T00:30:00') }));
  assert.equal(next.points, 70);
});

test('skip: points raise balanceOf and money saved, but add NO XP', () => {
  const g = game();
  const t = g.task({ title: 'Run', skill: 'sk_run', estimate: 60 });
  g.done(t, `${D}T08:00:00`, 60); // 60 points
  const before = M.play(g.records, T(`${D}T20:00:00`));
  const beforeBalance = M.balanceOf(g.db());
  g.add(M.makeSkip(g.db(), { query: 'HDMI cable', price: 30, at: T(`${D}T10:00:00`) }));
  const after = M.play(g.records, T(`${D}T20:00:00`));
  assert.equal(M.balanceOf(g.db()), beforeBalance + 30);
  assert.equal(after.balance, before.balance + 30);
  assert.equal(after.player.xp, before.player.xp, 'no skill earned it');
  const inv = M.inventory(g.records, T(`${D}T20:00:00`));
  assert.equal(inv.moneySaved, 30);
  // Decided — see inventory-decisions.test.mjs: over the cap
});

test('skip: stored points never change later', () => {
  const g = game();
  const a = g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 60, at: T(`${D}T09:00:00`) }));
  const snapshot = JSON.stringify(a);
  g.add(M.makeSkip(g.db(), { query: 'Rug', price: 70, at: T(`${D}T12:00:00`) }));
  g.add(M.makeSkip(g.db(), { query: 'Mug', price: 20, at: T(`${D}T15:00:00`) }));
  M.inventory(g.records, T(`${D}T20:00:00`));
  M.play(g.records, T(`${D}T20:00:00`));
  assert.equal(JSON.stringify(a), snapshot);
  // Decided — see inventory-decisions.test.mjs: a skip written later but timed earlier the same day
  assert.equal(M.balanceOf(g.db()), 60 + 40 + 0, 'balance sums the stored points, not a recomputation');
});

// ─── Spend ("buy anyway") ──────────────────────────────────────────────────

test('spend: records the price, costs no points, counts in spentThisMonth', () => {
  const g = game();
  const t = g.task({ title: 'Run', skill: 'sk_run', estimate: 60 });
  g.done(t, `${D}T08:00:00`, 60);
  const balance = M.balanceOf(g.db());
  const s = g.add(M.makeSpend(g.db(), { name: 'HDMI cable', price: 15, at: T(`${D}T10:00:00`) }));
  assert.equal(s.type, 'spend');
  assert.match(s.id, /^spend_/);
  assert.equal(s.day, D);
  assert.equal(s.name, 'HDMI cable');
  assert.equal(s.price, 15);
  assert.equal(s.qty, 1);
  assert.equal(M.balanceOf(g.db()), balance, 'no penalty');
  assert.equal(M.play(g.records, T(`${D}T20:00:00`)).balance, balance);
  assert.equal(M.inventory(g.records, T(`${D}T20:00:00`)).spentThisMonth, 15);
  // Decided — see inventory-decisions.test.mjs: "Buy anyway … adds or restocks the item"
});

test('spend and skip: month boundaries (September vs October)', () => {
  const g = game();
  g.add(M.makeSpend(g.db(), { name: 'Lamp', price: 20, at: T('2026-09-30T23:00:00') }));
  g.add(M.makeSkip(g.db(), { query: 'Rug', price: 25, at: T('2026-09-30T22:00:00') }));
  g.add(M.makeSpend(g.db(), { name: 'Mug', price: 30, at: T('2026-10-01T08:00:00') }));
  g.add(M.makeSkip(g.db(), { query: 'Chair', price: 40, at: T('2026-10-01T09:00:00') }));
  const sep = M.inventory(g.records, T('2026-09-30T23:30:00'));
  assert.equal(sep.spentThisMonth, 20);
  assert.equal(sep.savedThisMonth, 25);
  const oct = M.inventory(g.records, T('2026-10-15T12:00:00'));
  assert.equal(oct.spentThisMonth, 30);
  assert.equal(oct.savedThisMonth, 40);
  assert.equal(oct.moneySaved, 65, 'money saved is all-time');
});

// ─── Shopping list ─────────────────────────────────────────────────────────

test('shopping list: a wish with an inventory match carries its matches', () => {
  const { g, hdmi } = shelf();
  const w = g.add(M.makeWish(g.db(), { name: 'hdmi' }));
  assert.equal(w.type, 'wish');
  assert.equal(w.qty, 1);
  g.add(M.makeWish(g.db(), { name: 'Banana', qty: 6 }));
  const list = M.shoppingList(g.db());
  const hd = list.find((e) => e.name === 'hdmi');
  assert.ok(hd, 'the wish is on the list');
  assert.equal(hd.qty, 1);
  assert.equal(idOf(hd.wish), w.id);
  assert.ok(hd.matches.some((m) => idOf(m.item) === hdmi.id), 'flagged: you already own an HDMI cable');
  const banana = list.find((e) => e.name === 'Banana');
  assert.equal(banana.qty, 6);
  assert.deepEqual(banana.matches, []);
});

test('shopping list: a consumable at or below its low-stock level joins by itself, and leaves when restocked', () => {
  const g = game();
  const coffee = item(g, { name: 'Coffee beans', category: 'Food', consumable: true, qty: 2, lowStock: 2, place: 'place_kitchen' });
  item(g, { name: 'Rice', category: 'Food', consumable: true, qty: 5, lowStock: 2, place: 'place_kitchen' });
  const list = M.shoppingList(g.db());
  const e = list.find((x) => x.name === 'Coffee beans');
  assert.ok(e, 'qty 2 ≤ lowStock 2 → on the list');
  assert.ok(e.lowStock, 'flagged as low stock');
  assert.equal(list.find((x) => x.name === 'Rice'), undefined, 'qty 5 > lowStock 2 → not on the list');
  assert.ok(M.inventory(g.records, T(`${D}T12:00:00`)).lowStock.some((x) => idOf(x) === coffee.id || idOf(x?.item) === coffee.id));
  // Decided — see inventory-decisions.test.mjs: what qty does a low-stock entry ask for

  g.records.push({ ...coffee, qty: 3 }); // restocked (definition, last write wins)
  assert.equal(M.shoppingList(g.db()).find((x) => x.name === 'Coffee beans'), undefined);
});

// ─── Loadouts ──────────────────────────────────────────────────────────────

test('loadouts: SLOTS are head, body, feet, hands, bag, tech, vehicle', () => {
  assert.deepEqual(M.SLOTS, ['head', 'body', 'legs', 'feet', 'hands', 'bag', 'tech', 'vehicle']);
  const g = game();
  const hat = item(g, { name: 'Hard hat', slot: 'head' });
  const laptop = item(g, { name: 'Laptop', slot: 'tech' });
  const l = M.makeLoadout(g.db(), { name: 'Work bag', slots: { head: hat.id, tech: laptop.id } });
  assert.equal(l.type, 'loadout');
  assert.match(l.id, /^loadout_/);
  assert.equal(l.name, 'Work bag');
  assert.equal(l.active, false);
  assert.equal(l.slots.head, hat.id);
  assert.equal(l.slots.tech, laptop.id);
  for (const k of Object.keys(l.slots)) assert.ok(M.SLOTS.includes(k), `slot ${k}`);
  // Decided — see inventory-decisions.test.mjs: a slot name outside SLOTS
});

test('loadouts: only one is active', () => {
  const g = game();
  assert.equal(M.activeLoadout(g.db()), null, 'none yet');
  loadout(g, { name: 'Work bag' });
  assert.equal(M.activeLoadout(g.db()), null, 'none active');
  const gymBag = loadout(g, { name: 'Gym bag', active: true });
  assert.equal(M.activeLoadout(g.db()).id, gymBag.id);
  const car = loadout(g, { name: 'Car', active: true });
  // Decided — see inventory-decisions.test.mjs: makeLoadout returns one record and cannot rewrite the others; when two stored loadouts both
  assert.equal(M.activeLoadout(g.db()).id, car.id);
  const inv = M.inventory(g.records, T(`${D}T12:00:00`));
  assert.equal(idOf(inv.active), car.id);
  assert.equal(inv.loadouts.length, 3);
});

test('loadouts: in use = equipped in any loadout; stashes grouped by storage place', () => {
  const g = game();
  const shoes = item(g, { name: 'Running shoes', slot: 'feet', place: 'place_bedroom' });
  const laptop = item(g, { name: 'Laptop', slot: 'tech', place: 'place_desk' });
  const drill = item(g, { name: 'Drill', place: 'place_warehouse' });
  const tape = item(g, { name: 'Tape measure', place: 'place_warehouse' });
  loadout(g, { name: 'Gym bag', slots: { feet: shoes.id }, active: true });
  loadout(g, { name: 'Work bag', slots: { tech: laptop.id } }); // not active, still "in use"
  const inv = M.inventory(g.records, T(`${D}T12:00:00`));
  assert.ok(inv.inUse instanceof Set);
  // Decided — see inventory-decisions.test.mjs: inUse holds item ids
  assert.deepEqual([...inv.inUse].map(idOf).sort(), [shoes.id, laptop.id].sort());
  assert.equal(inv.items.length, 4);
  const byPlace = Object.fromEntries(inv.stashes.map((s) => [placeIdOf(s.place), s.items.map(idOf).sort()]));
  // Decided — see inventory-decisions.test.mjs: is stash.place the place id or the place record? Do in-use items still appear in their stash?
  assert.deepEqual(byPlace.place_warehouse, [drill.id, tape.id].sort());
  assert.equal(inv.stashes.filter((s) => placeIdOf(s.place) === 'place_warehouse').length, 1, 'one stash per place');
});

// ─── Gear bonus ────────────────────────────────────────────────────────────

test('gear bonus: new gear starts at +0%', () => {
  const { g, run, shoes } = gym();
  const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
  assert.equal(idOf(r.item), shoes.id);
  assert.equal(r.uses, 0);
  assert.equal(r.bonus, 0);
});

test('gear bonus: +1% per 10 completions done while equipped (9 → 0%, 10 → +1%, 19 → +1%, 20 → +2%)', () => {
  for (const [n, bonus] of [[9, 0], [10, 0.01], [19, 0.01], [20, 0.02], [55, 0.05]]) {
    const { g, run, shoes } = gym();
    seedUses(g, run, n, [shoes.id]);
    const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
    assert.equal(r.uses, n, `${n} uses`);
    assert.ok(close(r.bonus, bonus), `${n} uses → ${bonus}, got ${r.bonus}`);
  }
});

test('gear bonus: capped at +10% (100 uses and beyond)', () => {
  for (const n of [100, 150]) {
    const { g, run } = gym();
    seedUses(g, run, n, [M.activeLoadout(g.db()).slots.feet]);
    const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
    assert.equal(r.uses, n);
    assert.ok(close(r.bonus, M.GEAR_MAX), `${n} uses → 0.10, got ${r.bonus}`);
  }
});

test('gear bonus: completions done while NOT equipped do not count', () => {
  const { g, run, shoes } = gym();
  seedUses(g, run, 15, [], 'bare');
  seedUses(g, run, 5, [shoes.id], 'shod');
  const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
  assert.equal(r.uses, 5);
  assert.equal(r.bonus, 0);
});

test("gear bonus: completions of other skills' tasks do not count", () => {
  const { g, run, mail, shoes } = gym();
  seedUses(g, mail, 30, [shoes.id], 'mail'); // shoes worn while doing mail — not a Run completion
  seedUses(g, run, 10, [shoes.id], 'run');
  const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
  assert.equal(r.uses, 10);
  assert.ok(close(r.bonus, 0.01));
  const m = M.gearBonus(g.db(), mail, T(`${D}T09:00:00`));
  assert.equal(m?.bonus ?? 0, 0, 'shoes are not linked to Mail');
  // Decided — see inventory-decisions.test.mjs: with no linked item equipped, does gearBonus return { item: null, uses: 0, bonus: 0 } or null?
});

test('gear bonus: only while equipped in the active loadout now', () => {
  const { g, run, shoes } = gym();
  seedUses(g, run, 40, [shoes.id]);
  g.add(M.makeLoadout(g.db(), { name: 'Work bag', active: true })); // shoes are not in the new active loadout
  const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
  assert.equal(r?.bonus ?? 0, 0);
});

test('gear bonus: only the best item counts (no stacking)', () => {
  const g = game();
  const run = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const shoes = item(g, { name: 'Running shoes', skills: ['sk_run'], slot: 'feet' });
  const watch = item(g, { name: 'Sports watch', skills: ['sk_run'], slot: 'tech' });
  loadout(g, { name: 'Gym bag', slots: { feet: shoes.id, tech: watch.id }, active: true });
  seedUses(g, run, 30, [shoes.id], 'a');
  seedUses(g, run, 50, [watch.id], 'b');
  const r = M.gearBonus(g.db(), run, T(`${D}T09:00:00`));
  assert.equal(idOf(r.item), watch.id);
  assert.equal(r.uses, 50);
  assert.ok(close(r.bonus, 0.05), `0.05 not 0.08, got ${r.bonus}`);
});

test('gear bonus: makeDone records the gear equipped and price.bonuses.gear', () => {
  const { g, run, shoes } = gym();
  const towel = item(g, { name: 'Towel', slot: 'bag' }); // equipped, linked to nothing
  g.records.push({ ...M.activeLoadout(g.db()), slots: { feet: shoes.id, bag: towel.id } });
  seedUses(g, run, 20, [shoes.id]); // August: no underdog, no combo today
  const d = g.done(run, `${D}T09:00:00`, 20);
  assert.deepEqual([...d.gear].sort(), [shoes.id, towel.id].sort(), 'the active loadout’s items at the time');
  assert.ok(close(d.price.bonuses.gear, 0.02));
  assert.ok(close(d.price.multiplier, 1.02));
  assert.equal(d.price.points, Math.round(d.price.base * 1.02));
  // the next completion counts this one: 21 uses
  assert.equal(M.gearBonus(g.db(), run, T(`${D}T10:00:00`)).uses, 21);
});

test('gear bonus: makeDone with no active loadout records gear [] and bonus 0', () => {
  const g = game();
  const run = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const d = g.done(run, `${D}T09:00:00`, 30);
  assert.deepEqual(d.gear, []);
  assert.equal(d.price.bonuses.gear, 0);
});

test('gear bonus: sits inside the 2.5× cap', () => {
  const { g, run, mail, shoes } = gym();
  const read = g.task({ title: 'Read', skill: 'sk_read', estimate: 30 });
  seedUses(g, run, 100, [shoes.id]); // +10% gear, in August
  g.seed(mail.id, '2026-09-25', 50); // Work and Mind earned XP this week → Body is an underdog (+50%)
  g.seed(read.id, '2026-09-25', 50);
  let d;
  const prices = [];
  for (let i = 0; i < 11; i++) { // a chain: combo climbs +10% per task to +100%
    const m = 9 * 60 + i * 20;
    d = g.done(run, `${D}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`, 20);
    prices.push(d.price);
  }
  for (const p of prices) assert.ok(close(p.bonuses.gear, 0.1), 'gear +10% on every run');
  const tenth = prices[9]; // underdog .5 + combo .9 + gear .1 = 1.5 → exactly 2.5
  assert.ok(close(tenth.multiplier, 2.5));
  const last = prices[10]; // underdog .5 + combo 1 + gear .1 = 1.6 → capped at 2.5
  const sum = Object.values(last.bonuses).reduce((a, b) => a + b, 0);
  assert.ok(sum > 1.5, `bonuses add to ${sum}`);
  assert.ok(close(last.multiplier, M.BONUS_CAP));
  // The cap still binds the bonuses; they just buy style now, not points.
  assert.equal(last.points, last.base);
  assert.equal(last.style, Math.round(last.base * 1.5));
});

// ─── inventory() shape ─────────────────────────────────────────────────────

test('inventory(records, now): shape per the contract', () => {
  const { g, shoes, bag } = gym();
  g.add(M.makeSkip(g.db(), { query: 'Socks', price: 8, at: T(`${D}T09:00:00`) }));
  g.add(M.makeSkip(g.db(), { query: 'Cap', price: 12, at: T(`${D}T10:00:00`) }));
  g.add(M.makeSkip(g.db(), { query: 'Bottle', price: 5, at: T('2026-09-27T10:00:00') }));
  g.add(M.makeSpend(g.db(), { name: 'Tape', price: 4, at: T(`${D}T11:00:00`) }));
  const inv = M.inventory(g.records, T(`${D}T12:00:00`));
  for (const k of ['items', 'stashes', 'loadouts', 'active', 'inUse', 'lowStock', 'moneySaved', 'savedThisMonth', 'spentThisMonth', 'skipsToday']) {
    assert.ok(k in inv, `inventory().${k}`);
  }
  assert.ok(Array.isArray(inv.items) && Array.isArray(inv.stashes) && Array.isArray(inv.loadouts) && Array.isArray(inv.lowStock));
  assert.ok(inv.inUse instanceof Set);
  assert.ok(inv.inUse.has(shoes.id));
  assert.equal(idOf(inv.active), bag.id);
  for (const s of inv.stashes) { assert.ok('place' in s); assert.ok(Array.isArray(s.items)); }
  assert.equal(inv.moneySaved, 25);
  assert.equal(inv.savedThisMonth, 25);
  assert.equal(inv.spentThisMonth, 4);
  // Decided — see inventory-decisions.test.mjs: is skipsToday the skips made today
  const st = inv.skipsToday;
  assert.ok((Array.isArray(st) && st.length === 2) || st === 20 || st === 2, `skipsToday = ${JSON.stringify(st)}`);
});
