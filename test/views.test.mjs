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

// ─── difficulty (SPEC.md › Difficulty › Contract: the app) ──────────────────
import * as M from '../src/model.js';
import * as rules from '../src/views/rules.js';
import * as now from '../src/views/now.js';
import { game, T } from './helpers.mjs';

const MON = '2026-09-28';
/** Run gets 1500 XP: the player is level 3, Run level 6, Mail and Read level 1. */
function levelled() {
  const g = game();
  g.task({ id: 'task_run', title: 'Run', skill: 'sk_run', estimate: 30 });
  g.seed('task_run', '2026-09-20', 1500);
  return g;
}
const ctxOf = (g, at = `${MON}T12:00:00`) => ({ db: g.db(), g: play(g.records, T(at)), now: T(at), ui: {} });
/** The HTML of one tier card, by its data-tier. */
const card = (html, id) => {
  const m = new RegExp(`<label class="(tier-card[^"]*)"[^>]*data-tier="${id}"[^>]*>([\\s\\S]*?)</label>`).exec(html);
  assert.ok(m, `a card for ${id}`);
  return { cls: m[1].split(/\s+/), body: m[2] };
};

test('Review: five tier cards in a row, easiest first, each with its points × and a one-line summary', () => {
  const html = review.render(ctxOf(game()));
  const order = [...html.matchAll(/class="tier-card[^"]*"[^>]*data-tier="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['steady', 'push', 'grind', 'relentless', 'legend']);
  assert.match(html, /class="tier-row"/);
  for (const t of M.DIFFICULTY) {
    const c = card(html, t.id);
    assert.match(c.body, new RegExp(`>${t.name}<`));
    assert.match(c.body, new RegExp(`×${String(t.points).replace('.', '\\.')}\\b`));
    const summary = /class="tier-summary"[^>]*>([^<]*)</.exec(c.body);
    assert.ok(summary, `${t.id} has a summary`);
    assert.match(summary[1], new RegExp(`${Math.round(t.targetStep * 100)}%`), 'harder targets');
    assert.match(summary[1], /points|pts/i, 'bigger rewards');
    assert.match(summary[1], /rework/i, 'less forgiveness');
  }
});

test('Review: locked tiers are greyed out with their level, the current tier is highlighted', () => {
  const html = review.render(ctxOf(game()));
  for (const [id, lv] of [['grind', 3], ['relentless', 6], ['legend', 10]]) {
    const c = card(html, id);
    assert.ok(c.cls.includes('locked'), `${id} locked`);
    assert.match(c.body, new RegExp(`Unlocks at level ${lv}`));
    assert.match(c.body, /<input[^>]*type="radio"[^>]*disabled/);
  }
  for (const id of ['steady', 'push']) assert.ok(!card(html, id).cls.includes('locked'), `${id} open`);
  const push = card(html, 'push');
  assert.ok(push.cls.includes('current'), 'Push is current');
  assert.ok(push.cls.includes('chosen'), 'and chosen by default');
  assert.match(push.body, /<input[^>]*name="difficulty"[^>]*value="push"[^>]*checked/);
  assert.ok(!card(html, 'steady').cls.includes('current'));
});

test('Review: a level-3 player on Grind sees Grind current and Relentless still locked', () => {
  const g = levelled();
  g.add(M.makeReview(g.db(), { satisfaction: 7, at: T('2026-09-27T20:00:00'), difficulty: { tier: 'grind' } }));
  const html = review.render(ctxOf(g));
  assert.ok(card(html, 'grind').cls.includes('current'));
  assert.ok(!card(html, 'grind').cls.includes('locked'));
  assert.ok(card(html, 'relentless').cls.includes('locked'));
  assert.match(html, /LV 3/);
});

