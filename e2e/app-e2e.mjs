// End-to-end check of the Flow page in Chromium at phone width (390px).
//
//   ./serve.sh 8201 &            # the app
//   node e2e/app-e2e.mjs [--sync http://127.0.0.1:8092/w/flow token]
//
// Creates a skill and tasks, rates energy, logs completions (a batch
// included), logs rework through the timer and from today's list, buys a
// reward into debt, logs a moment, saves a review; fails on any console error
// or horizontal overflow. With --sync it also points two browser contexts at
// a sync-kit server and checks records travel both ways.
//
// Uses the globally installed Playwright (no npm install in this repo).

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.PLAYWRIGHT_ROOT || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const APP = process.env.APP_URL || 'http://127.0.0.1:8201/';
const SHOTS = process.env.SHOTS || null;
const syncArg = process.argv.indexOf('--sync');
const SYNC = syncArg > 0 ? { url: process.argv[syncArg + 1], token: process.argv[syncArg + 2] } : null;

const failures = [];
const check = (ok, what) => { if (ok) console.log(`  ok  ${what}`); else { console.log(`  FAIL ${what}`); failures.push(what); } };

// The replay renderer is a separate module: until it lands its 404 is expected.
const expected = (text) => /Failed to load resource.*404/.test(text);

async function openPage(browser, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !expected(m.text())) errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  await page.goto(APP);
  await page.waitForSelector('#view .view');
  return { context, page, errors };
}

