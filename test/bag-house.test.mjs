// The Bag as the house inventory and the reshelve walk-through
// (SPEC.md "House inventory", "Reshelving"): rendered from the records under Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';
import * as bag from '../src/views/bag.js';
import { game, T } from './helpers.mjs';

const NOW = T('2026-09-28T12:00:00');

function house() {
  const g = game();
  const place = (f) => g.add(M.makePlace(g.db(), { now: NOW, ...f }));
  const item = (f) => g.add(M.makeItem(g.db(), { now: NOW, ...f }));
  const garage = place({ name: 'Garage', zone: 'home' });
  const shelf = place({ name: 'Shelf B', parent: garage.id });
  const box = place({ name: 'Box 3', parent: shelf.id });
  const kitchen = place({ name: 'Kitchen', zone: 'home' });
  const drill = item({ name: 'Drill', brand: 'Makita', place: shelf.id, price: 120 });
  const hammer = item({ name: 'Hammer', place: box.id, price: 25 });
  const kettle = item({ name: 'Kettle', place: kitchen.id, price: 40 });
  return { g, garage, shelf, box, kitchen, drill, hammer, kettle };
}

const ctxOf = (g, ui = {}) => {
  const saved = [];
  const toasts = [];
  return {
    db: g.db(), g: M.play(g.records, NOW), now: NOW, ui, saved, toasts,
    store: { save: async (...r) => { saved.push(...r.flat()); return r.flat(); }, add: async (...r) => { saved.push(...r.flat()); }, remove: async (r) => { saved.push({ ...r, deletedAt: NOW }); }, allRecords: () => g.records, getRecord: (id) => g.records.find((r) => r.id === id) || null },
    toast: (t) => toasts.push(t), confirm: async () => true, render: () => {},
  };
};
const stashes = (html) => [...html.matchAll(/<section[^>]*class="stash[^"]*"[^>]*data-place="([^"]+)"[^>]*>\s*<h3[^>]*>([^<]*)/g)].map((m) => [m[1], m[2].trim()]);
const cells = (html) => [...html.matchAll(/class="cell[^"]*"[^>]*data-item="([^"]+)"/g)].map((m) => m[1]);

test('Bag: stashes in tree order, each titled with its place path', () => {
  const { g, shelf, box, kitchen } = house();
  const html = bag.render(ctxOf(g));
  assert.deepEqual(stashes(html), [[shelf.id, 'Garage › Shelf B'], [box.id, 'Garage › Shelf B › Box 3'], [kitchen.id, 'Kitchen']]);
});

test('Bag: the place tree nests, with a count of everything inside each place', () => {
  const { g, garage, shelf, box } = house();
  const html = bag.render(ctxOf(g));
  const row = (id) => new RegExp(`data-bag-place="${id}"[^>]*style="--depth: (\\d)"[\\s\\S]*?class="bag-count">(\\d*)<`).exec(html)?.slice(1);
  assert.deepEqual(row(garage.id), ['0', '2']);
  assert.deepEqual(row(shelf.id), ['1', '2']);
  assert.deepEqual(row(box.id), ['2', '1']);
});

test('Bag: choosing a place shows only the stashes inside it', () => {
  const { g, garage, drill, hammer } = house();
  const html = bag.render(ctxOf(g, { bagPlace: garage.id }));
  assert.deepEqual(cells(html).sort(), [drill.id, hammer.id].sort());
});

test('Bag: the search narrows the stash to matching items, place names included', () => {
  const { g, hammer, drill } = house();
  assert.deepEqual(cells(bag.render(ctxOf(g, { bagQuery: 'box 3' }))), [hammer.id]);
  assert.deepEqual(cells(bag.render(ctxOf(g, { bagQuery: 'makita' }))), [drill.id]);
  assert.match(bag.render(ctxOf(g, { bagQuery: 'ski wax' })), /Nothing matches/);
});

test('Bag: the item detail has the house-inventory fields, photo and receipt uploads, and a nested place picker', () => {
  const { g, drill, box } = house();
  const html = bag.render(ctxOf(g, { itemShow: drill.id }));
  const form = /id="item-edit-form"[\s\S]*?<\/form>/.exec(html)?.[0] || '';
  for (const n of ['brand', 'model', 'serial', 'bought', 'warranty', 'notes']) assert.match(form, new RegExp(`name="${n}"`), n);
  assert.match(form, /value="Makita"/);
  assert.match(form, new RegExp(`<option value="${box.id}"[^>]*>[^<]*Box 3`));
  assert.match(html, /data-upload="photo"/);
  assert.match(html, /data-upload="receipt"/);
});

test('Bag: saving an item keeps its details and its photos', async () => {
  const { g, drill } = house();
  g.add({ ...drill, photos: ['file_a'], updatedAt: NOW + 1 });
  const ctx = ctxOf(g);
  await bag.forms.item({ id: drill.id, name: 'Drill', category: 'Tools', place: drill.place, qty: '1', price: '120', slot: '', brand: 'Makita', model: 'DHP482', serial: 'SN-1', bought: '2025-11-28', warranty: '', notes: 'charger in the box' }, null, ctx);
  const rec = ctx.saved.find((r) => r.id === drill.id);
  assert.equal(rec.model, 'DHP482');
  assert.equal(rec.serial, 'SN-1');
  assert.equal(rec.bought, '2025-11-28');
  assert.equal(rec.notes, 'charger in the box');
  assert.deepEqual(rec.photos, ['file_a']);
});

test('Bag: a place can be added inside another', async () => {
  const { g, shelf } = house();
  const ctx = ctxOf(g);
  await bag.forms['bag-place']({ id: '', name: 'Box 4', parent: shelf.id, zone: '' }, null, ctx);
  const p = ctx.saved.find((r) => r.type === 'place' && r.name === 'Box 4');
  assert.equal(p.parent, shelf.id);
  assert.equal(p.zone, 'home');
});

test('Bag: labels draw one page per sheet, escaped', () => {
  const { g, garage } = house();
  g.add(M.makeItem(g.db(), { name: 'Nuts & <bolts>', place: garage.id, now: NOW }));
  const svg = bag.labelSvg(M.labelSheet(g.db(), garage.id));
  assert.match(svg, /^<svg[^>]+viewBox="0 0 612 792"/);
  assert.match(svg, /Nuts &amp; &lt;bolts&gt;/);
});

// ─── reshelving ─────────────────────────────────────────────────────────────

function planned() {
  const h = house();
  const plan = h.g.add(M.makeReshelve(h.g.db(), { name: 'Dewey', now: NOW, moves: [
    { item: h.drill.id, to: h.shelf.id, call: '621.9' },
    { item: h.kettle.id, to: h.box.id, call: '641.5' },
    { item: h.hammer.id, to: h.kitchen.id, call: '684' },
  ] }));
  return { ...h, plan };
}

test('Reshelve: the plan shows with its progress, shelf by shelf in plan order', () => {
  const { g, shelf, box } = planned();
  const html = bag.render(ctxOf(g));
  assert.match(html, /id="reshelve"[\s\S]*Dewey/);
  assert.match(html, /1\/3 shelved/, 'the drill is already on Shelf B');
  const groups = [...html.matchAll(/data-reshelve-shelf="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(groups.slice(0, 2), [shelf.id, box.id]);
  assert.match(html, /#2[\s\S]*?641\.5[\s\S]*?Kettle/);
});

test('Reshelve: the pull list groups books by the shelf they come from, each with where it goes', () => {
  const { g, kitchen } = planned();
  const html = bag.render(ctxOf(g, { reshelveTab: 'pull' }));
  assert.match(html, new RegExp(`data-reshelve-shelf="${kitchen.id}"[\\s\\S]*?Kettle[\\s\\S]*?→ Garage › Shelf B › Box 3`));
});

test('Reshelve: ticking a book shelved moves it and marks the plan; pulling only marks', async () => {
  const { g, plan, kettle, box } = planned();
  const ctx = ctxOf(g);
  await bag.actions['reshelve-shelve']({ dataset: { item: kettle.id }, checked: true }, ctx);
  const item = ctx.saved.find((r) => r.id === kettle.id);
  assert.equal(item.place, box.id);
  assert.deepEqual(ctx.saved.find((r) => r.id === plan.id).shelved, [kettle.id]);
  const ctx2 = ctxOf(g);
  await bag.actions['reshelve-pull']({ dataset: { item: kettle.id }, checked: true }, ctx2);
  assert.equal(ctx2.saved.length, 1);
  assert.deepEqual(ctx2.saved[0].pulled, [kettle.id]);
});

test('Reshelve: finishing sets the plan done', async () => {
  const { g, plan } = planned();
  const ctx = ctxOf(g);
  await bag.actions['reshelve-finish']({ dataset: {} }, ctx);
  assert.equal(ctx.saved.find((r) => r.id === plan.id).done, true);
});
