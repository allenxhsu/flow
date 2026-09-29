// The tree has tiers, and a tier opens when what it stands on is solid
// (SPEC.md › The board › Tiers). Modelled on Diablo's trees: a skill needs its
// prerequisite worked and the tree deep enough, so the basics come first.
//
// Locking here can never mean "you may not do this work" — Flow cannot refuse
// to log a drawing. It means the skill cannot be **focused** and carries no
// Grade yet: deliberate practice on it is premature, which is the true thing
// to say about modularity before you can model.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SKILLS, TIERS, skillById, treeSkills, treeDepth, unlockState, focusable, depthFor,
} from '../../src/board.js';

/** Minutes per skill id → the map the tree is read against. */
const mins = (o) => new Map(Object.entries(o));

describe('the shape of the tree', () => {
  test('every graded skill has a tier, and tier 1 has no prerequisite', () => {
    for (const s of SKILLS.filter((x) => x.graded)) {
      assert.ok(s.tier >= 1, `${s.id} has no tier`);
      if (s.tier === 1) assert.equal(s.requires, null, `${s.id} is tier 1 and must stand alone`);
      else assert.ok(s.requires, `${s.id} is tier ${s.tier} and must stand on something`);
    }
  });

  test('a prerequisite is a real skill in the same tree, and lower down it', () => {
    for (const s of SKILLS.filter((x) => x.requires)) {
      const parent = skillById(s.requires);
      assert.ok(parent, `${s.id} requires ${s.requires}, which does not exist`);
      assert.equal(parent.tree, s.tree, `${s.id} requires a skill from another tree`);
      assert.ok(parent.tier < s.tier, `${s.id} requires ${parent.id}, which is not below it`);
    }
  });

  test('every tree has a tier-1 root you can start from today', () => {
    for (const tree of [...new Set(SKILLS.filter((s) => s.graded).map((s) => s.tree))]) {
      assert.ok(treeSkills(tree).some((s) => s.tier === 1), `${tree} has no root`);
    }
  });

  test('the basics are the roots, and the deep work sits on them', () => {
    assert.equal(skillById('shaping').tier, 1);
    assert.equal(skillById('sundering').requires, 'interlock', 'modularity stands on assemblies');
    assert.ok(skillById('sundering').tier > skillById('shaping').tier);
    assert.equal(skillById('summoning').tier, 1, 'procurement is where operations start');
    assert.equal(skillById('deliverance').tier, 4, 'delivering on the date needs everything under it');
    assert.equal(skillById('scribing').tier, 1, 'writing is the root of communication');
    assert.equal(skillById('battle-orders').tier, 1);
    assert.equal(skillById('poise').requires, 'might', 'edge control is legs before lungs');
  });

  test('Hearth has no tiers, because it is not a ladder', () => {
    for (const s of treeSkills('hearth')) assert.equal(s.tier, null);
  });

  test('the tier gates are the ones decided, and they rise', () => {
    assert.deepEqual(TIERS.map((t) => t.tier), [1, 2, 3, 4]);
    const gates = TIERS.map((t) => t.treeDepth);
    for (let i = 1; i < gates.length; i++) assert.ok(gates[i] > gates[i - 1], 'gates rise with the tier');
    assert.equal(TIERS[0].treeDepth, 0, 'tier 1 is open from the first day');
  });
});

