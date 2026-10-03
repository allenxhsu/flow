// Technique badges (SPEC.md › The board › Techniques): named things inside a
// skill that you either can or cannot currently do.
//
// A badge here is a belt, not a sticker. "You logged ten days" is a souvenir;
// "you can hold a Euro-carve" is a claim about the present that has to be
// losable, or it means nothing. So a technique is held while the recent
// attempts are mostly clean, goes shaky on a bad run, and is lost on a bad
// stretch — and it is won back the same way.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  techniquesOf, techniqueById, techniqueState, ceilingOf,
  HOLD_WINDOW, HOLD_CLEAN, STATES,
} from '../../src/techniques.js';

/** Attempts newest-last: true = clean. */
const runs = (...clean) => clean.map((ok, i) => ({ at: i, clean: ok }));

describe('the ladder', () => {
  test('a skill with techniques lists them in order of difficulty', () => {
    const list = techniquesOf('poise');
    assert.ok(list.length >= 3, 'Poise has a ladder');
    assert.deepEqual(list.map((t) => t.rank), list.map((_, i) => i + 1), 'ranks are 1..n with no gaps');
    for (const t of list) {
      assert.ok(t.id && t.name, `${t.id} is named`);
      assert.ok(t.held && t.held.length > 5, `${t.name} says how it is held`);
    }
  });

  test('a skill without a ladder is empty on purpose, not broken', () => {
    assert.deepEqual(techniquesOf('bloodline'), []);
    assert.deepEqual(techniquesOf('nonesuch'), []);
  });

  test('no skill carries so many that they become wallpaper', () => {
    for (const id of ['poise', 'inscription', 'shaping', 'scribing']) {
      assert.ok(techniquesOf(id).length <= 7, `${id} has too many techniques`);
    }
  });

  test('a technique belongs to exactly one skill and knows it', () => {
    const t = techniquesOf('poise')[0];
    assert.equal(techniqueById(t.id).skill, 'poise');
  });
});

describe('earning and losing', () => {
  test('the rule is three clean of the last five', () => {
    assert.equal(HOLD_WINDOW, 5);
    assert.equal(HOLD_CLEAN, 3);
  });

  test('nothing attempted is locked', () => {
    assert.equal(techniqueState([]).state, STATES.locked);
  });

  test('attempted but not yet proven is attempting', () => {
    assert.equal(techniqueState(runs(true, false)).state, STATES.attempting);
  });

  test('three clean of five is held', () => {
    assert.equal(techniqueState(runs(true, false, true, false, true)).state, STATES.held);
    assert.equal(techniqueState(runs(true, true, true)).state, STATES.held);
  });

  test('one bad day does not strip it', () => {
    const s = techniqueState(runs(true, true, true, true, false));
    assert.equal(s.state, STATES.held, 'four of five is still held');
  });

  test('a bad stretch does: two of five is shaky, one is lost', () => {
    assert.equal(techniqueState(runs(true, false, true, false, false)).state, STATES.shaky);
    assert.equal(techniqueState(runs(false, false, true, false, false)).state, STATES.lost);
  });

  test('it is won back the same way it was lost', () => {
    const lost = runs(false, false, false, false, false);
    assert.equal(techniqueState(lost).state, STATES.lost);
    assert.equal(techniqueState([...lost, ...runs(true, true, true)]).state, STATES.held);
  });

  test('only the last five count: an old disaster is forgotten', () => {
    const history = [...runs(false, false, false, false, false, false), ...runs(true, true, true, true, true)];
    assert.equal(techniqueState(history).state, STATES.held);
  });

  test('the state carries the tally, so a screen can show the pips', () => {
    const s = techniqueState(runs(true, false, true));
    assert.equal(s.clean, 2);
    assert.equal(s.attempts, 3);
    assert.equal(s.window, 3, 'the window is what there is, until there are five');
  });
});

describe('the ceiling', () => {
  const held = (...ids) => new Map(ids.map((id) => [id, runs(true, true, true)]));

  test('the ceiling is the highest technique currently held', () => {
    const list = techniquesOf('poise');
    const top = list[2];
    const c = ceilingOf('poise', held(list[0].id, list[1].id, top.id));
    assert.equal(c.rank, 3);
    assert.equal(c.technique.id, top.id);
  });

  test('a technique held out of order still counts: the ceiling is the highest', () => {
    const list = techniquesOf('poise');
    const c = ceilingOf('poise', held(list[2].id));
    assert.equal(c.rank, 3);
  });

  test('nothing held is a ceiling of zero, not a crash', () => {
    assert.equal(ceilingOf('poise', new Map()).rank, 0);
    assert.equal(ceilingOf('poise', new Map()).technique, null);
  });

  test('shaky does not count toward the ceiling: it is a claim about now', () => {
    const list = techniquesOf('poise');
    const attempts = new Map([[list[1].id, runs(true, false, true, false, false)]]);
    assert.equal(ceilingOf('poise', attempts).rank, 0);
  });

  test('a skill with no ladder has no ceiling and says so', () => {
    assert.equal(ceilingOf('bloodline', new Map()).rank, 0);
  });

  test('the ceiling names what is next, so there is always something to chase', () => {
    const list = techniquesOf('poise');
    const c = ceilingOf('poise', held(list[0].id));
    assert.equal(c.next.id, list[1].id);
    const top = ceilingOf('poise', held(...list.map((t) => t.id)));
    assert.equal(top.next, null, 'nothing left to chase at the top');
  });
});
