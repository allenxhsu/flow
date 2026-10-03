// Acceptance: House inventory (decided 2026-09-28). Spec-derived, black-box.
// Written from SPEC.md "House inventory" and its Contract only.
// Every instant is a fixed local time, never the real clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const D = '2026-09-28';
const NOW = T(`${D}T12:00:00`);

const place = (g, fields) => g.add(M.makePlace(g.db(), { now: NOW, ...fields }));
const item = (g, fields) => g.add(M.makeItem(g.db(), { now: NOW, ...fields }));
const names = (list) => list.map((p) => p.name);

/**
 * Garage › Shelf B › Box 3, and a Kitchen, with a drill on the shelf, a
 * hammer and tape in the box, and a kettle in the kitchen.
 */
function house() {
  const g = game();
  const garage = place(g, { name: 'Garage', zone: 'home' });
  const shelf = place(g, { name: 'Shelf B', parent: garage.id });
  const box = place(g, { name: 'Box 3', parent: shelf.id });
  const kitchen = place(g, { name: 'Kitchen', zone: 'home' });
  const drill = item(g, { name: 'Drill', category: 'Tools', brand: 'Makita', model: 'DHP482', serial: 'SN-4471', place: shelf.id, price: 120 });
  const hammer = item(g, { name: 'Hammer', category: 'Tools', place: box.id, price: 25 });
  const tape = item(g, { name: 'Duct tape', category: 'Supplies', place: box.id, qty: 3, price: 6, notes: 'silver, wide' });
  const kettle = item(g, { name: 'Kettle', category: 'Kitchen', place: kitchen.id, price: 40 });
  return { g, garage, shelf, box, kitchen, drill, hammer, tape, kettle };
}

// ─── places nest ───────────────────────────────────────────────────────────

test('makePlace: parent defaults to null; a child takes its parent\'s zone unless given one', () => {
  const g = game();
  const garage = place(g, { name: 'Garage', zone: 'home' });
  assert.equal(garage.parent, null);
  const shelf = place(g, { name: 'Shelf', parent: garage.id });
  assert.equal(shelf.parent, garage.id);
  assert.equal(shelf.zone, 'home');
  const other = place(g, { name: 'Odd one', parent: garage.id, zone: 'town' });
  assert.equal(other.zone, 'town');
  assert.equal(place(g, { name: 'Loose' }).zone, 'elsewhere');
});

test('makePlace: a parent that does not exist throws', () => {
  const g = game();
  assert.throws(() => M.makePlace(g.db(), { name: 'Shelf', parent: 'place_nowhere' }));
});

test('placePath: top level first, the place last; [] for none or unknown', () => {
  const { g, garage, shelf, box } = house();
  assert.deepEqual(names(M.placePath(g.db(), box.id)), ['Garage', 'Shelf B', 'Box 3']);
  assert.deepEqual(names(M.placePath(g.db(), garage.id)), ['Garage']);
  assert.deepEqual(M.placePath(g.db(), null), []);
  assert.deepEqual(M.placePath(g.db(), 'place_nowhere'), []);
  assert.equal(M.placePath(g.db(), shelf.id).at(-1).id, shelf.id);
});

test('placesWithin: the place and every place inside it, at any depth', () => {
  const { g, garage, shelf, box, kitchen } = house();
  const inside = M.placesWithin(g.db(), garage.id);
  assert.ok(inside instanceof Set);
  assert.deepEqual([...inside].sort(), [garage.id, shelf.id, box.id].sort());
  assert.ok(!inside.has(kitchen.id));
  assert.deepEqual([...M.placesWithin(g.db(), box.id)], [box.id]);
});

test('placeTree: depth first, siblings by name, with depth', () => {
  const { g } = house();
  const tree = M.placeTree(g.db());
  const at = (name) => tree.find((x) => x.place.name === name);
  assert.equal(at('Garage').depth, 0);
  assert.equal(at('Shelf B').depth, 1);
  assert.equal(at('Box 3').depth, 2);
  assert.equal(at('Kitchen').depth, 0);
  const order = tree.map((x) => x.place.name);
  assert.ok(order.indexOf('Garage') < order.indexOf('Shelf B') && order.indexOf('Shelf B') < order.indexOf('Box 3'), 'children follow their parent');
  assert.ok(order.indexOf('Box 3') < order.indexOf('Kitchen'), 'Garage (and all inside it) before Kitchen: siblings by name');
});

