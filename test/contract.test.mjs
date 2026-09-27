// The seams between parts: what the app, the replay and the CLI rely on from src/model.js.
// Built from docs/API.md. Changing a contract means changing this test first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';
import { game, T } from './helpers.mjs';

// name → arity (Function.length: parameters before the first default)
const FUNCTIONS = {
  dayOf: 1, addDays: 2, daysBetween: 2, isDay: 1, isoWeek: 1, newId: 1, stamp: 1, tombstone: 1, index: 1,
  betterOf: 1, makeSkill: 2, makePlace: 2, placeOfTask: 2, makeMoment: 2, makeTask: 2, makeReward: 1,
  isCritical: 1, actual: 1, taskStats: 2, levelFor: 2, masteryFactor: 1, underdogsOn: 2, chainAt: 3,
  priceDone: 3, makeDone: 2, balanceOf: 1, chargeFor: 2, makePurchase: 2, makeRework: 3, makeEnergy: 1,
  energyOn: 2, makeReview: 2, latestPerWeek: 1, isDoneFor: 3, dailyStreak: 2, weeklyStreak: 2,
  pickNext: 2, reworkCandidate: 3, play: 1, replayDay: 2,
};

const CONSTANTS = {
  POINTS_PER_MINUTE: 1,
  BONUS: { flow: 0.2, pb: 0.25, underdog: 0.5, comboStep: 0.1, comboMax: 1, batchStep: 0.15 },
  BONUS_CAP: 2.5, COMBO_GAP_MIN: 30, BATCH_GAP_MIN: 10, BATCH_RELEASE: 3, DEADLINE_SOON_DAYS: 2,
  HISTORY_RUNS: 5, HISTORY_MIN_RUNS: 3, TARGET_STEP: 0.05, MASTERY_STEP: 0.075, MASTERY_FLOOR: 0.25,
  BATCH_MANA_SHARE: 0.5, REWORK_MULTIPLIERS: [1.5, 1.75, 2], REWORK_CRITICAL: 2, DEBT_MULTIPLIER: 2,
  PLAYER_STEP: 500, STAT_STEP: 300, SKILL_STEP: 100, ENERGY_MAX: 10, WEEK: 7, REWORK_ASK_DAYS: 14,
  ZONES: ['home', 'road', 'factory', 'town', 'elsewhere'], WALK_MIN: 5,
};

const DEFINITIONS = ['settings', 'stat', 'skill', 'task', 'reward', 'place', 'kind'];
const EVENTS = ['done', 'rework', 'purchase', 'energy', 'review', 'moment'];
const D = '2026-09-28';

test('contract: every function in docs/API.md is exported with its arity', () => {
  for (const [name, arity] of Object.entries(FUNCTIONS)) {
    assert.equal(typeof M[name], 'function', name);
    assert.equal(M[name].length, arity, `${name}.length`);
  }
});

test('contract: every constant in docs/API.md is exported with its value', () => {
  for (const [name, value] of Object.entries(CONSTANTS)) assert.deepEqual(M[name], value, name);
  for (const name of ['DEFAULT_STATS', 'DEFAULT_PLACES', 'DEFAULT_KINDS']) assert.ok(Array.isArray(M[name]) && M[name].length > 0, name);
  assert.deepEqual(M.DEFAULT_STATS.map((s) => s.name), ['Body', 'Mind', 'Craft', 'Work', 'Bonds']);
  for (const p of M.DEFAULT_PLACES) assert.ok(M.ZONES.includes(p.zone), `${p.id} zone`);
  for (const k of M.DEFAULT_KINDS) {
    for (const f of ['id', 'title', 'place']) assert.equal(typeof k[f], 'string', `${k.id}.${f}`);
    for (const f of ['staminaPerHour', 'manaPerHour']) assert.equal(typeof k[f], 'number', `${k.id}.${f}`);
  }
  assert.deepEqual(M.DEFAULT_KINDS.map((k) => k.title), ['Drive', 'Chat', 'Walk the floor', 'Laundry', 'Meal', 'Rest']);
});

test('contract: record types are the definitions then the events', () => {
  assert.deepEqual(M.RECORD_TYPES, [...DEFINITIONS, ...EVENTS]);
});

test('contract: sync metadata — stamp and tombstone', () => {
  const s = M.stamp({ id: 'task_x', type: 'task' }, { now: T(`${D}T10:00:00`), device: 'dev1' });
  assert.equal(s.updatedAt, T(`${D}T10:00:00`));
  assert.equal(s.origin, 'dev1');
  const t = M.tombstone({ id: 'task_x', type: 'task' }, { now: T(`${D}T10:00:00`), device: 'dev1' });
  assert.equal(t.deletedAt, T(`${D}T10:00:00`));
  assert.match(M.newId('done', T(`${D}T10:00:00`)), /^done_/);
});

