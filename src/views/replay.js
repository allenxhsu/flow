// Replay: the day as a 90s top-down adventure. The renderer is its own module
// (src/replay/index.js, exporting mountReplay(el, replayDay(...))) built
// separately; this view hands it a day and a <div id="replay-root"> to draw in,
// and shows a placeholder until it exists.

import { replayDay } from '../model.js';
import { esc } from '../util.js';

/** The replay keeps its own canvas and clock: a background re-render must not restart it. */
export const stable = true;

let loader = null;
function loadRenderer() {
  loader ||= import('../replay/index.js').then((m) => (typeof m.mountReplay === 'function' ? m : null)).catch(() => null);
  return loader;
}

export function render(ctx) {
  const day = ctx.ui.replayDay || ctx.g.day;
  const days = [...new Set([ctx.g.day, ...ctx.db.done.map((d) => d.day), ...ctx.db.moments.map((m) => m.day)])].sort().reverse().slice(0, 30);
  return `<div class="view">
    <div class="row-between"><h2>Day replay</h2>
      <label class="row small"><span class="sc-label">Day</span><select class="sc-select" data-replay-day style="width:auto">${days.map((d) => `<option ${d === day ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label></div>
    <div id="replay-root" class="replay-root sc-panel pad" data-day="${esc(day)}">
      <div class="muted-box" id="replay-placeholder">
        <p style="margin:0 0 8px"><b>The replay renderer plugs in here.</b></p>
        <p class="small" style="margin:0">It is a separate module, <span class="sc-mono">src/replay/index.js</span>, exporting <span class="sc-mono">mountReplay(el, replayDay(records, day))</span> — original 16-colour pixel art, one beat per event, 1×/2×/skip and a scrubber. Until it is here, this is the day in words.</p>
      </div>
    </div>
  </div>`;
}

function beatsList(story) {
  if (!story.beats.length) return '<div class="small sc-faint">Nothing happened on this day yet.</div>';
  const t = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `<div class="list small">${story.beats.filter((b) => b.kind !== 'idle').map((b) => `<div class="row"><span class="num sc-faint">${t(b.start)}</span><span>${esc(b.text)}</span></div>`).join('')}</div>
    <p class="small sc-muted">Tomorrow first: ${esc(story.finale.tomorrow?.title || '—')} · ${story.finale.points} pts · ${story.finale.tasks} tasks · ${story.finale.moments} moments</p>`;
}

export async function mounted(view, ctx) {
  const root = view.querySelector('#replay-root');
  if (!root) return;
  const day = root.dataset.day;
  const story = replayDay(ctx.store.allRecords(), day, { now: Date.now() });
  const mod = await loadRenderer();
  if (!root.isConnected) return;
  if (mod) {
    root.innerHTML = '';
    try { mod.mountReplay(root, story, { sound: !!ctx.db.settings.sound }); } catch (err) { console.warn(err); root.innerHTML = `<div class="sc-alert sc-alert--danger"><strong>Replay failed</strong> ${esc(err.message)}</div>`; }
  } else {
    root.insertAdjacentHTML('beforeend', `<div class="stack" style="margin-top:12px">${beatsList(story)}</div>`);
  }
}

export function onChange(ev, ctx) {
  if (!ev.target.matches('[data-replay-day]')) return;
  ctx.ui.replayDay = ev.target.value;
  ctx.render({ force: true });
}

