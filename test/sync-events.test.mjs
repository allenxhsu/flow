// Every event type the model writes is written once in the store, never
// edited or deleted (src/model.js header): the sync layer must know them all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_TYPES } from '../src/model.js';
import { isEvent } from '../src/sync.js';

test('the store treats every model event as write-once, skip and spend included', () => {
  assert.ok(EVENT_TYPES.includes('skip') && EVENT_TYPES.includes('spend'));
  for (const type of EVENT_TYPES) assert.equal(isEvent(type), true, type);
  for (const type of ['task', 'settings', 'item']) assert.equal(isEvent(type), false, type);
});
