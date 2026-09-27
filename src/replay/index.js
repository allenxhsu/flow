// flow/src/replay/index.js — the Day Replay: an end-of-day replay drawn as a
// 16-bit top-down adventure. Mount it on an element with the result of
// model.js's replayDay(records, day):
//
//   const r = mountReplay(el, replayDay(records, day), { sound: false, onPlace });
//   r.play(); r.pause(); r.seek(12.5); r.setSpeed(2); r.skip(); r.destroy();
//
// `schedule(replay)` is the pure timeline behind it (seconds), for tests.

import { schedule, segmentAt, eventsByPlace, clockText, mmss, isEvent } from './schedule.js';
import { buildWorld, BUILDINGS, TILE, PARKING } from './world.js';
import { planReplay, resolvePlaces } from './plan.js';
import { createRenderer, SCREEN_W, SCREEN_H } from './render.js';
import { createSound } from './sound.js';

export { schedule, segmentAt, heartsFor, outfitFor, bannersFor, energyMarks, eventsByPlace, TIMING } from './schedule.js';
export { planReplay, resolvePlaces } from './plan.js';
export { buildWorld } from './world.js';

const STYLE = `
.flow-replay{--fr-ink:#1c1a2e;--fr-slate:#3c3f5a;--fr-chalk:#f6f3e9;--fr-sun:#f5d74c;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;max-width:100%;box-sizing:border-box;color:var(--fr-chalk);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
.flow-replay *{box-sizing:border-box}
.flow-replay .fr-stage{display:flex;justify-content:center;width:100%;outline:none}
.flow-replay canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;background:var(--fr-ink);border-radius:4px;cursor:pointer;touch-action:manipulation}
.flow-replay .fr-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;width:100%;max-width:560px;padding:8px;background:var(--fr-ink);border-radius:8px}
.flow-replay button{min-height:36px;min-width:44px;padding:4px 10px;border:1px solid var(--fr-slate);border-radius:6px;background:#2a2940;color:var(--fr-chalk);font:inherit;cursor:pointer}
.flow-replay button:hover{border-color:var(--fr-sun)}
.flow-replay button:focus-visible,.flow-replay input:focus-visible,.flow-replay .fr-stage:focus-visible{outline:2px solid var(--fr-sun);outline-offset:2px}
.flow-replay button[aria-pressed="true"]{background:#4a4230;border-color:var(--fr-sun)}
.flow-replay .fr-scrub{flex:1 1 160px;min-width:120px;accent-color:var(--fr-sun)}
.flow-replay .fr-time{min-width:84px;text-align:center;font-variant-numeric:tabular-nums;color:#c5c9d8}
.flow-replay .fr-place{width:100%;max-width:560px;padding:10px 12px;background:var(--fr-ink);border:1px solid var(--fr-slate);border-radius:8px}
.flow-replay .fr-place[hidden]{display:none}
.flow-replay .fr-place header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.flow-replay .fr-place h3{margin:0;font-size:15px;color:var(--fr-sun)}
.flow-replay .fr-place header span{color:#9aa0b8;font-size:12px;text-transform:capitalize}
.flow-replay .fr-place header button{margin-left:auto;min-height:28px}
.flow-replay .fr-place ol{margin:0;padding:0;list-style:none}
.flow-replay .fr-place li button{display:flex;gap:10px;width:100%;min-height:32px;text-align:left;border:0;background:none;padding:4px 2px;border-radius:4px}
.flow-replay .fr-place li button:hover{background:#2a2940}
.flow-replay .fr-place li time{color:#9aa0b8;font-variant-numeric:tabular-nums}
.flow-replay .fr-place p{margin:0;color:#9aa0b8}
`;

function injectStyle(doc) {
  if (doc.getElementById('flow-replay-style')) return;
  const s = doc.createElement('style');
  s.id = 'flow-replay-style';
  s.textContent = STYLE;
  doc.head.appendChild(s);
}

/** The top skills of the day, as HUD item slots with an icon for where they happened. */
function topItems(replay, places) {
  const by = new Map();
  for (const b of replay.beats || []) {
    if (b.kind !== 'done' || !b.skill) continue;
    const e = by.get(b.skill) || { skill: b.skill, points: 0, place: b.place };
    e.points += b.points || 0;
    by.set(b.skill, e);
  }
  return [...by.values()].sort((a, b) => b.points - a.points).slice(0, 2).map((e) => {
    const p = places.get(e.place ?? null);
    return { skill: e.skill, icon: p?.car ? 'car' : p?.building?.icon || 'pin' };
  });
}