test('placeTree: a place whose parent is gone is top level', () => {
  const g = game();
  g.add({ id: 'place_orphan', type: 'place', name: 'Orphan', zone: 'home', parent: 'place_gone' });
  const row = M.placeTree(g.db()).find((x) => x.place.id === 'place_orphan');
  assert.equal(row.depth, 0);
});

test('movePlace: a new parent, or null for top level; into itself or its own insides throws', () => {
  const { g, garage, shelf, box, kitchen } = house();
  const moved = M.movePlace(g.db(), box.id, kitchen.id);
  assert.equal(moved.id, box.id);
  assert.equal(moved.parent, kitchen.id);
  assert.equal(moved.name, 'Box 3', 'the rest of the record is kept');
  assert.equal(M.movePlace(g.db(), shelf.id, null).parent, null);
  assert.throws(() => M.movePlace(g.db(), garage.id, garage.id));
  assert.throws(() => M.movePlace(g.db(), garage.id, box.id));
});

test('placeRemoval: items and places inside move up to the parent; nothing is deleted', () => {
  const { g, shelf, box, hammer, tape } = house();
  const out = M.placeRemoval(g.db(), box.id);
  const byId = new Map(out.map((r) => [r.id, r]));
  assert.equal(byId.get(hammer.id).place, shelf.id);
  assert.equal(byId.get(tape.id).place, shelf.id);
  assert.ok(!out.some((r) => r.id === box.id), 'the place itself is not in the records to write');
  assert.ok(out.every((r) => !r.deletedAt), 'nothing is tombstoned');

  const up = M.placeRemoval(g.db(), shelf.id);
  const upById = new Map(up.map((r) => [r.id, r]));
  assert.equal(upById.get(box.id).parent, M.placePath(g.db(), shelf.id)[0].id, 'Box 3 moves up into Garage');
});

test('placeRemoval: at the top level, items become Unfiled and places top level', () => {
  const { g, garage, shelf, drill } = house();
  const out = M.placeRemoval(g.db(), garage.id);
  const byId = new Map(out.map((r) => [r.id, r]));
  assert.equal(byId.get(shelf.id).parent, null);
  assert.ok(!byId.has(drill.id), 'the drill was on the shelf, not in the garage itself: it does not move');
  const direct = item(g, { name: 'Bike', place: garage.id });
  assert.equal(new Map(M.placeRemoval(g.db(), garage.id).map((r) => [r.id, r])).get(direct.id).place, null);
});

test('placeRemoval: tasks and skills set there move up too', () => {
  const { g, shelf, box } = house();
  const skill = g.add({ ...M.makeSkill(g.db(), { name: 'Tinker', stat: 'stat_craft', place: box.id }) });
  const task = g.add(M.makeTask(g.db(), { title: 'Sort screws', skill: 'sk_read', place: box.id }, { now: NOW }));
  const byId = new Map(M.placeRemoval(g.db(), box.id).map((r) => [r.id, r]));
  assert.equal(byId.get(skill.id).place, shelf.id);
  assert.equal(byId.get(task.id).place, shelf.id);
});

// ─── items carry the details ───────────────────────────────────────────────

test('makeItem: the house-inventory fields and their defaults', () => {
  const g = game();
  const plain = M.makeItem(g.db(), { name: 'Lamp' });
  assert.equal(plain.brand, '');
  assert.equal(plain.model, '');
  assert.equal(plain.serial, '');
  assert.equal(plain.bought, null);
  assert.equal(plain.warranty, null);
  assert.equal(plain.notes, '');
  assert.deepEqual(plain.photos, []);
  assert.deepEqual(plain.receipts, []);

  const tv = M.makeItem(g.db(), { name: 'TV', brand: 'Sony', model: 'X90L', serial: 'A1B2', bought: '2025-11-28',
    warranty: '2027-11-28', notes: 'wall mount in closet', photos: ['file_a'], receipts: ['file_r'], price: 900 });
  assert.equal(tv.brand, 'Sony');
  assert.equal(tv.model, 'X90L');
  assert.equal(tv.serial, 'A1B2');
  assert.equal(tv.bought, '2025-11-28');
  assert.equal(tv.warranty, '2027-11-28');
  assert.equal(tv.notes, 'wall mount in closet');
  assert.deepEqual(tv.photos, ['file_a']);
  assert.deepEqual(tv.receipts, ['file_r']);
  assert.equal(tv.price, 900, 'price stays the price of one');
});

