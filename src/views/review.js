// Review: the weekly form (life satisfaction, each stat 0–10, a win, a lesson,
// one change, and the difficulty for next week) and how satisfaction has
// moved. XP cannot buy this number. Difficulty is set only here.

import { makeReview, weekInSkills, DIFFICULTY, addDays } from '../model.js';
import { esc, fmtMin, fmtPts, chartGeometry, nearestPoint } from '../util.js';

function chart(reviews, width = 640) {
  if (!reviews.length) return '<div class="muted-box">The line starts with your first review.</div>';
  const w = Math.max(240, Math.round(width));
  const geo = chartGeometry(reviews, { width: w, height: Math.round(Math.min(240, Math.max(180, w * 0.4))) });
  const labelEvery = Math.max(1, Math.ceil(geo.points.length / Math.max(2, Math.floor(w / 90))));
  return `
  <figure class="chart" style="margin:0" id="sat-chart">
    <svg viewBox="0 0 ${geo.width} ${geo.height}" role="img" aria-label="Life satisfaction by week, 0 to 10">
      ${geo.ticks.map((t) => `<line class="grid-line" x1="${geo.left}" x2="${geo.width - geo.right}" y1="${t.y}" y2="${t.y}"/><text class="axis-text" x="${geo.left - 8}" y="${t.y + 4}" text-anchor="end">${t.v}</text>`).join('')}
      ${geo.points.map((p, i) => (i % labelEvery === 0 || i === geo.points.length - 1 ? `<text class="axis-text" x="${p.x}" y="${geo.height - 8}" text-anchor="middle">${esc(String(p.label).replace(/^\d{4}-/, ''))}</text>` : '')).join('')}
      <path class="series" d="${geo.path}"/>
      ${geo.points.map((p) => `<circle class="dot" cx="${p.x}" cy="${p.y}" r="4"/>`).join('')}
      <line class="crosshair" x1="0" x2="0" y1="${geo.top}" y2="${geo.height - geo.bottom}" visibility="hidden"/>
      <rect x="${geo.left}" y="0" width="${geo.width - geo.left - geo.right}" height="${geo.height}" fill="transparent" data-hit></rect>
    </svg>
    <div class="chart-tip" hidden></div>
  </figure>`;
}

// ─── difficulty ─────────────────────────────────────────────────────────────

const TIER_ICON = { steady: '◆', push: '▲', grind: '⚒', relentless: '✹', legend: '♛' };
const pc = (x) => `${Math.round(x * 100)}%`;
const signed = (x) => (x === 0 ? '+0' : `${x > 0 ? '+' : '−'}${Math.abs(x)}`);
const rank = (id) => DIFFICULTY.findIndex((d) => d.id === id);
const tierOf = (id) => DIFFICULTY.find((d) => d.id === id) || DIFFICULTY[1];

/** One line: harder targets · bigger rewards · less forgiveness. */
export const tierSummary = (t) => `targets ${pc(t.targetStep)} better · points ×${t.points} · rework ${signed(t.reworkAdd)}`;

/**
 * The setting the form starts from: what will be in effect tomorrow, so a
 * review already saved today shows its choice. Without the records, today's.
 */
function upcoming(ctx) {
  const { g, db } = ctx;
  const last = db ? [...db.reviews].filter((r) => r.difficulty && r.day <= g.day).sort((a, b) => a.day.localeCompare(b.day) || (a.at ?? 0) - (b.at ?? 0)).pop() : null;
  const set = last?.difficulty || g.difficulty;
  return { tier: set.tier, skills: { ...(set.skills || {}) } };
}

/** A tier can be chosen when the level has unlocked it, or it is no harder than the one in effect (lowering is free). */
const allowed = (t, level, current) => t.unlock <= level || rank(t.id) <= rank(current);

function guideText(g, chosenId, weekday) {
  const t = tierOf(chosenId);
  const rework = t.reworkAdd > 0 ? 'rework hurts more' : t.reworkAdd < 0 ? 'rework forgives a little' : 'rework as usual';
  const next = g.difficulty.next ? `${g.difficulty.next.name} unlocks at player level ${g.difficulty.next.unlock}.` : 'Every tier is unlocked.';
  return `${t.name} from ${weekday}: targets ${pc(t.targetStep)} sharper, points ×${t.points}, ${rework}. ${next}`;
}

