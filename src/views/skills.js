// Skills: stats → skills, with levels, XP and how much mastery has cut their
// energy cost. Also where the 4–6 stats themselves are renamed, added, removed.

import { makeSkill, newId, dayOf } from '../model.js';
import { TREES, SKILLS, treeSkills, treeDepth, unlockState, depthFor, rankFor, statId, skillRecordId } from '../board.js';
import { techniquesOf, techniqueState, ceilingOf, STATES } from '../techniques.js';
import { esc, fmtPts, materialize } from '../util.js';

const MIN_STATS = 4;
const MAX_STATS = 6;
const meter = (into, span, cls = '') => `<div class="sc-meter ${cls}"><span style="--value: ${span ? Math.max(0, Math.min(100, (into / span) * 100)) : 0}%"></span></div>`;

function statPanel(ctx, s) {
  const skills = ctx.g.skills.filter((k) => k.stat === s.id);
  const removable = ctx.g.stats.length > MIN_STATS && !skills.length;
  return `
  <section class="sc-panel pad stack" data-stat="${esc(s.id)}">
    <div class="row-between">
      <div class="row"><span class="big">${esc(s.icon || '◇')}</span><h2>${esc(s.name)}</h2>${s.underdog ? '<span class="sc-pill" style="--tint: var(--sc-accent-2)">underdog +50%</span>' : ''}</div>
      <span class="sc-badge">LV ${s.level}</span>
    </div>
    ${meter(s.into, s.span, 'meter-app')}
    <div class="small sc-faint num">${fmtPts(s.xp)} XP · ${fmtPts(s.toNext)} to next · ${fmtPts(s.lastWeek)} pts in the last 7 days</div>
    ${skills.length ? `<div class="list">${skills.map((k) => `
      <div class="item" data-skill="${esc(k.id)}">
        <div class="item-head"><span class="item-title">${esc(k.name)}</span><span class="sc-badge">LV ${k.level}</span></div>
        ${meter(k.into, k.span)}
        <div class="row small sc-muted"><span class="num">${fmtPts(k.xp)} XP</span><span class="num">${fmtPts(k.toNext)} to LV ${k.level + 1}</span><span>energy ×${k.energyFactor}</span>${k.place ? `<span>${esc(ctx.db.place.get(k.place)?.name || '')}</span>` : ''}</div>
      </div>`).join('')}</div>` : '<div class="small sc-faint">No skills here yet.</div>'}
    ${ctx.ui.editStat === s.id ? `
      <form class="stack" data-form="stat">
        <input type="hidden" name="id" value="${esc(s.id)}">
        <div class="form-grid">
          <label class="sc-field"><span>Name</span><input class="sc-input" name="name" required value="${esc(s.name)}"></label>
          <label class="sc-field"><span>Icon</span><input class="sc-input" name="icon" maxlength="4" value="${esc(s.icon || '')}"></label>
          <button class="sc-button sc-button--primary" type="submit">Save</button>
        </div>
        <div class="row"><button class="sc-button sc-button--danger sc-button--sm" type="button" data-action="remove-stat" data-stat="${esc(s.id)}" ${removable ? '' : 'disabled'} title="${removable ? '' : skills.length ? 'Move or keep its skills first' : `At least ${MIN_STATS} stats`}">Remove stat</button>
        <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="cancel-stat">Cancel</button></div>
      </form>` : `<div class="row"><button class="sc-button sc-button--ghost sc-button--sm" data-action="edit-stat" data-stat="${esc(s.id)}">Rename</button></div>`}
  </section>`;
}


// ─── the board, drawn as a tree (SPEC.md › The board › Tiers) ──────────────
// Diablo's shape: tier rows, a skill standing on the one below it, locked
// nodes greyed with what is missing. A lock never means "you may not do this
// work" — it means the skill cannot be focused yet, because deliberate
// practice on modularity before you can model is not practice.

/** Minutes logged per board skill id, from every completion that points at one. */
function minutesBySkill(db) {
  const m = new Map();
  for (const d of db.done) {
    const rec = db.skill.get(db.task.get(d.task)?.skill);
    const id = rec?.skill;
    if (!id) continue;
    m.set(id, (m.get(id) || 0) + (d.minutes || 0));
  }
  for (const r of db.rework) {
    const rec = db.skill.get(db.task.get(r.task)?.skill);
    const id = rec?.skill;
    if (!id) continue;
    m.set(id, (m.get(id) || 0) + (r.minutes || 0));
  }
  return m;
}

/** Attempts per technique for one skill, oldest first, from the records. */
function attemptsFor(db, skillId) {
  const m = new Map();
  for (const t of db.techniques || []) {
    if (t.skill !== skillId) continue;
    m.set(t.technique, [...(m.get(t.technique) || []), { at: t.at, clean: !!t.clean }]);
  }
  return m;
}