test('makeItem: a bought or warranty that is not a day throws', () => {
  const g = game();
  assert.throws(() => M.makeItem(g.db(), { name: 'TV', bought: 'last year' }));
  assert.throws(() => M.makeItem(g.db(), { name: 'TV', warranty: '2027-02-30' }));
});

test('makeItem: an item can be filed in a nested place', () => {
  const { g, box } = house();
  assert.equal(M.makeItem(g.db(), { name: 'Glue', place: box.id }).place, box.id);
});

// ─── files ─────────────────────────────────────────────────────────────────

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('makeFile: a write-once file record with its size in bytes', () => {
  const { g, drill } = house();
  const f = M.makeFile(g.db(), { item: drill.id, kind: 'photo', name: 'drill.png', mime: 'image/png', data: PNG_1PX, at: NOW });
  assert.match(f.id, /^file_/);
  assert.equal(f.type, 'file');
  assert.equal(f.item, drill.id);
  assert.equal(f.kind, 'photo');
  assert.equal(f.name, 'drill.png');
  assert.equal(f.mime, 'image/png');
  assert.equal(f.data, PNG_1PX);
  assert.equal(f.size, Buffer.from(PNG_1PX, 'base64').length);
  assert.equal(f.day, D);
  assert.equal(f.at, NOW);
});

test('makeFile: kind is photo or receipt; the item must exist; over FILE_MAX_BYTES throws', () => {
  const { g, drill } = house();
  const ok = { item: drill.id, kind: 'receipt', name: 'r.pdf', mime: 'application/pdf', data: PNG_1PX, at: NOW };
  assert.equal(M.makeFile(g.db(), ok).kind, 'receipt');
  assert.throws(() => M.makeFile(g.db(), { ...ok, kind: 'manual' }));
  assert.throws(() => M.makeFile(g.db(), { ...ok, item: 'item_nowhere' }));
  const big = Buffer.alloc(M.FILE_MAX_BYTES + 1).toString('base64');
  assert.throws(() => M.makeFile(g.db(), { ...ok, data: big }));
  const fits = Buffer.alloc(M.FILE_MAX_BYTES).toString('base64');
  assert.equal(M.makeFile(g.db(), { ...ok, data: fits }).size, M.FILE_MAX_BYTES);
});

test('file is an event, the last one; index() has files and file', () => {
  assert.equal(M.RECORD_TYPES.at(-1), 'file');
  const { g, drill } = house();
  const f = g.add(M.makeFile(g.db(), { item: drill.id, kind: 'photo', name: 'a.png', mime: 'image/png', data: PNG_1PX, at: NOW }));
  const db = g.db();
  assert.ok(db.files.some((x) => x.id === f.id));
  assert.equal(db.file.get(f.id).name, 'a.png');
});

test('filesOf: photos and receipts in the item\'s order; ids not synced yet are skipped', () => {
  const { g, drill } = house();
  const mk = (kind, name) => g.add(M.makeFile(g.db(), { item: drill.id, kind, name, mime: 'image/png', data: PNG_1PX, at: NOW }));
  const a = mk('photo', 'a.png');
  const b = mk('photo', 'b.png');
  const r = mk('receipt', 'r.png');
  g.add({ ...drill, photos: [b.id, 'file_not_here_yet', a.id], receipts: [r.id], updatedAt: NOW + 1 });
  const got = M.filesOf(g.db(), drill.id);
  assert.deepEqual(got.photos.map((f) => f.name), ['b.png', 'a.png']);
  assert.deepEqual(got.receipts.map((f) => f.name), ['r.png']);
});

// ─── finding things ────────────────────────────────────────────────────────

test('searchItems: every word must match; place names count, so "garage drill" finds the drill', () => {
  const { g, drill } = house();
  const hits = M.searchItems(g.db(), 'garage drill');
  assert.deepEqual(hits.map((h) => h.item.id), [drill.id]);
  assert.deepEqual(names(hits[0].path), ['Garage', 'Shelf B']);
  assert.deepEqual(M.searchItems(g.db(), 'kitchen drill'), []);
});