function difficultySection(ctx) {
  const { g } = ctx;
  const set = upcoming(ctx);
  const tomorrow = addDays(g.day, 1);
  const weekday = new Date(`${tomorrow}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  const level = g.player.level;
  const cards = DIFFICULTY.map((t) => {
    const open = allowed(t, level, set.tier);
    const current = t.id === g.difficulty.tier;
    const chosen = t.id === set.tier;
    const cls = ['tier-card', 'sc-card', current && 'current', chosen && 'chosen', !open && 'locked'].filter(Boolean).join(' ');
    const state = !open ? `<span class="tier-lock" aria-hidden="true"></span>Unlocks at level ${t.unlock}` : current ? 'Now' : chosen ? 'Chosen' : 'Open';
    return `<label class="${cls}" data-tier="${t.id}" title="${esc(`${t.name}: ${tierSummary(t)}`)}">
      <input type="radio" name="difficulty" value="${t.id}"${chosen ? ' checked' : ''}${open ? '' : ' disabled'}>
      <span class="tier-icon" aria-hidden="true">${TIER_ICON[t.id] || '◇'}</span>
      <span class="tier-name">${esc(t.name)}</span>
      <span class="tier-points num">×${t.points}</span><span class="tier-points-label">points</span>
      <span class="tier-summary">${esc(tierSummary(t))}</span>
      <dl class="tier-stats num"><dt>Target</dt><dd>${pc(t.targetStep)}</dd><dt>Rework</dt><dd>${signed(t.reworkAdd)}</dd><dt>Debt</dt><dd>×${t.debt}</dd><dt>Energy</dt><dd>×${t.energy}</dd><dt>Grace</dt><dd>${t.grace}/7</dd></dl>
      <span class="tier-state">${state}</span>
    </label>`;
  }).join('');
  const rows = g.skills.map((k) => {
    const mine = set.skills[k.id] || '';
    const options = DIFFICULTY.filter((t) => allowed(t, k.level, mine || set.tier) || t.id === mine)
      .map((t) => `<option value="${t.id}"${t.id === mine ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
    return `<label class="skill-tier" data-skill="${esc(k.id)}"><span class="skill-tier-name">${esc(k.name)}</span><span class="sc-badge skill-tier-level">LV ${k.level}</span><select class="sc-select" name="skill_${esc(k.id)}"><option value=""${mine ? '' : ' selected'}>Same as global</option>${options}</select></label>`;
  }).join('');
  return `<section class="difficulty stack" id="difficulty" aria-labelledby="difficulty-h">
      <div class="row-between"><h3 id="difficulty-h">Difficulty · from ${esc(weekday)}</h3><span class="small sc-muted num">Player LV ${level}</span></div>
      <div class="tier-row" role="radiogroup" aria-label="Global difficulty">${cards}</div>
      <div class="per-skill stack"><h3>Per skill</h3>${rows || '<p class="small sc-faint" style="margin:0">Add skills to set a tier per skill.</p>'}</div>
      <p class="tier-guide small" id="tier-guide" data-weekday="${esc(weekday)}" style="margin:0">${esc(guideText(g, set.tier, weekday))}</p>
      <p class="small sc-faint" style="margin:0">Harder tiers: harder targets, bigger rewards, less forgiveness, tighter energy. It changes only here, from the day after the review; points already earned never change.</p>
    </section>`;
}


// ─── the week in skills ─────────────────────────────────────────────────────
// SPEC.md › The week in skills. The hours in a week are fixed, so the reading
// that matters is not how many there were but which skill sets they went into,
// how much of them was spent doing something a second time, and which skill
// keeps not being chosen.

const pct = (x) => `${Math.round(x * 100)}%`;
const delta = (n) => (n === 0 ? 'same as last week' : `${n > 0 ? '+' : '−'}${fmtMin(Math.abs(n))} on last week`);

