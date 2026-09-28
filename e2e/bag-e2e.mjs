// End-to-end check of the Bag (the house inventory) in Chromium, at phone
// width and on a desktop.
//
//   ./serve.sh 8201 &
//   node e2e/bag-e2e.mjs            # SHOTS=dir to keep screenshots
//
// Nests places (Garage › Shelf B), files an item with its details, adds a
// photo, finds it by "garage drill", deletes the Garage and checks nothing
// went with it; fails on any console error or horizontal overflow.
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
  return document.documentElement.scrollWidth > window.innerWidth + 1 || view.scrollWidth > view.clientWidth + 1;
});
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('.sc-toast-item').forEach((t) => t.remove()));
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/bag-${name}.png`, fullPage: true });
};

async function run(browser, { width, height, label }) {
  console.log(`bag at ${label}`);
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !expected(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP);
  await page.evaluate(() => localStorage.setItem('flow.view', 'bag'));
  await page.reload();
  await page.waitForSelector('#bag-tree');
  check(await page.isVisible('.sc-nav-item[data-go="bag"]'), 'Bag is in the nav');

  // Garage (top level), then Shelf B inside it.
  const addPlace = async (name, zone) => {
    await page.click('[data-action="bag-new-place"]');
    await page.fill('form[data-form="bag-place"] [name=name]', name);
    if (zone) await page.selectOption('form[data-form="bag-place"] [name=zone]', zone);
    await page.click('form[data-form="bag-place"] [type=submit]');
    await page.waitForSelector(`.bag-place.is-active:has-text("${name}")`);
  };
  await addPlace('Garage', 'home');
  await addPlace('Shelf B');
  const depth = await page.$eval('.bag-place.is-active', (el) => el.style.getPropertyValue('--depth').trim());
  check(depth === '1', 'Shelf B sits inside the Garage');
  check((await page.locator('.bag-place').filter({ hasText: 'Bedroom' }).count()) === 1, 'the default places are kept beside the new ones');

  // An item on the shelf, with its details.
  await page.click('[data-action="bag-edit"][data-id="new"]');
  const form = 'form[data-form="bag-item"]';
  await page.fill(`${form} [name=name]`, 'Drill');
  await page.fill(`${form} [name=brand]`, 'Makita');
  await page.fill(`${form} [name=serial]`, 'SN-4471');
  await page.fill(`${form} [name=bought]`, '2025-11-28');
  await page.fill(`${form} [name=price]`, '120');
  check((await page.$eval(`${form} [name=place]`, (s) => s.selectedOptions[0].textContent.trim())) === 'Shelf B', 'a new item starts in the selected place');
  await page.click(`${form} [type=submit]`);
  await page.waitForSelector(`${form} [data-upload="photo"]`, { state: 'attached' });
  check(true, 'the new item stays open for photos');

  // A photo: resized in the page, written as a file record, shown as the thumbnail.
  await page.setInputFiles(`${form} [data-upload="photo"]`, { name: 'drill.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.bag-photo img');
  check((await page.getAttribute('.bag-photo img', 'src')).startsWith('data:image/jpeg;base64,'), 'the photo is stored as a JPEG');
  await page.click('[data-action="bag-close"]');
  await page.waitForSelector('.bag-item:has-text("Drill") .bag-thumb img');
  check(true, 'the photo is the list thumbnail');
  await shot(page, `${label}-shelf`);

  // Find it from everywhere by the place it is in.
  await page.click('.bag-place[data-bag-place=""]');
  await page.fill('[data-bag-search]', 'garage drill');
  await page.waitForFunction(() => document.querySelectorAll('#bag-results .bag-item').length === 1);
  check((await page.textContent('#bag-results')).includes('Garage › Shelf B'), '"garage drill" finds it, with its path');
  await page.fill('[data-bag-search]', 'kitchen drill');
  await page.waitForSelector('#bag-results .muted-box');
  check(true, 'a word that does not match finds nothing');
  await page.fill('[data-bag-search]', '');
  await page.dispatchEvent('[data-bag-search]', 'input');

  // Delete the Garage: the shelf and the drill on it stay.
  await page.click('.bag-place:has-text("Garage")');
  await page.click('[data-action="bag-edit-place"]');
  await page.click('[data-action="bag-remove-place"]');
  await page.waitForSelector('[data-dialog-button="ok"]');
  await page.click('[data-dialog-button="ok"]');
  await page.waitForFunction(() => ![...document.querySelectorAll('.bag-place')].some((b) => b.textContent.includes('Garage')));
  const shelf = page.locator('.bag-place').filter({ hasText: 'Shelf B' });
  check((await shelf.count()) === 1 && (await shelf.evaluate((el) => el.style.getPropertyValue('--depth').trim())) === '0', 'Shelf B moved up to the top level');
  await shelf.click();
  await page.waitForSelector('#bag-results .bag-item:has-text("Drill")');
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
