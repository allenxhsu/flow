// SPEC.md › The board: seven trees. Written from the spec and the public API.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TREES, SKILLS, skillById, oneShot, boardRecords, MAX_STATS,
  depthFor, DEPTH_RANKS, rankFor, gradeFor, paceFor, BASELINE_WEEKS, GRADE_PER_DOUBLING,
} from '../../src/board.js';

describe('the seven trees', () => {
  test('seven trees, four professional and three private, each with at least three skills', () => {
    assert.equal(TREES.length, 7);
    assert.deepEqual(TREES.map((t) => t.id),
      ['artifice', 'campaign', 'rhetoric', 'command', 'sinew', 'arcana', 'hearth']);
    for (const t of TREES) {
      const mine = SKILLS.filter((s) => s.tree === t.id);
      assert.ok(mine.length >= 3, `${t.id} has ${mine.length} skills, needs 3`);
    }
    assert.equal(TREES.filter((t) => t.side === 'work').length, 4);
    assert.equal(TREES.filter((t) => t.side === 'life').length, 3);
  });

  test('the stat cap is seven, because the board is', () => {
    assert.equal(MAX_STATS, 7);
  });

  test('every skill has a display name, a plain subtitle and a unit of output', () => {
    for (const s of SKILLS) {
      assert.ok(s.name, `${s.id} has no name`);
      assert.ok(s.plain, `${s.id} has no plain-language subtitle`);
      assert.ok(s.tree, `${s.id} has no tree`);
      if (s.tree !== 'hearth') assert.ok(s.unit, `${s.id} has no unit of output`);
    }
  });

  test('the names are the ones decided, and the subtitle says what they mean', () => {
    assert.equal(skillById('summoning').name, 'Summoning');
    assert.match(skillById('summoning').plain, /procurement/i);
    assert.equal(skillById('sundering').tree, 'artifice');
    assert.equal(skillById('poise').tree, 'sinew');
    assert.deepEqual(SKILLS.filter((s) => s.tree === 'hearth').map((s) => s.name),
      ['Covenant', 'Bloodline', 'Fellowship']);
  });

  test('one-shot skills are the ones you do not get to do twice', () => {
    for (const id of ['inscription', 'summoning', 'trial', 'deliverance', 'parley', 'council', 'decree', 'poise']) {
      assert.equal(oneShot(id), true, `${id} should be one-shot`);
    }
    for (const id of ['shaping', 'interlock', 'sundering', 'might', 'vigor', 'lore']) {
      assert.equal(oneShot(id), false, `${id} should be iterable`);
    }
  });

  test('Hearth is never graded: no unit, no grade, no pace', () => {
    for (const s of SKILLS.filter((x) => x.tree === 'hearth')) {
      assert.equal(s.graded, false, `${s.id} must not be graded`);
      assert.equal(s.unit, null);
    }
    assert.equal(TREES.find((t) => t.id === 'hearth').graded, false);
  });

  test('Poise is seasonal, so it does not go cold out of season', () => {
    assert.equal(skillById('poise').dormant, true);
    assert.equal(skillById('might').dormant, false);
  });

  test('the board can be written as records the model already understands', () => {
    const recs = boardRecords();
    const stats = recs.filter((r) => r.type === 'stat');
    const skills = recs.filter((r) => r.type === 'skill');
    assert.equal(stats.length, 7);
    assert.equal(skills.length, SKILLS.length);
    for (const s of skills) assert.ok(stats.some((st) => st.id === s.stat), `${s.id} points at a stat that exists`);
    for (const r of recs) assert.ok(r.id && r.type, 'every record has an id and a type');
  });
});

