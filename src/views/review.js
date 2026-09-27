// Review: the weekly form (life satisfaction, each stat 0–10, a win, a lesson,
// one change) and how satisfaction has moved. XP cannot buy this number.

import { makeReview } from '../model.js';
import { esc, chartGeometry, nearestPoint } from '../util.js';

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

export function render(ctx) {
  const { g } = ctx;
  const s = g.satisfaction;
  const reviews = s.history;
  const field = (name, label) => `<label class="sc-field"><span>${esc(label)} <output class="num" data-for="${name}">–</output></span><input type="range" name="${name}" min="0" max="10" step="0.5" value="5" data-unset="1"></label>`;
  return `<div class="view">
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

export function onInput(ev) {
  if (ev.target.dataset.unset) delete ev.target.dataset.unset;
}

export const forms = {
  review: async (d, form, ctx) => {
    const ratings = {};
    for (const st of ctx.g.stats) {
      const input = form.elements[`rate_${st.id}`];
      if (input && !input.dataset.unset) ratings[st.id] = d[`rate_${st.id}`];
    }
    const rec = makeReview(ctx.db, { satisfaction: d.satisfaction, ratings, win: d.win.trim(), lesson: d.lesson.trim(), next: d.next.trim(), at: Date.now() });
    await ctx.store.add(rec);
    ctx.toast(`Review for ${rec.week} saved.`, 'success');
  },
};
