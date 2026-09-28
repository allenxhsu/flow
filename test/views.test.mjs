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

// ─── the handheld look (SPEC.md › The app's screens match the game) ────────
import { readFileSync } from 'node:fs';
import { VIEWS } from '../src/views/index.js';
import { statusStrip, textBox, pixelIcon } from '../src/ds.js';
import * as bag from '../src/views/bag.js';

test('Views: every screen of the SPEC, Bag among them, each with a label, an original pixel icon and a renderer', () => {
  assert.deepEqual(VIEWS.map((v) => v.id), ['now', 'tasks', 'skills', 'bag', 'shop', 'review', 'replay', 'settings', 'rules']);
  for (const v of VIEWS) {
    assert.equal(typeof v.label, 'string');
    assert.equal(typeof v.mod.render, 'function', `${v.id} renders`);
    const icon = pixelIcon(v.id);
    assert.match(icon, /^<svg[^>]*class="px-icon"/, `${v.id} has a pixel icon`);
    assert.match(icon, /shape-rendering="crispEdges"/);
    assert.match(icon, /aria-hidden="true"/);
  }
  assert.equal(VIEWS.find((v) => v.id === 'bag').label, 'Bag');
});

test('Status strip: hearts = stamina (one heart per 2), magic bar = mana, gem counter = points, level', () => {
  const g0 = game();
  g0.energy(`${MON}T07:00:00`, 7, 5.5);
  const html = statusStrip(play(g0.records, T(`${MON}T12:00:00`)));
  assert.match(html, /class="ds-strip"/);
  const hearts = [...html.matchAll(/class="heart (full|half|empty)"/g)].map((m) => m[1]);
  assert.deepEqual(hearts, ['full', 'full', 'full', 'half', 'empty']);
  assert.match(html, /aria-label="Stamina 7 of 10"/);
  assert.match(html, /<[^>]*class="magic"[^>]*role="meter"[^>]*aria-label="Mana"[^>]*aria-valuenow="5.5"/);
  assert.match(html, /id="strip-gem"[^>]*>0</);
  assert.match(html, /id="strip-level"[^>]*>LV 1</);
  // Before the morning rating the hearts are empty and say so.
  const fresh = statusStrip(play([], T(`${MON}T12:00:00`)));
  assert.match(fresh, /aria-label="Stamina not rated yet"/);
});

test('Text box: a framed box with a speaker tab, for toasts and confirmations', () => {
  const html = textBox({ speaker: 'Flow', body: '<p>Saved.</p>', tone: 'success' });
  assert.match(html, /^<div class="textbox textbox--success"/);
  assert.match(html, /<span class="textbox-speaker">Flow<\/span>/);
  assert.match(html, /<p>Saved\.<\/p>/);
  assert.match(textBox({ speaker: '<b>', body: '' }), /&lt;b&gt;/, 'the speaker is escaped');
});

test('The pixel font is drawn from the page\'s own CSS: generated, embedded, no external origin', async () => {
  const { fontFaceCss, buildFont } = await import('../tools/pixel-font.mjs');
  const css = readFileSync(new URL('../src/pixel-font.css', import.meta.url), 'utf8');
  assert.equal(css, fontFaceCss(), 'src/pixel-font.css is what tools/pixel-font.mjs generates');
  assert.match(css, /@font-face\s*{[^}]*font-family: 'Flow Pixel'[^}]*src: url\(data:font\/ttf;base64,/);
  const ttf = buildFont();
  const tables = new Set();
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) tables.add(String.fromCharCode(...ttf.slice(12 + i * 16, 16 + i * 16)));
  for (const t of ['cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post', 'OS/2']) assert.ok(tables.has(t), `has ${t}`);
  for (const file of ['../index.html', '../src/styles.css', '../src/pixel-font.css']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}\//i, `${file} loads nothing from another origin`);
  }
});

// ─── Bag (SPEC.md › Inventory; the Bag screen) ──────────────────────────────

