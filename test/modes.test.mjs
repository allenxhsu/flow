// Two looks (SPEC.md › Two looks: the HUD by default, the handheld in Game
// mode): the sci-fi HUD is the look of every screen, the Terminal included;
// Game mode, a per-device switch remembered under `flow.mode`, turns on the
// handheld look. One markup, two themes: the chrome around the views renders
// per mode, the views themselves stay the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { play } from '../src/model.js';
import { MODES, MODE_KEY, DEFAULT_MODE, readMode, writeMode, applyMode, toggleMode, modeSwitch } from '../src/mode.js';
import { shellHtml, navHtml, headerHtml, terminalChrome } from '../src/chrome.js';
import { VIEWS } from '../src/views/index.js';
import * as settingsView from '../src/views/settings.js';
import * as screens from '../src/terminal/screens.js';
import { game, T } from './helpers.mjs';

const NOW = T('2026-09-28T12:00:00');
/** A Storage stand-in: getItem/setItem over a Map. */
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};
/** Storage that throws on every call: a sandboxed frame, blocked site data. */
const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
const rootEl = () => ({ dataset: {} });
const levelled = () => {
  const g = game();
  g.energy('2026-09-28T07:00:00', 7, 5);
  return play(g.records, NOW);
};

// ─── the switch and where it is remembered ─────────────────────────────────

test('mode: two looks, hud and game; the key is flow.mode and the default is the HUD', () => {
  assert.deepEqual(MODES, ['hud', 'game']);
  assert.equal(MODE_KEY, 'flow.mode');
  assert.equal(DEFAULT_MODE, 'hud');
});

test('mode: with nothing stored, no storage at all, storage that throws, or a junk value, Flow opens in the HUD', () => {
  assert.equal(readMode(memory()), 'hud');
  assert.equal(readMode(null), 'hud');
  assert.equal(readMode(undefined), 'hud');
  assert.equal(readMode(broken), 'hud');
  assert.equal(readMode(memory({ 'flow.mode': 'neon' })), 'hud');
  assert.equal(readMode(memory({ 'flow.mode': 'game' })), 'game');
  assert.equal(readMode(memory({ 'flow.mode': 'hud' })), 'hud');
});

test('mode: the choice is written per device under flow.mode and read back', () => {
  const s = memory();
  assert.equal(writeMode(s, 'game'), 'game');
  assert.equal(s.map.get('flow.mode'), 'game');
  assert.equal(readMode(s), 'game');
  assert.equal(writeMode(s, 'hud'), 'hud');
  assert.equal(readMode(s), 'hud');
  assert.equal(writeMode(s, 'nonsense'), 'hud', 'an unknown mode is the HUD');
  assert.equal(writeMode(broken, 'game'), 'game', 'a storage that throws still switches this page');
});

test('mode: applying a mode stamps data-mode on the root, which is what the CSS scopes by', () => {
  const root = rootEl();
  applyMode(root, 'game');
  assert.equal(root.dataset.mode, 'game');
  applyMode(root, 'hud');
  assert.equal(root.dataset.mode, 'hud');
  applyMode(root, 'bogus');
  assert.equal(root.dataset.mode, 'hud');
});

test('mode: toggling flips data-mode and persists; toggling again restores the HUD', () => {
  const s = memory();
  const root = rootEl();
  applyMode(root, readMode(s));
  assert.equal(root.dataset.mode, 'hud');
  assert.equal(toggleMode(s, root), 'game');
  assert.equal(root.dataset.mode, 'game');
  assert.equal(s.map.get('flow.mode'), 'game');
  assert.equal(readMode(s), 'game', 'remembered');
  assert.equal(toggleMode(s, root), 'hud');
  assert.equal(root.dataset.mode, 'hud');
  assert.equal(readMode(s), 'hud');
  const r2 = rootEl();
  applyMode(r2, 'hud');
  assert.equal(toggleMode(broken, r2), 'game', 'without storage the page still flips');
  assert.equal(r2.dataset.mode, 'game');
});

test('mode: the Game mode switch is a real switch that says whether it is on', () => {
  const off = modeSwitch('hud');
  assert.match(off, /<button[^>]*type="button"/);
  assert.match(off, /role="switch"/);
  assert.match(off, /aria-checked="false"/);
  assert.match(off, /data-mode-toggle/);
  assert.match(off, /Game mode/);
  assert.match(modeSwitch('game'), /aria-checked="true"/);
});

// ─── the chrome: the HUD sidebar and header, or the handheld strip and tabs ──

