// Acceptance: Reshelving (decided 2026-09-28). Spec-derived, black-box.
// Written from SPEC.md "Reshelving" and its Contract only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../src/model.js';
import { game, T } from '../helpers.mjs';

const NOW = T('2026-09-28T12:00:00');

/** Two shelves, three books all on shelf A, and a plan that sends two of them to shelf B. */
function shelves() {
  const g = game();
  const place = (f) => g.add(M.makePlace(g.db(), { now: NOW, ...f }));
  const item = (f) => g.add(M.makeItem(g.db(), { now: NOW, ...f }));
  const bookcase = place({ name: 'Bookcase 1', zone: 'home' });
  const a = place({ name: 'Shelf A', parent: bookcase.id });
  const b = place({ name: 'Shelf B', parent: bookcase.id });
  const algo = item({ name: 'Introduction to Algorithms', place: a.id });
  const optics = item({ name: 'Optics', place: a.id });
  const goal = item({ name: 'The Goal', place: a.id });
  const plan = M.makeReshelve(g.db(), { name: 'Dewey', now: NOW, moves: [
    { item: algo.id, to: a.id, call: '005.1' },
    { item: optics.id, to: b.id, call: '535' },
    { item: goal.id, to: b.id, call: '658.5' },
  ] });
  g.add(plan);
  return { g, bookcase, a, b, algo, optics, goal, plan };
}

test('makeReshelve: moves in their final order, numbered from 1, from defaulting to where the item is', () => {
  const { plan, a, b, optics } = shelves();
  assert.equal(plan.type, 'reshelve');
  assert.match(plan.id, /^reshelve_/);
  assert.equal(plan.name, 'Dewey');
  assert.deepEqual(plan.moves.map((m) => m.n), [1, 2, 3]);
  assert.deepEqual(plan.moves[1], { item: optics.id, from: a.id, to: b.id, n: 2, call: '535' });
  assert.deepEqual(plan.pulled, []);
  assert.deepEqual(plan.shelved, []);
  assert.equal(plan.done, false);
});

test('makeReshelve: an unknown item or place throws', () => {
  const { g, a, algo } = shelves();
  assert.throws(() => M.makeReshelve(g.db(), { name: 'x', moves: [{ item: 'item_gone', to: a.id }] }));
  assert.throws(() => M.makeReshelve(g.db(), { name: 'x', moves: [{ item: algo.id, to: 'place_gone' }] }));
});

test('activeReshelve: the latest plan that is not done, or null', () => {
  const { g, plan } = shelves();
  assert.equal(M.activeReshelve(g.db()).id, plan.id);
  g.add({ ...plan, done: true, updatedAt: NOW + 1 });
  assert.equal(M.activeReshelve(g.db()), null);
});

test('reshelveView: shelves in plan order with their books by n; a book already there counts as shelved', () => {
  const { g, plan, a, b } = shelves();
  const v = M.reshelveView(g.db(), plan);
  assert.equal(v.total, 3);
  assert.deepEqual(v.shelves.map((s) => s.place.id), [a.id, b.id]);
  assert.deepEqual(v.shelves[0].path, ['Bookcase 1', 'Shelf A']);
  assert.deepEqual(v.shelves[1].moves.map((m) => m.item.name), ['Optics', 'The Goal']);
  assert.equal(v.shelves[0].moves[0].isShelved, true, 'Algorithms is already on shelf A');
  assert.equal(v.shelved, 1);
  assert.equal(v.pulled, 0);
});

test('reshelveView: sources group the books by the shelf they come from', () => {
  const { g, plan, a } = shelves();
  const v = M.reshelveView(g.db(), plan);
  assert.deepEqual(v.sources.map((s) => s.place.id), [a.id]);
  assert.deepEqual(v.sources[0].moves.map((m) => m.n), [1, 2, 3]);
});

test('markPulled: marks and unmarks, nothing else', () => {
  const { g, plan, optics } = shelves();
  const p1 = M.markPulled(plan, optics.id);
  assert.deepEqual(p1.pulled, [optics.id]);
  assert.deepEqual(M.markPulled(p1, optics.id).pulled, [optics.id], 'marking twice keeps one');
  assert.deepEqual(M.markPulled(p1, optics.id, false).pulled, []);
  g.add({ ...p1, updatedAt: NOW + 1 });
  assert.equal(M.reshelveView(g.db(), p1).pulled, 1);
});

test('shelveMove: the item moves to its new place and the plan marks it; unticking does not move it back', () => {
  const { g, plan, b, optics } = shelves();
  const { plan: p1, item } = M.shelveMove(g.db(), plan, optics.id);
  assert.equal(item.id, optics.id);
  assert.equal(item.place, b.id);
  assert.equal(item.name, 'Optics', 'the rest of the item is kept');
  assert.deepEqual(p1.shelved, [optics.id]);
  g.add({ ...item, updatedAt: NOW + 1 }, { ...p1, updatedAt: NOW + 1 });
  assert.equal(M.reshelveView(g.db(), p1).shelved, 2);
  const off = M.shelveMove(g.db(), p1, optics.id, false);
  assert.deepEqual(off.plan.shelved, []);
  assert.equal(off.item, null);
});

test('reshelveView: a move whose item is gone is left out', () => {
  const { g, plan, goal } = shelves();
  g.add({ ...goal, deletedAt: NOW + 1, updatedAt: NOW + 1 });
  const v = M.reshelveView(g.db(), plan);
  assert.equal(v.total, 2);
  assert.ok(!v.shelves.some((s) => s.moves.some((m) => m.item.id === goal.id)));
});
