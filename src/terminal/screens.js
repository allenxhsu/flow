// The Terminal's screens (SPEC.md › Terminal: the iPhone app), as HTML
// strings from the state src/terminal.js builds, so they render under Node:
// Projects → a project's tasks → the timer, the status strip with I'm tired,
// and the sheets (Add task, Stop & log, I'm tired, Settings). The handheld
// look of the app's screens; nothing else from the game.

import { statusStrip } from '../ds.js';
import { esc, fmtMin } from '../util.js';
import { tiredSheet } from '../views/tired.js';

export { tiredSheet };

const shortDate = (day) => {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
/** "due Oct 1", "overdue Sep 20", "due today". */
function due(day, today) {
  if (!day) return '';
  if (day === today) return 'due today';
  return `${day < today ? 'overdue' : 'due'} ${shortDate(day)}`;
}
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The top: the status strip (hearts, magic bar, gem, level), I'm tired and Settings. */
export function top(ctx) {
  const waiting = ctx.waiting ? `<span class="term-wait" id="ops-waiting">${ctx.waiting} waiting for Planner</span>` : '';
  return `${statusStrip(ctx.g)}
  <div class="term-bar">
    <button class="sc-button term-tired" data-action="tired" id="tired-button">I'm tired</button>
    ${waiting}
    <button class="sc-button sc-button--ghost term-gear" data-action="settings" aria-label="Settings">Settings</button>
  </div>`;
}

/** Projects: Planner's plans that have tasks for the player. */
export function projects(ctx) {
  const list = ctx.projects || [];
  const today = ctx.g.day;
  const empty = ctx.connected === false
    ? `<div class="muted-box stack"><p>Not connected to Planner yet.</p><p class="small">Open <b>Settings</b> and sign in to the Portal (or give Planner's server) to see your projects here.</p></div>`
    : '<div class="muted-box">No Planner projects with tasks for you.</div>';
  return `
  <section class="view term-view" aria-labelledby="projects-h">
    <div class="row-between"><h2 id="projects-h">Projects</h2><span class="small sc-faint">${list.length || ''}</span></div>
    ${list.length ? `<ul class="term-list">${list.map((p) => `
      <li><button class="term-card" data-action="open-project" data-plan="${esc(p.id)}">
        <span class="term-card-title">${p.pinned ? '<span class="term-pin" title="Pinned">★</span> ' : ''}${esc(p.name)}</span>
        <span class="term-card-meta">
          <span>${p.open} open</span>
          ${p.deadline ? `<span class="${p.deadline < today ? 'term-late' : ''}">${esc(due(p.deadline, today))}</span>` : ''}
          <span>${p.weekMinutes ? fmtMin(p.weekMinutes) : '0m'} this week</span>
        </span>
      </button></li>`).join('')}</ul>` : empty}
  </section>`;
}

/** A project's open tasks for the player, each with Start; + Add task. */
export function tasks(ctx, planId) {
  const p = (ctx.projects || []).find((x) => x.id === planId);
  const today = ctx.g.day;
  if (!p) {
    return `<section class="view term-view"><button class="sc-button sc-button--ghost term-back" data-action="back">◀ Projects</button>
      <div class="muted-box">That project is not in your list any more.</div></section>`;
  }
  const list = [...p.tasks].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.title.localeCompare(b.title));
  return `
  <section class="view term-view" aria-labelledby="tasks-h">
    <div class="term-head">
      <button class="sc-button sc-button--ghost term-back" data-action="back" aria-label="Back to projects">◀</button>
      <h2 id="tasks-h" class="term-title">${esc(p.name)}</h2>
    </div>
    ${ctx.ui.adding ? addTaskSheet(p) : `<button class="sc-button term-add" data-action="add-task">+ Add task</button>`}
    ${list.length ? `<ul class="term-list">${list.map((t) => `
      <li class="term-task${t.pending ? ' is-pending' : ''}" data-task="${esc(t.id)}">
        <div class="term-task-text">
          <span class="term-task-title">${esc(t.title)}</span>
          <span class="term-card-meta"><span>~${fmtMin(t.estimate)}</span>${t.deadline ? `<span class="${t.deadline < today ? 'term-late' : ''}">${esc(due(t.deadline, today))}</span>` : ''}${t.pending ? '<span class="term-sending">sending to Planner</span>' : ''}</span>
        </div>
        <button class="sc-button sc-button--primary term-start" data-action="start" data-task="${esc(t.id)}">Start</button>
      </li>`).join('')}</ul>` : '<div class="muted-box">Nothing open here. Add a task to start one.</div>'}
  </section>`;
}

/** + Add task: a name, and optionally hours and a deadline. */
export function addTaskSheet(project) {
  return `
  <form class="sc-panel sc-panel--lit pad stack term-sheet" data-form="add-task" id="add-task-form">
    <div class="row-between"><h2>Add task</h2><span class="small sc-faint">to ${esc(project.name)} in Planner</span></div>
    <input type="hidden" name="plan" value="${esc(project.id)}">
    <label class="sc-field"><span>Name</span><input class="sc-input" name="name" required autocomplete="off" enterkeyhint="done" placeholder="What needs doing"></label>
    <div class="term-pair">
      <label class="sc-field"><span>Hours (optional)</span><input class="sc-input" name="hours" type="number" inputmode="decimal" min="0.25" step="0.25" placeholder="—"></label>
      <label class="sc-field"><span>Deadline (optional)</span><input class="sc-input" name="deadline" type="date"></label>
    </div>
    <div class="term-actions"><button class="sc-button sc-button--primary" type="submit">Add</button><button class="sc-button sc-button--ghost" type="button" data-action="add-cancel">Cancel</button></div>
  </form>`;
}