test('shell: the HUD is the left sidebar (brand, screens, sync status at its foot) and a header over the view', () => {
  const html = shellHtml('hud');
  assert.match(html, /id="shell"[^>]*data-shell="hud"|data-shell="hud"[^>]*id="shell"/);
  assert.match(html, /class="sc-shell[^"]*"/);
  assert.match(html, /<aside class="sc-sidebar"/);
  assert.match(html, /class="sc-brand"/);
  assert.match(html, /<nav class="sc-nav" id="nav"/);
  assert.match(html, /class="sc-sidebar-foot"[\s\S]*<sc-sync-status/);
  assert.match(html, /<header class="sc-header" id="header"/);
  assert.match(html, /id="view"/);
  assert.doesNotMatch(html, /ds-strip|ds-tabs|ds-screen/);
});

test('shell: Game mode is the handheld lower screen: the strip, the tab row, the view and the text-box toasts', () => {
  const html = shellHtml('game');
  assert.match(html, /data-shell="game"/);
  assert.match(html, /class="ds"/);
  assert.match(html, /class="ds-screen"/);
  assert.match(html, /<header class="ds-top" id="header"/);
  assert.match(html, /<nav class="ds-tabs" id="nav"/);
  assert.match(html, /class="ds-main" id="view"/);
  assert.match(html, /class="ds-toasts" id="toasts"/);
  assert.doesNotMatch(html, /sc-sidebar/);
});

test('nav in the HUD: one sidebar item per screen with its label and a hex glyph icon, the current one lit', () => {
  const html = navHtml(VIEWS, 'skills', 'hud');
  const items = [...html.matchAll(/<button[^>]*class="sc-nav-item([^"]*)"[^>]*data-go="([a-z]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(items.map((m) => m[2]), VIEWS.map((v) => v.id));
  for (const [, cls, id, body] of items) {
    const v = VIEWS.find((x) => x.id === id);
    assert.match(body, /<span class="sc-nav-icon"[^>]*>[^<]+<\/span>/, `${id} has a glyph in a hex`);
    assert.match(body, new RegExp(`<span class="sc-nav-label">${v.label}</span>`));
    assert.equal(cls.includes('is-active'), id === 'skills', `${id} lit only when current`);
  }
  assert.match(html, /data-go="skills"[^>]*aria-current="page"|aria-current="page"[^>]*data-go="skills"/);
  assert.doesNotMatch(html, /px-icon|ds-tab/, 'no pixel icons in the HUD');
  for (const v of VIEWS) assert.equal(typeof v.glyph, 'string', `${v.id} has a HUD glyph`);
});

test('nav in Game mode: the handheld tab row, a big button per screen with its original pixel icon', () => {
  const html = navHtml(VIEWS, 'bag', 'game');
  const tabs = [...html.matchAll(/<button[^>]*class="ds-tab"[^>]*data-go="([a-z]+)"[^>]*>([\s\S]*?)<\/button>/g)];
  assert.deepEqual(tabs.map((m) => m[1]), VIEWS.map((v) => v.id));
  for (const [, id, body] of tabs) {
    assert.match(body, /<svg class="px-icon"/, `${id} has a pixel icon`);
    assert.match(body, new RegExp(`class="ds-tab-label">${VIEWS.find((v) => v.id === id).label}<`));
  }
  assert.match(html, /data-go="bag"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /sc-nav-item/);
});

test('header in the HUD: the view title, the Game mode switch, gem points and level — no status strip', () => {
  const g = levelled();
  const html = headerHtml(g, 'Skills', 'hud');
  assert.match(html, /<h1 class="sc-header-title" id="view-title">Skills<\/h1>/);
  assert.match(html, /role="switch"[^>]*aria-checked="false"|aria-checked="false"[^>]*role="switch"/);
  assert.match(html, /class="sc-resource"[\s\S]*id="hdr-balance"[^>]*>0</);
  assert.match(html, /class="sc-badge"[^>]*id="hdr-level"[^>]*>LV 1</);
  assert.doesNotMatch(html, /ds-strip|class="heart/);
});

test('header in Game mode: the status strip (hearts, magic bar, gem, level) and the switch, on', () => {
  const g = levelled();
  const html = headerHtml(g, 'Skills', 'game');
  assert.match(html, /id="view-title"[^>]*>Skills</);
  assert.match(html, /class="ds-strip"/);
  assert.match(html, /class="heart (full|half|empty)"/);
  assert.match(html, /id="strip-gem"/);
  assert.match(html, /id="strip-level"[^>]*>LV 1</);
  assert.match(html, /role="switch"[^>]*aria-checked="true"|aria-checked="true"[^>]*role="switch"/);
  assert.doesNotMatch(html, /sc-header-title|hdr-balance/);
});

test('index.html opens in the HUD: data-mode="hud" before any script, the static shell is the sidebar, flow.mode read before paint', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]*data-mode="hud"/);
  assert.match(html, /<aside class="sc-sidebar"/);
  assert.match(html, /flow\.mode/);
  assert.match(html, /theme-picker\.js/, 'the HUD palette picker is back in Settings');
});

// ─── Settings and the Terminal carry the same switch ───────────────────────

