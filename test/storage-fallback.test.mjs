// With no IndexedDB and no localStorage (a sandboxed preview, some private
// modes), Flow still opens: records live in memory for this window, and the
// app says so instead of hanging on "Loading…".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, persistence } from '../src/sync.js';

test('no browser storage: the store opens in memory and says so', async () => {
  assert.equal(typeof globalThis.indexedDB, 'undefined');
  assert.equal(typeof globalThis.localStorage, 'undefined');
  const s = await openStore('flow-test');
  await s.put([{ id: 'task_a', type: 'task', title: 'A', updatedAt: 1, deletedAt: null, origin: 't' }]);
  assert.deepEqual((await s.all()).map((r) => r.id), ['task_a']);
  assert.equal(persistence(), 'memory');
});
