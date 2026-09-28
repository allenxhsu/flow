// End-to-end check of the bookshelf in Play (SPEC.md › The bookshelf) and the
// Bag's item panel, in Chromium at phone width and on a desktop.
//
//   ./serve.sh 8201 &
//   node e2e/bookshelf-e2e.mjs      # SHOTS=dir to keep screenshots
//
// Files two bookcases of books, walks the hero across the generic home to the
// shelf, presses A, picks a bookcase, a shelf and a book; reshelves a book
// there (it moves); then gives a book its details and a photo in the Bag.
// Fails on any console error or horizontal overflow.
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
const expected = (text) => /Failed to load resource.*404/.test(text) || /WebGL|GPU stall|THREE\./i.test(text);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

const overflow = (page) => page.evaluate(() => {
  const view = document.querySelector('#view');
  return document.documentElement.scrollWidth > window.innerWidth + 1 || (view && view.scrollWidth > view.clientWidth + 1);
});
const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/shelf-${name}.png` });
};
const menu = (page) => page.textContent('#play-menu');

/** One step at a time, the way a thumb does it: press, let the walk finish. */
async function walk(page, steps) {
  const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  for (const [dir, n] of steps) for (let k = 0; k < n; k++) { await page.keyboard.down(key[dir]); await page.waitForTimeout(90); await page.keyboard.up(key[dir]); await page.waitForTimeout(260); }
}

async function run(browser, { width, height, label }) {
  console.log(`bookshelf at ${label}`);
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !expected(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(APP);
  await page.waitForSelector('#view .view');

  // Two bookcases with shelves, and books on them, through the app's own store.
  const ids = await page.evaluate(async () => {
    const store = await import('./src/sync.js');
    const M = await import('./src/model.js');
    const { materialize } = await import('./src/util.js');
    await store.save(materialize('place', store.allRecords()));
    const put = async (make) => { const r = make(store.db()); await store.save(r); return r; };
    const b1 = await put((db) => M.makePlace(db, { name: 'Bookcase 1', zone: 'home' }));
    const s1 = await put((db) => M.makePlace(db, { name: 'Shelf 1 (top)', parent: b1.id }));
    const s2 = await put((db) => M.makePlace(db, { name: 'Shelf 2', parent: b1.id }));
    const b3 = await put((db) => M.makePlace(db, { name: 'Bookcase 3', zone: 'home' }));
    const clrs = await put((db) => M.makeItem(db, { name: 'Introduction to Algorithms', brand: 'Cormen', category: 'Books', place: s1.id, notes: 'Dewey 005.1 · Reference & study' }));
    await put((db) => M.makeItem(db, { name: 'Design Patterns', brand: 'Gamma', category: 'Books', place: s1.id }));
    await put((db) => M.makeItem(db, { name: 'Optics', brand: 'Hecht', category: 'Books', place: s2.id }));
    await put((db) => M.makeItem(db, { name: 'Emma 1', brand: 'Kaoru Mori', category: 'Books', place: b3.id }));
    await put((db) => M.makeReshelve(db, { name: 'Dewey', moves: [{ item: clrs.id, to: s2.id, call: '005.1' }] }));
    return { b1: b1.id, s1: s1.id, s2: s2.id, clrs: clrs.id };
  });

  // Play: from the start spot to the living-room shelf.
  await page.evaluate(() => { localStorage.setItem('flow.view', 'play'); });
  await page.reload();
  await page.waitForSelector('#play-screen');
  await page.waitForTimeout(1200);
  await walk(page, [['down', 1], ['right', 5], ['up', 2], ['right', 3], ['up', 1]]);
  await page.keyboard.press('Space');
  await page.waitForSelector('#play-menu', { timeout: 5000 }).catch(() => {});
  check((await page.isVisible('#play-menu')) && /WHICH BOOKCASE\?/.test(await menu(page)), 'pressing A at the shelf asks which bookcase');
  await shot(page, `${label}-which`);
  await page.click('#play-menu [data-action="shelf-case"]:has-text("Bookcase 1")');
  check(/BOOKCASE 1[\s\S]*Shelf 1 \(top\)[\s\S]*Shelf 2/.test(await menu(page)), 'its shelves, with how many are on each');
  await page.click(`#play-menu [data-action="shelf-row"][data-place="${ids.s1}"]`);
  check(/Design Patterns[\s\S]*Introduction to Algorithms/.test(await menu(page)), 'a shelf lists its books');
  await page.click(`#play-menu [data-action="shelf-book"][data-item="${ids.clrs}"]`);
  check(/Introduction to Algorithms[\s\S]*Cormen[\s\S]*Bookcase 1 › Shelf 1 \(top\)[\s\S]*Dewey 005\.1/.test(await menu(page)), 'a book: title, author, where, call number');
  await shot(page, `${label}-book`);

  // Reshelve at the shelf: shelving moves the book.
  await page.click('#play-menu [data-action="shelf-back"]');
  await page.click('#play-menu [data-action="shelf-back"]');
  check(/RESHELVE 0\/1 shelved/.test(await menu(page)), 'the bookcase offers the active plan');
  await page.click('#play-menu [data-action="shelf-reshelve"]');
  await page.click('#play-menu [data-action="rs-mode"][data-mode="shelve"]');
  await page.click(`#play-menu [data-action="rs-group"][data-place="${ids.s2}"]`);
  await page.click(`#play-menu [data-action="rs-tick"][data-item="${ids.clrs}"]`);
  await page.waitForFunction(() => document.querySelector('#play-menu')?.textContent.includes('✓'));
  const at = await page.evaluate(async (id) => (await import('./src/sync.js')).db().item.get(id).place, ids.clrs);
  check(at === ids.s2, 'ticking it shelved moves the book to Shelf 2');
  await page.keyboard.press('Escape');
  check(!(await overflow(page)), `${label} Play: no horizontal overflow`);

  // The Bag: the item panel carries the details and a photo.
  await page.evaluate(() => { localStorage.setItem('flow.view', 'bag'); });
  await page.reload();
  await page.waitForSelector('#stashes');
  await page.click('#stashes .cell:has-text("Optics")');
  await page.fill('#item-edit-form [name=serial]', 'ISBN 9780133977226');
  await page.click('#item-edit-form [type=submit]');
  await page.waitForTimeout(300);
  if (!(await page.isVisible('#item-detail'))) await page.click('#stashes .cell:has-text("Optics")');
  await page.setInputFiles('#item-detail [data-upload="photo"]', { name: 'cover.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('#item-detail .bag-photos img');
  check((await page.inputValue('#item-detail [name=serial]')) === 'ISBN 9780133977226', 'the Bag keeps a book’s details');
  check((await page.getAttribute('#item-detail .bag-photos img', 'src')).startsWith('data:image/jpeg;base64,'), 'and its photo, as a JPEG');
  check((await page.locator('#stashes .bag-place, #reshelve').count()) === 0, 'the Bag has no bookcase browser or reshelve panel');
  check(!(await overflow(page)), `${label} Bag: no horizontal overflow`);
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
