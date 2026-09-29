// Settings: sync, the hero, places, moment kinds, sound, backup.

import { makePlace, newId, ZONES } from '../model.js';
import { esc, materialize } from '../util.js';
import { TREES, SKILLS, boardRecords, statId } from '../board.js';
import { STARTER_RULES } from '../board-routing.js';
import { validateWorld, worldRecord, worldFor } from '../game/world.js';
import { modeSwitch } from '../mode.js';

/** Starting colours for the hero sprite — data for the replay, not page styling. */
export const HERO_DEFAULTS = { hair: '#4a3222', skin: '#e0b48c', shirt: '#2f7fd0', trousers: '#34405a' };
const HERO_PARTS = [['hair', 'Hair'], ['skin', 'Skin'], ['shirt', 'Shirt'], ['trousers', 'Trousers']];

const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;

function syncSection(ctx) {
  const s = ctx.store.getSettings();
  const st = ctx.store.syncStatus();
  if (ctx.store.inPortal()) {
    return `<section class="sc-panel pad stack" id="sync">
      <h2>Sync</h2>
      <p class="sc-muted" style="margin:0">Synced through the Portal, workspace <span class="sc-mono">flow</span>. Your sign-in is the credential: nothing to paste.</p>
      <sc-sync-status></sc-sync-status>
    </section>`;
  }
  return `<form class="sc-panel pad stack" data-form="sync" id="sync">
    <h2>Sync</h2>
    <p class="small sc-muted" style="margin:0">Off the Portal, point Flow at a sync-kit server's workspace, e.g. <span class="sc-mono">https://host/w/flow</span>, with a device token.</p>
    <div class="form-grid">
      <label class="sc-field wide"><span>Server URL</span><input class="sc-input" name="url" type="url" value="${esc(s.url)}" placeholder="https://…/w/flow" autocomplete="off"></label>
      <label class="sc-field wide"><span>Token</span><input class="sc-input" name="token" type="password" value="${esc(s.token)}" autocomplete="off"></label>
      <label class="check-field"><input class="sc-check" type="checkbox" name="enabled" ${s.enabled || !s.url ? 'checked' : ''}> Sync on</label>
      <button class="sc-button sc-button--primary" type="submit">Save</button>
    </div>
    ${ctx.native?.hosted ? '<div class="row"><button class="sc-button sc-button--sm" type="button" data-action="portal-pair">Sign in to the Portal</button><button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="portal-sign-out">Sign out</button></div>' : ''}
    <sc-sync-status></sc-sync-status>
    ${st.lastError ? `<div class="sc-alert sc-alert--danger small"><strong>Last error</strong> ${esc(st.lastError)}</div>` : ''}
  </form>`;
}