test('searchItems: a box\'s name finds what is in it', () => {
  const { g } = house();
  assert.deepEqual(M.searchItems(g.db(), 'box 3').map((h) => h.item.name), ['Duct tape', 'Hammer']);
});

test('searchItems: brand, model, serial and notes match; case does not matter', () => {
  const { g, drill, tape } = house();
  assert.deepEqual(M.searchItems(g.db(), 'MAKITA').map((h) => h.item.id), [drill.id]);
  assert.deepEqual(M.searchItems(g.db(), 'dhp482').map((h) => h.item.id), [drill.id]);
  assert.deepEqual(M.searchItems(g.db(), 'sn-4471').map((h) => h.item.id), [drill.id]);
  assert.deepEqual(M.searchItems(g.db(), 'silver').map((h) => h.item.id), [tape.id]);
});

test('searchItems: within a place counts everything inside it; an empty query lists all, by path then name', () => {
  const { g, garage, box } = house();
  assert.deepEqual(M.searchItems(g.db(), '', garage.id).map((h) => h.item.name), ['Drill', 'Duct tape', 'Hammer']);
  assert.deepEqual(M.searchItems(g.db(), 'tools', box.id).map((h) => h.item.name), ['Hammer']);
  assert.deepEqual(M.searchItems(g.db(), '').map((h) => h.item.name), ['Drill', 'Duct tape', 'Hammer', 'Kettle']);
});

test('findItems ("I have it") is unchanged by nesting: no place matching', () => {
  const { g } = house();
  assert.deepEqual(M.findItems(g.db(), 'garage'), []);
});

// ─── inventory, CSV, labels ────────────────────────────────────────────────

test('inventory(): stashes carry their place path', () => {
  const { g, box } = house();
  const stash = M.inventory(g.records, NOW).stashes.find((s) => s.place === box.id);
  assert.deepEqual(stash.path, ['Garage', 'Shelf B', 'Box 3']);
});

test('inventoryCSV: header, rows by path then name, counts of files, CRLF', () => {
  const { g, drill, kettle } = house();
  g.add({ ...kettle, photos: ['file_x', 'file_y'], receipts: ['file_z'], updatedAt: NOW + 1 });
  const db = g.db();
  const csv = M.inventoryCSV(db, db.items);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Name,Place,Quantity,Category,Brand,Model,Serial,Bought,Price,Warranty,Photos,Receipts,Notes');
  assert.deepEqual(lines.slice(1, 5).map((l) => l.split(',')[0]), ['Drill', 'Duct tape', 'Hammer', 'Kettle']);
  assert.ok(lines[1].startsWith(`Drill,Garage › Shelf B,1,Tools,Makita,DHP482,SN-4471,,120,,0,0,`), lines[1]);
  assert.ok(lines[4].includes(',2,1,'), 'the kettle has 2 photos and 1 receipt');
  assert.ok(lines[2].endsWith('"silver, wide"'), 'a comma is quoted');
  assert.ok(csv.endsWith('\r\n'));
  assert.ok(drill);
});

test('inventoryCSV: a cell that would run as a formula is written as text', () => {
  const g = game();
  const it = item(g, { name: '=HYPERLINK("x")', notes: '+1 spare', price: 1 });
  const csv = M.inventoryCSV(g.db(), [it]);
  assert.ok(csv.split('\r\n')[1].startsWith(`"'=HYPERLINK(""x"")"`), csv);
  assert.ok(csv.includes("'+1 spare"));
});

test('labelSheet: its own items first, then each place inside under its path', () => {
  const { g, garage } = house();
  const sheet = M.labelSheet(g.db(), garage.id);
  assert.equal(sheet.place.id, garage.id);
  assert.deepEqual(sheet.path, ['Garage']);
  const text = sheet.lines.map((l) => (l.heading !== undefined ? `# ${l.heading}` : `${l.name} ×${l.qty}`));
  assert.deepEqual(text, ['# Shelf B', 'Drill ×1', '# Shelf B › Box 3', 'Duct tape ×3', 'Hammer ×1']);
});

test('labelSheet: a place with nothing in it has no lines', () => {
  const { g, kitchen, kettle } = house();
  assert.deepEqual(M.labelSheet(g.db(), kitchen.id).lines.map((l) => l.item), [kettle.id]);
  const empty = place(g, { name: 'Attic', zone: 'home' });
  assert.deepEqual(M.labelSheet(g.db(), empty.id).lines, []);
});