// The tab row sits along the bottom on a phone; a tab is a real button and
// the current one carries aria-current="page".
const go = async (page, view) => {
  await page.click(`.ds-tabs [data-go="${view}"]`);
  await page.waitForSelector(`.ds-tabs [data-go="${view}"][aria-current="page"]`);
};
const overflow = (page) => page.evaluate(() => {
  const doc = document.documentElement.scrollWidth > window.innerWidth + 1;
  const view = document.querySelector('#view');
  return doc || view.scrollWidth > view.clientWidth + 1;
});
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(350); await page.evaluate(() => document.querySelectorAll('.ds-toast').forEach((t) => t.remove())); fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/app-${name}.png`, fullPage: false }); } };
const setRange = (page, sel, value) => page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
const dialogButton = async (page, id) => { await page.waitForSelector(`[data-dialog-button="${id}"]`); await page.click(`[data-dialog-button="${id}"]`); };
const todayItem = (page, text) => page.locator('#today .item').filter({ hasText: text }).first();
const item = (page, text) => page.locator('#view .item').filter({ hasText: text }).first();

async function mainFlow(browser) {
  console.log('main flow');
  const { page, errors, context } = await openPage(browser, 'main');

  // Morning rating.
  check(await page.isVisible('#energy-form'), 'asks for the morning rating');
  await setRange(page, '#energy-form [name=stamina]', 8);
  await setRange(page, '#energy-form [name=mana]', 6.5);
  await shot(page, 'now-morning');
  await page.click('#energy-form [type=submit]');
  await page.waitForSelector('#energy-form', { state: 'detached' });
  check((await page.textContent('.hud')).includes('8/10'), 'HUD shows stamina 8/10');

  // Skills.
  await go(page, 'skills');
  for (const [name, stat] of [['Purchasing', 'stat_work'], ['Writing', 'stat_mind']]) {
    await page.fill('#skill-form [name=name]', name);
    await page.selectOption('#skill-form [name=stat]', stat);
    await page.click('#skill-form [type=submit]');
    await page.waitForSelector(`#view .item:has-text("${name}")`);
  }
  check(await page.isVisible('#view .item:has-text("Purchasing")'), 'skill created under a stat');
  // Rename a stat (writes every default stat as a record first).
  await page.click('[data-action="edit-stat"][data-stat="stat_bonds"]');
  await page.fill('form[data-form=stat] [name=name]', 'People');
  await page.click('form[data-form=stat] [type=submit]');
  await page.waitForSelector('#view h2:has-text("People")');
  check((await page.locator('section[data-stat]').count()) === 5, 'renaming a stat keeps all five');
  await shot(page, 'skills');

  // Tasks.
  await go(page, 'tasks');
  const addTask = async (f) => {
    await page.click('[data-action=new]');
    await page.fill('#task-form [name=title]', f.title);
    await page.selectOption('#task-form [name=skill]', { label: f.skill });
    if (f.measure) await page.selectOption('#task-form [name=measure]', f.measure);
    if (f.unit) await page.fill('#task-form [name=unit]', f.unit);
    await page.fill('#task-form [name=estimate]', String(f.estimate));
    if (f.batch) await page.fill('#task-form [name=batch]', f.batch);
    if (f.deadline) await page.fill('#task-form [name=deadline]', f.deadline);
    if (f.critical) await page.check('#task-form [name=critical]');
    await page.click('#task-form [type=submit]');
    await page.waitForSelector('#task-form', { state: 'detached' });
  };
  await addTask({ title: 'Email triage', skill: 'Mind · Writing', estimate: 15 });
  await addTask({ title: 'Pages written', skill: 'Mind · Writing', measure: 'count', unit: 'pages', estimate: 30 });
  for (const t of ['PR alpha', 'PR beta', 'PR gamma']) await addTask({ title: t, skill: 'Work · Purchasing', estimate: 10, batch: 'purchase request' });
  check((await page.locator('#view .item').count()) === 5, 'five tasks listed');
  // Edit one.
  await item(page, 'Pages written').locator('[data-action=edit]').click();
  await page.fill('#task-form [name=estimate]', '25');
  await page.click('#task-form [type=submit]');
  await page.waitForSelector('#task-form', { state: 'detached' });
  check((await item(page, 'Pages written').textContent()).includes('est 25m'), 'task edited in place');
  await shot(page, 'tasks');

  // Now: the batch is released (3 waiting) and offered together.
  await go(page, 'now');
  const batchBtn = page.locator('#next [data-action=batch]').first();
  check(await batchBtn.count() > 0, 'picker offers the batch together');
  check((await page.textContent('#next')).includes('Batch: 3 × purchase request'), 'batch named with its size');
  await batchBtn.click();
  await page.click('#batch-form [type=submit]');
  await page.waitForSelector('#batch-form', { state: 'detached' });
  check(await page.isVisible('#batch-banner'), 'batch banner with minutes left');
  check((await page.textContent('#today')).includes('batch +30%'), 'third in the batch earned +30%');

  // Log done: a count task, with quality.
  await page.selectOption('#any-task [name=any]', { label: 'Pages written' });
  await page.click('[data-action=log-any]');
  await page.fill('#log-form [name=minutes]', '20');
  await page.fill('#log-form [name=value]', '3');
  await setRange(page, '#log-form [name=quality]', 90);
  await page.click('#log-form [type=submit]');
  await page.waitForSelector('#log-form', { state: 'detached' });
  check((await page.locator('#today .item').count()) === 4, 'four completions today');

  // Log done: time task.
  await page.selectOption('#any-task [name=any]', { label: 'Email triage' });
  await page.click('[data-action=log-any]');
  await page.fill('#log-form [name=minutes]', '12');
  await page.click('#log-form [type=submit]');
  await page.waitForSelector('#log-form', { state: 'detached' });
  await shot(page, 'now-hud');

  // Timer on a task finished recently asks about rework → rework it.
  await page.selectOption('#any-task [name=any]', { label: 'Email triage' });
  await page.click('[data-action=start-any]');
  await dialogButton(page, 'rework');
  await page.waitForSelector('#timer-card');
  check((await page.textContent('#timer-card')).includes('rework of'), 'timer running as rework');
  check(JSON.parse(await page.evaluate(() => localStorage.getItem('flow.timer'))).reworkOf, 'timer persisted in flow.timer');
  await page.reload();
  await page.waitForSelector('#timer-card');
  check(true, 'timer survives a reload');
  await page.click('[data-action=stop]');
  await page.fill('#rework-form [name=minutes]', '6');
  await page.click('#rework-form [type=submit]');
  await page.waitForSelector('#rework-form', { state: 'detached' });
  check(!(await page.isVisible('#timer-card')), 'timer cleared after logging');
  check((await todayItem(page, 'Email triage').textContent()).includes('rework ×1'), 'rework logged against the run');

  // Rework from today's list.
  await todayItem(page, 'Pages written').locator('[data-action=rework]').click();
  await page.fill('#rework-form [name=minutes]', '5');
  await page.click('#rework-form [type=submit]');
  await page.waitForSelector('#rework-form', { state: 'detached' });
  check((await todayItem(page, 'Pages written').textContent()).includes('rework ×1'), 'rework from today list');

  // A moment, with who.
  await page.click('[data-action=moment-start][data-kind=kind_chat]');
  await page.waitForSelector('#moment-running');
  await page.fill('#moment-running [name=who]', 'Whitney');
  await page.waitForTimeout(1100);
  await page.click('#moment-running [type=submit]');
  await page.waitForSelector('#moments');
  check((await page.textContent('#today')).includes('with Whitney'), 'moment logged with who');
  check(!(await overflow(page)), 'Now: no horizontal overflow');
  await shot(page, 'now-today');

  // Shop: buy into debt.
  await go(page, 'shop');
  const balance = Number((await page.textContent('#shop-balance')).replace(/[^\d−-]/g, '').replace('−', '-'));
  await page.fill('#reward-form [name=title]', 'Bubble tea');
  await page.fill('#reward-form [name=price]', String(balance + 50));
  await page.click('#reward-form [type=submit]');
  await page.waitForSelector('#view [data-action=buy]');
  await page.click('#view [data-action=buy]');
  await page.waitForSelector('dialog.ds-dialog:has-text("Into debt")');
  check((await page.textContent('dialog.ds-dialog')).includes(`charged ${(balance + 100).toLocaleString('en-US')}`), 'debt warning names the doubled charge');
  await shot(page, 'shop-debt');
  await dialogButton(page, 'ok');
  await page.waitForSelector('#purchases');
  check((await page.textContent('#purchases')).includes('debt ×2'), 'purchase history marks the debt');
  check((await page.textContent('#shop-balance')).includes('−100'), 'balance is −100 after buying 50 over');
  check(!(await overflow(page)), 'Shop: no horizontal overflow');

  // Bag: quick add, a loadout, "have it" → skip pays points, buy anyway restocks.
  await go(page, 'bag');
  const addItem = async (name, place, price, slot = '') => {
    await page.fill('#item-form [name=name]', name);
    await page.selectOption('#item-form [name=place]', place);
    await page.fill('#item-form [name=price]', String(price));
    if (slot) await page.selectOption('#item-form [name=slot]', slot);
    await page.click('#item-form [type=submit]');
    await page.waitForSelector(`#stashes .cell:has-text("${name}")`);
  };
  await addItem('HDMI cable', 'place_desk', 15);
  await addItem('Work boots', 'place_floor', 80, 'feet');
  check((await page.locator('#stashes section.stash').count()) === 2, 'a stash per storage place');
  await page.fill('#loadout-form [name=name]', 'Work');
  await page.selectOption('#loadout-form [name=slot_feet]', { label: 'Work boots' });
  await page.check('#loadout-form [name=active]');
  await page.click('#loadout-form [type=submit]');
  await page.waitForSelector('#doll [data-slot=feet]:has-text("Work boots")');
  check(true, 'loadout equipped on the paper doll');
  const before = Number((await page.textContent('#strip-gem')).replace(/[^\d−-]/g, '').replace('−', '-'));
  await page.fill('#have-form [name=query]', 'hdmi');
  await page.fill('#have-form [name=price]', '15');
  await page.click('#have-form [type=submit]');
  await page.waitForSelector('#have-result');
  check((await page.textContent('#have-result')).includes('You own 1: Desk'), 'have-it lookup names where it is');
  await page.click('#have-result [data-action=skip]');
  await page.waitForSelector('#have-result', { state: 'detached' });
  const after = Number((await page.textContent('#strip-gem')).replace(/[^\d−-]/g, '').replace('−', '-'));
  check(after === before + 15, 'skip adds 15 points to the gem counter');
  check((await page.textContent('#money')).includes('saved $15'), 'money saved this month');
  await page.fill('#have-form [name=query]', 'HDMI cable');
  await page.fill('#have-form [name=price]', '12');
  await page.click('#have-form [type=submit]');
  await page.click('#have-result [data-action=spend]');
  await page.waitForSelector('#have-result', { state: 'detached' });
  check((await page.textContent('#money')).includes('spent $12'), 'buy anyway: spent this month');
  check((await page.getAttribute('#stashes .cell:has-text("HDMI cable")', 'title')).includes('×2'), 'buy anyway restocks the item');
  check(!(await overflow(page)), 'Bag: no horizontal overflow');
  await shot(page, 'bag');

  // Review.
  await go(page, 'review');
  await setRange(page, '#review-form [name=satisfaction]', 7.5);
  await setRange(page, '#review-form [name=rate_stat_work]', 8);
  await page.fill('#review-form [name=win]', 'Batched purchase requests');
  await page.click('#review-form [type=submit]');
  await page.waitForSelector('#sat-chart');
  await page.locator('#sat-chart svg').scrollIntoViewIfNeeded();
  const box = await page.locator('#sat-chart svg').boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  check(await page.isVisible('#sat-chart .chart-tip'), 'chart tooltip on hover');
  check((await page.textContent('#reviews')).includes('7.5'), 'review in the table');
  check(!(await overflow(page)), 'Review: no horizontal overflow');
  await shot(page, 'review');

  // Replay placeholder, Settings, Rules.
  await go(page, 'replay');
  await page.waitForSelector('#replay-root');
  await page.waitForTimeout(400);
  check((await page.textContent('#replay-root')).includes('Whitney') || (await page.locator('#replay-root canvas').count()) > 0, 'replay shows the day');
  check(!(await overflow(page)), 'Replay: no horizontal overflow');
  await go(page, 'settings');
  await page.fill('#hero [name=shirt]', '#aa3355').catch(() => page.$eval('#hero [name=shirt]', (el) => { el.value = '#aa3355'; }));
  await page.click('#hero [type=submit]');
  await page.waitForTimeout(200);
  const hero = await page.evaluate(async () => (await import('/src/sync.js')).getRecord('settings')?.hero);
  check(hero?.shirt === '#aa3355', 'hero colours saved to settings.hero');
  await page.check('[data-setting=sound]');
  await page.waitForTimeout(200);
  check(await page.evaluate(async () => (await import('/src/sync.js')).getRecord('settings')?.sound === true), 'sound toggle saved');
  await page.fill('#add-place [name=name]', 'Library');
  await page.click('#add-place [type=submit]');
  await page.waitForSelector('#places input[value="Library"]');
  check((await page.locator('#places form[data-form=place]').count()) >= 12, 'place added beside the defaults');
  check(!(await overflow(page)), 'Settings: no horizontal overflow');
  await shot(page, 'settings');
  await go(page, 'rules');
  check((await page.textContent('#rules')).includes('capped at 2.5× base'), 'rules explain the cap');
  check(!(await overflow(page)), 'Rules: no horizontal overflow');
  for (const v of ['tasks', 'skills', 'bag']) { await go(page, v); check(!(await overflow(page)), `${v}: no horizontal overflow`); }

  // Export includes everything.
  const exported = await page.evaluate(async () => (await import('/src/sync.js')).exportStore());
  check(exported.records.some((r) => r.type === 'rework') && exported.records.some((r) => r.type === 'purchase'), 'export carries events');
  check(exported.records.every((r) => r.origin && r.updatedAt), 'every record stamped with origin and updatedAt');

  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await context.close();
}

