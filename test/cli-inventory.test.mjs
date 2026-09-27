// The inventory from the CLI (SPEC.md › Inventory), end to end, in a throwaway
// FLOW_HOME with the clock fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../cli/flow.mjs', import.meta.url).pathname;

function player() {
  const home = mkdtempSync(join(tmpdir(), 'flow-cli-inv-'));
  const env = { ...process.env, FLOW_HOME: home, TZ: 'UTC', FLOW_NOW: '2026-09-28T18:00:00Z' };
  delete env.FLOW_OFFLINE;
  const run = (...args) => execFileSync('node', [CLI, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  const fails = (...args) => {
    try { run(...args); } catch (err) { return err.stderr; }
    assert.fail(`expected failure: ${args.join(' ')}`);
  };
  const json = (...args) => JSON.parse(run(...args));
  run('init', '--name', 'Allen');
  return { home, run, fails, json, done: () => rmSync(home, { recursive: true, force: true }) };
}

test('items: add, search before buying, edit, list', () => {
  const p = player();
  const { run, fails, json } = p;
  try {
    assert.match(run('item', 'add', '--name', 'HDMI cable', '--category', 'Cables', '--alias', 'display lead', '--place', 'desk', '--price', '15'),
      /Added HDMI cable ×1 at Desk .*\[item_/);
    run('item', 'add', '--name', 'HDMI cable', '--category', 'Cables', '--place', 'car', '--price', '15');
    run('item', 'add', '--name', 'Drill', '--category', 'Tools', '--place', 'warehouse');

    const have = run('have', 'hdmi');
    assert.match(have, /^You own 2: Desk, Car/);
    assert.match(have, /HDMI cable ×1 · Desk/);
    assert.match(run('have', 'display lead'), /You own 1: Desk/);
    assert.match(run('have', 'tools'), /You own 1: Warehouse[\s\S]*Drill/);
    assert.match(run('have', 'banana'), /You own nothing like "banana"/);
    const hits = json('have', 'hdmi', '--json');
    assert.equal(hits.length, 2);
    assert.ok(hits.every((h) => h.item.name === 'HDMI cable' && typeof h.score === 'number'));

    assert.match(run('item', 'edit', 'drill', '--qty', '2', '--alias', 'power drill', '--skill', 'none'), /Updated Drill ×2 at Warehouse/);
    assert.match(run('have', 'power drill'), /You own 2: Warehouse/);
    assert.match(fails('item', 'add', '--name', 'Keys', '--slot', 'pocket'), /slot/);
    assert.match(fails('item', 'edit', 'hdmi', '--qty', '3'), /matches 2 items/);

    const list = run('item', 'list');
    assert.match(list, /## Desk[\s\S]*HDMI cable/);
    assert.match(list, /## Warehouse[\s\S]*Drill ×2/);
    assert.equal(json('item', 'list', '--json').length, 3);
  } finally { p.done(); }
});

test('skip: points per dollar avoided, capped at 100 a day, no XP; undo takes it back', () => {
  const p = player();
  const { run, json } = p;
  try {
    assert.match(run('skip', 'HDMI cable', '--price', '60', '--at', '09:00'), /Skipped HDMI cable: \+60 pts, \$60 saved\. Balance 0 → 60/);
    const capped = run('skip', 'Rug', '--price', '70', '--at', '10:00');
    assert.match(capped, /\+40 pts \(daily skip cap 100\)/);
    assert.match(capped, /\$70 saved/);
    assert.match(run('skip', 'Tape', '--price', '12.49', '--at', '11:00'), /\+0 pts .*\$12\.49 saved/);
    const s = json('status', '--json');
    assert.equal(s.balance, 100);
    assert.equal(s.player.xp, 0, 'skipping pays points, never XP');
    assert.match(run('log', '--days', '1'), /skipped Rug \$70 · \+40 pts/);
    assert.match(run('undo', 'last'), /Undid skip: Tape/);
    assert.equal(json('inventory', '--json').moneySaved, 130);
  } finally { p.done(); }
});

test('purchase: real money — a new item, or a restock of one you own; no penalty; buy <reward> still spends points', () => {
  const p = player();
  const { run, json, fails } = p;
  try {
    run('item', 'add', '--name', 'AA batteries', '--category', 'Supplies', '--consumable', '--qty', '1', '--low', '1', '--usual', '4', '--place', 'kitchen');
    assert.match(run('purchase', 'Label maker', '--price', '35', '--place', 'desk', '--at', '10:00'), /Bought Label maker ×1 for \$35 — no penalty\. New item: Label maker ×1 at Desk/);
    assert.match(run('purchase', 'AA batteries', '--price', '8', '--qty', '2', '--at', '11:00'), /Restocked AA batteries: 1 → 3/);
    assert.match(run('buy', 'Mug', '--price', '6', '--at', '12:00'), /Bought Mug ×1 for \$6/, 'buy with --price is a real-money purchase');
    assert.equal(json('status', '--json').balance, 0, 'no penalty');
    assert.match(run('have', 'label'), /You own 1: Desk/);
    assert.match(run('log', '--days', '1'), /bought Label maker ×1 \$35/);
    const inv = json('inventory', '--json');
    assert.equal(inv.spentThisMonth, 49);
    assert.match(run('undo', 'last'), /Undid spend: Mug/);
    assert.match(run('have', 'mug'), /You own 0|You own nothing like "mug"/);

    run('reward', 'add', '--title', 'Ice cream', '--price', '10');
    run('skip', 'Rug', '--price', '30', '--at', '17:00');
    assert.match(run('buy', 'ice'), /Ice cream: −10 pts/);
    assert.match(fails('purchase', 'Thing'), /--price/);
  } finally { p.done(); }
});

test('shopping list: wishes flagged when you already own a match, and low stock by itself', () => {
  const p = player();
  const { run, json } = p;
  try {
    run('item', 'add', '--name', 'HDMI cable', '--place', 'desk', '--price', '15');
    run('item', 'add', '--name', 'Coffee beans', '--category', 'Food', '--consumable', '--qty', '1', '--low', '1', '--usual', '4');
    assert.match(run('wish', 'add', 'hdmi'), /Added hdmi ×1 to the shopping list — you already own: HDMI cable ×1 \(Desk\)/);
    run('wish', 'add', 'Bananas', '--qty', '6');
    const list = run('wish', 'list');
    assert.match(list, /hdmi ×1 · you own: HDMI cable ×1 \(Desk\)/);
    assert.match(list, /Bananas ×6(?! · you own)/);
    assert.match(list, /Coffee beans ×3 · low stock \(have 1, usual 4\)/);
    const entries = json('wish', 'list', '--json');
    assert.equal(entries.length, 3);
    assert.equal(entries.find((e) => e.name === 'hdmi').matches.length, 1);
    // Buying what is wished for crosses it off.
    run('purchase', 'Bananas', '--price', '3', '--qty', '6');
    assert.doesNotMatch(run('wish', 'list'), /Bananas/);
    assert.match(run('wish', 'done', 'hdmi'), /Crossed off hdmi/);
    assert.doesNotMatch(run('wish', 'list'), /hdmi/);
  } finally { p.done(); }
});

test('loadouts: add, equip one, list; completions record the gear worn', () => {
  const p = player();
  const { run, json, fails } = p;
  try {
    run('skill', 'add', '--name', 'Running', '--stat', 'body', '--place', 'gym');
    run('task', 'add', '--title', 'Run 5k', '--skill', 'running', '--estimate', '30');
    run('item', 'add', '--name', 'Running shoes', '--category', 'Shoes', '--slot', 'feet', '--skill', 'running', '--place', 'bedroom');
    run('item', 'add', '--name', 'Laptop', '--slot', 'tech', '--place', 'desk');
    run('item', 'add', '--name', 'Jeans', '--slot', 'legs', '--color', '#2b4c8c');
    assert.match(run('loadout', 'add', '--name', 'Gym bag', '--feet', 'shoes', '--check', 'Towel, Water bottle'), /Added loadout Gym bag: feet Running shoes/);
    run('loadout', 'add', '--name', 'Work bag', '--tech', 'laptop', '--legs', 'jeans');
    assert.match(fails('loadout', 'add', '--name', 'X', '--feet', 'laptop-nope'), /no item matches/);
    assert.match(run('loadout', 'equip', 'gym'), /Equipped Gym bag: feet Running shoes[\s\S]*Pack: Towel, Water bottle/);
    const list = run('loadout', 'list');
    assert.match(list, /\* Gym bag \(active\) — feet Running shoes/);
    assert.match(list, /  Work bag — legs Jeans, tech Laptop/);
    run('loadout', 'equip', 'work');
    assert.match(run('loadout', 'list'), /\* Work bag \(active\)/);
    run('loadout', 'equip', 'gym');

    run('done', 'run', '--minutes', '30', '--at', '07:00');
    const s = json('status', '--json');
    const shoes = json('item', 'list', '--json').find((i) => i.name === 'Running shoes');
    assert.deepEqual(s.history[0].gear, [shoes.id]);
    assert.equal(s.history[0].price.bonuses.gear, 0, 'new gear starts at +0%');
  } finally { p.done(); }
});

test('inventory: the summary — money saved vs spent this month, in use, low stock, stashes', () => {
  const p = player();
  const { run, json } = p;
  try {
    run('item', 'add', '--name', 'Running shoes', '--slot', 'feet', '--place', 'bedroom');
    run('item', 'add', '--name', 'Coffee beans', '--consumable', '--qty', '1', '--low', '2', '--place', 'kitchen');
    run('loadout', 'add', '--name', 'Gym bag', '--feet', 'shoes', '--active');
    run('skip', 'Chair', '--price', '150', '--at', '09:00');
    run('purchase', 'Tape', '--price', '4', '--at', '10:00');
    const out = run('inventory');
    assert.match(out, /3 items/);
    assert.match(out, /This month: saved \$150 · spent \$4/);
    assert.match(out, /Skip points today: 100\/100/);
    assert.match(out, /Active loadout: Gym bag — feet Running shoes/);
    assert.match(out, /In use: Running shoes/);
    assert.match(out, /Low stock: Coffee beans \(have 1, buy 2\)/);
    assert.match(out, /## Kitchen[\s\S]*Coffee beans/);
    const inv = json('inventory', '--json');
    for (const k of ['items', 'stashes', 'loadouts', 'active', 'inUse', 'lowStock', 'moneySaved', 'savedThisMonth', 'spentThisMonth', 'skipsToday']) assert.ok(k in inv, k);
    assert.ok(Array.isArray(inv.inUse), 'the Set goes out as a list');
    assert.equal(inv.moneySaved, 150);
    assert.equal(inv.skipsToday.length, 1);
  } finally { p.done(); }
});