/** Running shoes in an active Gym bag, worn for 12 runs; a cable at the desk; beans running low. */
function stocked() {
  const g = game();
  const run = g.task({ id: 'task_run', title: 'Run', skill: 'sk_run', estimate: 30 });
  const shoes = g.add(M.makeItem(g.db(), { name: 'Running shoes', category: 'Shoes', skills: ['sk_run'], slot: 'feet', place: 'place_gym', price: 120 }));
  const hdmi = g.add(M.makeItem(g.db(), { name: 'HDMI cable', category: 'Cables', aliases: ['display lead'], place: 'place_desk', qty: 2, price: 15 }));
  const laptop = g.add(M.makeItem(g.db(), { name: 'Laptop', category: 'Tech', slot: 'tech', place: 'place_desk', price: 900 }));
  const beans = g.add(M.makeItem(g.db(), { name: 'Coffee beans', category: 'Food', place: 'place_kitchen', consumable: true, lowStock: 1, usual: 3, qty: 1, price: 14 }));
  const gymBag = g.add({ ...M.makeLoadout(g.db(), { name: 'Gym bag', slots: { feet: shoes.id }, active: true, checklist: ['Towel', 'Water bottle'] }), updatedAt: 2 });
  const work = g.add({ ...M.makeLoadout(g.db(), { name: 'Work bag', slots: { tech: laptop.id } }), updatedAt: 1 });
  for (let i = 0; i < 12; i++) {
    const day = M.addDays('2026-08-01', i);
    g.add({ id: `done_gear_${i}`, type: 'done', task: run.id, day, start: T(`${day}T07:00:00`), end: T(`${day}T07:30:00`),
      minutes: 30, measure: 'time', value: 30, quality: 1, gear: [shoes.id], price: { points: 30, base: 30, energy: {} } });
  }
  return { g, run, shoes, hdmi, laptop, beans, gymBag, work };
}
const bagCtx = (g, ui = {}, at = `${MON}T12:00:00`) => {
  const saved = [];
  const toasts = [];
  const ctx = { db: g.db(), g: play(g.records, T(at)), now: T(at), ui, saved, toasts,
    store: { add: async (r) => { saved.push(...[r].flat()); }, save: async (r) => { saved.push(...[r].flat()); }, getRecord: (id) => g.db().item.get(id) || g.db().loadouts.find((l) => l.id === id) },
    toast: (text) => toasts.push(text), confirm: async () => true, render: () => {} };
  return ctx;
};

