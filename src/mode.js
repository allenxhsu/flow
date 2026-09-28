// The two looks (SPEC.md › Two looks): the sci-fi HUD by default, the
// handheld look in Game mode. The choice is per device, under `flow.mode`,
// and lives on <html data-mode>, which is what src/hud.css and src/game.css
// scope every rule by. Storage may be missing or throw (a sandboxed frame,
// blocked site data): then the page opens in the HUD and still switches.

import { esc } from './util.js';

export const MODES = ['hud', 'game'];
export const MODE_KEY = 'flow.mode';
export const DEFAULT_MODE = 'hud';

const valid = (m) => (MODES.includes(m) ? m : DEFAULT_MODE);

/** The remembered look, or the HUD. */
export function readMode(storage) {
  try { return valid(storage?.getItem(MODE_KEY)); } catch { return DEFAULT_MODE; }
}

/** Remember a look; returns the look in effect even when it cannot be saved. */
export function writeMode(storage, mode) {
  const m = valid(mode);
  try { storage?.setItem(MODE_KEY, m); } catch { /* not remembered, still switched */ }
  return m;
}

/** Stamp the look on the root element. */
export function applyMode(root, mode) {
  const m = valid(mode);
  if (root?.dataset) root.dataset.mode = m;
  return m;
}

/** Flip the look on the root, remember it, and return it. */
export function toggleMode(storage, root) {
  const next = root?.dataset?.mode === 'game' ? 'hud' : 'game';
  writeMode(storage, next);
  return applyMode(root, next);
}

/** The Game mode switch, in the header and in Settings. Clicks are handled by the page (data-mode-toggle). */
export function modeSwitch(mode, { id = '' } = {}) {
  const on = valid(mode) === 'game';
  return `<button type="button" class="mode-switch" role="switch" aria-checked="${on}" data-mode-toggle${id ? ` id="${esc(id)}"` : ''} title="${on ? 'Game mode is on: the handheld look. Switch back to the HUD.' : 'Game mode: the handheld look'}"><span class="mode-switch-track" aria-hidden="true"><span class="mode-switch-thumb"></span></span><span class="mode-switch-label">Game mode</span></button>`;
}
