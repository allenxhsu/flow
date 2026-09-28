// Acceptance: The bookshelf (Play, decided 2026-09-28). Spec-derived, black-box:
// SPEC.md "The bookshelf" and its Contract, and the Play view's public
// interact(), render() and actions, as the desk's TASKS menu is tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { shelfPlaces, shelfRows, shelfBooks, bookText } from '../../src/game/shelf.js';
import { validateWorld } from '../../src/game/world.js';
import { GENERIC_WORLD } from '../../src/game/worlds/generic.js';
import * as playView from '../../src/views/play.js';
import { game, T } from '../helpers.mjs';

const NOW = T('2026-09-28T12:00:00');
const shelfOf = (world) => world.levels.flatMap((l) => l.furniture).find((f) => f.model === 'shelf');

/** Two bookcases (one with two shelves), a kitchen with a kettle, and books. */
function library() {
  const g = game();
  const place = (f) => g.add(M.makePlace(g.db(), { now: NOW, zone: 'home', ...f }));
  const item = (f) => g.add(M.makeItem(g.db(), { now: NOW, category: 'Books', ...f }));
  const b1 = place({ name: 'Bookcase 1' });
  const s1 = place({ name: 'Shelf 1 (top)', parent: b1.id });
  const s2 = place({ name: 'Shelf 2', parent: b1.id });
  const b3 = place({ name: 'Bookcase 3' });
  const kitchen = place({ name: 'Kitchen' });
  const sicp = item({ name: 'Structure and Interpretation', brand: 'Abelson & Sussman', place: s1.id, notes: 'Dewey 005.1 · Reference & study' });
  const clrs = item({ name: 'Introduction to Algorithms', brand: 'Cormen', place: s1.id });
  const optics = item({ name: 'Optics', brand: 'Hecht', place: s2.id });
  const emma = item({ name: 'Emma 1', brand: 'Kaoru Mori', place: b3.id });
  item({ name: 'Kettle', category: 'Kitchen', place: kitchen.id });
  return { g, b1, s1, s2, b3, kitchen, sicp, clrs, optics, emma };
}

// ─── which bookcase a shelf is ──────────────────────────────────────────────

test('shelfPlaces: a shelf with no place stands for the top-level bookcases that hold something, by name', () => {
  const { g, b1, b3 } = library();
  assert.deepEqual(shelfPlaces(g.db(), { model: 'shelf' }).map((p) => p.id), [b1.id, b3.id]);
});

test('shelfPlaces: furniture that names a place, by id or by name in any case, is that place', () => {
  const { g, b3 } = library();
  assert.deepEqual(shelfPlaces(g.db(), { model: 'shelf', place: b3.id }).map((p) => p.id), [b3.id]);
  assert.deepEqual(shelfPlaces(g.db(), { model: 'desk', place: 'bookcase 3' }).map((p) => p.id), [b3.id]);
});

test('shelfPlaces: nothing that fits — no bookcases, or other furniture with no place — is []', () => {
  const g = game();
  assert.deepEqual(shelfPlaces(g.db(), { model: 'shelf' }), []);
  const { g: g2 } = library();
  assert.deepEqual(shelfPlaces(g2.db(), { model: 'sofa' }), []);
  assert.deepEqual(shelfPlaces(g2.db(), { model: 'shelf', place: 'Attic' }), [], 'a name that is no place');
});

test('world pack: furniture may name a place; the generic home has a shelf', () => {
  const pack = JSON.parse(JSON.stringify(GENERIC_WORLD));
  shelfOf(pack).place = 'Bookcase 1';
  assert.equal(shelfOf(validateWorld(pack)).place, 'Bookcase 1');
  assert.ok(shelfOf(validateWorld(GENERIC_WORLD)), 'the generic home keeps its shelf');
  shelfOf(pack).place = 'x'.repeat(81);
  assert.throws(() => validateWorld(pack));
});

// ─── shelves and books ──────────────────────────────────────────────────────

test('shelfRows: every place inside the bookcase, labelled below it, with what sits directly on it', () => {
  const { g, b1, s1, s2 } = library();
  const rows = shelfRows(g.db(), b1.id);
  assert.deepEqual(rows.map((r) => [r.place.id, r.label, r.count]), [[s1.id, 'Shelf 1 (top)', 2], [s2.id, 'Shelf 2', 1]]);
});

test('shelfRows: a bookcase with things directly on it lists itself first', () => {
  const { g, b3 } = library();
  const rows = shelfRows(g.db(), b3.id);
  assert.equal(rows[0].place.id, b3.id);
  assert.equal(rows[0].count, 1);
});

