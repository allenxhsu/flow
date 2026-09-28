// The app's plannerSince stamp (src/sync.js writes what plannerSinceStamp returns):
// the first successful read stamps it, once; it is never moved later.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannerSinceStamp } from '../src/planner.js';

test('plannerSinceStamp: stamps a settings record without one, at the read time', () => {
  const s = plannerSinceStamp({ id: 'settings', type: 'settings', name: 'Ana', mission: '' }, 1000);
  assert.deepEqual(s, { id: 'settings', type: 'settings', name: 'Ana', mission: '', plannerSince: 1000 });
});

test('plannerSinceStamp: no settings record yet → a new one with the stamp', () => {
  const s = plannerSinceStamp(null, 1000);
  assert.equal(s.id, 'settings');
  assert.equal(s.type, 'settings');
  assert.equal(s.plannerSince, 1000);
});

test('plannerSinceStamp: an existing stamp is never moved later (nothing to write)', () => {
  assert.equal(plannerSinceStamp({ id: 'settings', type: 'settings', plannerSince: 500 }, 1000), null);
});

test('plannerSinceStamp: without a successful read there is nothing to stamp', () => {
  assert.equal(plannerSinceStamp({ id: 'settings', type: 'settings' }, null), null);
});
