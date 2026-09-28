// The online build (GitHub Pages): the same static app the Portal serves, plus
// what an iPhone needs to keep it as a home-screen app that works offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = mkdtempSync(join(tmpdir(), 'flow-pages-'));
execFileSync(process.execPath, [join(root, 'tools/pages.mjs'), out], { cwd: root });
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const list = files(out).map((f) => relative(out, f));

test('the site carries the app and nothing else', () => {
  for (const f of ['index.html', 'src/app.js', 'src/model.js', 'ui-kit/js/theme.js', 'sync-kit/js/index.js']) assert.ok(list.includes(f), f);
  for (const f of list) assert.doesNotMatch(f, /^(test|cli|docs|e2e|skills|tools|ios)\/|^(SPEC|CLAUDE|README)\.md$|\.test\./, f);
});

test('index.html is an installable home-screen app', () => {
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/icon-180\.png">/);
  assert.match(html, /serviceWorker\.register\('sw\.js'\)/);
  const m = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Flow');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  for (const size of [180, 192, 512]) assert.ok(existsSync(join(out, `icons/icon-${size}.png`)), `icon ${size}`);
});

test('the service worker precaches every file, so it opens offline', () => {
  const sw = readFileSync(join(out, 'sw.js'), 'utf8');
  for (const f of list.filter((f) => f !== 'sw.js')) assert.ok(sw.includes(JSON.stringify('./' + f)), f);
});
