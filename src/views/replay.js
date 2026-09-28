// Replay: the same game as Play, in fast forward over a chosen day's records
// (SPEC.md › Play, "One game, two clocks", and › Day Replay). The hero walks
// the day's events in order through the same world — the generic one or the
// player's pack — on Day Replay's own timeline: 1×/2×, skip to the finale, a
// scrubber, the day picker, and a list of places to jump to. Input is off.

import { replayDay, index } from '../model.js';
import { esc } from '../util.js';
import { worldFor } from '../game/world.js';
import { gameClock } from '../game/clock.js';
import { SCREEN_HTML, injectGameStyle, loadThree } from '../game/screen.js';
import { eventsByPlace, energyMarks, mmss, minutesText } from '../replay/schedule.js';

/** The replay keeps its own canvas and clock: a background re-render must not restart it. */
export const stable = true;

export function render(ctx) {
  const day = ctx.ui.replayDay || ctx.g.day;
  const days = [...new Set([ctx.g.day, ...ctx.db.done.map((d) => d.day), ...ctx.db.moments.map((m) => m.day)])].sort().reverse().slice(0, 30);
  return `<div class="view">
    <div class="row-between"><h2>Day replay</h2>
      <label class="row small"><span class="sc-label">Day</span><select class="sc-select" data-replay-day style="width:auto">${days.map((d) => `<option ${d === day ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label></div>
    <div id="replay-root" class="play" data-mode="replay" data-day="${esc(day)}">
      ${SCREEN_HTML.replace('<div class="play-pop"', '<div class="play-finale play-frame" id="play-finale" hidden></div><div class="play-pop"')}
      <div class="play-lower">
        <div class="play-controls" role="group" aria-label="Replay controls">
          <button type="button" data-act="play" aria-label="Play">▶</button>
          <button type="button" data-act="speed" aria-label="Speed" aria-pressed="false">1×</button>
          <button type="button" data-act="skip" aria-label="Skip to the finale">Skip ⏭</button>
          <input type="range" data-act="scrub" min="0" max="100" step="0.1" value="0" aria-label="Scrub through the day">
          <span class="play-note" data-time>0:00</span>
        </div>
        <div class="play-places" data-places></div>
      </div>
    </div>
  </div>`;
}

function finaleHtml(screen, story) {
  const f = story.finale;
  if (screen === 'totals') return `<h3>THE DAY · ${esc(story.day)}</h3><ul><li>+${f.points} points earned${f.spent ? `, −${f.spent} spent` : ''}</li><li>${f.tasks} tasks · ${f.moments} moments${f.reworks ? ` · ${f.reworks} rework` : ''}</li><li>Best combo ×${f.bestCombo || 0}${f.bestBatch ? ` · batch ×${f.bestBatch}` : ''}</li><li>Level ${f.level} · balance ${f.balance}</li></ul>`;
  if (screen === 'energy') {
    const marks = energyMarks(story.series);
    return `<h3>ENERGY</h3><ul>${marks.map((m) => `<li>${esc(m.label)}: stamina ${m.stamina > 0 ? '+' : ''}${m.stamina}, mana ${m.mana > 0 ? '+' : ''}${m.mana}</li>`).join('') || '<li>Steady all day.</li>'}</ul>`;
  }
  if (screen === 'time') return `<h3>WHERE TIME WENT</h3><ul>${f.zones.map((z) => `<li>${esc(z.zone)}: ${minutesText(z.minutes)}</li>`).join('') || '<li>Nothing logged.</li>'}<li>travel ${minutesText(f.travel)} · idle ${minutesText(f.idle)}</li></ul>`;
  return `<h3>TOMORROW</h3><p>${f.tomorrow ? `First: ${esc(f.tomorrow.title)}` : 'Nothing waiting. Rest.'}</p>`;
}

let running = null;

export async function mounted(view, ctx) {
  const doc = view.ownerDocument;
  injectGameStyle(doc);
  const root = view.querySelector('#replay-root');
  if (!root) return;
  running?.stop();
  const day = root.dataset.day;
  const records = ctx.store.allRecords();
  const story = replayDay(records, day, { now: Date.now() });
  let clock = gameClock('replay', { story, day });
  let playing = false;
  const $ = (s) => root.querySelector(s);
  const scrub = $('[data-act="scrub"]');
  scrub.max = String(clock.duration);
  const THREE = await loadThree(doc);
  if (!root.isConnected) return;
  const { createGame } = await import('../game/engine.js');
  const db = index(records);
  const game = createGame(root, {
    world: worldFor(db), mode: 'replay', THREE, hero: db.settings.hero || {}, name: db.settings.name || 'You',
    status: () => ({ stamina: clock.hud.stamina, mana: clock.hud.mana, points: clock.hud.points, clock: clock.clock, dark: clock.dark }),
    replay: () => clock,
  });

  const finale = $('#play-finale');
  let shown = null;
  const paint = () => {
    scrub.value = String(clock.t);
    $('[data-time]').textContent = `${mmss(clock.t)} / ${mmss(clock.duration)}`;
    const key = clock.intro ? 'intro' : clock.finale;
    if (key !== shown) {
      shown = key;
      if (clock.intro) { finale.innerHTML = `<h3>DAY REPLAY</h3><p>${esc(day)} · ${story.beats.filter((b) => ['done', 'moment', 'rework', 'purchase'].includes(b.kind)).length} events</p>`; finale.hidden = false; }
      else if (clock.finale) { finale.innerHTML = finaleHtml(clock.finale, story); finale.hidden = false; }
      else finale.hidden = true;
    }
  };
  let last = performance.now();
  let raf = 0;
  const tick = (now) => {
    if (!root.isConnected) { stop(); return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (playing) { clock = clock.step(dt); if (clock.ended) setPlaying(false); }
    paint();
    raf = doc.defaultView.requestAnimationFrame(tick);
  };
  const setPlaying = (on) => { playing = on; const b = $('[data-act="play"]'); b.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', on ? 'Pause' : 'Play'); };
  function stop() { doc.defaultView.cancelAnimationFrame(raf); game.destroy(); }
  running = { stop };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'play') { if (clock.ended) clock = clock.seek(0); setPlaying(!playing); }
    else if (act === 'speed') { clock = clock.setSpeed(clock.speed === 1 ? 2 : 1); b.textContent = `${clock.speed}×`; b.setAttribute('aria-pressed', clock.speed === 2 ? 'true' : 'false'); }
    else if (act === 'skip') { clock = clock.skip(); setPlaying(true); }
    else if (act === 'seek') { clock = clock.seek(Number(b.dataset.t)); }
  });
  scrub.addEventListener('input', () => { clock = clock.seek(Number(scrub.value)); });
  // Tap a place to list what happened there, and jump to it.
  const places = [...eventsByPlace(story).values()];
  const segs = clock.timeline.segments;
  $('[data-places]').innerHTML = places.map((p) => {
    const first = segs.find((s) => s.type === 'beat' && s.beat.place === p.id && s.beat.kind !== 'walk');
    return `<button type="button" data-act="seek" data-t="${first ? first.t0 + 0.01 : 0}" title="${esc(p.beats.map((b) => b.text).join(' · '))}">${esc(p.name)} ×${p.beats.length}</button>`;
  }).join('');
  raf = doc.defaultView.requestAnimationFrame(tick);
  setPlaying(true);
}

export function onChange(ev, ctx) {
  if (!ev.target.matches('[data-replay-day]')) return;
  ctx.ui.replayDay = ev.target.value;
  ctx.render({ force: true });
}