/**
 * The ladder as pips: one per technique, lit when held. A badge is a claim
 * about what the player can do now, so shaky and lost read differently from
 * held, and the next one is always named — there is always something to chase.
 */
function ladder(db, s) {
  const list = techniquesOf(s.id);
  if (!list.length) return { html: '', rank: 0 };
  const attempts = attemptsFor(db, s.id);
  const c = ceilingOf(s.id, attempts);
  const pips = list.map((t) => {
    const st = techniqueState(attempts.get(t.id) || []);
    return `<span class="tech-pip tech-${st.state}" title="${esc(`${t.name} — ${t.note}. Held: ${t.held}.`)}" aria-label="${esc(`${t.name}: ${st.state}`)}"></span>`;
  }).join('');
  const line = c.technique
    ? `${esc(c.technique.name)}${c.next ? ` · next: ${esc(c.next.name)}` : ' · the top of the ladder'}`
    : `next: ${esc(c.next?.name || '')}`;
  return { html: `<div class="tech"><div class="tech-pips">${pips}</div><div class="tech-line">${line}</div></div>`, rank: c.rank };
}

function skillNode(ctx, s, mins, live) {
  const worked = mins.get(s.id) || 0;
  const depth = depthFor(worked);
  const state = s.graded ? unlockState(s.id, mins) : { unlocked: true, reasons: [] };
  const cls = ['tree-node', 'sc-card', state.unlocked ? '' : 'is-locked'].filter(Boolean).join(' ');
  const tags = [
    s.oneShot ? '<span class="sc-pill" style="--tint: var(--sc-warning)">right once</span>' : '',
    s.dormant ? '<span class="sc-pill">seasonal</span>' : '',
  ].join('');
  const lad = ladder(ctx.db, s);
  return `<div data-skill="${esc(s.id)}"${s.tier ? ` data-tier="${s.tier}"` : ''}${lad.html ? ` data-ceiling="${lad.rank}"` : ''} class="${cls}">
    <div class="tree-head">
      <span class="tree-icon" aria-hidden="true">${esc(s.icon)}</span>
      <span class="tree-name">${esc(s.name)}</span>
      ${s.graded ? `<span class="sc-badge" title="Depth — log2 of the hours in it">${esc(rankFor(depth))} ${depth}</span>` : ''}
    </div>
    <div class="tree-plain">${esc(s.plain)}</div>
    ${s.unit ? `<div class="tree-line"><span class="tree-label">one unit</span> ${esc(s.unit)}</div>` : ''}
    <div class="tree-line"><span class="tree-label">measured by</span> ${esc(s.meter)}</div>
    ${lad.html}
    ${tags ? `<div class="pills">${tags}</div>` : ''}
    ${state.unlocked ? '' : `<div class="tree-lock"><span class="tree-lock-mark" aria-hidden="true">🔒</span> ${state.reasons.map((r) => esc(r)).join(' ')}</div>`}
  </div>`;
}

function treePanel(ctx, tree, mins) {
  const skills = treeSkills(tree.id);
  const stat = ctx.g.stats.find((x) => x.id === statId(tree.id));
  const depth = treeDepth(tree.id, mins);
  const tiers = [...new Set(skills.map((s) => s.tier).filter(Boolean))].sort((a, b) => a - b);
  const body = tiers.length
    ? tiers.map((n) => `<div class="tree-tier"><span class="tree-tier-label">T${n}</span>
        <div class="tree-row">${skills.filter((s) => s.tier === n).map((s) => skillNode(ctx, s, mins)).join('')}</div>
      </div>`).join('')
    : `<div class="tree-row">${skills.map((s) => skillNode(ctx, s, mins)).join('')}</div>`;
  return `<section class="sc-panel pad stack tree-panel" data-tree="${esc(tree.id)}">
    <div class="row-between">
      <div class="row"><span class="big">${esc(tree.icon)}</span><h2>${esc(tree.name)}</h2><span class="small sc-faint">${esc(tree.plain)}</span></div>
      <div class="row">${stat ? `<span class="sc-badge">LV ${stat.level}</span>` : ''}
      ${tree.graded ? `<span class="sc-badge" data-tree-depth="${depth}" title="Every hour spent anywhere in this tree">tree depth ${depth}</span>` : '<span class="small sc-faint">never graded</span>'}</div>
    </div>
    ${stat ? `${meter(stat.into, stat.span, 'meter-app')}
      <div class="small sc-faint num">${fmtPts(stat.xp)} XP · ${fmtPts(stat.toNext)} to next · ${fmtPts(stat.lastWeek)} pts in the last 7 days
        <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="edit-stat" data-stat="${esc(stat.id)}">Rename</button></div>` : ''}
    ${body}
  </section>`;
}

/** The board, when the player has adopted it. */
function boardTree(ctx) {
  const mins = minutesBySkill(ctx.db);
  return `<div class="grid tree-grid">${TREES.map((t) => treePanel(ctx, t, mins)).join('')}</div>`;
}