/** Project Planner, read-only: where its workspace is read from, and how the last read went. */
function plannerSection(ctx) {
  const st = ctx.store.plannerStatus?.() || { configured: false, plans: 0, tasks: 0 };
  const ps = ctx.store.plannerSettingsNow?.() || { url: '', token: '' };
  const state = `<div class="small sc-faint" id="planner-status">${st.configured ? `${st.plans} plan${st.plans === 1 ? '' : 's'} · ${st.tasks} task${st.tasks === 1 ? '' : 's'} for you${st.lastPullAt ? ` · read ${new Date(st.lastPullAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}${st.since ? ` · finishes logged since ${new Date(st.since).toLocaleDateString()}` : ''}` : 'Not connected.'}</div>
    ${st.lastError ? `<div class="sc-alert sc-alert--danger small"><strong>Last error</strong> ${esc(st.lastError)}</div>` : ''}`;
  const intro = '<p class="small sc-muted" style="margin:0">Your Planner tasks show up in Tasks and Now. Flow only reads Planner: tick tasks off there, and a finish or a reopen is logged here.</p>';
  if (st.portal) {
    return `<section class="sc-panel pad stack" id="planner">
      <h2>Project Planner</h2>${intro}
      <p class="small sc-muted" style="margin:0">Read through the Portal, workspace <span class="sc-mono">project</span>.</p>
      <div class="row"><button class="sc-button sc-button--sm" data-action="planner-pull">Read now</button></div>${state}
    </section>`;
  }
  return `<form class="sc-panel pad stack" data-form="planner" id="planner">
    <h2>Project Planner</h2>${intro}
    <div class="form-grid">
      <label class="sc-field wide"><span>Planner server URL</span><input class="sc-input" name="url" type="url" value="${esc(ps.url)}" placeholder="https://…/w/project" autocomplete="off"></label>
      <label class="sc-field wide"><span>Token (blank: Flow's)</span><input class="sc-input" name="token" type="password" value="${esc(ps.token)}" autocomplete="off"></label>
      <button class="sc-button sc-button--primary" type="submit">Save</button>
      ${st.configured ? '<button class="sc-button sc-button--sm" type="button" data-action="planner-pull">Read now</button>' : ''}
    </div>${state}
  </form>`;
}

function placesSection(ctx) {
  const { db } = ctx;
  const zoneSel = (z) => `<select class="sc-select" name="zone">${ZONES.map((x) => opt(x, x, x === z)).join('')}</select>`;
  return `<section class="sc-panel pad stack" id="places">
    <h2>Places</h2>
    <div class="list">${db.places.map((p) => `
      <form class="form-grid" data-form="place"><input type="hidden" name="id" value="${esc(p.id)}">
        <label class="sc-field"><span>Name</span><input class="sc-input" name="name" required value="${esc(p.name)}"></label>
        <label class="sc-field"><span>Zone</span>${zoneSel(p.zone)}</label>
        <div class="row"><button class="sc-button sc-button--sm" type="submit">Save</button><button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="remove-place" data-id="${esc(p.id)}">Remove</button></div>
      </form>`).join('')}</div>
    <form class="form-grid" data-form="place" id="add-place">
      <label class="sc-field"><span>New place</span><input class="sc-input" name="name" required placeholder="e.g. Library"></label>
      <label class="sc-field"><span>Zone</span>${zoneSel('town')}</label>
      <button class="sc-button sc-button--primary sc-button--sm" type="submit">Add place</button>
    </form>
  </section>`;
}

/**
 * The iPhone app only: mark Flow places for arrive / leave. The shell reads
 * the location and keeps it on this device; the page only ever sends and
 * sees place ids and names.
 */
function geofenceSection(ctx) {
  const n = ctx.native;
  if (n?.platform !== 'ios') return '';
  const st = n.state?.geofence;
  const set = new Set((st?.places || []).filter((p) => p.set).map((p) => p.id));
  return `<section class="sc-panel pad stack" id="geofences">
    <h2>Places on this iPhone</h2>
    <p class="small sc-muted" style="margin:0">Stand at a place and set it: Flow notes when you arrive and leave, and logs the drive between two places. Where a place is stays on this iPhone; only its name reaches your records.</p>
    ${st && !st.authorized ? '<div class="sc-alert sc-alert--warning small"><strong>Location is off</strong> Allow Flow to use your location (Always, for arrive and leave) in the iPhone Settings app. Everything else works without it.</div>' : ''}
    <div class="list">${ctx.db.places.map((p) => `
      <div class="item" data-geofence="${esc(p.id)}">
        <div class="item-head"><span class="item-title">${esc(p.name)}</span><span class="small sc-faint">${set.has(p.id) ? 'set on this iPhone' : 'not set'}</span></div>
        <div class="row"><button class="sc-button sc-button--sm" data-action="geofence-set" data-id="${esc(p.id)}">Set to where I am now</button>${set.has(p.id) ? `<button class="sc-button sc-button--ghost sc-button--sm" data-action="geofence-clear" data-id="${esc(p.id)}">Clear</button>` : ''}</div>
      </div>`).join('')}</div>
  </section>`;
}

function kindsSection(ctx) {
  const { db } = ctx;
  const placeSel = (v) => `<select class="sc-select" name="place">${opt('', '—', !v)}${db.places.map((p) => opt(p.id, p.name, p.id === v)).join('')}</select>`;
  const fields = (k = {}) => `
    <label class="sc-field"><span>Icon</span><input class="sc-input" name="icon" maxlength="4" value="${esc(k.icon || '')}"></label>
    <label class="sc-field"><span>Title</span><input class="sc-input" name="title" required value="${esc(k.title || '')}"></label>
    <label class="sc-field"><span>Place</span>${placeSel(k.place)}</label>
    <label class="sc-field"><span>Stamina / h</span><input class="sc-input" type="number" step="0.5" min="-10" max="10" name="staminaPerHour" value="${esc(k.staminaPerHour ?? 0)}"></label>
    <label class="sc-field"><span>Mana / h</span><input class="sc-input" type="number" step="0.5" min="-10" max="10" name="manaPerHour" value="${esc(k.manaPerHour ?? 0)}"></label>`;
  return `<section class="sc-panel pad stack" id="kinds">
    <h2>Moment kinds</h2>
    <p class="small sc-faint" style="margin:0">Energy per hour; negative restores. Moments never earn or cost points.</p>
    <div class="list">${db.kinds.map((k) => `
      <form class="form-grid item" data-form="kind"><input type="hidden" name="id" value="${esc(k.id)}">${fields(k)}
        <div class="row"><button class="sc-button sc-button--sm" type="submit">Save</button><button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="remove-kind" data-id="${esc(k.id)}">Remove</button></div>
      </form>`).join('')}</div>
    <form class="form-grid" data-form="kind" id="add-kind">${fields({ icon: '•' })}<button class="sc-button sc-button--primary sc-button--sm" type="submit">Add kind</button></form>
  </section>`;
}

/** Play's world: the generic one, or a private pack imported from a flow.world file. */
function worldSection(ctx) {
  const pack = ctx.db.world;
  return `<section class="sc-panel pad stack" id="world-pack">
    <h2>World pack</h2>
    <p class="small sc-muted" style="margin:0">Play and Replay draw ${pack ? `your pack, <b>${esc(worldFor(ctx.db).name)}</b>` : 'the generic world'}. A pack is a private <span class="sc-mono">flow.world</span> file: your own rooms, places and people. It syncs to your devices like your tasks.</p>
    <div class="row"><label class="sc-button" style="cursor:pointer">Import…<input type="file" accept=".json,application/json" data-world-import hidden></label>
      ${pack ? '<button class="sc-button sc-button--ghost" data-action="world-remove">Remove</button>' : ''}</div>
  </section>`;
}

/** The look: Game mode (the handheld) or the HUD, per device; the HUD's palette in the HUD. */
function appearanceSection(ctx) {
  const mode = ctx.mode === 'game' ? 'game' : 'hud';
  return `<section class="sc-panel pad stack" id="appearance">
    <h2>Appearance</h2>
    <div class="row">${modeSwitch(mode, { id: 'mode-switch-settings' })}</div>
    <p class="small sc-muted" style="margin:0">${mode === 'game' ? 'Game mode: every screen in the handheld look. Turn it off for the HUD.' : 'Game mode turns on the handheld look for every screen. Only this device changes; your records do not.'}</p>
    ${mode === 'hud' ? '<sc-theme-picker></sc-theme-picker>' : ''}
  </section>`;
}


/**
 * The board (SPEC.md › The board: seven trees) and the rules that route tasks
 * onto it. Adopting is a write the player makes deliberately — it seeds seven
 * stats and their skills — and without routing the whole week reads as one
 * skill called Work, so the two live together.
 */
function boardSection(ctx) {
  const { db } = ctx;
  const adopted = TREES.every((t) => db.stat.get(statId(t.id)));
  const rules = Array.isArray(db.settings.routing) ? db.settings.routing : [];
  const options = SKILLS.filter((k) => k.graded)
    .map((k) => `<option value="${esc(k.id)}">${esc(k.name)} · ${esc(k.plain)}</option>`).join('');
  const rows = rules.map((r, i) => `<li class="rule-row">
    <span class="rule-match">${r.project ? `project <b>${esc(r.project)}</b>` : ''}${r.project && r.pattern ? ' and ' : ''}${r.pattern ? `title matches <code>${esc(r.pattern)}</code>` : ''}</span>
    <span class="rule-arrow" aria-hidden="true">→</span>
    <span class="rule-skill">${esc(SKILLS.find((k) => k.id === r.skill)?.name || r.skill)}</span>
    <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="drop-rule" data-index="${i}">Remove</button>
  </li>`).join('');
  return `<section class="sc-panel pad stack" id="board">
    <div class="row-between"><h2>The board</h2><span class="small sc-faint">${adopted ? `${TREES.length} trees · ${SKILLS.length} skills` : 'not adopted yet'}</span></div>
    ${adopted ? '' : `<div class="muted-box"><p>Seven trees — ${TREES.map((t) => esc(t.name)).join(' · ')} — and the skills under them. Adopting writes them as your stats and skills; nothing already logged is touched.</p>
      <div class="row"><button class="sc-button sc-button--primary" type="button" data-action="adopt-board">Adopt the board</button></div></div>`}
    <div class="stack">
      <h3>Routing</h3>
      <p class="small sc-faint" style="margin:0">A task joins a skill only when it is an instance of that skill's unit of output. Everything else is Toil, and Toil is the number to drive down. Planner's own skill wins where it has one; otherwise the first rule that matches, in this order.</p>
      ${rows ? `<ul class="list rule-list">${rows}</ul>` : `<div class="muted-box"><p>No rules yet, so every Planner task is Toil until Planner names a skill for it.</p>${
        adopted ? `<div class="row"><button class="sc-button" type="button" data-action="starter-rules">Take the ${STARTER_RULES.length} starter rules</button></div>` : ''}</div>`}
      <form class="stack" data-form="routing">
        <div class="form-grid">
          <label class="sc-field"><span>Project is</span><input class="sc-input" name="project" placeholder="e.g. Swagelok Bellows Project"></label>
          <label class="sc-field"><span>or title matches</span><input class="sc-input" name="pattern" placeholder="e.g. ^Release Drawing"></label>
          <label class="sc-field"><span>route to</span><select class="sc-select" name="skill" required>${options}</select></label>
          <button class="sc-button" type="submit">Add rule</button>
        </div>
      </form>
    </div>
  </section>`;
}

export function render(ctx) {
  const set = ctx.db.settings;
  const hero = { ...HERO_DEFAULTS, ...(set.hero || {}) };
  return `<div class="view">
    ${syncSection(ctx)}
    ${boardSection(ctx)}
    <form class="sc-panel pad stack" data-form="player" id="player">
      <h2>Player</h2>
      <div class="form-grid">
        <label class="sc-field"><span>Name</span><input class="sc-input" name="name" value="${esc(set.name || 'Player')}"></label>
        <label class="sc-field"><span>Your name in Planner</span><input class="sc-input" name="plannerName" value="${esc(set.plannerName || '')}" placeholder="${esc(set.name || 'Player')}"></label>
        <label class="sc-field wide"><span>Mission</span><input class="sc-input" name="mission" value="${esc(set.mission || '')}" placeholder="what the game is for"></label>
        <label class="check-field"><input class="sc-check" type="checkbox" name="sound" data-setting="sound" ${set.sound ? 'checked' : ''}> Replay sound (chiptune)</label>
        <button class="sc-button sc-button--primary" type="submit">Save</button>
      </div>
    </form>
    <form class="sc-panel pad stack" data-form="hero" id="hero">
      <h2>Hero colours</h2>
      <div class="form-grid">${HERO_PARTS.map(([k, l]) => `<label class="sc-field"><span>${l}</span><input type="color" name="${k}" value="${esc(hero[k])}"></label>`).join('')}
        <button class="sc-button sc-button--primary" type="submit">Save hero</button></div>
    </form>
    ${plannerSection(ctx)}
    ${placesSection(ctx)}
    ${geofenceSection(ctx)}
    ${kindsSection(ctx)}
    ${worldSection(ctx)}
    <section class="sc-panel pad stack" id="backup">
      <h2>Backup</h2>
      <p class="small sc-muted" style="margin:0">Every record, deletions included, in one file. Importing merges by the newer edit and never deletes.</p>
      <div class="row"><button class="sc-button" data-action="export">Export</button>
        <label class="sc-button" style="cursor:pointer">Import…<input type="file" accept=".json,application/json" data-import hidden></label></div>
      <div class="small sc-faint">This device <span class="sc-mono">${esc(ctx.store.deviceId())}</span> · store ${esc(ctx.store.storeKind())} · ${ctx.store.allRecords().length} records · storage ${esc(ctx.store.persistence())}</div>
    </section>
    ${appearanceSection(ctx)}
  </div>`;
}

function settingsRecord(ctx) {
  return ctx.store.getRecord('settings') || { id: 'settings', type: 'settings', name: 'Player', mission: '' };
}
async function saveSettings(ctx, changes) {
  const cur = settingsRecord(ctx);
  await ctx.store.save({ ...cur, id: 'settings', type: 'settings', ...changes });
}

/** Places and kinds: the first edit writes the defaults it replaces. */
async function saveList(ctx, type, rec) {
  const base = materialize(type, ctx.store.allRecords().filter((r) => !r.deletedAt));
  const byId = new Map(base.map((r) => [r.id, r]));
  byId.set(rec.id, { ...(byId.get(rec.id) || ctx.store.getRecord(rec.id) || {}), ...rec });
  await ctx.store.save([...byId.values()]);
}

export const actions = {
  /** Seed the seven trees and their skills. Deliberate: it is a write to definitions. */
  'adopt-board': async (el, ctx) => {
    await ctx.store.save(boardRecords());
    ctx.toast(`The board is yours: ${TREES.length} trees, ${SKILLS.length} skills.`, 'success');
    ctx.render?.({ force: true });
  },

  /** The starter set, written in order. Offered only while there are no rules. */
  'starter-rules': async (el, ctx) => {
    await ctx.store.save({ ...ctx.store.getRecord('settings'), id: 'settings', type: 'settings', routing: [...STARTER_RULES] });
    ctx.toast(`${STARTER_RULES.length} rules added. Edit or remove any of them.`, 'success');
    ctx.render?.({ force: true });
  },

  'drop-rule': async (el, ctx) => {
    const i = Number(el.dataset.index);
    const rules = [...(ctx.db.settings.routing || [])];
    if (!(i >= 0 && i < rules.length)) return;
    rules.splice(i, 1);
    await ctx.store.save({ ...ctx.store.getRecord('settings'), id: 'settings', type: 'settings', routing: rules });
    ctx.render?.({ force: true });
  },

  'sync-now': async (el, ctx) => { await ctx.store.syncNow(); ctx.render({ force: true }); },
  'planner-pull': async (el, ctx) => {
    await ctx.store.pullPlanner();
    const st = ctx.store.plannerStatus();
    ctx.toast(st.lastError ? `Planner: ${st.lastError}` : `Planner: ${st.tasks} task${st.tasks === 1 ? '' : 's'} for you.`, st.lastError ? 'danger' : 'success');
    ctx.render({ force: true });
  },
  export: async (el, ctx) => {
    const doc = await ctx.store.exportStore();
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flow-backup-${ctx.g.day}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ctx.toast(`Exported ${doc.counts.total} records.`, 'success');
  },
  'remove-place': async (el, ctx) => {
    const id = el.dataset.id;
    if (ctx.db.tasks.some((t) => t.place === id) || ctx.db.skills.some((s) => s.place === id)) throw new Error('A skill or task is at that place.');
    if (!(await ctx.confirm('Remove place?', 'Past moments keep it by id.', 'Remove', 'danger'))) return;
    await saveList(ctx, 'place', { id });
    await ctx.store.remove(ctx.store.getRecord(id));
  },
  'world-remove': async (el, ctx) => {
    const rec = ctx.store.getRecord('world');
    if (!rec) return;
    if (!(await ctx.confirm('Remove the world pack?', 'Play and Replay go back to the generic world. The file you imported is untouched.', 'Remove', 'danger'))) return;
    await ctx.store.remove(rec);
    ctx.toast('World pack removed: the generic world is back.', 'success');
    ctx.render({ force: true });
  },
  'geofence-set': (el, ctx) => {
    const p = ctx.db.place.get(el.dataset.id);
    if (!p || !ctx.native) return;
    ctx.native.setGeofence(p);
    ctx.toast(`${p.name}: marking where you are now…`);
  },
  'geofence-clear': (el, ctx) => {
    const p = ctx.db.place.get(el.dataset.id);
    if (p && ctx.native) ctx.native.clearGeofence(p);
  },
  'portal-pair': (el, ctx) => {
    // The Portal the Sync form names, if any; else the shell's own default.
    let origin = '';
    try { origin = new URL(globalThis.document?.querySelector('#sync [name=url]')?.value || ctx.store.getSettings().url).origin; } catch { /* none typed */ }
    ctx.native?.pair(origin === 'null' ? '' : origin);
  },
  'portal-sign-out': (el, ctx) => ctx.native?.signOut(),
  'remove-kind': async (el, ctx) => {
    await saveList(ctx, 'kind', { id: el.dataset.id, archived: true });
  },
};

export async function onChange(ev, ctx) {
  const t = ev.target;
  if (t.matches('[data-world-import]') && t.files?.[0]) {
    const r = validateWorld(await t.files[0].text());
    t.value = '';
    if (!r.ok) { ctx.toast(`World pack refused: ${r.reason}`, 'danger'); return; }
    await ctx.store.save(worldRecord(r.world));
    ctx.toast(`World pack imported: ${r.world.name}.`, 'success');
    ctx.render({ force: true });
  } else if (t.matches('[data-import]') && t.files?.[0]) {
    const text = await t.files[0].text();
    const r = await ctx.store.importStore(text);
    ctx.toast(`Imported: ${r.added} added, ${r.replaced} replaced, ${r.kept} kept.`, 'success');
    t.value = '';
  } else if (t.dataset.setting === 'sound') {
    await saveSettings(ctx, { sound: t.checked });
  }
}

export const forms = {
  routing: async (d, form, ctx) => {
    const project = String(d.project || '').trim();
    const pattern = String(d.pattern || '').trim();
    if (!project && !pattern) throw new Error('A rule needs a project or a title pattern.');
    if (pattern) { try { new RegExp(pattern, 'i'); } catch { throw new Error(`"${pattern}" is not a pattern I can read.`); } }
    if (!SKILLS.some((k) => k.id === d.skill)) throw new Error('Pick a skill on the board.');
    const rules = [...(ctx.db.settings.routing || []), { ...(project ? { project } : {}), ...(pattern ? { pattern } : {}), skill: d.skill }];
    await ctx.store.save({ ...ctx.store.getRecord('settings'), id: 'settings', type: 'settings', routing: rules });
    ctx.toast('Rule added.', 'success');
  },

  sync: async (d, form, ctx) => {
    await ctx.store.applySettings({ url: d.url, token: d.token, enabled: d.enabled === 'on' });
    const st = ctx.store.syncStatus();
    ctx.toast(st.lastError ? `Sync failed: ${st.lastError}` : ctx.store.syncConfigured() ? 'Sync on.' : 'Sync off.', st.lastError ? 'danger' : 'success');
    ctx.render({ force: true });
  },
  player: async (d, form, ctx) => { await saveSettings(ctx, { name: (d.name || '').trim() || 'Player', plannerName: (d.plannerName || '').trim(), mission: (d.mission || '').trim(), sound: d.sound === 'on' }); ctx.toast('Saved.', 'success'); },
  planner: async (d, form, ctx) => {
    await ctx.store.applyPlannerSettings({ url: d.url, token: d.token });
    const st = ctx.store.plannerStatus();
    ctx.toast(st.lastError ? `Planner: ${st.lastError}` : st.configured ? `Planner: ${st.tasks} task${st.tasks === 1 ? '' : 's'} for you.` : 'Planner off.', st.lastError ? 'danger' : 'success');
  },
  hero: async (d, form, ctx) => {
    const hero = Object.fromEntries(HERO_PARTS.map(([k]) => [k, /^#[0-9a-f]{6}$/i.test(d[k]) ? d[k] : HERO_DEFAULTS[k]]));
    await saveSettings(ctx, { hero });
    ctx.toast('Hero saved.', 'success');
  },
  place: async (d, form, ctx) => {
    if (d.id) {
      if (!ZONES.includes(d.zone)) throw new Error('Pick a zone.');
      await saveList(ctx, 'place', { id: d.id, type: 'place', name: d.name.trim(), zone: d.zone });
    } else {
      const rec = makePlace(ctx.db, { name: d.name.trim(), zone: d.zone });
      await saveList(ctx, 'place', rec);
      ctx.toast(`${rec.name} added.`, 'success');
    }
  },
  kind: async (d, form, ctx) => {
    const n = (v) => { const x = Number(v || 0); if (!Number.isFinite(x) || x < -10 || x > 10) throw new Error('Energy per hour is −10 to 10.'); return x; };
    if (!d.title?.trim()) throw new Error('A moment kind needs a title.');
    const rec = { id: d.id || newId('kind'), type: 'kind', title: d.title.trim(), icon: (d.icon || '').trim(), place: d.place || null, staminaPerHour: n(d.staminaPerHour), manaPerHour: n(d.manaPerHour) };
    await saveList(ctx, 'kind', rec);
    ctx.toast(`${rec.title} ${d.id ? 'saved' : 'added'}.`, 'success');
  },
};

export function mounted(view, ctx) {
  for (const el of view.querySelectorAll('sc-sync-status')) { try { el.status = ctx.store.syncStatus(); } catch { /* older widget */ } }
}