test('Review: a per-skill select for each skill, "Same as global" plus the tiers its level allows', () => {
  const g = levelled();
  g.add(M.makeReview(g.db(), { satisfaction: 7, at: T('2026-09-27T20:00:00'), difficulty: { tier: 'push', skills: { sk_mail: 'steady' } } }));
  const html = review.render(ctxOf(g));
  const select = (id) => {
    const m = new RegExp(`<select[^>]*name="skill_${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html);
    assert.ok(m, `a select for ${id}`);
    return [...m[1].matchAll(/<option value="([a-z]*)"([^>]*)>([^<]*)</g)].map((o) => ({ value: o[1], selected: /selected/.test(o[2]), label: o[3] }));
  };
  const run = select('sk_run');
  assert.deepEqual(run.map((o) => o.value), ['', 'steady', 'push', 'grind', 'relentless']);
  assert.equal(run[0].label, 'Same as global');
  assert.ok(run[0].selected);
  const read = select('sk_read');
  assert.deepEqual(read.map((o) => o.value), ['', 'steady', 'push']);
  const mail = select('sk_mail');
  assert.equal(mail.find((o) => o.selected).value, 'steady', 'the current override is selected');
  // Each skill row shows its level.
  assert.match(html, /Run[\s\S]*?LV 6/);
});

test('Review: saving passes difficulty to makeReview, and a locked tier is refused', async () => {
  const g = levelled();
  const ctx = ctxOf(g, '2026-09-27T20:00:00');
  const saved = [];
  ctx.store = { add: async (r) => { saved.push(r); } };
  ctx.toast = () => {};
  const form = { elements: {} };
  const base = { satisfaction: '7', win: '', lesson: '', next: '' };
  await review.forms.review({ ...base, difficulty: 'grind', skill_sk_run: 'relentless', skill_sk_mail: 'steady', skill_sk_read: '' }, form, ctx);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].difficulty, { tier: 'grind', skills: { sk_run: 'relentless', sk_mail: 'steady' } });
  await assert.rejects(review.forms.review({ ...base, difficulty: 'legend' }, form, ctx), /Legend unlocks at level 10/);
  await assert.rejects(review.forms.review({ ...base, difficulty: 'push', skill_sk_read: 'grind' }, form, ctx), /Grind unlocks at level 3/);
});

test('Rules: the current tier and the tiers table', () => {
  const g = levelled();
  g.add(M.makeReview(g.db(), { satisfaction: 7, at: T('2026-09-27T20:00:00'), difficulty: { tier: 'grind' } }));
  const html = rules.render(ctxOf(g));
  assert.match(html, /id="difficulty"/);
  assert.match(html, /You play at <b>Grind<\/b>/);
  const rows = [...html.matchAll(/<tr[^>]*data-tier="([a-z]+)"([^>]*)>([\s\S]*?)<\/tr>/g)];
  assert.deepEqual(rows.map((r) => r[1]), ['steady', 'push', 'grind', 'relentless', 'legend']);
  assert.match(rows[2][2], /current/);
  assert.match(rows[4][3], /<td[^>]*>10<\/td>/);
  assert.match(rows[4][3], /15%/);
  // Without a player (the rules page before any data) it still renders, at Push.
  assert.match(rules.render({ g: play([], T(`${MON}T12:00:00`)) }), /You play at <b>Push<\/b>/);
});

test('Now: a small tier badge next to the player level', () => {
  const g = levelled();
  g.add(M.makeReview(g.db(), { satisfaction: 7, at: T('2026-09-27T20:00:00'), difficulty: { tier: 'grind' } }));
  const html = now.render(ctxOf(g));
  assert.match(html, /id="hud-level"/);
  assert.match(html, /<span class="sc-badge tier-badge"[^>]*id="hud-tier"[^>]*>Grind<\/span>/);
});

// The shop previews a purchase at the global tier's debt multiplier, not a fixed ×2.
import * as shop from '../src/views/shop.js';
test('Shop: the debt preview and wording follow the tier (Steady ×1.5)', () => {
  const g = game();
  g.add(M.makeReview(g.db(), { satisfaction: 7, at: T('2026-09-27T20:00:00'), difficulty: { tier: 'steady' } }));
  g.reward({ id: 'reward_cake', title: 'Cake', price: 100 });
  const html = shop.render(ctxOf(g));
  assert.match(html, /costs 150/, 'balance 0, price 100, below zero ×1.5');
  assert.match(html, /×1\.5/);
  assert.doesNotMatch(html, /costs double/);
});
test('Shop: at Push the wording still says double', () => {
  const g = game();
  g.reward({ id: 'reward_cake', title: 'Cake', price: 100 });
  const html = shop.render(ctxOf(g));
  assert.match(html, /costs 200/);
  assert.match(html, /double/);
});
