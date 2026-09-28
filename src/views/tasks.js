// Tasks: the list, and one form for creating and editing a task.

import { makeTask, isCritical } from '../model.js';
import { esc, fmtMin, taskFields } from '../util.js';

const opt = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;

function form(ctx, task) {
  const { db } = ctx;
  const t = task || { measure: 'time', cadence: 'anytime', estimate: 30, stamina: 1, mana: 1 };
  const batches = [...new Set(db.tasks.map((x) => x.batch).filter(Boolean))];
  return `
  <form class="sc-panel sc-panel--lit pad stack" data-form="task" id="task-form">
    <div class="row-between"><h2>${task ? 'Edit task' : 'New task'}</h2>${task ? `<span class="small sc-faint">created ${esc(task.created || '')}</span>` : ''}</div>
    <input type="hidden" name="id" value="${esc(task?.id || '')}">
    <div class="form-grid">
      <label class="sc-field wide"><span>Title</span><input class="sc-input" name="title" required value="${esc(t.title || '')}" placeholder="e.g. Purchase request"></label>
      <label class="sc-field"><span>Skill</span><select class="sc-select" name="skill" required>${db.skills.map((s) => opt(s.id, `${db.stat.get(s.stat)?.name || '?'} · ${s.name}`, s.id === t.skill)).join('')}</select></label>
      <label class="sc-field"><span>Measure</span><select class="sc-select" name="measure">${['time', 'count', 'quality'].map((m) => opt(m, m, m === t.measure)).join('')}</select></label>
      <label class="sc-field"><span>Unit (count)</span><input class="sc-input" name="unit" value="${esc(t.unit || '')}" placeholder="e.g. pages"></label>
      <label class="sc-field"><span>Cadence</span><select class="sc-select" name="cadence">${['daily', 'weekly', 'once', 'anytime'].map((m) => opt(m, m, m === t.cadence)).join('')}</select></label>
      <label class="sc-field"><span>Estimate (min)</span><input class="sc-input" type="number" name="estimate" min="1" step="1" required value="${esc(t.estimate)}"></label>
      <label class="sc-field"><span>Stamina cost</span><input class="sc-input" type="number" name="stamina" min="-10" max="10" step="0.5" value="${esc(t.stamina ?? 0)}" title="negative restores"></label>
      <label class="sc-field"><span>Mana cost</span><input class="sc-input" type="number" name="mana" min="-10" max="10" step="0.5" value="${esc(t.mana ?? 0)}" title="negative restores"></label>
      <label class="sc-field"><span>Deadline</span><input class="sc-input" type="date" name="deadline" value="${esc(t.deadline || '')}"></label>
      <label class="sc-field"><span>Place</span><select class="sc-select" name="place">${opt('', 'from its skill', !t.place)}${db.places.map((p) => opt(p.id, `${p.name} (${p.zone})`, p.id === t.place)).join('')}</select></label>
      <label class="sc-field"><span>Batch type</span><input class="sc-input" name="batch" list="batch-types" value="${esc(t.batch || '')}" placeholder="same-type tasks batch"><datalist id="batch-types">${batches.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></label>
      <label class="check-field"><input class="sc-check" type="checkbox" name="critical" ${t.critical ? 'checked' : ''}> Critical</label>
      <label class="check-field"><input class="sc-check" type="checkbox" name="forOthers" ${t.forOthers ? 'checked' : ''}> For someone else</label>
    </div>
    <p class="small sc-faint" style="margin:0">Negative stamina/mana restores energy. Critical = flagged, has a deadline, or for someone else: rework on it costs 2×.</p>
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Save task</button><button class="sc-button sc-button--ghost" type="button" data-action="cancel">Cancel</button></div>
  </form>`;
}

/** Where a Planner task is edited: Planner itself, beside Flow on the Portal. */
export const PLANNER_HREF = '../project/';
/** "Planner · Website relaunch": a derived task's tag. */
export const plannerTag = (t) => (t.source?.app === 'project' ? `<span class="sc-pill planner-tag" data-source="project">Planner · ${esc(t.project || '')}</span>` : '');

