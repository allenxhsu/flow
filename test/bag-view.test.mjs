// The Bag view (SPEC.md "House inventory"): rendered from the records under
// Node, the way test/views.test.mjs checks the other screens.
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
  const loose = item({ name: 'Mystery key' });
  return { g, garage, shelf, box, kitchen, drill, hammer, kettle, loose };
}

const ctxOf = (g, ui = {}) => ({ db: g.db(), g: M.play(g.records, NOW), now: NOW, ui });
const rows = (html) => [...html.matchAll(/data-bag-item="([^"]+)"/g)].map((m) => m[1]);

test('Bag: the place tree nests, with a count of everything inside each place', () => {
  const { g, garage, shelf, box } = house();
  const html = bag.render(ctxOf(g));
  const tree = [...html.matchAll(/data-bag-place="([^"]*)"[^>]*style="--depth: (\d+)"[\s\S]*?class="bag-count">(\d*)</g)]
    .map((m) => [m[1], Number(m[2]), m[3]]);
  const at = (id) => tree.find((t) => t[0] === id);
  assert.deepEqual(at(garage.id), [garage.id, 0, '2'], 'Garage holds the drill and, inside Box 3, the hammer');
  assert.deepEqual(at(shelf.id), [shelf.id, 1, '2']);
  assert.deepEqual(at(box.id), [box.id, 2, '1']);
  assert.match(html, /data-bag-place="unfiled"/, 'items with no place are listed as Unfiled');
});

test('Bag: everything by default; a place lists what is inside it at any depth', () => {
  const { g, garage, drill, hammer, kettle, loose } = house();
  assert.deepEqual(rows(bag.render(ctxOf(g))).sort(), [drill.id, hammer.id, kettle.id, loose.id].sort());
  assert.deepEqual(rows(bag.render(ctxOf(g, { bagPlace: garage.id }))), [drill.id, hammer.id]);
  assert.deepEqual(rows(bag.render(ctxOf(g, { bagPlace: 'unfiled' }))), [loose.id]);
});

test('Bag: a search shows each hit with its full place path', () => {
  const { g, hammer } = house();
  const html = bag.render(ctxOf(g, { bagQuery: 'box 3' }));
  assert.deepEqual(rows(html), [hammer.id]);
  assert.match(html, /Garage › Shelf B › Box 3/);
});

test('Bag: the item editor carries the house-inventory fields and a nested place picker', () => {
  const { g, drill, box } = house();
  const html = bag.render(ctxOf(g, { bagEdit: drill.id }));
  for (const name of ['name', 'place', 'qty', 'category', 'aliases', 'brand', 'model', 'serial', 'bought', 'price', 'warranty', 'notes']) {
    assert.match(html, new RegExp(`name="${name}"`), name);
  }
  assert.match(html, new RegExp(`<option value="${box.id}"[^>]*>[^<]*Box 3`));
  assert.match(html, /data-upload="photo"/);
  assert.match(html, /data-upload="receipt"/);
});

test('Bag: a new item has no photo upload until it is saved', () => {
  const { g } = house();
  const html = bag.render(ctxOf(g, { bagEdit: 'new' }));
  assert.match(html, /name="name"/);
  assert.doesNotMatch(html, /data-upload=/);
});

test('Bag: an item\'s first photo is its thumbnail', () => {
  const { g, drill } = house();
  const f = g.add(M.makeFile(g.db(), { item: drill.id, kind: 'photo', name: 'd.jpg', mime: 'image/jpeg', data: 'AAAA', at: NOW }));
  g.add({ ...drill, photos: [f.id], updatedAt: NOW + 1 });
  assert.match(bag.render(ctxOf(g)), /<img[^>]+src="data:image\/jpeg;base64,AAAA"/);
});

test('labelSvg: one page per sheet, the place and its path at the top, text escaped', () => {
  const { g, garage } = house();
  g.add(M.makeItem(g.db(), { name: 'Nuts & <bolts>', place: garage.id, now: NOW }));
  const svg = bag.labelSvg(M.labelSheet(g.db(), garage.id));
  assert.match(svg, /^<svg[^>]+viewBox="0 0 612 792"/);
  assert.match(svg, />Garage</);
  assert.match(svg, /Nuts &amp; &lt;bolts&gt;/);
  assert.match(svg, />Shelf B</);
});