function skillRow(k) {
  const tasks = k.tasks.map((t) => `<li><span class="wk-task">${esc(t.title)}</span><span class="small sc-faint num">${t.runs > 1 ? `×${t.runs} · ` : ''}${fmtMin(t.minutes)}</span></li>`).join('');
  return `<div class="item wk-skill" data-week-skill="${esc(k.id)}">
    <div class="item-head">
      <span class="item-title">${esc(k.name)}</span>
      <span class="pills"><span class="sc-pill">${esc(k.statName)}</span>${k.rework.count ? `<span class="sc-pill" style="--tint: var(--sc-danger)">rework ${pct(k.reworkShare)}</span>` : ''}</span>
      <span class="sc-spacer"></span>
      <span class="num wk-minutes">${fmtMin(k.minutes)}</span><span class="num wk-share">${pct(k.share)}</span>
    </div>
    <div class="sc-meter meter-app" role="meter" aria-label="${esc(k.name)} share of the week" aria-valuenow="${Math.round(k.share * 100)}"><span style="--value: ${Math.round(k.share * 100)}%"></span></div>
    <div class="row small sc-muted"><span class="num">${fmtPts(k.points)} pts</span><span class="num">${k.runs} run${k.runs === 1 ? '' : 's'}</span><span>${esc(delta(k.change))}</span>${k.rework.count ? `<span class="num">${fmtMin(k.rework.minutes)} redone</span>` : ''}</div>
    <ul class="wk-tasks">${tasks}</ul>
  </div>`;
}

function weekSection(ctx) {
  if (!ctx.db) return ''; // rendered from play() alone, as the replay and the tests do
  const w = weekInSkills(ctx.db, ctx.g.day);
  if (!w.skills.length) {
    return `<section class="sc-panel pad stack" id="week-skills">
      <h2>Where the week went · ${esc(w.week)}</h2>
      <div class="muted-box">Nothing logged this week yet, so there is no work this week to group.</div>
    </section>`;
  }
  const cold = w.untouched.slice(0, 6);
  return `<section class="sc-panel pad stack" id="week-skills">
    <div class="row-between"><h2>Where the week went · ${esc(w.week)}</h2>
      <span class="small sc-faint num">${fmtMin(w.minutes)} over ${w.days} day${w.days === 1 ? '' : 's'} · ${fmtPts(w.points)} pts</span></div>
    <div class="row wk-stats">${w.stats.map((s) => `<span class="sc-pill wk-stat" data-week-stat="${esc(s.id)}">${esc(s.name)} <b class="num">${pct(s.share)}</b></span>`).join('')}</div>
    <div class="list">${w.skills.map(skillRow).join('')}</div>
    ${cold.length ? `<div class="stack wk-cold">
      <h3>Not worked this week</h3>
      <div class="row">${cold.map((k) => `<span class="sc-pill" data-week-cold="${esc(k.id)}">${esc(k.name)} <span class="small sc-faint">${k.days === null ? 'never' : `${k.days}d`}</span></span>`).join('')}</div>
      <p class="small sc-faint" style="margin:0">A skill you keep not choosing is the one worth noticing.</p>
    </div>` : ''}
  </section>`;
}