/**
 * Mount the replay in `element`. Returns controls: play, pause, seek(seconds),
 * setSpeed(1|2), skip (to the finale), destroy. `onPlace(place)` is called
 * with { id, name, zone, beats } when a place on the map is tapped.
 */
export function mountReplay(element, replay, { sound = false, onPlace } = {}) {
  const doc = element.ownerDocument || document;
  const win = doc.defaultView || globalThis;
  injectStyle(doc);
  replay = replay || { beats: [], series: [], finale: {} };
  const timeline = schedule(replay);
  const world = buildWorld();
  const places = resolvePlaces(replay);
  const plan = planReplay(replay, timeline, world);
  const byPlace = eventsByPlace(replay);

  const root = doc.createElement('div');
  root.className = 'flow-replay';
  root.innerHTML = `
    <div class="fr-stage" tabindex="0" aria-label="Day replay. Space plays or pauses.">
      <canvas width="${SCREEN_W}" height="${SCREEN_H}" role="img" aria-label="Day replay"></canvas>
    </div>
    <div class="fr-controls">
      <button type="button" data-act="play" aria-label="Play">▶ Play</button>
      <button type="button" data-act="speed" aria-label="Speed" aria-pressed="false">1×</button>
      <button type="button" data-act="skip" aria-label="Skip to the finale">Skip ⏭</button>
      <input class="fr-scrub" type="range" min="0" max="${timeline.total}" step="0.1" value="0" aria-label="Scrub through the day">
      <span class="fr-time" aria-live="off">0:00 / ${mmss(timeline.total)}</span>
      <button type="button" data-act="sound" aria-pressed="${sound ? 'true' : 'false'}">♪ ${sound ? 'On' : 'Off'}</button>
    </div>
    <section class="fr-place" hidden aria-live="polite"></section>`;
  element.appendChild(root);
  const $ = (sel) => root.querySelector(sel);
  const canvas = $('canvas');
  const stage = $('.fr-stage');
  const scrub = $('.fr-scrub');
  const timeEl = $('.fr-time');
  const playBtn = $('[data-act="play"]');
  const speedBtn = $('[data-act="speed"]');
  const soundBtn = $('[data-act="sound"]');
  const panel = $('.fr-place');

  const renderer = createRenderer(canvas, { replay, timeline, plan, world, places, items: topItems(replay, places) });
  const audio = createSound();
  audio.setEnabled(!!sound);

  let t = 0;
  let playing = false;
  let speed = 1;
  let last = null;
  let raf = 0;
  let lastSeg = -1;
  let scrubbing = false;
  let gestured = false;
  let destroyed = false;

  const setPlayLabel = () => { playBtn.textContent = playing ? '❚❚ Pause' : t >= timeline.total ? '↺ Again' : '▶ Play'; playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play'); };
  const updateTime = () => {
    if (!scrubbing) scrub.value = String(Math.round(t * 10) / 10);
    timeEl.textContent = `${mmss(t)} / ${mmss(timeline.total)}`;
  };

  function frame(now) {
    if (destroyed) return;
    raf = win.requestAnimationFrame(frame);
    if (playing && last !== null) {
      t = Math.min(timeline.total, t + ((now - last) / 1000) * speed);
      if (t >= timeline.total) { playing = false; audio.stopMusic(); setPlayLabel(); }
    }
    last = now;
    const at = renderer.draw(t, now);
    if (at.i !== lastSeg) {
      if (playing && at.i === lastSeg + 1 && at.seg.sfx) audio.sfx(at.seg.sfx);
      lastSeg = at.i;
    }
    updateTime();
  }

  const api = {
    play() {
      if (t >= timeline.total) t = 0;
      playing = true;
      last = null;
      if (gestured) { audio.unlock(); audio.startMusic(); }
      setPlayLabel();
    },
    pause() { playing = false; audio.stopMusic(); setPlayLabel(); },
    seek(seconds) {
      t = Math.max(0, Math.min(timeline.total, Number(seconds) || 0));
      lastSeg = segmentAt(timeline, t).i;
      setPlayLabel();
      updateTime();
    },
    setSpeed(n) {
      speed = Number(n) === 2 ? 2 : 1;
      speedBtn.textContent = `${speed}×`;
      speedBtn.setAttribute('aria-pressed', speed === 2 ? 'true' : 'false');
    },
    skip() { api.seek(timeline.dayEnd); if (!playing) api.play(); },
    destroy() {
      destroyed = true;
      win.cancelAnimationFrame(raf);
      ro?.disconnect();
      audio.destroy();
      root.remove();
    },
    get time() { return t; },
    get playing() { return playing; },
    timeline,
  };

  // Controls
  const gesture = () => { gestured = true; if (audio.enabled) audio.unlock(); };
  root.addEventListener('pointerdown', gesture, true);
  root.addEventListener('keydown', gesture, true);
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'play') (playing ? api.pause() : api.play());
    else if (act === 'speed') api.setSpeed(speed === 1 ? 2 : 1);
    else if (act === 'skip') api.skip();
    else if (act === 'sound') {
      audio.setEnabled(!audio.enabled);
      soundBtn.textContent = `♪ ${audio.enabled ? 'On' : 'Off'}`;
      soundBtn.setAttribute('aria-pressed', audio.enabled ? 'true' : 'false');
      if (audio.enabled) { audio.unlock(); if (playing) audio.startMusic(); }
    } else if (act === 'close') { panel.hidden = true; }
    else if (act === 'goto') { api.seek(Number(e.target.closest('[data-t]').dataset.t)); }
  });
  scrub.addEventListener('input', () => { scrubbing = true; api.seek(Number(scrub.value)); });
  scrub.addEventListener('change', () => { scrubbing = false; });
  stage.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); playing ? api.pause() : api.play(); }
    else if (e.key === 'ArrowRight') api.seek(t + 5);
    else if (e.key === 'ArrowLeft') api.seek(t - 5);
  });

  // Tap a place on the map to list what happened there.
  const segStart = new Map();
  timeline.segments.forEach((s) => { if (s.type === 'beat') segStart.set(s.beat, s.t0); });
  const hitRects = [];
  for (const b of BUILDINGS) {
    const ids = [...places.values()].filter((p) => p.building === b).map((p) => p.id);
    hitRects.push({ rect: { x: b.x * TILE, y: b.y * TILE - (b.style === 'factory' ? 18 : 6), w: b.w * TILE, h: b.h * TILE + (b.style === 'factory' ? 18 : 6) + TILE }, ids: ids.length ? ids : [b.id], name: ids.length ? places.get(ids[0]).name : b.name, zone: b.zone });
  }
  for (const p of places.values()) {
    if (p.spare) hitRects.push({ rect: { x: p.spare.sign.x * TILE, y: p.spare.sign.y * TILE, w: TILE, h: TILE }, ids: [p.id], name: p.name, zone: p.zone });
    if (p.car) for (const pk of Object.values(PARKING)) hitRects.push({ rect: { x: pk.x * TILE, y: pk.y * TILE, w: TILE, h: TILE }, ids: [p.id], name: p.name, zone: 'road' });
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function showPlace(hit) {
    const beats = hit.ids.flatMap((id) => byPlace.get(id)?.beats || []).sort((a, b) => a.start - b.start);
    const place = { id: hit.ids[0], name: hit.name, zone: hit.zone, beats };
    panel.innerHTML = `<header><h3>${esc(hit.name)}</h3><span>${esc(hit.zone)}</span><button type="button" data-act="close" aria-label="Close">×</button></header>${
      beats.length ? `<ol>${beats.map((b) => `<li><button type="button" data-act="goto" data-t="${segStart.get(b) ?? 0}"><time>${clockText(b.start)}</time><span>${esc(b.text || b.title || '')}</span></button></li>`).join('')}</ol>` : '<p>Nothing happened here today.</p>'
    }`;
    panel.hidden = false;
    if (typeof onPlace === 'function') onPlace(place);
  }
  canvas.addEventListener('click', (e) => {
    if (segmentAt(timeline, t).seg.type === 'finale') return;
    const r = canvas.getBoundingClientRect();
    const lx = ((e.clientX - r.left) * SCREEN_W) / r.width;
    const ly = ((e.clientY - r.top) * SCREEN_H) / r.height;
    if (ly < 19) return;
    const w = renderer.toWorld(lx, ly);
    const hit = hitRects.find((h) => w.x >= h.rect.x && w.x < h.rect.x + h.rect.w && w.y >= h.rect.y && w.y < h.rect.y + h.rect.h);
    if (!hit) return;
    renderer.highlight(hit.rect, win.performance.now());
    showPlace(hit);
  });

  // Integer scaling in device pixels, as large as fits.
  const fit = () => {
    const avail = Math.max(1, root.clientWidth || element.clientWidth || SCREEN_W);
    const dpr = win.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor((avail * dpr) / SCREEN_W));
    let w = (SCREEN_W * k) / dpr;
    if (w > avail) w = avail;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${(w * SCREEN_H) / SCREEN_W}px`;
  };
  const ro = win.ResizeObserver ? new win.ResizeObserver(fit) : null;
  ro?.observe(root);
  fit();
  setPlayLabel();
  updateTime();
  raf = win.requestAnimationFrame(frame);
  return api;
}

export { isEvent };