const boardAdopted = (db) => TREES.every((t) => !!db.stat.get(statId(t.id)));

export function render(ctx) {
  const { db, g } = ctx;
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  return `<div class="view">
    <form class="sc-panel sc-panel--lit pad stack" data-form="skill" id="skill-form">
      <h2>New skill</h2>
      <div class="form-grid">
        <label class="sc-field"><span>Name</span><input class="sc-input" name="name" required placeholder="e.g. Purchasing"></label>
        <label class="sc-field"><span>Stat</span><select class="sc-select" name="stat">${g.stats.map((s) => opt(s.id, s.name)).join('')}</select></label>
        <label class="sc-field"><span>Place</span><select class="sc-select" name="place">${opt('', 'anywhere')}${db.places.map((p) => opt(p.id, `${p.name} (${p.zone})`)).join('')}</select></label>
        <button class="sc-button sc-button--primary" type="submit">Add skill</button>
      </div>
    </form>
    <div class="row-between"><h2>Stats · ${g.stats.length}</h2>
      ${g.stats.length < MAX_STATS ? '<button class="sc-button sc-button--sm" data-action="add-stat">+ Add stat</button>' : `<span class="small sc-faint">${MAX_STATS} is the most</span>`}</div>
    ${ctx.ui.addStat ? `<form class="sc-panel pad" data-form="stat"><div class="form-grid">
        <label class="sc-field"><span>Name</span><input class="sc-input" name="name" required></label>
        <label class="sc-field"><span>Icon</span><input class="sc-input" name="icon" maxlength="4" value="◇"></label>
        <button class="sc-button sc-button--primary" type="submit">Add stat</button>
        <button class="sc-button sc-button--ghost" type="button" data-action="cancel-stat">Cancel</button></div></form>` : ''}
    ${boardAdopted(db) ? boardTree(ctx) : `<div class="grid">${g.stats.map((s) => statPanel(ctx, s)).join('')}</div>`}
    <p class="small sc-faint">Levels: a skill needs 100 × L XP from level L to L+1, a stat 300 × L, you 500 × L. Each skill level cuts a task's energy by 7.5%, down to a quarter. Rework takes XP away, so levels can drop.</p>
  </div>`;
}

/** Stat writes go through here: the first edit writes all the defaults it replaces. */
async function saveStats(ctx, changes) {
  const base = materialize('stat', ctx.store.allRecords().filter((r) => !r.deletedAt));
  const byId = new Map(base.map((r) => [r.id, r]));
  for (const c of changes) byId.set(c.id, { ...(byId.get(c.id) || ctx.store.getRecord(c.id) || {}), ...c });
  await ctx.store.save([...byId.values()]);
}

export const actions = {
  'edit-stat': (el, ctx) => { ctx.ui.editStat = el.dataset.stat; ctx.ui.addStat = false; ctx.render({ force: true }); },
  'add-stat': (el, ctx) => { ctx.ui.addStat = true; ctx.ui.editStat = null; ctx.render({ force: true }); },
  'cancel-stat': (el, ctx) => { ctx.ui.addStat = false; ctx.ui.editStat = null; ctx.render({ force: true }); },
  'remove-stat': async (el, ctx) => {
    const s = ctx.db.stat.get(el.dataset.stat);
    if (ctx.g.stats.length <= MIN_STATS) throw new Error(`Keep at least ${MIN_STATS} stats.`);
    if (ctx.db.skills.some((k) => k.stat === s.id)) throw new Error('That stat still has skills.');
    if (!(await ctx.confirm('Remove stat?', `Remove <b>${esc(s.name)}</b>?`, 'Remove', 'danger'))) return;
    ctx.ui.editStat = null;
    await saveStats(ctx, []);
    await ctx.store.remove(ctx.store.getRecord(s.id));
  },
};

export const forms = {
  skill: async (d, form, ctx) => {
    const rec = makeSkill(ctx.db, { name: d.name.trim(), stat: d.stat, place: d.place || null });
    await ctx.store.save(rec);
    ctx.toast(`${rec.name} added.`, 'success');
  },
  stat: async (d, form, ctx) => {
    const name = (d.name || '').trim();
    if (!name) throw new Error('A stat needs a name.');
    if (d.id) {
      ctx.ui.editStat = null;
      await saveStats(ctx, [{ id: d.id, name, icon: (d.icon || '').trim() }]);
    } else {
      if (ctx.g.stats.length >= MAX_STATS) throw new Error(`${MAX_STATS} stats is the most.`);
      const order = Math.max(0, ...ctx.g.stats.map((s) => s.order ?? 0)) + 1;
      ctx.ui.addStat = false;
      await saveStats(ctx, [{ id: newId('stat'), type: 'stat', name, icon: (d.icon || '').trim() || '◇', order }]);
    }
  },
};
