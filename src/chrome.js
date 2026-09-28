// The chrome around the views, per look (SPEC.md › Two looks). The views
// render the same markup in both; only the frame differs:
//   HUD (default) — ui-kit's app shell: the left sidebar of screens with hex
//     glyph icons and the sync status at its foot, the header with the view
//     title, gem points and level (a bottom bar on a phone, by CSS).
//   Game mode — the handheld lower screen: the status strip, the tab row of
//     original pixel icons, the framed text-box toasts.
// Pure HTML strings, so the tests render them under Node.

import { esc, fmtPts } from './util.js';
import { statusStrip, pixelIcon } from './ds.js';
import { modeSwitch } from './mode.js';

const LOADING = 'Loading…';

/** The page frame. Both carry #shell, #header, #nav and #view; Game mode also its toast host. */
export function shellHtml(mode) {
  if (mode === 'game') {
    return `<div class="ds" id="shell" data-shell="game">
    <div class="ds-screen" id="screen">
      <header class="ds-top" id="header"></header>
      <nav class="ds-tabs" id="nav" aria-label="Screens"></nav>
      <main class="ds-main" id="view" tabindex="-1"><div class="ds-boot">${LOADING}</div></main>
    </div>
    <div class="ds-toasts" id="toasts" role="status" aria-live="polite"></div>
  </div>`;
  }
  return `<div class="sc-shell flow-shell" id="shell" data-shell="hud">
    <aside class="sc-sidebar" id="sidebar">
      <div class="sc-brand">
        <span class="sc-brand-mark">FL</span>
        <div>
          <div class="sc-brand-name">Flow</div>
          <span class="sc-brand-sub">FASTER · BETTER</span>
        </div>
      </div>
      <nav class="sc-nav" id="nav" aria-label="Screens"></nav>
      <span class="sc-spacer"></span>
      <footer class="sc-sidebar-foot">
        <sc-sync-status style="flex: 1"></sc-sync-status>
      </footer>
    </aside>
    <main class="sc-main">
      <header class="sc-header" id="header"><h1 class="sc-header-title" id="view-title">Now</h1></header>
      <div class="sc-content" id="view" tabindex="-1"><div class="sc-boot sc-muted">${LOADING}</div></div>
    </main>
  </div>`;
}

/** The screens: sidebar items with hex glyphs (HUD) or the tab row with pixel icons (Game mode). */
export function navHtml(views, current, mode) {
  if (mode === 'game') {
    return views.map((v) => `
    <button type="button" class="ds-tab" data-go="${v.id}" data-view="${v.id}"${v.id === current ? ' aria-current="page"' : ''}>
      ${pixelIcon(v.id)}<span class="ds-tab-label">${esc(v.label)}</span>
    </button>`).join('');
  }
  return views.map((v) => `
    <button type="button" class="sc-nav-item${v.id === current ? ' is-active' : ''}" data-go="${v.id}" data-view="${v.id}"${v.id === current ? ' aria-current="page"' : ''}>
      <span class="sc-nav-icon" style="--tint: var(--sc-app)" aria-hidden="true">${esc(v.glyph || '•')}</span>
      <span class="sc-nav-label">${esc(v.label)}</span>
    </button>`).join('');
}

/** The header: title, switch, gem points and level (HUD); the status strip with the switch (Game mode). */
export function headerHtml(g, label, mode) {
  if (mode === 'game') {
    return `<h1 class="visually-hidden" id="view-title">${esc(label)}</h1>${statusStrip(g, { after: modeSwitch('game') })}`;
  }
  const debt = g.balance < 0;
  return `<h1 class="sc-header-title" id="view-title">${esc(label)}</h1>
    <span class="sc-spacer"></span>
    ${modeSwitch('hud')}
    <span class="sc-resource${debt ? ' is-debt' : ''}" title="Points balance${debt ? ' (in debt)' : ''}"><span class="sc-resource-icon"></span><span id="hdr-balance">${fmtPts(g.balance)}</span></span>
    <span class="sc-badge" id="hdr-level" title="Player level · difficulty ${esc(g.difficulty?.name || 'Push')}">LV ${g.player?.level ?? 1}</span>`;
}

/**
 * The HUD's status readout for the Terminal (SPEC.md › Terminal: stamina,
 * mana, points and level at the top): two kit meters, the gem counter and
 * the level badge.
 */
export function hudStatus(g) {
  const e = g.energy || {};
  const rated = !!e.rated;
  const meter = (label, cls, v) => `<span class="hud-stat"><span class="hud-stat-label">${label}</span><span class="sc-meter ${cls}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${rated ? v : 0}"${rated ? '' : ' aria-valuetext="not rated yet"'}><span style="--value: ${rated ? Math.max(0, Math.min(100, v * 10)) : 0}%"></span></span><span class="hud-stat-num num">${rated ? `${Math.round(v * 10) / 10}` : '–'}</span></span>`;
  return `<div class="hud-status">
    ${meter('Stamina', 'meter-stamina', e.stamina)}
    ${meter('Mana', 'meter-mana', e.mana)}
    <span class="sc-resource" title="Points balance${g.balance < 0 ? ' (in debt)' : ''}"><span class="sc-resource-icon"></span><span class="num" id="hdr-balance">${fmtPts(g.balance)}</span></span>
    <span class="sc-badge" id="hdr-level" title="Player level">LV ${g.player?.level ?? 1}</span>
  </div>`;
}

/** The Terminal's frame classes per look: the same four elements of terminal.html, dressed. */
export function terminalChrome(mode) {
  if (mode === 'game') return { shell: 'ds ds--terminal', screen: 'ds-screen', top: 'ds-top term-top', view: 'ds-main' };
  return { shell: 'term-shell', screen: 'term-screen', top: 'term-top', view: 'term-main' };
}