async function syncFlow(browser) {
  console.log('sync flow');
  const a = await openPage(browser, 'A');
  const b = await openPage(browser, 'B');
  for (const { page } of [a, b]) {
    await go(page, 'settings');
    await page.fill('#sync [name=url]', SYNC.url);
    await page.fill('#sync [name=token]', SYNC.token);
    await page.check('#sync [name=enabled]');
    await page.click('#sync [type=submit]');
    await page.waitForFunction(async () => (await import('/src/sync.js')).syncStatus().lastSyncAt);
  }
  // A writes a skill and a reward; B pulls them.
  await go(a.page, 'skills');
  const tag = Math.random().toString(36).slice(2, 7);
  await a.page.fill('#skill-form [name=name]', `Synced skill ${tag}`);
  await a.page.click('#skill-form [type=submit]');
  await a.page.waitForSelector(`#view .item:has-text("Synced skill ${tag}")`);
  await a.page.evaluate(async () => (await import('/src/sync.js')).syncNow());
  await b.page.evaluate(async () => (await import('/src/sync.js')).syncNow());
  await go(b.page, 'skills');
  check(await b.page.isVisible(`#view .item:has-text("Synced skill ${tag}")`), 'A → B: skill arrived');
  // B writes an event; A pulls it.
  await go(b.page, 'now');
  if (await b.page.isVisible('#energy-form')) {
    await setRange(b.page, '#energy-form [name=stamina]', 3);
    await b.page.click('#energy-form [type=submit]');
    await b.page.waitForSelector('#energy-form', { state: 'detached' });
  } else {
    // A server kept from an earlier run already has today's rating: rate again.
    await b.page.evaluate(async () => { const m = await import('/src/model.js'); await (await import('/src/sync.js')).add(m.makeEnergy({ stamina: 3, mana: 5 })); });
  }
  await b.page.evaluate(async () => (await import('/src/sync.js')).syncNow());
  await a.page.evaluate(async () => (await import('/src/sync.js')).syncNow());
  await go(a.page, 'now');
  check(!(await a.page.isVisible('#energy-form')) && (await a.page.textContent('.hud')).includes('3/10'), 'B → A: energy rating arrived');
  // A renames the skill (definition, last-write-wins); B sees the new name.
  const origins = await b.page.evaluate(async (n) => { const s = await import('/src/sync.js'); return [s.deviceId(), s.allRecords().find((r) => r.name === n)?.origin]; }, `Synced skill ${tag}`);
  check(origins[0] !== origins[1], 'pulled record keeps the writer device as origin');
  await a.page.evaluate(async (n) => { const s = await import('/src/sync.js'); const k = s.allRecords().find((r) => r.name === n); await s.save({ ...k, name: `Renamed ${n}` }); await s.syncNow(); }, `Synced skill ${tag}`);
  await b.page.evaluate(async () => (await import('/src/sync.js')).syncNow());
  await go(b.page, 'skills');
  check(await b.page.isVisible(`#view .item:has-text("Renamed Synced skill ${tag}")`), 'definition edit synced in place');
  // A write pushes by itself shortly after (no Sync now pressed on A).
  await go(a.page, 'shop');
  await a.page.fill('#reward-form [name=title]', `Auto-pushed treat ${tag}`);
  await a.page.fill('#reward-form [name=price]', '40');
  await a.page.click('#reward-form [type=submit]');
  await a.page.waitForTimeout(3500);
  await b.page.evaluate(async () => (await import('/src/sync.js')).syncNow());
  await go(b.page, 'shop');
  check(await b.page.isVisible(`#view .item:has-text("Auto-pushed treat ${tag}")`), 'a write syncs by itself after saving');
  await go(b.page, 'settings');
  await shot(b.page, 'sync-settings');
  check(a.errors.length === 0 && b.errors.length === 0, `no console errors in sync${[...a.errors, ...b.errors].join(' | ')}`);
  await a.context.close();
  await b.context.close();
}

const browser = await chromium.launch();
try {
  await mainFlow(browser);
  if (SYNC) await syncFlow(browser);
} catch (err) {
  failures.push(err.message);
  console.error(err);
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