test('Bag: the paper doll shows the active loadout slot by slot, empty slots included', () => {
  const { g, shoes } = stocked();
  const html = bag.render(bagCtx(g));
  const slots = [...html.matchAll(/data-slot="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(slots, M.SLOTS, 'the eight slots, in order');
  const feet = new RegExp(`data-slot="feet"[^>]*data-item="${shoes.id}"[^>]*>[\\s\\S]*?Running shoes`).exec(html);
  assert.ok(feet, 'the shoes are on the feet');
  assert.match(html, /data-slot="head"[^>]*>[\s\S]*?(empty|—)/, 'an empty slot says so');
  assert.match(html, /id="doll"[\s\S]*?Gym bag/, 'named after the loadout shown');
});

test('Bag: loadouts listed with the active one marked, an Equip button on the others, the packing checklist, and the gear bonus', () => {
  const { g, gymBag, work } = stocked();
  const html = bag.render(bagCtx(g));
  const tab = (id) => new RegExp(`<button[^>]*data-loadout="${id}"[^>]*>`).exec(html)?.[0];
  assert.ok(tab(gymBag.id) && tab(work.id), 'a tab per loadout');
  assert.match(tab(gymBag.id), /aria-pressed="true"/, 'the active one is shown first');
  assert.match(html, /Gym bag[\s\S]{0,200}(active|equipped)/i);
  assert.match(html, /Towel[\s\S]*Water bottle/, 'its checklist');
  assert.match(html, /id="gear-bonus"[\s\S]*?Running shoes \+1% · 12 uses/, '+1% per 10 uses while equipped');
  // Showing another loadout offers to equip it.
  const other = bag.render(bagCtx(g, { loadout: work.id }));
  assert.match(other, new RegExp(`data-action="equip"[^>]*data-loadout="${work.id}"`));
  assert.match(other, /data-slot="tech"[^>]*>[\s\S]*?Laptop/);
});

test('Bag: Equip makes one loadout active and the others not', async () => {
  const { g, gymBag, work } = stocked();
  const ctx = bagCtx(g);
  await bag.actions.equip({ dataset: { loadout: work.id } }, ctx);
  const byId = Object.fromEntries(ctx.saved.map((r) => [r.id, r]));
  assert.equal(byId[work.id].active, true);
  assert.equal(byId[gymBag.id].active, false);
});

test('Bag: a stash per storage place, each item a cell with a tooltip; equipped items stay in their stash', () => {
  const { g, shoes, hdmi, beans } = stocked();
  const html = bag.render(bagCtx(g));
  const places = [...html.matchAll(/<section[^>]*class="stash[^"]*"[^>]*data-place="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(places.sort(), ['place_desk', 'place_gym', 'place_kitchen']);
  assert.match(html, /data-place="place_desk"[\s\S]*?Desk/);
  const cell = (id) => new RegExp(`<button[^>]*class="cell[^"]*"[^>]*data-item="${id}"[^>]*>`).exec(html)?.[0];
  assert.ok(cell(hdmi.id), 'a cell for the cable');
  assert.match(cell(hdmi.id), /title="HDMI cable ×2 · Desk · Skip buying \+15 pts"/);
  assert.match(cell(shoes.id), /in-use/, 'the equipped shoes are marked in use');
  assert.match(cell(shoes.id), /Skip buying \+100 pts/, 'a skip pays at most the daily cap');
  assert.match(cell(beans.id), /\blow\b/, 'low stock is flagged');
});

test('Bag: "have it" lookup — what you own that matches, where, and a skip button', async () => {
  const { g, hdmi } = stocked();
  const ctx = bagCtx(g);
  await bag.forms.have({ query: 'display lead', price: '15' }, null, ctx);
  assert.deepEqual(ctx.ui.have, { query: 'display lead', price: 15 });
  const html = bag.render(ctx);
  assert.match(html, /id="have-result"[\s\S]*You own 2: Desk/);
  assert.match(html, new RegExp(`data-action="skip"[^>]*data-item="${hdmi.id}"[^>]*>[^<]*\\+15`), 'skip on the match, with its points');
  assert.match(html, /data-action="spend"/, 'buying anyway is allowed');
  // Nothing owned: no skip, buying is fine.
  const none = bagCtx(g, { have: { query: 'ski wax', price: 20 } });
  const miss = bag.render(none);
  assert.match(miss, /You own nothing like/);
  assert.doesNotMatch(miss, /data-action="skip"/);
  assert.match(miss, /data-action="spend"/);
});

test('Bag: the skip button writes a skip record (1 pt per dollar, no XP) and says so', async () => {
  const { g, hdmi } = stocked();
  const ctx = bagCtx(g, { have: { query: 'display lead', price: 15 } });
  await bag.actions.skip({ dataset: { item: hdmi.id } }, ctx);
  assert.equal(ctx.saved.length, 1);
  const s = ctx.saved[0];
  assert.equal(s.type, 'skip');
  assert.equal(s.item, hdmi.id);
  assert.equal(s.price, 15);
  assert.equal(s.points, 15);
  assert.equal(s.at, ctx.now);
  assert.equal(ctx.ui.have, null, 'the lookup is done');
  assert.match(ctx.toasts.join(' '), /\+15/);
});

test('Bag: buy anyway records the spend and restocks the owned item (no penalty)', async () => {
  const { g, hdmi } = stocked();
  const ctx = bagCtx(g, { have: { query: 'HDMI cable', price: 12 } });
  await bag.actions.spend({ dataset: { item: hdmi.id } }, ctx);
  const spend = ctx.saved.find((r) => r.type === 'spend');
  assert.ok(spend);
  assert.equal(spend.price, 12);
  assert.equal(spend.item, hdmi.id);
  const stock = ctx.saved.find((r) => r.type === 'item');
  assert.equal(stock.id, hdmi.id);
  assert.equal(stock.qty, 3);
  // Something new becomes a new item.
  const ctx2 = bagCtx(g, { have: { query: 'Ski wax', price: 20 } });
  await bag.actions.spend({ dataset: {} }, ctx2);
  const fresh = ctx2.saved.find((r) => r.type === 'item');
  assert.equal(fresh.name, 'Ski wax');
  assert.equal(ctx2.saved.find((r) => r.type === 'spend').item, fresh.id);
});

test('Bag: money saved vs spent this month, and skip points today against the cap', () => {
  const { g } = stocked();
  g.add(M.makeSkip(g.db(), { query: 'Lamp', price: 15, at: T(`${MON}T09:00:00`) }));
  g.add(M.makeSpend(g.db(), { name: 'Tape', price: 30, at: T(`${MON}T10:00:00`) }));
  g.add(M.makeSpend(g.db(), { name: 'Old', price: 99, at: T('2026-08-10T10:00:00') }));
  const html = bag.render(bagCtx(g));
  assert.match(html, /id="money"[\s\S]*saved \$15[\s\S]*spent \$30/);
  assert.match(html, /15\/100/);
});

test('Bag: the shopping list flags what you already own, and low stock asks for the usual amount', () => {
  const { g } = stocked();
  g.add(M.makeWish(g.db(), { name: 'HDMI cable' }));
  const html = bag.render(bagCtx(g));
  assert.match(html, /id="shopping"[\s\S]*HDMI cable[\s\S]*you own/i);
  assert.match(html, /Coffee beans ×2/, 'have 1, usual 3 → buy 2');
});

test('Bag: an empty bag renders, with the quick add form', () => {
  const html = bag.render(bagCtx(game()));
  assert.match(html, /data-form="item"/);
  assert.match(html, /data-form="have"/);
  assert.match(html, /No loadouts yet|no loadout/i);
});

test('Bag: quick add writes an item at a place', async () => {
  const { g } = stocked();
  const ctx = bagCtx(g);
  await bag.forms.item({ name: 'Tape', category: 'Tools', place: 'place_warehouse', qty: '2', price: '4', slot: '' }, null, ctx);
  const it = ctx.saved[0];
  assert.equal(it.type, 'item');
  assert.equal(it.name, 'Tape');
  assert.equal(it.place, 'place_warehouse');
  assert.equal(it.qty, 2);
  assert.equal(it.price, 4);
});