/** One of every event, written through the real constructors. */
function everyEvent() {
  const g = game();
  const t = g.task({ title: 'Mail', skill: 'sk_mail', estimate: 30, mana: 2 });
  const energy = g.energy(`${D}T06:30:00`, 8, 8);
  const moment = g.moment('kind_drive', `${D}T07:30:00`, `${D}T08:00:00`);
  const done = g.done(t, `${D}T09:00:00`, 30);
  const rework = g.rework(done, `${D}T12:00:00`, 10);
  const purchase = g.buy(g.reward({ title: 'Cake', price: 10 }), `${D}T13:00:00`);
  const review = g.add(M.makeReview(g.db(), { satisfaction: 7, at: T(`${D}T20:00:00`) }));
  return { g, t, events: { energy, moment, done, rework, purchase, review } };
}

test('contract: event records carry id, type, day and their fields', () => {
  const { events } = everyEvent();
  for (const [type, r] of Object.entries(events)) {
    assert.equal(r.type, type);
    assert.ok(r.id.startsWith(`${type}_`), `${type} id`);
    assert.equal(r.day, D, `${type}.day`);
  }
  const { done, rework, purchase, moment, energy, review } = events;
  for (const f of ['task', 'start', 'end', 'minutes', 'quality']) assert.ok(f in done, `done.${f}`);
  for (const f of ['base', 'points', 'bonuses', 'multiplier', 'energy']) assert.ok(f in done.price, `done.price.${f}`);
  assert.deepEqual(Object.keys(done.price.bonuses).sort(), ['batch', 'combo', 'flow', 'pb', 'underdog']);
  for (const f of ['done', 'minutes', 'multiplier', 'penalty', 'charged']) assert.ok(f in rework, `rework.${f}`);
  for (const f of ['reward', 'price', 'charged']) assert.ok(f in purchase, `purchase.${f}`);
  for (const f of ['kind', 'place', 'start', 'end', 'who']) assert.ok(f in moment, `moment.${f}`);
  for (const f of ['stamina', 'mana', 'at']) assert.ok(f in energy, `energy.${f}`);
  for (const f of ['week', 'satisfaction', 'ratings', 'win', 'lesson', 'next']) assert.ok(f in review, `review.${f}`);
});

test('contract: events are write-once — later records never rewrite a stored event', () => {
  const { g, t, events } = everyEvent();
  const snapshot = JSON.stringify(events);
  g.done(t, `${D}T14:00:00`, 10); // more history
  g.records.push({ ...t, estimate: 5, updatedAt: T(`${D}T15:00:00`) }); // definition edited (last write wins)
  M.play(g.records, T(`${D}T21:00:00`));
  M.replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  assert.equal(JSON.stringify(events), snapshot, 'constructors and readers leave event records untouched');
});

test('contract: play() top-level keys', () => {
  const { g } = everyEvent();
  const p = M.play(g.records, T(`${D}T21:00:00`));
  for (const k of ['now', 'day', 'week', 'settings', 'player', 'balance', 'energy', 'stats', 'skills', 'tasks', 'rewards',
    'next', 'combo', 'batch', 'today', 'history', 'purchases', 'satisfaction', 'achievements', 'underdogs', 'places', 'kinds', 'moments']) {
    assert.ok(k in p, `play().${k}`);
  }
  for (const k of ['level', 'xp', 'toNext']) assert.equal(typeof p.player[k], 'number', `player.${k}`);
  for (const k of ['stamina', 'mana', 'rated', 'empty']) assert.ok(k in p.energy, `energy.${k}`);
  for (const k of ['points', 'done', 'minutes']) assert.equal(typeof p.today[k], 'number', `today.${k}`);
  assert.equal(typeof p.balance, 'number');
});

test('contract: pickNext() → {next, alternatives, queued, exhausted, empty}', () => {
  const { g } = everyEvent();
  const n = M.pickNext(g.db(), T(`${D}T21:00:00`));
  assert.deepEqual(Object.keys(n).sort(), ['alternatives', 'empty', 'exhausted', 'next', 'queued']);
  assert.ok(Array.isArray(n.alternatives) && Array.isArray(n.queued) && Array.isArray(n.empty));
  assert.equal(typeof n.exhausted, 'boolean');
  for (const k of ['task', 'title', 'why', 'batch', 'cost']) assert.ok(k in n.next, `next.${k}`);
  assert.deepEqual(Object.keys(n.next.cost).sort(), ['mana', 'stamina']);
});

