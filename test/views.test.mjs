// The views render HTML from play()'s output, so each can be checked under
// Node against the states the rules can produce.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play } from '../src/model.js';
import * as review from '../src/views/review.js';

test('Review renders for a new player before their first Sunday (not due, no review yet)', () => {
  const g = play([], new Date('2026-09-24T12:00:00').getTime()); // Thursday
  const html = review.render({ g });
  assert.match(html, /Weekly review/);
  assert.match(html, /first review|Sunday/i);
});