const settingsStore = () => ({
  getSettings: () => ({ url: '', token: '', enabled: false }), syncStatus: () => ({ phase: 'idle' }), inPortal: () => false,
  plannerStatus: () => ({ configured: false, plans: 0, tasks: 0 }), plannerSettingsNow: () => ({ url: '', token: '' }),
  deviceId: () => 'dev1', storeKind: () => 'memory', allRecords: () => [], persistence: () => 'unknown',
});

test('Settings: an Appearance section with the Game mode switch, off in the HUD and on in Game mode', () => {
  const g = game();
  const base = { db: g.db(), g: play(g.records, NOW), now: NOW, ui: {}, store: settingsStore() };
  const hud = settingsView.render({ ...base, mode: 'hud' });
  const section = /<section[^>]*id="appearance"[\s\S]*?<\/section>/.exec(hud)?.[0];
  assert.ok(section, 'an Appearance section');
  assert.match(section, /data-mode-toggle[^>]*|role="switch"/);
  assert.match(section, /aria-checked="false"/);
  assert.match(section, /<sc-theme-picker/, 'the HUD palette picker, in the HUD');
  const gm = settingsView.render({ ...base, mode: 'game' });
  assert.match(/<section[^>]*id="appearance"[\s\S]*?<\/section>/.exec(gm)[0], /aria-checked="true"/);
  assert.match(settingsView.render(base), /id="appearance"[\s\S]*aria-checked="false"/, 'no mode given is the HUD');
});

const termState = (mode) => {
  const g0 = game();
  g0.energy('2026-09-28T07:00:00', 7, 5);
  return { db: g0.db(), g: play(g0.records, NOW), now: NOW, projects: [], ui: {}, mode };
};

test('Terminal in the HUD: stamina and mana meters, points and level, I’m tired — no handheld strip', () => {
  const html = screens.top(termState('hud'));
  assert.doesNotMatch(html, /ds-strip|class="heart/);
  assert.match(html, /role="meter"[^>]*aria-label="Stamina"[^>]*aria-valuenow="7"/);
  assert.match(html, /role="meter"[^>]*aria-label="Mana"[^>]*aria-valuenow="5"/);
  assert.match(html, /class="sc-resource"/);
  assert.match(html, /LV 1/);
  assert.match(html, /data-action="tired"/);
  assert.match(screens.top(termState()), /class="sc-resource"/, 'no mode given is the HUD');
});

test('Terminal in Game mode: the handheld status strip', () => {
  const html = screens.top(termState('game'));
  assert.match(html, /class="ds-strip"/);
  assert.match(html, /data-action="tired"/);
});

test('Terminal: its Settings sheet carries the Game mode switch', () => {
  assert.match(screens.settingsSheet({ ...termState('hud'), settings: {} }), /data-mode-toggle[\s\S]*?aria-checked="false"|aria-checked="false"[\s\S]*?data-mode-toggle/);
  assert.match(screens.settingsSheet({ ...termState('game'), settings: {} }), /aria-checked="true"/);
});

test('Terminal: the page opens in the HUD, and its frame takes the look of the mode', () => {
  const html = readFileSync(new URL('../terminal.html', import.meta.url), 'utf8');
  assert.match(html, /<html[^>]*data-mode="hud"/);
  assert.match(html, /flow\.mode/);
  const hud = terminalChrome('hud');
  const gm = terminalChrome('game');
  for (const k of ['shell', 'screen', 'top', 'view']) assert.equal(typeof hud[k], 'string', k);
  assert.doesNotMatch(Object.values(hud).join(' '), /\bds\b|ds-screen|ds-main/);
  assert.match(gm.shell, /\bds\b/);
  assert.match(gm.shell, /ds--terminal/);
  assert.match(gm.screen, /ds-screen/);
  assert.match(gm.view, /ds-main/);
});

// ─── the stylesheets: one markup, two themes ───────────────────────────────

test('styles: shared CSS imports the HUD and the handheld sheets, every rule of each scoped by data-mode', () => {
  const main = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(main, /@import url\(['"]?\.\/hud\.css['"]?\)/);
  assert.match(main, /@import url\(['"]?\.\/game\.css['"]?\)/);
  for (const [file, mode] of [['hud.css', 'hud'], ['game.css', 'game']]) {
    const css = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Every selector list outside @keyframes names the mode it belongs to.
    const body = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [...body.matchAll(/(?:^|[;{}])\s*([^;{}@\s][^;{}]*?)\s*\{/g)].map((m) => m[1].trim()).filter(Boolean);
    assert.ok(selectors.length > 20, `${file} has rules`);
    for (const sel of selectors) {
      for (const part of sel.split(/,(?![^(]*\))/)) assert.match(part.trim(), new RegExp(`^:root\\[data-mode='${mode}'\\]`), `${file}: "${part.trim()}" is scoped`);
    }
    assert.doesNotMatch(css, /(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}\//i, `${file} loads nothing from another origin`);
  }
});