describe('Depth — the logbook', () => {
  test('log2 of hours: each level costs double the last', () => {
    assert.equal(depthFor(8 * 60), 4);
    assert.equal(depthFor(75 * 60), 7);
    assert.equal(depthFor(300 * 60), 9);
    assert.equal(depthFor(1000 * 60), 10, 'log2(1000) is 9.97, and Depth floors');
    assert.equal(depthFor(10000 * 60), 14);
  });

  test('under an hour is Depth 0, and it never goes negative', () => {
    assert.equal(depthFor(0), 0);
    assert.equal(depthFor(30), 0);
    assert.equal(depthFor(59), 0);
    assert.equal(depthFor(60), 1);
    assert.equal(depthFor(-100), 0);
  });

  test('ranks band the depths', () => {
    assert.deepEqual(DEPTH_RANKS.map((r) => r.name),
      ['Initiate', 'Journeyman', 'Adept', 'Master', 'Grandmaster']);
    assert.equal(rankFor(1), 'Initiate');
    assert.equal(rankFor(3), 'Initiate');
    assert.equal(rankFor(4), 'Journeyman');
    assert.equal(rankFor(8), 'Adept');
    assert.equal(rankFor(11), 'Master');
    assert.equal(rankFor(20), 'Grandmaster');
  });
});

describe('Grade — the score', () => {
  test('at your baseline the Grade is zero, and a doubling is ten', () => {
    assert.equal(GRADE_PER_DOUBLING, 10);
    assert.equal(gradeFor(1), 0);
    assert.equal(gradeFor(2), 10);
    assert.equal(gradeFor(1.5), 6);
    assert.equal(gradeFor(1.15), 2);
  });

  test('Grade can fall: slower than baseline is negative', () => {
    assert.equal(gradeFor(0.5), -10);
    assert.ok(gradeFor(0.9) < 0);
  });

  test('a sustained 1% a day is one level every seven days', () => {
    const days = 7;
    const pace = 1.01 ** days;
    assert.equal(gradeFor(pace), 1);
    assert.equal(gradeFor(1.01 ** 70), 10, 'and a doubling in ten weeks');
  });

  test('pace for an iterable skill is baseline minutes per unit over current', () => {
    const p = paceFor({ baseline: { minutes: 600, units: 10 }, current: { minutes: 500, units: 10 } });
    assert.equal(p, 1.2, '60 min a unit down to 50');
  });

  test('pace for a one-shot skill counts only units that did not come back', () => {
    // Ten drawings at 60 min, none returned, against ten rushed at 50 with four returned.
    const careful = paceFor({ baseline: { minutes: 600, units: 10, clean: 10 },
      current: { minutes: 600, units: 10, clean: 10 }, oneShot: true });
    assert.equal(careful, 1);
    const rushed = paceFor({ baseline: { minutes: 600, units: 10, clean: 10 },
      current: { minutes: 660, units: 10, clean: 6 }, oneShot: true });
    assert.ok(rushed < 1, 'rushing and reworking is slower, not faster');
    assert.equal(Math.round((660 / 6) * 10) / 10, 110);
    assert.equal(Math.round(rushed * 100) / 100, Math.round((60 / 110) * 100) / 100);
  });

  test('slowing down to get it right raises the Grade of a one-shot skill', () => {
    const base = { minutes: 600, units: 10, clean: 10 };
    const rushed = paceFor({ baseline: base, current: { minutes: 660, units: 10, clean: 6 }, oneShot: true });
    const careful = paceFor({ baseline: base, current: { minutes: 600, units: 10, clean: 10 }, oneShot: true });
    assert.ok(careful > rushed);
  });

  test('over-investing is punished too: the formula has an optimum', () => {
    const base = { minutes: 600, units: 10, clean: 10 };
    const slow = paceFor({ baseline: base, current: { minutes: 1200, units: 10, clean: 10 }, oneShot: true });
    const rushed = paceFor({ baseline: base, current: { minutes: 660, units: 10, clean: 6 }, oneShot: true });
    assert.ok(slow < rushed, '120 min a clean drawing is worse than 110');
  });

  test('no baseline, no Grade — the first weeks are measured, not graded', () => {
    assert.equal(BASELINE_WEEKS, 4);
    assert.equal(paceFor({ baseline: null, current: { minutes: 100, units: 2 } }), null);
    assert.equal(paceFor({ baseline: { minutes: 0, units: 0 }, current: { minutes: 100, units: 2 } }), null);
    assert.equal(gradeFor(null), null);
  });

  test('a current period with no completed units has no pace yet', () => {
    assert.equal(paceFor({ baseline: { minutes: 600, units: 10 }, current: { minutes: 50, units: 0 } }), null);
    assert.equal(paceFor({ baseline: { minutes: 600, units: 10, clean: 10 },
      current: { minutes: 200, units: 3, clean: 0 }, oneShot: true }), null);
  });
});
