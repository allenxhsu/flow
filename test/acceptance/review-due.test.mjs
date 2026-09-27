// SPEC › Streaks, reviews: the weekly review is due every Sunday (the end of a
// Monday–Sunday week) when that week has no review yet, and stays due after a
// missed week until one is done. A new player's first is due on their first Sunday.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { play, makeReview, index } from '../../src/model.js';

const at = (day, time = '12:00') => new Date(`${day}T${time}:00`).getTime();
const review = (day) => ({ ...makeReview(index([]), { satisfaction: 7, at: at(day, '20:00') }), updatedAt: at(day, '20:00'), origin: 't' });
const due = (records, day) => play(records, at(day)).satisfaction.due;

// 2026-09-28 is a Monday; 2026-10-04 is the Sunday that ends that week.
test('a new player is not due until their first Sunday', () => {
  assert.equal(due([], '2026-09-28'), false, 'Monday of the first week');
  assert.equal(due([], '2026-10-03'), false, 'Saturday');
  assert.equal(due([], '2026-10-04'), true, 'Sunday');
});

test('reviewed this week: not due again until next Sunday', () => {
  const r = [review('2026-10-04')];
  assert.equal(due(r, '2026-10-04'), false, 'the same Sunday, after reviewing');
  assert.equal(due(r, '2026-10-05'), false, 'Monday');
  assert.equal(due(r, '2026-10-10'), false, 'Saturday — seven days on is not the rule');
  assert.equal(due(r, '2026-10-11'), true, 'the next Sunday');
});

test('a late review on Monday still counts for the new week, and Sunday is the next due day', () => {
  const r = [review('2026-10-05')]; // Monday of W41
  assert.equal(due(r, '2026-10-06'), false);
  assert.equal(due(r, '2026-10-11'), false, 'W41 already has its review');
  assert.equal(due(r, '2026-10-18'), true);
});

test('a missed week stays due until a review is done', () => {
  const r = [review('2026-10-04')]; // W40 reviewed, W41 (Oct 5–11) missed
  assert.equal(due(r, '2026-10-12'), true, 'Monday after the missed Sunday');
  assert.equal(due(r, '2026-10-14'), true, 'Wednesday, still owed');
  const caught = [...r, review('2026-10-14')];
  assert.equal(due(caught, '2026-10-15'), false, 'done for W42 now');
  // The catch-up on Wednesday is W42's review (one per week), so W42's Sunday is not due.
  assert.equal(due(caught, '2026-10-18'), false, 'W42 already reviewed');
  assert.equal(due(caught, '2026-10-25'), true, 'the Sunday after');
});
