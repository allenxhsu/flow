// End-to-end check of the Bag as the house inventory, and a reshelve plan, in
// Chromium at phone width and on a desktop.
//
//   ./serve.sh 8201 &
//   node e2e/bag-e2e.mjs            # SHOTS=dir to keep screenshots
//
// Nests places (Garage › Shelf B), files an item with its details and a photo,
// finds it by "garage drill", walks a reshelve plan (shelving a book moves it),
// deletes the Garage and checks nothing went with it; fails on any console
// error or horizontal overflow.
//
// Uses the globally installed Playwright (no npm install in this repo).

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(process.env.PLAYWRIGHT_ROOT || '/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const APP = process.env.APP_URL || 'http://127.0.0.1:8201/';
const SHOTS = process.env.SHOTS || null;
const failures = [];
const check = (ok, what) => { if (ok) console.log(`  ok  ${what}`); else { console.log(`  FAIL ${what}`); failures.push(what); } };
const expected = (text) => /Failed to load resource.*404/.test(text);

// A 2×2 PNG: a real image for the page to decode, resize and store.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

const overflow = (page) => page.evaluate(() => {
  const view = document.querySelector('#view');
  return document.documentElement.scrollWidth > window.innerWidth + 1 || (view && view.scrollWidth > view.clientWidth + 1);
});
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/bag-${name}.png`, fullPage: true });
};
/** The app confirms in its own dialog: press its OK. */
const confirmDialog = async (page) => {
  const ok = page.locator('[data-dialog-button="ok"], .ds-dialog [data-choice="ok"], dialog button:has-text("Delete"), dialog button:has-text("Finish")').first();
  await ok.waitFor({ timeout: 5000 });
  await ok.click();
};

async function run(browser, { width, height, label }) {
  console.log(`bag at ${label}`);
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !expected(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('flow.view', 'bag'));
  await page.reload();
  await page.waitForSelector('#stashes');

  // Garage (top level), then Shelf B inside it.
  const addPlace = async (name, zone) => {
    await page.click('[data-action="bag-place-new"]');
    await page.fill('#bag-place-form [name=name]', name);
    if (zone) await page.selectOption('#bag-place-form [name=zone]', zone);
    await page.click('#bag-place-form [type=submit]');
    await page.waitForSelector(`.bag-place.is-active:has-text("${name}")`);
  };
  await addPlace('Garage', 'home');
  await addPlace('Shelf B');
  check((await page.$eval('.bag-place.is-active', (el) => el.style.getPropertyValue('--depth').trim())) === '1', 'Shelf B sits inside the Garage');
  check((await page.locator('.bag-place').filter({ hasText: 'Bedroom' }).count()) === 1, 'the default places are kept beside the new ones');

  // Quick add two things onto the shelf.
  for (const [name, price] of [['Drill', 120], ['Hammer', 25]]) {
    await page.fill('#item-form [name=name]', name);
    await page.selectOption('#item-form [name=place]', { label: ' Shelf B' });
    await page.fill('#item-form [name=price]', String(price));
    await page.click('#item-form [type=submit]');
    await page.waitForSelector(`#stashes .cell:has-text("${name}")`);
  }
  check((await page.textContent('#stashes .stash-tab')).includes('Garage › Shelf B'), 'the stash is titled with its path');

  // Details and a photo on the drill.
  await page.click('#stashes .cell:has-text("Drill")');
  await page.fill('#item-edit-form [name=brand]', 'Makita');
  await page.fill('#item-edit-form [name=serial]', 'SN-4471');
  await page.fill('#item-edit-form [name=bought]', '2025-11-28');
  await page.click('#item-edit-form [type=submit]');
  await page.waitForTimeout(300);
  if (!(await page.isVisible('#item-detail'))) await page.click('#stashes .cell:has-text("Drill")');
  await page.setInputFiles('#item-detail [data-upload="photo"]', { name: 'drill.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('#item-detail .bag-photos img');
  check((await page.getAttribute('#item-detail .bag-photos img', 'src')).startsWith('data:image/jpeg;base64,'), 'the photo is stored as a JPEG');
  check((await page.inputValue('#item-detail [name=brand]')) === 'Makita', 'the details are saved');

  // Find it from everywhere by the place it is in, and by its serial.
  await page.click('.bag-place[data-bag-place=""]');
  await page.fill('[data-bag-search]', 'garage drill');
  await page.waitForFunction(() => document.querySelectorAll('#stash-list .cell').length === 1);
  check((await page.textContent('#stash-list')).includes('Drill'), '"garage drill" finds the drill');
  await page.fill('[data-bag-search]', 'sn-4471');
  await page.waitForFunction(() => document.querySelectorAll('#stash-list .cell').length === 1);
  check(true, 'the serial number finds it too');
  await page.fill('[data-bag-search]', 'kitchen drill');
  await page.waitForSelector('#stash-list .muted-box');
  check(true, 'a word that does not match finds nothing');
  await page.fill('[data-bag-search]', '');
  await page.locator('[data-bag-search]').blur(); // Flow holds re-renders while a field is being typed in

  // A reshelve plan, imported as a record: the hammer goes to the Kitchen.
  const ids = await page.evaluate(async () => {
    const store = await import('./src/sync.js');
    const M = await import('./src/model.js');
    const db = store.db();
    const hammer = db.items.find((i) => i.name === 'Hammer');
    const kitchen = db.places.find((p) => p.name === 'Kitchen');
    const plan = M.makeReshelve(db, { name: 'Tidy up', moves: [{ item: hammer.id, to: kitchen.id, call: '684' }] });
    await store.save(plan);
    return { hammer: hammer.id, kitchen: kitchen.id };
  });
  await page.waitForSelector('#reshelve');
  check((await page.textContent('#reshelve')).includes('0/1 shelved'), 'the plan shows with its progress');
  await page.click(`#reshelve [data-action="reshelve-tab"][data-tab="pull"]`);
  await page.click(`#reshelve [data-action="reshelve-pull"][data-item="${ids.hammer}"]`);
  await page.waitForFunction(() => document.querySelector('#reshelve')?.textContent.includes('1/1 pulled'));
  check(true, 'pulling a book ticks it off');
  await page.click(`#reshelve [data-action="reshelve-tab"][data-tab="shelve"]`);
  await page.click(`#reshelve [data-action="reshelve-shelve"][data-item="${ids.hammer}"]`);
  await page.waitForFunction(() => document.querySelector('#reshelve')?.textContent.includes('1/1 shelved'));
  check((await page.textContent(`#stashes .stash[data-place="${ids.kitchen}"]`)).includes('Hammer'), 'shelving moves the hammer to the Kitchen');
  await shot(page, `${label}-reshelve`);
  await page.click('#reshelve [data-action="reshelve-finish"]');
  await page.waitForSelector('#reshelve', { state: 'detached' });
  check(true, 'a finished plan leaves the Bag');

  // Delete the Garage: the shelf and the drill on it stay.
  await page.click('.bag-place:has-text("Garage")');
  await page.click('[data-action="bag-place-edit"]');
  await page.click('[data-action="bag-place-remove"]');
  await confirmDialog(page);
  await page.waitForFunction(() => ![...document.querySelectorAll('.bag-place')].some((b) => b.textContent.includes('Garage')));
  const shelf = page.locator('.bag-place').filter({ hasText: 'Shelf B' });
  check((await shelf.count()) === 1 && (await shelf.evaluate((el) => el.style.getPropertyValue('--depth').trim())) === '0', 'Shelf B moved up to the top level');
  await shelf.click();
  await page.waitForSelector('#stash-list .cell:has-text("Drill")');
  check(true, 'the drill is still on Shelf B');

  check(!(await overflow(page)), `${label}: no horizontal overflow`);
  await shot(page, `${label}-after`);
  check(!errors.length, `${label}: no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  await context.close();
}

const browser = await chromium.launch();
try {
  await run(browser, { width: 390, height: 844, label: 'phone' });
  await run(browser, { width: 1280, height: 860, label: 'desktop' });
} finally {
  await browser.close();
}
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