test('shelfBooks: left to right by the latest reshelve plan to that shelf, the rest by name', () => {
  const { g, s1, sicp, clrs } = library();
  assert.deepEqual(shelfBooks(g.db(), s1.id).map((i) => i.id), [clrs.id, sicp.id], 'by name with no plan');
  g.add(M.makeReshelve(g.db(), { name: 'Dewey', now: NOW, moves: [{ item: sicp.id, to: s1.id }, { item: clrs.id, to: s1.id }] }));
  assert.deepEqual(shelfBooks(g.db(), s1.id).map((i) => i.id), [sicp.id, clrs.id], 'the plan’s order');
});

test('bookText: title and author, where it is, then its notes', () => {
  const { g, sicp } = library();
  const lines = bookText(g.db(), sicp);
  assert.match(lines[0], /Structure and Interpretation/);
  assert.match(lines[0], /Abelson & Sussman/);
  assert.ok(lines.some((l) => /Bookcase 1 › Shelf 1 \(top\)/.test(l)));
  assert.ok(lines.some((l) => /Dewey 005\.1/.test(l)));
});

// ─── the menu in Play ───────────────────────────────────────────────────────

const ctxOf = (g, ui = {}) => {
  const saved = [];
  const store = { save: async (...r) => { saved.push(...r.flat()); }, add: async (...r) => { saved.push(...r.flat()); }, allRecords: () => g.records, getRecord: (id) => g.records.find((r) => r.id === id) || null };
  return { db: g.db(), g: M.play(g.records, NOW), now: NOW, ui, saved, store, toast: () => {} };
};

test('Play: pressing A at a shelf with several bookcases asks which', () => {
  const { g } = library();
  const ctx = ctxOf(g);
  playView.interact({ kind: 'shelf', furniture: { model: 'shelf' } }, ctx);
  const html = playView.render(ctx);
  assert.match(html, /WHICH BOOKCASE\?/);
  assert.match(html, /Bookcase 1[\s\S]*Bookcase 3/);
});

test('Play: a shelf that is one bookcase opens on its shelves; a shelf lists its books; a book is described', async () => {
  const { g, b1, s1, clrs } = library();
  const ctx = ctxOf(g);
  playView.interact({ kind: 'shelf', furniture: { model: 'shelf', place: b1.id } }, ctx);
  let html = playView.render(ctx);
  assert.match(html, /BOOKCASE 1/);
  assert.match(html, /Shelf 1 \(top\)[\s\S]*?2[\s\S]*Shelf 2/);
  await playView.actions['shelf-row']({ dataset: { place: s1.id } }, ctx);
  html = playView.render(ctx);
  assert.match(html, /Introduction to Algorithms[\s\S]*Structure and Interpretation/);
  await playView.actions['shelf-book']({ dataset: { item: clrs.id } }, ctx);
  assert.match(playView.render(ctx), /Introduction to Algorithms/);
});

test('Play: with a plan active the bookcase offers RESHELVE; ticking SHELVE moves the book', async () => {
  const { g, b1, s2, clrs } = library();
  const plan = g.add(M.makeReshelve(g.db(), { name: 'Dewey', now: NOW, moves: [{ item: clrs.id, to: s2.id, call: '005.1' }] }));
  const ctx = ctxOf(g);
  playView.interact({ kind: 'shelf', furniture: { model: 'shelf', place: b1.id } }, ctx);
  assert.match(playView.render(ctx), /RESHELVE[^<]*0\/1/);
  await playView.actions['shelf-reshelve']({ dataset: {} }, ctx);
  await playView.actions['rs-mode']({ dataset: { mode: 'shelve' } }, ctx);
  assert.match(playView.render(ctx), /Bookcase 1 › Shelf 2/);
  await playView.actions['rs-group']({ dataset: { place: s2.id } }, ctx);
  assert.match(playView.render(ctx), /005\.1[\s\S]*Introduction to Algorithms/);
  await playView.actions['rs-tick']({ dataset: { item: clrs.id } }, ctx);
  const moved = ctx.saved.find((r) => r.id === clrs.id);
  assert.equal(moved.place, s2.id);
  assert.deepEqual(ctx.saved.find((r) => r.id === plan.id).shelved, [clrs.id]);
});

test('Play: a shelf that stands for nothing just says its text', () => {
  const g = game();
  const ctx = ctxOf(g);
  playView.interact({ kind: 'shelf', furniture: { model: 'shelf', text: 'A shelf of books you mean to finish.' } }, ctx);
  assert.equal(ctx.ui.play?.menu ?? null, null);
});