function row(ctx, t) {
  const skill = ctx.db.skill.get(t.skill);
  const measure = t.measure === 'time' ? 'time' : t.measure === 'count' ? `count${t.unit ? ` (${esc(t.unit)})` : ''}` : 'quality %';
  const fmt = (v) => (v === null || v === undefined ? '–' : t.measure === 'time' ? fmtMin(v) : t.measure === 'quality' ? `${v}%` : v);
  return `
  <div class="item" data-task="${esc(t.id)}">
    <div class="item-head"><span class="item-title">${esc(t.title)}</span>
      <span class="pills">${t.doneNow ? '<span class="sc-pill" style="--tint: var(--sc-success)">done</span>' : ''}${t.overdue ? '<span class="sc-pill" style="--tint: var(--sc-danger)">overdue</span>' : ''}${isCritical(t) ? '<span class="sc-pill" style="--tint: var(--sc-warning)">critical</span>' : ''}${t.batch ? `<span class="sc-pill">${esc(t.batch)}</span>` : ''}${t.archived ? '<span class="sc-pill" style="--tint: var(--sc-text-3)">archived</span>' : ''}${plannerTag(t)}</span></div>
    <div class="row small sc-muted">
      <span>${esc(skill?.name || '?')}</span><span>${measure}</span><span>${t.cadence}</span><span>est ${fmtMin(t.estimate)}${t.estimateFrom === 'history' ? ' (from history)' : ''}</span>
      <span>⚡ ${t.stamina ?? 0} / ✧ ${t.mana ?? 0}</span>${t.deadline ? `<span>due ${esc(t.deadline)}</span>` : ''}
    </div>
    <div class="row small sc-faint"><span>runs ${t.runs}</span><span>best ${fmt(t.best)}</span><span>target ${fmt(t.target)}</span>${t.streak ? `<span>streak ${t.streak}${t.atRisk ? ' (at risk)' : ''}</span>` : ''}${t.reworks ? `<span>rework ×${t.reworks}</span>` : ''}</div>
    <div class="row">${t.source ? `
      <a class="sc-button sc-button--sm" href="${PLANNER_HREF}" data-planner-link>Open in Planner</a>` : `
      <button class="sc-button sc-button--sm" data-action="edit" data-task="${esc(t.id)}">Edit</button>
      ${t.archived ? `<button class="sc-button sc-button--ghost sc-button--sm" data-action="unarchive" data-task="${esc(t.id)}">Restore</button>` : `<button class="sc-button sc-button--ghost sc-button--sm" data-action="archive" data-task="${esc(t.id)}">Archive</button>`}`}
    </div>
  </div>`;
}

export function render(ctx) {
  const { db, g, ui } = ctx;
  if (!db.skills.length) {
    return `<div class="view"><div class="sc-panel pad stack"><h2>Tasks</h2><p class="sc-muted" style="margin:0">A task belongs to a skill. Make a skill first.</p><div class="row"><button class="sc-button sc-button--primary" data-go="skills">Add a skill</button></div></div></div>`;
  }
  const editing = ui.editTask;
  // A task of a Planner plan archived since is history, not a task to do.
  // And a Planner task the calendar did not lay on today is not today's work:
  // Flow's list is Planner's Today, in Planner's order (sync.js › db, and
  // Planner's model/dayplan.js). Flow's own tasks are not Planner's to
  // schedule, so they stay. `laidAt` first, then anything unscheduled, then
  // alphabetical — which is the old order for everything Planner has not
  // spoken about.
  const list = g.tasks
    .filter((t) => !(t.source && t.archived))
    .filter((t) => !(t.source && t.offToday))
    .filter((t) => ui.showArchived || !t.archived)
    .sort((a, b) => Number(a.archived) - Number(b.archived)
      || (a.laidAt ?? Infinity) - (b.laidAt ?? Infinity)
      || a.title.localeCompare(b.title));
  const archived = g.tasks.filter((t) => t.archived && !t.source).length;
  return `<div class="view">
    <div class="row-between"><h2>Tasks · ${list.filter((t) => !t.archived).length}</h2>
      <div class="row">${archived ? `<label class="check-field small"><input class="sc-check" type="checkbox" data-toggle="archived" ${ui.showArchived ? 'checked' : ''}> archived (${archived})</label>` : ''}
      <button class="sc-button sc-button--primary" data-action="new">+ New task</button></div></div>
    ${editing && !db.task.get(editing)?.source ? form(ctx, editing === 'new' ? null : db.task.get(editing)) : ''}
    ${list.length ? `<div class="list">${list.map((t) => row(ctx, t)).join('')}</div>` : '<div class="muted-box">No tasks yet.</div>'}
  </div>`;
}

export const actions = {
  new: (el, ctx) => { ctx.ui.editTask = 'new'; ctx.render({ force: true }); document.getElementById('task-form')?.scrollIntoView({ block: 'start' }); },
  edit: (el, ctx) => { ctx.ui.editTask = el.dataset.task; ctx.render({ force: true }); document.getElementById('task-form')?.scrollIntoView({ block: 'start' }); },
  cancel: (el, ctx) => { ctx.ui.editTask = null; ctx.render({ force: true }); },
  archive: async (el, ctx) => { const t = ctx.store.getRecord(el.dataset.task); await ctx.store.save({ ...t, archived: true }); ctx.toast(`${t.title} archived.`); },
  unarchive: async (el, ctx) => { const t = ctx.store.getRecord(el.dataset.task); await ctx.store.save({ ...t, archived: false }); },
};

export function onChange(ev, ctx) {
  if (ev.target.dataset.toggle === 'archived') { ctx.ui.showArchived = ev.target.checked; ctx.render({ force: true }); }
}

export const forms = {
  task: async (d, form, ctx) => {
    const fields = taskFields(d);
    const existing = d.id ? ctx.store.getRecord(d.id) : null;
    const rec = existing ? makeTask(ctx.db, { ...existing, ...fields }) : makeTask(ctx.db, fields);
    ctx.ui.editTask = null;
    await ctx.store.save(rec);
    ctx.toast(`${rec.title} ${existing ? 'saved' : 'added'}.`, 'success');
  },
};