export function render(ctx) {
  const { g } = ctx;
  const s = g.satisfaction;
  const reviews = s.history;
  const field = (name, label) => `<label class="sc-field"><span>${esc(label)} <output class="num" data-for="${name}">–</output></span><input type="range" name="${name}" min="0" max="10" step="0.5" value="5" data-unset="1"></label>`;
  return `<div class="view">
    ${weekSection(ctx)}
    <form class="sc-panel sc-panel--lit pad stack" data-form="review" id="review-form">
      <div class="row-between"><h2>Weekly review · ${esc(g.week)}</h2>${s.due ? '<span class="sc-pill" style="--tint: var(--sc-warning)">due</span>' : `<span class="small sc-faint">${s.latest ? `last ${esc(s.latest.day)}` : 'first review due Sunday'}</span>`}</div>
      <div class="form-grid">
        <label class="sc-field wide"><span>Life satisfaction <output class="num" data-for="satisfaction">7</output>/10</span><input type="range" name="satisfaction" min="0" max="10" step="0.5" value="7"></label>
        ${g.stats.map((st) => field(`rate_${st.id}`, `${st.icon || ''} ${st.name}`)).join('')}
        <label class="sc-field wide"><span>Win</span><textarea class="sc-textarea" name="win" rows="2"></textarea></label>
        <label class="sc-field wide"><span>Lesson</span><textarea class="sc-textarea" name="lesson" rows="2"></textarea></label>
        <label class="sc-field wide"><span>One change for next week</span><textarea class="sc-textarea" name="next" rows="2"></textarea></label>
      </div>
      <p class="small sc-faint" style="margin:0">Stat sliders you leave untouched are not rated.</p>
      ${difficultySection(ctx)}
      <div class="row"><button class="sc-button sc-button--primary" type="submit">Save review</button></div>
    </form>
    <section class="sc-panel pad stack">
      <div class="row-between"><h2>Life satisfaction</h2>${s.trend !== null ? `<span class="small sc-muted">${s.trend >= 0 ? '+' : ''}${Math.round(s.trend * 10) / 10} vs the 3 before</span>` : ''}</div>
      ${chart(reviews)}
      ${reviews.length ? `<div class="table-wrap"><table class="sc-table" id="reviews"><thead><tr><th>Week</th><th>Satisfaction</th>${g.stats.map((st) => `<th title="${esc(st.name)}">${esc(st.icon || st.name)}</th>`).join('')}<th>Win</th><th>Lesson</th><th>Next</th></tr></thead><tbody>
        ${[...reviews].reverse().map((r) => `<tr><td class="num">${esc(r.week)}</td><td class="num">${r.satisfaction}</td>${g.stats.map((st) => `<td class="num">${r.ratings?.[st.id] ?? '–'}</td>`).join('')}<td>${esc(r.win)}</td><td>${esc(r.lesson)}</td><td>${esc(r.next)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    </section>
  </div>`;
}

export function mounted(view, ctx) {
  let fig = view.querySelector('#sat-chart');
  if (!fig) return;
  // Drawn at the size it is shown, so the axis text stays legible on a phone.
  fig.outerHTML = chart(ctx.g.satisfaction.history, fig.clientWidth);
  fig = view.querySelector('#sat-chart');
  const svg = fig.querySelector('svg');
  const tip = fig.querySelector('.chart-tip');
  const cross = svg.querySelector('.crosshair');
  const pts = [...svg.querySelectorAll('.dot')].map((c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) }));
  const labels = [...view.querySelectorAll('#reviews tbody tr')].reverse().map((tr) => [tr.cells[0].textContent, tr.cells[1].textContent]);
  const show = (ev) => {
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const x = ((ev.clientX - box.left) / box.width) * vb.width;
    const p = nearestPoint(pts, x);
    if (!p) return;
    const i = pts.indexOf(p);
    cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x); cross.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${labels[i]?.[0] ?? ''} · ${labels[i]?.[1] ?? ''}/10`;
    tip.style.left = `${(p.x / vb.width) * box.width}px`;
    tip.style.top = `${(p.y / vb.height) * box.height}px`;
  };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

export function onInput(ev, ctx) {
  if (ev.target.dataset.unset) delete ev.target.dataset.unset;
  if (ev.target.name === 'difficulty') {
    const form = ev.target.form;
    for (const card of form.querySelectorAll('.tier-card')) {
      const chosen = card.dataset.tier === ev.target.value;
      card.classList.toggle('chosen', chosen);
      const state = card.querySelector('.tier-state');
      if (state && !card.classList.contains('locked') && !card.classList.contains('current')) state.textContent = chosen ? 'Chosen' : 'Open';
    }
    const guide = form.querySelector('#tier-guide');
    if (guide && ctx?.g) guide.textContent = guideText(ctx.g, ev.target.value, guide.dataset.weekday);
  }
}

export const forms = {
  review: async (d, form, ctx) => {
    const ratings = {};
    for (const st of ctx.g.stats) {
      const input = form.elements[`rate_${st.id}`];
      if (input && !input.dataset.unset) ratings[st.id] = d[`rate_${st.id}`];
    }
    const skills = {};
    for (const k of ctx.g.skills) if (d[`skill_${k.id}`]) skills[k.id] = d[`skill_${k.id}`];
    const difficulty = d.difficulty ? { tier: d.difficulty, skills } : null;
    const rec = makeReview(ctx.db, { satisfaction: d.satisfaction, ratings, win: d.win.trim(), lesson: d.lesson.trim(), next: d.next.trim(), difficulty, at: ctx.now ?? Date.now() });
    await ctx.store.add(rec);
    ctx.toast(`Review for ${rec.week} saved.`, 'success');
  },
};