test('contract: replayDay() → {beats, series, finale, hero, …}; beat kinds and each event beat’s after', () => {
  const { g } = everyEvent();
  const r = M.replayDay(g.records, D, { now: T(`${D}T21:00:00`) });
  for (const k of ['day', 'beats', 'series', 'finale', 'hero']) assert.ok(k in r, `replayDay().${k}`);
  assert.equal(r.day, D);
  const kinds = new Set(r.beats.map((b) => b.kind));
  for (const k of kinds) assert.ok(['done', 'moment', 'rework', 'purchase', 'walk', 'idle'].includes(k), `beat kind ${k}`);
  for (const k of ['done', 'moment', 'rework', 'purchase', 'walk', 'idle']) assert.ok(kinds.has(k), `a ${k} beat`);
  for (const b of r.beats) {
    assert.equal(typeof b.start, 'number');
    assert.equal(typeof b.end, 'number');
    if (['done', 'moment', 'rework', 'purchase'].includes(b.kind)) {
      assert.deepEqual(Object.keys(b.after).sort(), ['mana', 'points', 'stamina'], `${b.kind}.after`);
      assert.equal(typeof b.place, 'string');
    }
    if (b.kind === 'walk') { assert.equal(typeof b.from, 'string'); assert.equal(typeof b.to, 'string'); }
  }
  for (const p of r.series) for (const k of ['at', 'stamina', 'mana']) assert.equal(typeof p[k], 'number', `series.${k}`);
  for (const k of ['points', 'spent', 'tasks', 'moments', 'reworks', 'zones', 'tomorrow', 'balance', 'level']) assert.ok(k in r.finale, `finale.${k}`);
});

// ─── Inventory (phase 1.5) — SPEC.md "Inventory (phase 1.5) › Contract" ───────
// NOTE for the implementation commit: the contract adds record types (item, loadout, wish; skip, spend)
// and price.bonuses.gear, so the older 'record types' and 'event records' assertions above must be
// updated in the same commit.

// Arity = Function.length, read literally from the contract signatures (no default on the options object).
// Decided: inventory(records, now = Date.now()) has a default like play(), so arity 1.
const INVENTORY_FUNCTIONS = {
  makeItem: 2, findItems: 2, makeSkip: 2, makeSpend: 2, makeWish: 2, shoppingList: 1,
  makeLoadout: 2, activeLoadout: 1, gearBonus: 3, inventory: 1, restockFor: 2,
};
const INVENTORY_CONSTANTS = {
  SKIP_POINTS_PER_DOLLAR: 1, SKIP_DAILY_CAP: 100, GEAR_STEP_USES: 10, GEAR_STEP: 0.01, GEAR_MAX: 0.10,
  SLOTS: ['head', 'body', 'feet', 'hands', 'bag', 'tech', 'vehicle'],
};

test('contract (inventory): new functions are exported with their arity', () => {
  for (const [name, arity] of Object.entries(INVENTORY_FUNCTIONS)) {
    assert.equal(typeof M[name], 'function', name);
    assert.equal(M[name].length, arity, `${name}.length`);
  }
});

test('contract (inventory): new constants are exported with their value', () => {
  for (const [name, value] of Object.entries(INVENTORY_CONSTANTS)) assert.deepEqual(M[name], value, name);
});

test('contract (inventory): record types — item, loadout, wish are definitions; skip, spend are events', () => {
  for (const t of ['item', 'loadout', 'wish', 'skip', 'spend']) assert.ok(M.RECORD_TYPES.includes(t), t);
  const firstEvent = M.RECORD_TYPES.indexOf('done');
  for (const t of ['item', 'loadout', 'wish']) assert.ok(M.RECORD_TYPES.indexOf(t) < firstEvent, `${t} is a definition`);
  for (const t of ['skip', 'spend']) assert.ok(M.RECORD_TYPES.indexOf(t) > firstEvent, `${t} is an event`);
});

test('contract (inventory): done carries gear and price.bonuses.gear; skip/spend carry id, type, day', () => {
  const g = game();
  const t = g.task({ title: 'Run', skill: 'sk_run', estimate: 30 });
  const done = g.done(t, `${D}T09:00:00`, 30);
  assert.ok(Array.isArray(done.gear), 'done.gear');
  assert.equal(typeof done.price.bonuses.gear, 'number', 'done.price.bonuses.gear');
  const skip = g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 20, at: T(`${D}T10:00:00`) }));
  const spend = g.add(M.makeSpend(g.db(), { name: 'Lamp', price: 20, at: T(`${D}T11:00:00`) }));
  for (const [type, r] of Object.entries({ skip, spend })) {
    assert.equal(r.type, type);
    assert.ok(r.id.startsWith(`${type}_`), `${type} id`);
    assert.equal(r.day, D, `${type}.day`);
    assert.equal(r.price, 20, `${type}.price`);
  }
  assert.equal(typeof skip.points, 'number');
  const inv = M.inventory(g.records, T(`${D}T21:00:00`));
  for (const k of ['items', 'stashes', 'loadouts', 'active', 'inUse', 'lowStock', 'moneySaved', 'savedThisMonth', 'spentThisMonth', 'skipsToday']) {
    assert.ok(k in inv, `inventory().${k}`);
  }
  assert.ok(inv.inUse instanceof Set);
  const gb = M.gearBonus(g.db(), t, T(`${D}T21:00:00`));
  assert.ok(gb === null || ['item', 'uses', 'bonus'].every((k) => k in gb), 'gearBonus → { item, uses, bonus }');
});
