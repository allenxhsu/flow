// The CLI end to end, in a throwaway FLOW_HOME with the clock fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = new URL('../cli/flow.mjs', import.meta.url).pathname;

function player() {
  const home = mkdtempSync(join(tmpdir(), 'flow-cli-'));
  const env = { ...process.env, FLOW_HOME: home, TZ: 'UTC', FLOW_NOW: '2026-09-28T18:00:00Z' };
  delete env.FLOW_OFFLINE;
  const run = (...args) => execFileSync('node', [CLI, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  const fails = (...args) => {
    try { run(...args); } catch (err) { return err.stderr; }
    assert.fail(`expected failure: ${args.join(' ')}`);
  };
  const json = () => JSON.parse(run('status', '--json'));
  return { home, run, fails, json, done: () => rmSync(home, { recursive: true, force: true }) };
}

test('a whole day: setup, energy, a batch of three, rework, moments, debt, review', () => {
  const p = player();
  const { run, fails } = p;
  try {
    assert.match(run('init', '--name', 'Allen', '--mission', 'Faster and better', '--stats', 'Body,Mind,Craft,Work,Bonds'), /Started Flow for Allen/);
    assert.match(run('skill', 'add', '--name', 'Procurement', '--stat', 'work', '--place', 'desk'), /under Work, at Desk/);
    run('skill', 'add', '--name', 'Running', '--stat', 'Body', '--place', 'gym');
    for (const [title, extra] of [['Purchase request', []], ['Supplier PR', []], ['Tooling PR', ['--for-others']]]) {
      run('task', 'add', '--title', title, '--skill', 'procure', '--estimate', '10', '--mana', '1', '--batch', 'purchase', ...extra);
    }
    assert.match(run('task', 'add', '--title', 'Run 5k', '--skill', 'running', '--cadence', 'daily', '--estimate', '30', '--stamina', '3'), /daily, time, ~30 min/);
    assert.match(run('reward', 'add', '--title', 'Ice cream', '--price', '60'), /60 pts/);
    assert.match(fails('task', 'add', '--title', 'X', '--skill', 'nope'), /no skill matches "nope"/);

    run('energy', '7', '6', '--at', '07:00');
    const next = run('next');
    assert.match(next, /Batch: 3 × purchase/);

    // A batch of three: each within 10 minutes of the last.
    assert.match(run('done', 'purchase request', '--minutes', '10', '--at', '09:00'), /\+10 pts[\s\S]*First step/);
    const second = run('done', 'supplier', '--minutes', '9', '--start', '09:02');
    assert.match(second, /\+12 pts .*batch ×2 \+15%/);
    assert.match(second, /mana 4\.5 \(this cost 0 \/ 0\.5\)/); // later batch tasks cost half the mana
    const third = run('done', 'tooling', '--minutes', '8', '--start', '09:13', '--quality', '90');
    assert.match(third, /\+12 pts .*base 9 .*90% quality.*batch ×3 \+30%/);
    assert.match(third, /Batched/);
    assert.match(fails('done', 'PR', '--minutes', '5'), /matches 2 tasks: Supplier PR, Tooling PR/);

    // Critical rework pays 2×: 4 min × 1.5 pts/min × 2.
    assert.match(run('rework', 'tooling', '--minutes', '4', '--at', '11:00', '--note', 'wrong part'), /= −12 XP[\s\S]*balance 34 → 22[\s\S]*12 min at 45% quality/);

    assert.match(run('moment', 'drive', '--from', '07:30', '--to', '08:10', '--who', 'Whitney'), /Drive 07:30–08:10 with Whitney at Car: stamina −0\.3, mana −0\.7/);
    assert.match(run('moment', 'chat', '--from', '08:20', '--to', '08:40', '--who', 'Sam', '--place', 'meeting'), /at Meeting room/);

    // 22 covered, 38 on credit at double: 98.
    assert.match(run('buy', 'ice', '--at', '17:00'), /−98 pts .*Balance 22 → -76/);
    // Rework in debt costs double too: penalty 2 × 1 × 1.5 = 3, charged 6. It is
    // logged after the 17:00 purchase — a charge is doubled by the balance at its
    // own time, not by debt that came later.
    const log = run('log', '--days', '1');
    const doneId = /Purchase request 10m .*\[(done_[^\]]+)\]/.exec(log)[1];
    assert.match(run('rework', doneId, '--minutes', '2', '--at', '17:30'), /= −3 XP[\s\S]*Charged 6 pts \(3 extra/);

    assert.match(run('review', '--satisfaction', '7', '--body', '6', '--work', '8', '--win', 'batched', '--lesson', 'check part numbers', '--next', 'add a check step'), /Review 2026-W40: satisfaction 7\/10 · Body 6, Work 8/);
    assert.match(fails('review', '--satisfaction', '7', '--bogus', '3'), /no stat called --bogus/);
    assert.match(fails('review', '--satisfaction', '12'), /0–10/);

    const s = p.json();
    assert.equal(s.setup, true);
    assert.equal(s.settings.name, 'Allen');
    assert.equal(s.balance, -82);
    assert.equal(s.player.xp, 34 - 12 - 3);
    assert.deepEqual({ stamina: s.energy.stamina, mana: s.energy.mana }, { stamina: 6.7, mana: 2.6 });
    assert.equal(s.today.done, 3);
    assert.equal(s.today.points, 34);
    assert.equal(s.moments.length, 2);
    assert.equal(s.tasks.find((t) => t.title === 'Tooling PR').reworks, 1);
    assert.equal(s.satisfaction.latest.satisfaction, 7);
    assert.equal(s.satisfaction.due, false);
    const earned = s.achievements.filter((a) => a.earned).map((a) => a.id);
    assert.deepEqual(earned.sort(), ['batch-3', 'first-step']);
    assert.equal(s.stats.find((x) => x.name === 'Work').lastWeek, 34);
    assert.equal(s.sync.configured, false);

    const status = run('status');
    assert.match(status, /# Allen — level 1 .*balance -82 pts \(in debt/);
    assert.match(status, /Latest 2026-W40: 7\/10/);

    const replay = run('replay');
    assert.match(replay, /\[Desk\] Supplier PR — batch ×2\. \+12/);
    assert.match(replay, /Drive with Whitney/);
    assert.match(replay, /— Finale —\n\+34 pts earned, 116 spent · 3 tasks, 2 moments, 2 rework/);
    assert.match(replay, /Tomorrow: /);

    // Undo takes back the last entry; the purchase was 98.
    assert.match(run('undo', 'last'), /Undid review/);
    assert.equal(p.json().satisfaction.latest, null);
  } finally {
    p.done();
  }
});

test('definitions: edit, archive, stats, places, kinds, export and import', () => {
  const p = player();
  const { run, fails } = p;
  try {
    run('init', '--name', 'Allen');
    run('skill', 'add', '--name', 'Writing', '--stat', 'craft');
    run('task', 'add', '--title', 'Write 500 words', '--skill', 'writing', '--measure', 'count', '--unit', 'words', '--estimate', '40', '--mana', '3');
    assert.match(run('task', 'edit', 'write', '--estimate', '45', '--deadline', '2026-09-29', '--place', 'kitchen'), /~45 min.*due 2026-09-29.*critical.*at Kitchen/);
    assert.match(run('task', 'edit', 'write', '--deadline', 'none'), /^Updated Write 500 words — Writing \(anytime, count, ~45 min, stamina 0, mana 3, at Kitchen\)/);
    assert.match(fails('done', 'write', '--minutes', '30'), /count task needs a value/);
    assert.match(run('done', 'write', '--minutes', '30', '--value', '520', '--at', '10:00'), /520 words\): \+45 pts/);

    // A first custom stat keeps the defaults rather than hiding them.
    assert.match(run('stat', 'add', '--name', 'Home', '--icon', '⌂'), /Added stat ⌂ Home \[stat_home\]/);
    assert.equal(p.json().stats.length, 6);
    assert.match(run('stat', 'rename', 'bonds', '--name', 'People'), /Bonds → ❖ People/);
    assert.match(fails('stat', 'remove', 'craft'), /has skills \(Writing\)/);
    assert.match(run('stat', 'remove', 'craft', '--to', 'mind'), /moved 1 skill to Mind/);
    assert.deepEqual(p.json().stats.map((s) => s.name), ['Body', 'Mind', 'Work', 'People', 'Home']);

    assert.match(run('place', 'add', '--name', 'Garage', '--zone', 'home'), /Garage \(home\)/);
    assert.equal(p.json().places.length, 12);
    assert.match(run('kind', 'add', '--title', 'Call', '--place', 'garage', '--mana', '1.5'), /mana 1\.5; at Garage/);
    assert.equal(p.json().kinds.length, 7);
    assert.match(run('moment', 'call', '--from', '19:00', '--to', '19:30', '--who', 'Whitney'), /mana −0\.8/);

    assert.match(run('reward', 'add', '--title', 'Cinema', '--price', '120', '--once'), /one-off/);
    assert.match(run('task', 'archive', 'write'), /Archived/);
    assert.equal(p.json().tasks[0].archived, true);
    assert.match(run('task', 'restore', 'write'), /Restored/);

    const file = join(p.home, 'backup.json');
    assert.match(run('export', file), /Exported \d+ records/);
    const other = player();
    try {
      assert.match(other.run('import', file), /Imported (\d+) of \1 records/);
      assert.equal(other.json().balance, 45);
      assert.match(other.run('import', file), /Imported 0 of/);
    } finally { other.done(); }
    assert.ok(JSON.parse(readFileSync(file, 'utf8')).records.length > 20);
  } finally {
    p.done();
  }
});

test('config keeps the token to itself', () => {
  const p = player();
  try {
    const out = p.run('config', '--url', 'http://127.0.0.1:9/w/flow', '--token', 'super-secret-token-1');
    assert.match(out, /Token: set \(hidden\)/);
    assert.doesNotMatch(out, /super-secret/);
    assert.equal(statSync(join(p.home, 'config.json')).mode & 0o777, 0o600);
    // Unreachable server: the write still lands, with a warning.
    const env = { ...process.env, FLOW_HOME: p.home, TZ: 'UTC' };
    const res = execFileSync('node', [CLI, 'init', '--name', 'Offline'], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(res, /Started Flow for Offline/);
    assert.equal(JSON.parse(p.run('status', '--json', '--offline')).settings.name, 'Offline');
    assert.match(p.run('config', '--clear'), /Sync switched off/);
  } finally {
    p.done();
  }
});

// Difficulty (SPEC.md › Difficulty): shown by `flow difficulty`, set only by `flow review`.
function playerAt() {
  const home = mkdtempSync(join(tmpdir(), 'flow-cli-'));
  const env = { ...process.env, FLOW_HOME: home, TZ: 'UTC' };
  delete env.FLOW_OFFLINE;
  const run = (now, ...args) => execFileSync('node', [CLI, ...args], { encoding: 'utf8', env: { ...env, FLOW_NOW: now }, stdio: ['ignore', 'pipe', 'pipe'] });
  const fails = (now, ...args) => {
    try { run(now, ...args); } catch (err) { return err.stderr; }
    assert.fail(`expected failure: ${args.join(' ')}`);
  };
  return { run, fails, done: () => rmSync(home, { recursive: true, force: true }) };
}

test('difficulty: shown by flow difficulty, set in the review, per skill, from the next day', () => {
  const MON = '2026-09-28T18:00:00Z';
  const TUE = '2026-09-29T18:00:00Z';
  const p = playerAt();
  const run = (...a) => p.run(MON, ...a);
  const fails = (...a) => p.fails(MON, ...a);
  try {
    run('init', '--name', 'Allen');
    run('skill', 'add', '--name', 'Running', '--stat', 'Body');
    run('skill', 'add', '--name', 'Mail', '--stat', 'Work');
    run('task', 'add', '--title', 'Long run', '--skill', 'running', '--estimate', '600');
    run('task', 'add', '--title', 'Inbox', '--skill', 'mail', '--estimate', '100');
    // 1800+ XP on Running: the player reaches level 3, Running level 6, Mail stays level 1.
    for (const d of ['21', '22', '23']) run('done', 'long run', '--minutes', '600', '--at', `2026-09-${d}T20:00:00Z`);
    run('done', 'inbox', '--minutes', '100', '--at', '2026-09-24T10:00:00Z');
    run('done', 'inbox', '--minutes', '100', '--at', '2026-09-25T10:00:00Z');
    // Push: the next target is 5% better than 100.
    assert.match(run('done', 'inbox', '--minutes', '100', '--at', '2026-09-26T10:00:00Z'), /Next time: target 95 min \(your last 3 runs, 5% better\)/);

    const text = run('difficulty');
    assert.match(text, /Push/);
    assert.match(text, /changes only at the weekly review/i);
    assert.match(text, /Unlocked: Steady, Push, Grind/);
    assert.match(text, /Next: Relentless at level 6/);
    assert.match(text, /every skill plays at the global tier/i);
    for (const name of ['Steady', 'Grind', 'Relentless', 'Legend']) assert.match(text, new RegExp(name));
    assert.match(text, /Legend .*×2/);

    const j = JSON.parse(run('difficulty', '--json'));
    assert.equal(j.tier, 'push');
    assert.equal(j.name, 'Push');
    assert.deepEqual(j.skills, {});
    assert.deepEqual(j.unlocked, ['steady', 'push', 'grind']);
    assert.deepEqual(j.next, { id: 'relentless', name: 'Relentless', unlock: 6 });
    assert.equal(j.changesAt, 'review');
    assert.equal(j.tiers.length, 5);

    // Errors print as one clean line, like every other error.
    const locked = fails('review', '--satisfaction', '7', '--difficulty', 'legend');
    assert.match(locked, /^flow: Legend unlocks at level 10; the player is level 3\n$/);
    assert.match(fails('review', '--satisfaction', '7', '--difficulty', 'nightmare'), /^flow: no difficulty tier "nightmare"/);
    assert.match(fails('review', '--satisfaction', '7', '--difficulty', 'push', '--skill-difficulty', 'mail=grind'), /^flow: Grind unlocks at level 3; Mail is level 1\n$/);
    assert.match(fails('review', '--satisfaction', '7', '--skill-difficulty', 'nope=steady'), /^flow: no skill matches "nope"/);
    assert.match(fails('review', '--satisfaction', '7', '--skill-difficulty', 'mail'), /^flow: --skill-difficulty is <skill>=<tier>/);
    assert.match(fails('review', '--satisfaction', '7', '--skill-difficulty', 'mail=nightmare'), /^flow: no difficulty tier "nightmare"/);

    // Names or ids, any case; the flag repeats, one per skill.
    const review = run('review', '--satisfaction', '7', '--difficulty', 'Grind', '--skill-difficulty', 'mail=steady', '--skill-difficulty', 'Running=relentless');
    assert.match(review, /Difficulty from 2026-09-29: Grind · Mail Steady · Running Relentless/);

    // Same day: still Push, with the new setting waiting for tomorrow.
    const pending = run('difficulty');
    assert.match(pending, /Now: Push/);
    assert.match(pending, /From 2026-09-29: Grind · Mail Steady · Running Relentless/);

    const t = JSON.parse(p.run(TUE, 'difficulty', '--json'));
    const ids = Object.fromEntries(JSON.parse(p.run(TUE, 'status', '--json')).skills.map((s) => [s.name, s.id]));
    assert.equal(t.tier, 'grind');
    assert.deepEqual(t.skills, { [ids.Mail]: 'steady', [ids.Running]: 'relentless' });
    assert.match(p.run(TUE, 'difficulty'), /Mail: Steady/);

    // The CLI's own "next time" target uses the skill's tier today: Steady aims 3% better.
    const inbox = p.run(TUE, 'done', 'inbox', '--minutes', '100', '--at', '2026-09-29T10:00:00Z');
    assert.match(inbox, /Steady/);
    assert.match(inbox, /Next time: target 97 min \(your last 4 runs, 3% better\)/);

    assert.match(p.run(TUE, 'help'), /flow difficulty/);
    assert.match(p.run(TUE, 'help'), /--skill-difficulty <skill>=<tier>/);
  } finally {
    p.done();
  }
});
