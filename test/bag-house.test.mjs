// The Bag's part of the house inventory (SPEC.md "House inventory"): the item
// panel's details, photos and receipts, and the nested place picker. Browsing
// by shelf and reshelving are the bookshelf's, in Play (test/acceptance/bookshelf.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';
import * as bag from '../src/views/bag.js';
import { labelSvg } from '../src/game/shelf.js';
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

test('Labels (printed from the bookshelf): one page per sheet, escaped', () => {
  const { g, garage } = house();
  g.add(M.makeItem(g.db(), { name: 'Nuts & <bolts>', place: garage.id, now: NOW }));
  const svg = labelSvg(M.labelSheet(g.db(), garage.id));
  assert.match(svg, /^<svg[^>]+viewBox="0 0 612 792"/);
  assert.match(svg, /Nuts &amp; &lt;bolts&gt;/);
});

test('Bag: a stash in a nested place is titled with its path, so two "Top shelf"s are told apart', () => {
  const g = game();
  const place = (f) => g.add(M.makePlace(g.db(), { now: NOW, zone: 'home', ...f }));
  const spice = place({ name: 'Spice cabinet' });
  const tea = place({ name: 'Tea cabinet' });
  const a = place({ name: 'Top shelf', parent: spice.id });
  const b = place({ name: 'Top shelf', parent: tea.id });
  g.add(M.makeItem(g.db(), { name: 'Salt', place: a.id, now: NOW }));
  g.add(M.makeItem(g.db(), { name: 'Matcha', place: b.id, now: NOW }));
  const html = bag.render(ctxOf(g));
  const title = (id) => new RegExp(`data-place="${id}"[^>]*>\\s*<h3 class="stash-tab">([^<]*)`).exec(html)?.[1].trim();
  assert.equal(title(a.id), 'Spice cabinet › Top shelf');
  assert.equal(title(b.id), 'Tea cabinet › Top shelf');
});