describe('every skill says what it is', () => {
  test('a name alone is a crossword: each carries what it is, its unit and its meter', () => {
    for (const s of SKILLS) {
      assert.ok(s.plain && s.plain.length > 3, `${s.id} has no plain-language line`);
      assert.ok(s.meter && s.meter.length > 8, `${s.id} does not say what measures it`);
      if (s.graded) assert.ok(s.unit && s.unit.length > 2, `${s.id} does not say what one unit is`);
    }
  });

  test('the meters are the ones the spec names', () => {
    assert.match(skillById('inscription').meter, /revision/i);
    assert.match(skillById('summoning').meter, /second req|on-dock/i);
    assert.match(skillById('trial').meter, /first.time/i);
    assert.match(skillById('scribing').meter, /round.trip/i);
    assert.match(skillById('council').meter, /say.back/i);
    assert.match(skillById('battle-orders').meter, /chase/i);
    assert.match(skillById('poise').meter, /fall/i);
  });

  test('every skill has an icon, and no two in a tree share one', () => {
    for (const s of SKILLS) assert.ok(s.icon && s.icon.length <= 2, `${s.id} has no icon`);
    for (const tree of [...new Set(SKILLS.map((x) => x.tree))]) {
      const icons = treeSkills(tree).map((x) => x.icon);
      assert.equal(new Set(icons).size, icons.length, `${tree} has a duplicate icon`);
    }
  });

  test('Hearth says plainly that it is not measured', () => {
    for (const s of treeSkills('hearth')) assert.match(s.meter, /never graded|not measured/i);
  });
});

describe('tree depth', () => {
  test("a tree's depth is log2 of every hour spent anywhere in it", () => {
    const m = mins({ shaping: 240, interlock: 240 });
    assert.equal(treeDepth('artifice', m), depthFor(480), '8 hours across the tree');
  });

  test('a tree nobody has touched is depth 0', () => {
    assert.equal(treeDepth('artifice', mins({})), 0);
  });

  test('hours in another tree do not deepen this one', () => {
    assert.equal(treeDepth('artifice', mins({ might: 6000 })), 0);
  });
});

describe('what is unlocked', () => {
  test('a tier-1 skill is open on the first day, with nothing done', () => {
    const u = unlockState('shaping', mins({}));
    assert.equal(u.unlocked, true);
    assert.equal(u.reasons.length, 0);
  });

  test('a tier-2 skill is locked until the tree is deep enough AND its parent is worked', () => {
    const u = unlockState('interlock', mins({}));
    assert.equal(u.unlocked, false);
    assert.ok(u.reasons.some((r) => /tree/i.test(r)), `expected a tree reason, got ${u.reasons}`);
    assert.ok(u.reasons.some((r) => /Shaping/.test(r)), `expected a Shaping reason, got ${u.reasons}`);
  });

  test('the tree being deep is not enough on its own: the parent must be worked', () => {
    // All the hours in one tier-1 skill: the tree is deep, the parent of
    // Sundering (Interlock) is untouched.
    const u = unlockState('sundering', mins({ shaping: 100000 }));
    assert.equal(u.unlocked, false);
    assert.ok(u.reasons.some((r) => /Interlock/.test(r)));
  });

  test('working the parent is not enough on its own either', () => {
    const u = unlockState('deliverance', mins({ trial: 600 }));
    assert.equal(u.unlocked, false);
    assert.ok(u.reasons.some((r) => /tree/i.test(r)));
  });

  test('both satisfied, and the skill opens', () => {
    const m = mins({ shaping: 60 * 60, interlock: 30 * 60 });
    const u = unlockState('sundering', m);
    assert.equal(u.unlocked, true, `still locked: ${u.reasons}`);
  });

  test('a locked skill can still be worked — it just cannot be focused', () => {
    const m = mins({ interlock: 120 });
    assert.equal(unlockState('interlock', m).unlocked, false);
    assert.equal(focusable('interlock', m), false, 'deliberate practice on it is premature');
    assert.equal(focusable('shaping', m), true);
    // and the hours still count: they are what eventually opens it
    assert.ok(treeDepth('artifice', m) > 0);
  });

  test('Hearth is never locked and never focusable: it is not that kind of thing', () => {
    const u = unlockState('covenant', mins({}));
    assert.equal(u.unlocked, true);
    assert.equal(focusable('covenant', mins({})), false);
  });

  test('an unknown skill is locked rather than throwing', () => {
    assert.equal(unlockState('nonesuch', mins({})).unlocked, false);
    assert.equal(focusable('nonesuch', mins({})), false);
  });

  test('the reasons are sentences a person can act on', () => {
    for (const r of unlockState('interlock', mins({})).reasons) {
      assert.match(r, /[A-Z]/);
      assert.ok(r.length > 8, `"${r}" is not a sentence`);
    }
  });
});
