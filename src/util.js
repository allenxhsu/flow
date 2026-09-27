// Small pure helpers for the page: formatting, the timer, the batch log, the
// shop's debt warning, the review chart's geometry. No DOM, no storage, so
// `node --test` runs them as they are.

import { chargeFor, DEFAULT_STATS, DEFAULT_PLACES, DEFAULT_KINDS } from './model.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for HTML, attributes included. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** 25 → "25m", 65 → "1h 05m". */
export function fmtMin(m) {
  const n = Math.round(Number(m) || 0);
  if (Math.abs(n) < 60) return `${n}m`;
  const h = Math.trunc(n / 60);
  return `${h}h ${String(Math.abs(n % 60)).padStart(2, '0')}m`;
}

/** Points with a sign when asked: 1234 → "1,234", −5 → "−5". */
export function fmtPts(n, { sign = false } = {}) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString('en-US');
  if (v < 0) return `−${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

/** A running clock "mm:ss" or "h:mm:ss". */
export function fmtClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** Whole minutes a timer ran, never less than one. */
export const elapsedMinutes = (start, now) => Math.max(1, Math.round((now - start) / 60000));

/** Read a JSON value from a Storage, or null — a broken value is no value. */
export function readJson(storage, key) {
  try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function writeJson(storage, key, value) {
  try { if (value == null) storage?.removeItem(key); else storage?.setItem(key, JSON.stringify(value)); } catch { /* quota, private mode */ }
}

/** A running timer is { task, start, reworkOf? }; anything else is no timer. */
export function validTimer(t) {
  return t && typeof t.task === 'string' && Number.isFinite(t.start) ? t : null;
}

/**
 * Lay a batch logged in one go end to end, finishing now, so the model sees
 * them as the chain they were: each starts where the last one ended.
 */
export function batchEnds(minutesList, now) {
  const total = minutesList.reduce((a, b) => a + b, 0);
  let t = now - total * 60000;
  return minutesList.map((m) => (t += m * 60000));
}

/**
 * What buying something costs at a balance. The part below zero costs the
 * tier's debt multiplier (double at Push),
 * and the page says so before the purchase, not after.
 */
export function purchasePreview(balance, price, debt) {
  const charged = debt === undefined ? chargeFor(balance, price) : chargeFor(balance, price, debt);
  const below = Math.max(0, price - Math.max(0, balance));
  return { charged, below, after: balance - charged, intoDebt: below > 0, extra: charged - price };
}

/** Normalise the task form's strings into makeTask's fields. */
export function taskFields(form) {
  const num = (v, d = 0) => (v === '' || v == null ? d : Number(v));
  const str = (v) => (v == null ? '' : String(v).trim());
  return {
    title: str(form.title),
    skill: str(form.skill),
    measure: str(form.measure) || 'time',
    unit: str(form.unit),
    cadence: str(form.cadence) || 'anytime',
    estimate: num(form.estimate, 30),
    stamina: num(form.stamina),
    mana: num(form.mana),
    deadline: str(form.deadline) || null,
    place: str(form.place) || null,
    batch: str(form.batch) || null,
    critical: form.critical === 'on' || form.critical === true,
    forOthers: form.forOthers === 'on' || form.forOthers === true,
  };
}

/**
 * The records to write the first time a list the model defaults (stats,
 * places, moment kinds) is edited. While none exist the model shows its
 * defaults; the moment one exists the defaults vanish — so all of them are
 * written together, the edited one included.
 */
export function materialize(type, live) {
  if (live.some((r) => r.type === type)) return [];
  const defaults = { stat: DEFAULT_STATS, place: DEFAULT_PLACES, kind: DEFAULT_KINDS }[type] || [];
  return defaults.map((d, i) => ({ ...d, type, ...(type === 'stat' ? { order: i } : {}) }));
}

/**
 * The satisfaction chart: one series on a fixed 0–10 axis. Points are spaced
 * evenly by review, which keeps a missed week from stretching the line.
 */
export function chartGeometry(reviews, { width = 600, height = 220, left = 32, right = 16, top = 14, bottom = 28 } = {}) {
  const w = width - left - right;
  const h = height - top - bottom;
  const n = reviews.length;
  const x = (i) => left + (n <= 1 ? w / 2 : (i * w) / (n - 1));
  const y = (v) => top + h - (Math.max(0, Math.min(10, v)) / 10) * h;
  const points = reviews.map((r, i) => ({ x: Math.round(x(i) * 10) / 10, y: Math.round(y(r.satisfaction) * 10) / 10, value: r.satisfaction, label: r.week || r.day, review: r }));
  const ticks = [0, 2, 4, 6, 8, 10].map((v) => ({ v, y: Math.round(y(v) * 10) / 10 }));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  return { width, height, left, right, top, bottom, points, ticks, path };
}

/** The review nearest a pointer's x, for the crosshair. */
export function nearestPoint(points, px) {
  let best = null;
  for (const p of points) if (!best || Math.abs(p.x - px) < Math.abs(best.x - px)) best = p;
  return best;
}