/** The timer: big elapsed time, the task and its project, Pause, Stop & log, Cancel. */
export function timer(ctx, t) {
  const task = ctx.db.task.get(t.task);
  const of = t.reworkOf && ctx.db.done.find((d) => d.id === t.reworkOf);
  return `
  <section class="view term-view term-timer" aria-labelledby="timer-h">
    <h2 id="timer-h" class="visually-hidden">Timer</h2>
    <div class="term-clock-wrap">
      <span class="sc-label">${of ? 'Rework running' : 'Working on'}</span>
      <div class="term-clock num" data-since="${t.start}" role="timer" aria-live="off">00:00</div>
      <div class="term-timer-task">${esc(task?.title || 'A task')}</div>
      <div class="small sc-muted">${esc(task?.project || '')}${of ? ` · rework of ${esc(of.day)}` : ''} · since ${esc(time(t.start))}</div>
      ${task?.pending ? '<span class="term-sending">sending to Planner</span>' : ''}
    </div>
    ${ctx.ui.log ? logSheet(ctx, t, task, of) : `
    <div class="term-timer-actions">
      <button class="sc-button term-big" data-action="pause">Pause</button>
      <button class="sc-button sc-button--primary term-big" data-action="stop">Stop &amp; log</button>
      <button class="sc-button sc-button--ghost" data-action="cancel-timer">Cancel</button>
    </div>
    <p class="small sc-faint term-note">Pause logs the time to Planner and keeps the task open. Stop &amp; log finishes it.</p>`}
  </section>`;
}

/** Stop & log: minutes (the timer's, editable), quality and a note — Log done's questions. */
function logSheet(ctx, t, task, of) {
  const L = ctx.ui.log;
  if (of) {
    return `
    <form class="sc-panel pad stack term-sheet" data-form="log" id="log-form">
      <h2>Log rework</h2>
      <p class="small sc-muted">Rework of ${esc(of.day)}: fix minutes × ${of.price?.points || 0} pts ÷ ${of.minutes} min × the rework multiplier comes off XP and points.</p>
      <label class="sc-field"><span>Fix minutes</span><input class="sc-input" type="number" name="minutes" min="1" step="1" required value="${L.minutes}"></label>
      <label class="sc-field"><span>Note</span><input class="sc-input" name="note" placeholder="what went wrong"></label>
      <div class="term-actions"><button class="sc-button sc-button--danger" type="submit">Log rework</button><button class="sc-button sc-button--ghost" type="button" data-action="log-cancel">Back</button></div>
    </form>`;
  }
  const quality = task?.measure === 'quality';
  return `
  <form class="sc-panel pad stack term-sheet" data-form="log" id="log-form">
    <h2>Log done</h2>
    <label class="sc-field"><span>Minutes</span><input class="sc-input" type="number" name="minutes" min="1" step="1" required value="${L.minutes}"></label>
    ${task?.measure === 'count' ? `<label class="sc-field"><span>How many (${esc(task.unit || 'count')})</span><input class="sc-input" type="number" name="value" min="0" step="any" required></label>` : ''}
    <label class="sc-field"><span>Quality <output class="num" data-for="${quality ? 'value' : 'quality'}" data-suffix="%">100%</output></span><input type="range" name="${quality ? 'value' : 'quality'}" min="0" max="100" step="5" value="100"></label>
    <label class="sc-field"><span>Note</span><input class="sc-input" name="note" placeholder="optional"></label>
    <div class="term-actions"><button class="sc-button sc-button--primary" type="submit">Log it</button><button class="sc-button sc-button--ghost" type="button" data-action="log-cancel">Back</button></div>
  </form>`;
}

/** Settings: the Portal pairing (the iPhone app), the player's Planner name, Planner's server. */
export function settingsSheet(ctx) {
  const s = ctx.settings || {};
  const hosted = !!ctx.hosted;
  return `
  <section class="view term-view" aria-labelledby="settings-h">
    <div class="term-head">
      <button class="sc-button sc-button--ghost term-back" data-action="back" aria-label="Back">◀</button>
      <h2 id="settings-h" class="term-title">Settings</h2>
    </div>
    <div class="sc-panel pad stack">
      <h2>Sync</h2>
      <p class="small">${s.paired ? `Signed in to <b>${esc(s.url)}</b>.` : 'Not signed in: your work stays on this device until you are.'}</p>
      ${hosted
    ? `<div class="term-actions">${s.paired ? '<button class="sc-button" data-action="sign-out">Sign out</button>' : '<button class="sc-button sc-button--primary" data-action="pair">Sign in to the Portal</button>'}</div>`
    : ''}
      <p class="small sc-faint">${esc(s.planner || '')}</p>
    </div>
    <form class="sc-panel pad stack" data-form="settings" id="settings-form">
      <h2>Planner</h2>
      <label class="sc-field"><span>Your name in Planner</span><input class="sc-input" name="plannerName" value="${esc(s.plannerName || '')}" placeholder="${esc(s.name || 'Player')}" autocomplete="off"></label>
      <label class="sc-field"><span>Planner server URL (optional)</span><input class="sc-input" name="url" type="url" value="${esc(s.plannerUrl || '')}" placeholder="https://…/w/project" autocomplete="off"></label>
      <label class="sc-field"><span>Token (optional)</span><input class="sc-input" name="token" type="password" value="${esc(s.plannerToken || '')}" autocomplete="off"></label>
      <div class="term-actions"><button class="sc-button sc-button--primary" type="submit">Save</button><button class="sc-button" type="button" data-action="planner-pull">Read now</button></div>
    </form>
  </section>`;
}
