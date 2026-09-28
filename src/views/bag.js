// Bag: what you own, and using it before buying more (SPEC.md › Inventory).
// The paper doll of a loadout and the gear bonus, a stash per storage place,
// the "have it" lookup with its skip, buying anyway, the shopping list, and
// money saved vs spent — what the CLI's inventory, have, loadout and skip do.
// It is also the house inventory (SPEC.md › House inventory): the stash browses
// by the place tree, a search finds anything by its details or where it is, and
// an item carries its details, photos and receipts; and it walks a reshelve
// plan through (SPEC.md › Reshelving).

import {
  inventory, findItems, makeItem, makeSkip, makeSpend, restockFor, makeWish, makeLoadout, gearBonus, SLOTS, SKIP_DAILY_CAP, SKIP_POINTS_PER_DOLLAR,
  makePlace, movePlace, placeRemoval, placeTree, placePath, placesWithin, searchItems, makeFile, filesOf, inventoryCSV, labelSheet,
  activeReshelve, reshelveView, markPulled, shelveMove, ZONES, PHOTO_MAX_PX, FILE_MAX_BYTES,
} from '../model.js';
import { esc, materialize } from '../util.js';
import { pixelIcon, heroSprite, textBox } from '../ds.js';

const SLOT_LABEL = { head: 'Head', body: 'Body', legs: 'Legs', feet: 'Feet', hands: 'Hands', bag: 'Bag', tech: 'Tech', vehicle: 'Vehicle' };
const usd = (x) => `$${Number.isInteger(Number(x)) ? Number(x) : Number(x).toFixed(2)}`;
const placeName = (db, id) => (id ? db.place.get(id)?.name || id : 'Unfiled');
const nowOf = (ctx) => ctx.now ?? Date.now();
const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Skip points left today, and what skipping a price would pay now. */
const skipLeft = (inv) => Math.max(0, SKIP_DAILY_CAP - inv.skipsToday.reduce((n, s) => n + (s.points || 0), 0));
const skipPoints = (price, left) => Math.max(0, Math.min(Math.round((Number(price) || 0) * SKIP_POINTS_PER_DOLLAR), left));
const isLow = (i) => i.consumable && (i.qty || 0) <= (i.lowStock || 0);

// ─── "have it" ──────────────────────────────────────────────────────────────

function haveSection(ctx, inv) {
  const { db, ui } = ctx;
  const h = ui.have;
  let result = '';
  if (h) {
    const hits = findItems(db, h.query).filter((x) => (x.item.qty || 0) > 0);
    const pts = skipPoints(h.price, skipLeft(inv));
    const exact = db.items.find((i) => !i.archived && i.name.toLowerCase() === h.query.toLowerCase());
    const total = hits.reduce((n, x) => n + (x.item.qty || 0), 0);
    const places = [...new Set(hits.map((x) => placeName(db, x.item.place)))];
    const body = hits.length
      ? `<p class="have-head">You own ${total}: ${esc(places.join(', '))}</p>
        <ul class="have-list">${hits.map(({ item }) => `<li>${pixelIcon(item.slot || 'item')}<span>${esc(item.name)} ×${item.qty} · ${esc(placeName(db, item.place))}${ctx.inUse?.has(item.id) ? ' · in use' : ''}</span></li>`).join('')}</ul>
        <div class="row">${hits.slice(0, 3).map(({ item }) => `<button class="sc-button sc-button--primary" data-action="skip" data-item="${esc(item.id)}">Use ${esc(item.name)} · skip +${pts} pts</button>`).join('')}</div>`
      : `<p class="have-head">You own nothing like “${esc(h.query)}”. Buying it is fine.</p>`;
    result = textBox({
      speaker: 'Bag',
      id: 'have-result',
      body: `${body}
        <div class="row">
          <button class="sc-button" data-action="spend"${exact ? ` data-item="${esc(exact.id)}"` : ''}>Buy anyway · ${usd(h.price)}${exact ? ' (restock)' : ''}</button>
          ${hits.length ? '' : '<button class="sc-button sc-button--ghost" data-action="wish-add">Add to shopping list</button>'}
          <button class="sc-button sc-button--ghost" data-action="have-cancel">Never mind</button>
        </div>
        <p class="small sc-muted">Skipping pays ${SKIP_POINTS_PER_DOLLAR} point a dollar, up to ${SKIP_DAILY_CAP} a day (${skipLeft(inv)} left today) — points, never XP. Buying anyway has no penalty.</p>`,
    });
  }
  return `
  <form class="sc-panel sc-panel--lit pad stack" data-form="have" id="have-form">
    <h2>Want to buy something?</h2>
    <div class="have-row">
      <label class="sc-field have-what"><span>What</span><input class="sc-input" name="query" required value="${esc(h?.query || '')}" placeholder="e.g. batteries, tape, a cable" autocomplete="off"></label>
      <label class="sc-field have-price"><span>Price $</span><input class="sc-input" type="number" name="price" min="0" step="0.01" value="${h ? esc(h.price) : ''}" placeholder="0"></label>
      <button class="sc-button sc-button--primary" type="submit">Check</button>
    </div>
    <p class="small sc-muted">Check your stash before you buy. Use what you own and skip the purchase: the price avoided becomes points and money saved.</p>
  </form>
  ${result}`;
}

// ─── the paper doll ─────────────────────────────────────────────────────────

function gearSection(ctx, inv) {
  const { db } = ctx;
  const a = inv.active;
  const skills = new Set();
  for (const id of Object.values(a?.slots || {})) for (const s of db.item.get(id)?.skills || []) skills.add(s);
  const rows = [...skills].map((sk) => ({ sk, b: gearBonus(db, { skill: sk }, nowOf(ctx)) })).filter((x) => x.b.item);
  return `<div class="gear-bonus" id="gear-bonus">
    <span class="sc-label">Gear bonus</span>
    ${rows.length ? rows.map(({ sk, b }) => `<span class="sc-pill" style="--tint: var(--accent)">${esc(b.item.name)} +${Math.round(b.bonus * 100)}% · ${b.uses} uses <span class="sc-muted">(${esc(db.skill.get(sk)?.name || sk)})</span></span>`).join('')
    : '<span class="small sc-muted">None yet.</span>'}
    <span class="small sc-muted">+1% per 10 completions of a skill done wearing an item linked to it, in the equipped loadout; up to +10%, best item only.</span>
  </div>`;
}

function loadoutForm(ctx, l, canCancel) {
  const items = ctx.db.items.filter((i) => !i.archived);
  const options = (slot, current) => {
    const fit = items.filter((i) => i.slot === slot);
    const rest = items.filter((i) => i.slot !== slot);
    return `${opt('', '— empty —', !current)}${[...fit, ...rest].map((i) => opt(i.id, i.name, i.id === current)).join('')}`;
  };
  return `
  <form class="stack loadout-form" data-form="loadout" id="loadout-form">
    <input type="hidden" name="id" value="${esc(l?.id || '')}">
    <h3>${l ? `Edit ${esc(l.name)}` : 'New loadout'}</h3>
    <div class="form-grid">
      <label class="sc-field wide"><span>Name</span><input class="sc-input" name="name" required value="${esc(l?.name || '')}" placeholder="e.g. Work bag, Gym bag, Car"></label>
      ${SLOTS.map((s) => `<label class="sc-field"><span>${SLOT_LABEL[s]}</span><select class="sc-select" name="slot_${s}">${options(s, l?.slots?.[s])}</select></label>`).join('')}
      <label class="sc-field wide"><span>Packing checklist</span><input class="sc-input" name="checklist" value="${esc((l?.checklist || []).join(', '))}" placeholder="comma-separated: Towel, Water bottle"></label>
      <label class="check-field"><input class="sc-check" type="checkbox" name="active" ${l?.active ? 'checked' : ''}> Equip it</label>
    </div>
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Save loadout</button>${canCancel ? '<button class="sc-button sc-button--ghost" type="button" data-action="loadout-cancel">Cancel</button>' : ''}</div>
  </form>`;
}

function dollSection(ctx, inv) {
  const { db, ui } = ctx;
  const loadouts = inv.loadouts.filter((l) => !l.archived);
  const shown = loadouts.find((l) => l.id === ui.loadout) || inv.active || loadouts[0] || null;
  const editing = ui.editLoadout ? (ui.editLoadout === 'new' ? null : loadouts.find((l) => l.id === ui.editLoadout)) : undefined;
  const isActive = (l) => l && inv.active?.id === l.id;
  const tabs = loadouts.map((l) => `<button type="button" class="chip" data-action="loadout-show" data-loadout="${esc(l.id)}" aria-pressed="${l.id === shown?.id}">${esc(l.name)}${isActive(l) ? ' <span class="chip-note">equipped</span>' : ''}</button>`).join('');
  const slots = SLOTS.map((slot) => {
    const it = shown ? db.item.get(shown.slots?.[slot]) : null;
    return `<div class="slot${it ? ' filled' : ''}" data-slot="${slot}"${it ? ` data-item="${esc(it.id)}"` : ''}>${pixelIcon(slot, { size: 3 })}<span class="slot-item">${it ? esc(it.name) : 'empty'}</span><span class="slot-name">${SLOT_LABEL[slot]}</span></div>`;
  }).join('');
  return `
  <section class="sc-panel pad stack" id="doll" aria-labelledby="doll-h">
    <div class="row-between"><h2 id="doll-h">Gear${shown ? ` · ${esc(shown.name)}` : ''}</h2>
      <div class="row">${shown ? (isActive(shown) ? '<span class="sc-badge">Equipped</span>' : `<button class="sc-button sc-button--primary sc-button--sm" data-action="equip" data-loadout="${esc(shown.id)}">Equip</button>`) : ''}
        ${shown ? `<button class="sc-button sc-button--ghost sc-button--sm" data-action="loadout-edit" data-id="${esc(shown.id)}">Edit</button>` : ''}
        ${loadouts.length ? '<button class="sc-button sc-button--sm" data-action="loadout-new">+ Loadout</button>' : ''}</div></div>
    ${loadouts.length ? `<div class="chips" role="group" aria-label="Loadouts">${tabs}</div>` : '<p class="sc-muted" style="margin:0">No loadouts yet. A loadout is what you carry for one context — Work bag, Gym bag, Car — slot by slot.</p>'}
    ${shown ? `<div class="doll">
      <div class="doll-hero">${heroSprite(db.settings.hero)}</div>
      <div class="slots">${slots}</div>
    </div>
    ${shown.checklist?.length ? `<div class="checklist"><span class="sc-label">Pack before you leave</span><ul>${shown.checklist.map((c) => `<li><label class="check-field"><input class="sc-check" type="checkbox"> ${esc(c)}</label></li>`).join('')}</ul></div>` : ''}` : ''}
    ${gearSection(ctx, inv)}
    ${editing !== undefined || !loadouts.length ? loadoutForm(ctx, editing || null, loadouts.length > 0) : ''}
  </section>`;
}

// ─── stashes ────────────────────────────────────────────────────────────────

function cell(ctx, inv, item, left) {
  const inUse = inv.inUse.has(item.id);
  const low = isLow(item);
  const tip = [`${item.name} ×${item.qty}`, placeName(ctx.db, item.place), inUse ? 'in use' : '', low ? 'low stock' : '', item.price ? `Skip buying +${skipPoints(item.price, left)} pts` : ''].filter(Boolean).join(' · ');
  const cls = ['cell', inUse && 'in-use', low && 'low', ctx.ui.itemShow === item.id && 'sel'].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" data-action="item-show" data-item="${esc(item.id)}" title="${esc(tip)}" aria-label="${esc(tip)}">${pixelIcon(item.slot || 'item', { size: 3 })}<span class="cell-name">${esc(item.name)}</span><i class="num">×${item.qty}</i></button>`;
}

function itemForm(ctx, item) {
  const { db } = ctx;
  const i = item || { qty: 1, price: '', lowStock: 0 };
  const id = item ? 'item-edit-form' : 'item-form';
  return `
  <form class="stack" data-form="item" id="${id}">
    <input type="hidden" name="id" value="${esc(item?.id || '')}">
    <div class="form-grid">
      <label class="sc-field"><span>Name</span><input class="sc-input" name="name" required value="${esc(i.name || '')}" placeholder="e.g. HDMI cable"></label>
      <label class="sc-field"><span>Category</span><input class="sc-input" name="category" value="${esc(i.category || '')}" placeholder="e.g. Cables"></label>
      <label class="sc-field"><span>Kept at</span><select class="sc-select" name="place">${placeOptions(db, i.place, 'Unfiled')}</select></label>
      <label class="sc-field"><span>How many</span><input class="sc-input" type="number" name="qty" min="0" step="1" value="${esc(i.qty)}"></label>
      <label class="sc-field"><span>Rough price $</span><input class="sc-input" type="number" name="price" min="0" step="0.01" value="${esc(i.price)}"></label>
      <label class="sc-field"><span>Worn in slot</span><select class="sc-select" name="slot">${opt('', '—', !i.slot)}${SLOTS.map((s) => opt(s, SLOT_LABEL[s], s === i.slot)).join('')}</select></label>
      <label class="sc-field"><span>Helps skill</span><select class="sc-select" name="skill">${opt('', '—', !i.skills?.length)}${db.skills.map((s) => opt(s.id, s.name, i.skills?.[0] === s.id)).join('')}</select></label>
      <label class="sc-field"><span>Aliases</span><input class="sc-input" name="aliases" value="${esc((i.aliases || []).join(', '))}" placeholder="other names, comma-separated"></label>
      <label class="check-field"><input class="sc-check" type="checkbox" name="consumable" ${i.consumable ? 'checked' : ''}> Consumable</label>
      <label class="sc-field"><span>Low at</span><input class="sc-input" type="number" name="lowStock" min="0" step="1" value="${esc(i.lowStock ?? 0)}"></label>
      ${item ? `<label class="sc-field"><span>Brand</span><input class="sc-input" name="brand" value="${esc(i.brand || '')}"></label>
      <label class="sc-field"><span>Model</span><input class="sc-input" name="model" value="${esc(i.model || '')}"></label>
      <label class="sc-field"><span>Serial number</span><input class="sc-input" name="serial" value="${esc(i.serial || '')}"></label>
      <label class="sc-field"><span>Bought</span><input class="sc-input" type="date" name="bought" value="${esc(i.bought || '')}"></label>
      <label class="sc-field"><span>Warranty until</span><input class="sc-input" type="date" name="warranty" value="${esc(i.warranty || '')}"></label>
      <label class="sc-field wide"><span>Notes</span><textarea class="sc-textarea" name="notes" rows="2">${esc(i.notes || '')}</textarea></label>` : ''}
    </div>
    ${item ? filesBlock(ctx, item) : ''}
    <div class="row"><button class="sc-button sc-button--primary" type="submit">${item ? 'Save item' : 'Add to stash'}</button>
      ${item ? `<button class="sc-button sc-button--ghost" type="button" data-action="item-close">Close</button><button class="sc-button sc-button--danger" type="button" data-action="item-remove" data-item="${esc(item.id)}">Remove</button>` : ''}</div>
  </form>`;
}

/** Places as <option>s, indented by depth. */
function placeOptions(db, selected, none) {
  return `${none ? opt('', none, !selected) : ''}${placeTree(db).map(({ place, depth }) => opt(place.id, `${' '.repeat(depth)}${place.name}`, place.id === selected)).join('')}`;
}

/** How many items are in each place, counting every place inside it. */
function counts(db, items) {
  const direct = new Map();
  for (const i of items) direct.set(i.place || null, (direct.get(i.place || null) || 0) + 1);
  const out = new Map();
  for (const p of db.places) { let n = 0; for (const id of placesWithin(db, p.id)) n += direct.get(id) || 0; out.set(p.id, n); }
  return out;
}

function placeTreeNav(ctx, inv) {
  const { db, ui } = ctx;
  const n = counts(db, inv.items);
  const row = (id, label, depth, count) => `<button type="button" class="bag-place${(ui.bagPlace || '') === id ? ' is-active' : ''}" data-action="bag-place" data-bag-place="${esc(id)}" style="--depth: ${depth}"><span class="bag-place-name">${esc(label)}</span><span class="bag-count">${count || ''}</span></button>`;
  const unfiled = inv.items.filter((i) => !i.place || !db.place.has(i.place)).length;
  return `<nav class="bag-places" aria-label="Places">
    ${row('', 'Everywhere', 0, inv.items.length)}
    ${placeTree(db).map(({ place, depth }) => row(place.id, place.name, depth, n.get(place.id))).join('')}
    ${unfiled ? row('unfiled', 'Unfiled', 0, unfiled) : ''}
  </nav>`;
}

function placeEditor(ctx) {
  const { db, ui } = ctx;
  const sel = db.place.get(ui.bagPlace) || null;
  const editing = ui.bagPlaceEdit === 'edit' ? sel : null;
  if (!ui.bagPlaceEdit) {
    return `<div class="row">
      <button type="button" class="sc-button sc-button--sm" data-action="bag-place-new">+ Place${sel ? ` in ${esc(sel.name)}` : ''}</button>
      ${sel ? `<button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-place-edit">Edit ${esc(sel.name)}</button>` : ''}
      <button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-labels">Labels</button>
      <button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-csv">CSV</button>
    </div>`;
  }
  const inside = editing ? placesWithin(db, editing.id) : new Set();
  const parent = editing ? editing.parent || '' : sel?.id || '';
  return `<form class="stack bag-place-form" data-form="bag-place" id="bag-place-form">
    <input type="hidden" name="id" value="${esc(editing?.id || '')}">
    <div class="form-grid">
      <label class="sc-field"><span>${editing ? 'Name' : 'New place'}</span><input class="sc-input" name="name" required value="${esc(editing?.name || '')}" placeholder="e.g. Bookcase 1, Shelf 2, Box 3" autocomplete="off"></label>
      <label class="sc-field"><span>Inside</span><select class="sc-select" name="parent">${opt('', '— top level —', !parent)}${placeTree(db).filter(({ place }) => !inside.has(place.id)).map(({ place, depth }) => opt(place.id, `${' '.repeat(depth)}${place.name}`, place.id === parent)).join('')}</select></label>
      <label class="sc-field"><span>Zone</span><select class="sc-select" name="zone">${opt('', editing ? `${editing.zone} (keep)` : 'as the place it is in', true)}${ZONES.map((z) => opt(z, z, false)).join('')}</select></label>
    </div>
    <div class="row"><button class="sc-button sc-button--primary sc-button--sm" type="submit">${editing ? 'Save place' : 'Add place'}</button>
      <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="bag-place-cancel">Cancel</button>
      ${editing ? `<button class="sc-button sc-button--danger sc-button--sm" type="button" data-action="bag-place-remove" data-id="${esc(editing.id)}">Delete</button>` : ''}</div>
  </form>`;
}

/** The stashes shown: those inside the chosen place, narrowed by the search, in tree order. */
function shownStashes(ctx, inv) {
  const { db, ui } = ctx;
  const where = ui.bagPlace && ui.bagPlace !== 'unfiled' && db.place.has(ui.bagPlace) ? ui.bagPlace : null;
  const q = String(ui.bagQuery || '').trim();
  const keep = new Set(searchItems(db, q, where).map((h) => h.item.id));
  const order = new Map(placeTree(db).map((x, k) => [x.place.id, k]));
  return inv.stashes
    .map((s) => ({ ...s, items: s.items.filter((i) => keep.has(i.id) || (ui.bagPlace === 'unfiled' && !q && !s.place)) }))
    .filter((s) => s.items.length && (ui.bagPlace !== 'unfiled' || !s.place || !db.place.has(s.place)))
    .sort((a, b) => (a.place === null) - (b.place === null) || (order.get(a.place) ?? 1e9) - (order.get(b.place) ?? 1e9));
}

function stashList(ctx, inv) {
  const left = skipLeft(inv);
  const list = shownStashes(ctx, inv);
  if (!inv.items.length) return '<div class="muted-box">Nothing stashed yet. Add what you own below — one room at a time.</div>';
  if (!list.length) return `<div class="muted-box">Nothing matches${ctx.ui.bagQuery ? ` “${esc(ctx.ui.bagQuery)}”` : ' here'}.</div>`;
  return list.map((s) => `
      <section class="stash" data-place="${esc(s.place || 'unfiled')}" aria-label="${esc(s.path?.length ? s.path.join(' › ') : s.name)}">
        <h3 class="stash-tab">${esc(s.path?.length ? s.path.join(' › ') : s.name)} <span class="num">${s.items.length}</span></h3>
        <div class="cells">${s.items.map((i) => cell(ctx, inv, i, left)).join('')}</div>
      </section>`).join('');
}

function stashSection(ctx, inv) {
  const shown = ctx.ui.itemShow ? ctx.db.item.get(ctx.ui.itemShow) : null;
  return `
  <section class="stack" id="stashes" aria-labelledby="stash-h">
    <div class="row-between"><h2 id="stash-h">Stash</h2><span class="small sc-muted">${inv.items.length} item${inv.items.length === 1 ? '' : 's'} · ${inv.inUse.size} in use</span></div>
    <form data-form="bag-find" role="search" class="bag-find"><input class="sc-input" type="search" name="q" data-bag-search value="${esc(ctx.ui.bagQuery || '')}" placeholder="Find anything: a title, a brand, a serial, a shelf…" autocomplete="off" aria-label="Find in the stash"></form>
    <div class="bag-layout">
      <div class="stack bag-side">${placeTreeNav(ctx, inv)}${placeEditor(ctx)}</div>
      <div class="stack" id="stash-list">${stashList(ctx, inv)}</div>
    </div>
    ${shown ? `<section class="sc-panel pad stack item-detail" id="item-detail"><h3>${esc(shown.name)}</h3>${itemForm(ctx, shown)}</section>` : ''}
  </section>`;
}

// ─── photos and receipts ────────────────────────────────────────────────────

const src = (f) => `data:${f.mime};base64,${f.data}`;
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function filesBlock(ctx, item) {
  const f = filesOf(ctx.db, item);
  return `<div class="stack bag-files">
    <span class="sc-label">Photos</span>
    <div class="bag-photos">${f.photos.map((p) => `<figure><img src="${esc(src(p))}" alt="${esc(p.name)}">
      <button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-unlink" data-kind="photos" data-item="${esc(item.id)}" data-file="${esc(p.id)}" aria-label="Remove photo">✕</button></figure>`).join('')}
      <label class="sc-button sc-button--sm bag-add">Add photos…<input type="file" accept="image/*" multiple hidden data-upload="photo" data-item="${esc(item.id)}"></label></div>
    <span class="sc-label">Receipts</span>
    ${f.receipts.length ? `<ul class="bag-receipts">${f.receipts.map((r) => `<li><button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-save-file" data-file="${esc(r.id)}">${esc(r.name || 'receipt')}</button><span class="small sc-muted">${kb(r.size)}</span>
      <button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-unlink" data-kind="receipts" data-item="${esc(item.id)}" data-file="${esc(r.id)}" aria-label="Remove receipt">✕</button></li>`).join('')}</ul>` : ''}
    <label class="sc-button sc-button--sm bag-add">Attach receipt…<input type="file" accept="image/*,application/pdf" multiple hidden data-upload="receipt" data-item="${esc(item.id)}"></label>
    <p class="small sc-muted" style="margin:0">Photos are resized to ${PHOTO_MAX_PX} px; a file is at most ${FILE_MAX_BYTES / 1024 / 1024} MB. They sync with everything else.</p>
  </div>`;
}

// ─── reshelving ─────────────────────────────────────────────────────────────

function reshelveSection(ctx) {
  const { db, ui } = ctx;
  const plan = activeReshelve(db);
  if (!plan) return '';
  const v = reshelveView(db, plan);
  const tab = ui.reshelveTab === 'pull' ? 'pull' : 'shelve';
  const groups = tab === 'shelve' ? v.shelves : v.sources;
  const path = (id) => placePath(db, id).map((p) => p.name).join(' › ') || 'Unfiled';
  const ticked = (m) => (tab === 'shelve' ? m.isShelved : m.isPulled);
  // One shelf open at a time: the one you are on (ui.reshelveOpen), else the first with books left.
  const open = groups.find((g) => (g.place?.id || 'unfiled') === ui.reshelveOpen) || groups.find((g) => g.moves.some((m) => !ticked(m)));
  const body = groups.map((g) => {
    const done = g.moves.filter(ticked).length;
    const rows = g.moves.map((m) => {
      const on = tab === 'shelve' ? m.isShelved : m.isPulled;
      const where = tab === 'shelve' ? (m.from === m.to ? 'stays' : `from ${esc(path(m.from))}`) : `→ ${esc(path(m.to))}`;
      return `<label class="rs-row${on ? ' done' : ''}"><input class="sc-check" type="checkbox" data-action="reshelve-${tab}" data-item="${esc(m.item.id)}"${on ? ' checked' : ''}>
        <span class="num">#${m.n}</span><span class="num rs-call">${esc(m.call || '')}</span><span class="rs-name">${esc(m.item.name)}</span><span class="small sc-muted rs-where">${where}</span></label>`;
    }).join('');
    return `<details class="rs-group" data-reshelve-shelf="${esc(g.place?.id || 'unfiled')}"${g === open ? ' open' : ''}>
      <summary><span>${esc(g.path.join(' › ') || 'Unfiled')}</span><span class="num small">${done}/${g.moves.length}</span></summary>${rows}</details>`;
  }).join('');
  const complete = v.total > 0 && v.shelved === v.total;
  return `<section class="sc-panel pad stack" id="reshelve" aria-labelledby="reshelve-h">
    <div class="row-between"><h2 id="reshelve-h">Reshelve · ${esc(plan.name)}</h2><span class="num small">${v.pulled}/${v.total} pulled · ${v.shelved}/${v.total} shelved</span></div>
    <p class="small sc-muted" style="margin:0">${tab === 'shelve' ? 'Put each shelf up left to right in this order. Ticking a book moves it in the Bag too.' : 'Empty one shelf at a time; each book says where it goes. Stack them in piles by new shelf.'}</p>
    <div class="chips" role="tablist" aria-label="Reshelve step">
      <button type="button" class="chip" data-action="reshelve-tab" data-tab="pull" aria-pressed="${tab === 'pull'}">1 · Pull</button>
      <button type="button" class="chip" data-action="reshelve-tab" data-tab="shelve" aria-pressed="${tab === 'shelve'}">2 · Shelve</button>
    </div>
    <div class="rs-groups">${body || '<div class="muted-box">Nothing left in this plan.</div>'}</div>
    <div class="row"><button type="button" class="sc-button ${complete ? 'sc-button--primary' : 'sc-button--ghost'} sc-button--sm" data-action="reshelve-finish">${complete ? 'Finish — every book is shelved' : 'Finish early'}</button></div>
  </section>`;
}

// ─── box labels ─────────────────────────────────────────────────────────────

const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A label sheet as one US Letter page (points), lines shrinking to fit a full box. */
export function labelSvg(sheet, { w = 612, h = 792 } = {}) {
  const m = 48;
  const top = m + 90;
  const lineH = Math.max(9, Math.min(20, (h - top - m) / Math.max(1, sheet.lines.length)));
  const size = Math.min(13, lineH * 0.72);
  const body = sheet.lines.map((l, k) => {
    const y = (top + k * lineH).toFixed(1);
    if (l.heading !== undefined) return `<text x="${m}" y="${y}" font-size="${size}" font-weight="bold" fill="#555">${xml(l.heading)}</text>`;
    const qty = l.qty !== 1 ? `<text x="${w - m}" y="${y}" font-size="${size}" text-anchor="end">× ${xml(l.qty)}</text>` : '';
    return `<text x="${m + 12}" y="${y}" font-size="${size}">${xml(l.name)}</text>${qty}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif">`
    + `<rect width="${w}" height="${h}" fill="#fff"/>`
    + `<text x="${m}" y="${m + 30}" font-size="34" font-weight="bold">${xml(sheet.place.name)}</text>`
    + `<text x="${m}" y="${m + 54}" font-size="12" fill="#555">${xml(sheet.path.join(' › '))}</text>`
    + `<line x1="${m}" y1="${m + 66}" x2="${w - m}" y2="${m + 66}" stroke="#000" stroke-width="1.5"/>`
    + `${body || `<text x="${m}" y="${top}" font-size="13" fill="#555">Empty</text>`}</svg>`;
}

// ─── money and the shopping list ────────────────────────────────────────────

function moneySection(inv) {
  const used = SKIP_DAILY_CAP - skipLeft(inv);
  return `
  <section class="sc-panel pad stack" id="money" aria-labelledby="money-h">
    <h2 id="money-h">Saved vs spent</h2>
    <div class="money">
      <div class="money-cell saved"><span class="sc-label">This month</span><span class="big num">saved ${usd(inv.savedThisMonth)}</span></div>
      <div class="money-cell spent"><span class="sc-label">This month</span><span class="big num">spent ${usd(inv.spentThisMonth)}</span></div>
      <div class="money-cell"><span class="sc-label">Skip points today</span><span class="big num">${used}/${SKIP_DAILY_CAP}</span></div>
    </div>
    <p class="small sc-muted" style="margin:0">All time: saved ${usd(inv.moneySaved)} · spent ${usd(inv.spent)}.</p>
  </section>`;
}

function shoppingSection(ctx, inv) {
  const { db } = ctx;
  const rows = inv.shopping.map((e) => {
    if (e.lowStock) return `<li class="shop-row low"><span>${esc(e.name)} ×${e.qty} · <span class="flag">low stock</span> (have ${e.item.qty}, usual ${e.item.usual ?? e.item.lowStock + 1})</span></li>`;
    const own = e.matches.filter((m) => (m.item.qty || 0) > 0);
    return `<li class="shop-row"><span>${esc(e.name)} ×${e.qty}${own.length ? ` · <span class="flag">you own: ${esc(own.map((m) => `${m.item.name} ×${m.item.qty} (${placeName(db, m.item.place)})`).join(', '))}</span> — check before buying` : ''}</span>
      <button class="sc-button sc-button--ghost sc-button--sm" data-action="wish-done" data-wish="${esc(e.wish.id)}">Done</button></li>`;
  }).join('');
  return `
  <section class="sc-panel pad stack" id="shopping" aria-labelledby="shopping-h">
    <h2 id="shopping-h">Shopping list</h2>
    ${rows ? `<ul class="shop-list">${rows}</ul>` : '<p class="small sc-muted" style="margin:0">Nothing to buy. Consumables at their low-stock level join by themselves.</p>'}
    <form class="have-row" data-form="wish" id="wish-form">
      <label class="sc-field have-what"><span>Add</span><input class="sc-input" name="name" required placeholder="something you mean to buy"></label>
      <label class="sc-field have-price"><span>Qty</span><input class="sc-input" type="number" name="qty" min="1" step="1" value="1"></label>
      <button class="sc-button" type="submit">Add</button>
    </form>
  </section>`;
}

export function render(ctx) {
  const inv = inventory(ctx.db, nowOf(ctx));
  const c = { ...ctx, inUse: inv.inUse };
  return `<div class="view bag">
    ${haveSection(c, inv)}
    ${reshelveSection(c)}
    ${dollSection(c, inv)}
    ${stashSection(c, inv)}
    <section class="sc-panel pad stack" aria-labelledby="add-h"><h2 id="add-h">Quick add</h2>${itemForm(c, null)}</section>
    ${moneySection(inv)}
    ${shoppingSection(c, inv)}
  </div>`;
}

// ─── writes ─────────────────────────────────────────────────────────────────

const rerender = (ctx) => ctx.render?.({ force: true });

// ─── the house inventory's writes ───────────────────────────────────────────

/** Places: the first edit writes the default places it replaces (util.materialize). */
async function savePlaces(ctx, ...records) {
  const base = materialize('place', ctx.store.allRecords().filter((r) => !r.deletedAt));
  const byId = new Map(base.map((r) => [r.id, r]));
  for (const r of records) byId.set(r.id, { ...(byId.get(r.id) || ctx.store.getRecord(r.id) || {}), ...r });
  await ctx.store.save([...byId.values()]);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Any image the browser can decode → a JPEG at most PHOTO_MAX_PX on its long side, as base64. */
async function photoData(file) {
  const img = new Image();
  img.src = await readAsDataURL(file);
  await img.decode();
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; // a transparent PNG flattens onto white, not black
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

function printLabels(ctx) {
  const { db, ui } = ctx;
  const one = db.place.has(ui.bagPlace) ? [ui.bagPlace] : null;
  const ids = one || placeTree(db).map((x) => x.place.id).filter((id) => db.items.some((i) => !i.archived && i.place === id));
  const sheets = ids.map((id) => labelSheet(db, id)).filter((s) => s.lines.length);
  if (!sheets.length) { ctx.toast('Nothing filed there to label yet.'); return; }
  const w = window.open('', '_blank');
  if (!w) { ctx.toast('Allow pop-ups to print labels.', 'danger'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Box labels</title><style>@page{size:letter;margin:0}body{margin:0}svg{display:block;width:8.5in;height:11in;page-break-after:always}</style>${sheets.map((s) => labelSvg(s)).join('')}`);
  w.document.close();
  w.focus();
  w.print();
}

/** The plan and, when shelving, the item at its new place: one write, so they never disagree. */
async function reshelveWrite(ctx, fn) {
  const plan = activeReshelve(ctx.db);
  if (!plan) return;
  await ctx.store.save(fn(plan));
}

export const actions = {
  skip: async (el, ctx) => {
    const h = ctx.ui.have;
    if (!h) return;
    const rec = makeSkip(ctx.db, { query: h.query, price: h.price, item: el.dataset.item || null, at: nowOf(ctx) });
    ctx.ui.have = null;
    // save, not add: src/sync.js's event list predates skip and spend.
    await ctx.store.save(rec);
    ctx.toast(`Skipped ${rec.query}: +${rec.points} pts, ${usd(rec.price)} saved.`, 'success');
    rerender(ctx);
  },
  spend: async (el, ctx) => {
    const h = ctx.ui.have;
    if (!h) return;
    const spend = makeSpend(ctx.db, { name: h.query, price: h.price, item: el.dataset.item || null, at: nowOf(ctx) });
    const stock = restockFor(ctx.db, spend);
    const wishes = ctx.db.wishes.filter((w) => !w.done && w.name.toLowerCase() === spend.name.toLowerCase()).map((w) => ({ ...w, done: true }));
    ctx.ui.have = null;
    await ctx.store.save([{ ...spend, item: stock.id }, stock, ...wishes]);
    ctx.toast(`Bought ${spend.name} for ${usd(spend.price)}. ${el.dataset.item ? `Restocked: ×${stock.qty}.` : 'Added to your stash.'}`, 'info');
    rerender(ctx);
  },
  'have-cancel': (el, ctx) => { ctx.ui.have = null; rerender(ctx); },
  'wish-add': async (el, ctx) => {
    const h = ctx.ui.have;
    if (!h) return;
    const rec = makeWish(ctx.db, { name: h.query });
    ctx.ui.have = null;
    await ctx.store.save(rec);
    ctx.toast(`${rec.name} is on the shopping list.`, 'success');
    rerender(ctx);
  },
  'wish-done': async (el, ctx) => {
    const w = ctx.db.wishes.find((x) => x.id === el.dataset.wish);
    if (w) await ctx.store.save({ ...w, done: true });
  },
  equip: async (el, ctx) => {
    const l = ctx.db.loadouts.find((x) => x.id === el.dataset.loadout);
    if (!l) return;
    const others = ctx.db.loadouts.filter((x) => x.active && x.id !== l.id).map((x) => ({ ...x, active: false }));
    ctx.ui.loadout = l.id;
    await ctx.store.save([...others, { ...l, active: true }]);
    ctx.toast(`Equipped ${l.name}.${l.checklist?.length ? ` Pack: ${l.checklist.join(', ')}.` : ''}`, 'success');
  },
  'loadout-show': (el, ctx) => { ctx.ui.loadout = el.dataset.loadout; ctx.ui.editLoadout = null; rerender(ctx); },
  'loadout-new': (el, ctx) => { ctx.ui.editLoadout = 'new'; rerender(ctx); document.getElementById('loadout-form')?.scrollIntoView({ block: 'center' }); },
  'loadout-edit': (el, ctx) => { ctx.ui.editLoadout = el.dataset.id; rerender(ctx); document.getElementById('loadout-form')?.scrollIntoView({ block: 'center' }); },
  'loadout-cancel': (el, ctx) => { ctx.ui.editLoadout = null; rerender(ctx); },
  'item-show': (el, ctx) => { ctx.ui.itemShow = ctx.ui.itemShow === el.dataset.item ? null : el.dataset.item; rerender(ctx); document.getElementById('item-detail')?.scrollIntoView({ block: 'nearest' }); },
  'item-close': (el, ctx) => { ctx.ui.itemShow = null; rerender(ctx); },
  'bag-place': (el, ctx) => { ctx.ui.bagPlace = el.dataset.bagPlace || null; ctx.ui.bagPlaceEdit = null; rerender(ctx); },
  'bag-place-new': (el, ctx) => { ctx.ui.bagPlaceEdit = 'new'; rerender(ctx); },
  'bag-place-edit': (el, ctx) => { ctx.ui.bagPlaceEdit = 'edit'; rerender(ctx); },
  'bag-place-cancel': (el, ctx) => { ctx.ui.bagPlaceEdit = null; rerender(ctx); },
  'bag-place-remove': async (el, ctx) => {
    const place = ctx.db.place.get(el.dataset.id);
    if (!place) return;
    const up = place.parent ? ctx.db.place.get(place.parent) : null;
    const moved = placeRemoval(ctx.db, place.id);
    const what = moved.length ? `Everything in it moves to <b>${esc(up ? up.name : 'Unfiled and the top level')}</b>.` : 'Nothing is filed there.';
    if (!(await ctx.confirm(`Delete ${esc(place.name)}?`, `${what} Past moments keep it by id.`, 'Delete', 'danger'))) return;
    await savePlaces(ctx, ...moved.filter((r) => r.type === 'place'));
    const others = moved.filter((r) => r.type !== 'place');
    if (others.length) await ctx.store.save(others);
    await ctx.store.remove(ctx.store.getRecord(place.id) || place);
    ctx.ui.bagPlace = up ? up.id : null;
    ctx.ui.bagPlaceEdit = null;
    ctx.toast(`${place.name} deleted.`, 'success');
  },
  'bag-csv': (el, ctx) => {
    const where = ctx.db.place.has(ctx.ui.bagPlace) ? ctx.ui.bagPlace : null;
    const items = searchItems(ctx.db, ctx.ui.bagQuery || '', where).map((h) => h.item);
    download(new Blob([inventoryCSV(ctx.db, items)], { type: 'text/csv' }), 'inventory.csv');
  },
  'bag-labels': (el, ctx) => printLabels(ctx),
  'bag-unlink': async (el, ctx) => {
    const item = ctx.db.item.get(el.dataset.item);
    if (!item) return;
    const kind = el.dataset.kind === 'receipts' ? 'receipts' : 'photos';
    await ctx.store.save({ ...item, [kind]: (item[kind] || []).filter((id) => id !== el.dataset.file) });
  },
  'bag-save-file': async (el, ctx) => {
    const f = ctx.db.file.get(el.dataset.file);
    if (f) download(await (await fetch(src(f))).blob(), f.name || 'receipt');
  },
  'reshelve-tab': (el, ctx) => { ctx.ui.reshelveTab = el.dataset.tab; ctx.ui.reshelveOpen = null; rerender(ctx); },
  'reshelve-pull': (el, ctx) => { ctx.ui.reshelveOpen = el.closest?.('[data-reshelve-shelf]')?.dataset.reshelveShelf || null; return reshelveWrite(ctx, (plan) => markPulled(plan, el.dataset.item, !!el.checked)); },
  'reshelve-shelve': (el, ctx) => { ctx.ui.reshelveOpen = el.closest?.('[data-reshelve-shelf]')?.dataset.reshelveShelf || null; return reshelveWrite(ctx, (plan) => {
    const r = shelveMove(ctx.db, plan, el.dataset.item, !!el.checked);
    return r.item ? [r.item, r.plan] : [r.plan];
  }); },
  'reshelve-finish': async (el, ctx) => {
    const plan = activeReshelve(ctx.db);
    if (!plan) return;
    const v = reshelveView(ctx.db, plan);
    if (v.shelved < v.total && !(await ctx.confirm('Finish early?', `${v.total - v.shelved} books are not ticked as shelved. The plan leaves the Bag either way.`, 'Finish', 'danger'))) return;
    await ctx.store.save({ ...plan, done: true });
    ctx.toast(`${plan.name} finished.`, 'success');
  },
  'item-remove': async (el, ctx) => {
    const item = ctx.db.item.get(el.dataset.item);
    if (!item) return;
    if (!(await ctx.confirm('Remove item?', `Take <b>${esc(item.name)}</b> out of the stash? Loadouts that wear it show the slot empty.`, 'Remove', 'danger'))) return;
    ctx.ui.itemShow = null;
    await ctx.store.save({ ...item, archived: true });
  },
};

export const forms = {
  // Enter in the search box: the stash already follows every keystroke (onInput).
  'bag-find': (d, form, ctx) => { ctx.ui.bagQuery = d.q || ''; },
  'bag-place': async (d, form, ctx) => {
    const name = String(d.name || '').trim();
    if (!name) throw new Error('A place needs a name.');
    if (d.id) {
      const cur = ctx.db.place.get(d.id);
      const rec = { ...cur, name, ...(d.zone ? { zone: d.zone } : {}), parent: movePlace(ctx.db, d.id, d.parent || null).parent };
      await savePlaces(ctx, rec);
    } else {
      const rec = makePlace(ctx.db, { name, parent: d.parent || null, zone: d.zone || undefined, now: nowOf(ctx) });
      await savePlaces(ctx, rec);
      ctx.ui.bagPlace = rec.id;
    }
    ctx.ui.bagPlaceEdit = null;
  },
  have: async (d, form, ctx) => {
    const query = String(d.query || '').trim();
    if (!query) throw new Error('Say what you are about to buy.');
    const price = Number(d.price || 0);
    if (!(price >= 0)) throw new Error('A price is 0 or more dollars.');
    ctx.ui.have = { query, price };
  },
  item: async (d, form, ctx) => {
    const existing = d.id ? ctx.db.item.get(d.id) : null;
    const lowStock = Number(d.lowStock || 0);
    const fields = {
      name: d.name, category: String(d.category || '').trim(), place: d.place || null,
      qty: Number(d.qty === undefined || d.qty === '' ? 1 : d.qty), price: Number(d.price || 0),
      slot: d.slot || null, skills: d.skill ? [d.skill] : [], aliases: list(d.aliases),
      consumable: d.consumable === 'on' || d.consumable === true, lowStock,
    };
    // The house-inventory details, when the form has them (the detail panel does; quick add does not).
    for (const k of ['brand', 'model', 'serial', 'bought', 'warranty', 'notes']) if (k in d) fields[k] = k === 'bought' || k === 'warranty' ? (d[k] || null) : String(d[k] ?? '');
    if (existing) {
      const usual = lowStock === existing.lowStock ? existing.usual : lowStock + 1;
      const rec = makeItem(ctx.db, { ...existing, ...fields, usual, skills: d.skill ? [d.skill] : [] });
      await ctx.store.save({ ...existing, ...rec });
      ctx.toast(`${rec.name} saved.`, 'success');
    } else {
      const rec = makeItem(ctx.db, { ...fields, now: nowOf(ctx) });
      await ctx.store.save(rec);
      ctx.toast(`${rec.name} is in the ${placeName(ctx.db, rec.place)} stash.`, 'success');
    }
  },
  loadout: async (d, form, ctx) => {
    const existing = d.id ? ctx.db.loadouts.find((l) => l.id === d.id) : null;
    const slots = Object.fromEntries(SLOTS.map((s) => [s, d[`slot_${s}`] || null]));
    const rec = makeLoadout(ctx.db, { name: d.name, slots, active: d.active === 'on', checklist: list(d.checklist), id: existing?.id || null, now: nowOf(ctx) });
    const others = rec.active ? ctx.db.loadouts.filter((l) => l.active && l.id !== rec.id).map((l) => ({ ...l, active: false })) : [];
    ctx.ui.editLoadout = null;
    ctx.ui.loadout = rec.id;
    await ctx.store.save([...others, { ...(existing || {}), ...rec }]);
    ctx.toast(`${rec.name} saved${rec.active ? ' and equipped' : ''}.`, 'success');
  },
  wish: async (d, form, ctx) => {
    const rec = makeWish(ctx.db, { name: d.name, qty: Number(d.qty || 1) });
    await ctx.store.save(rec);
    const own = findItems(ctx.db, rec.name).filter((x) => (x.item.qty || 0) > 0);
    ctx.toast(own.length ? `${rec.name} added — you already own ${own.map((x) => x.item.name).join(', ')}.` : `${rec.name} added.`, own.length ? 'warning' : 'success');
  },
};

/** Typing in the search box filters the stash in place: no re-render, so the field keeps its focus. */
export function onInput(ev, ctx) {
  if (!ev.target.matches?.('[data-bag-search]')) return;
  ctx.ui.bagQuery = ev.target.value;
  const inv = inventory(ctx.db, nowOf(ctx));
  const el = document.getElementById('stash-list');
  if (el) el.innerHTML = stashList({ ...ctx, inUse: inv.inUse }, inv);
}

/** Photos and receipts: each file is written once, then listed on the item. */
export async function onChange(ev, ctx) {
  const input = ev.target;
  if (!input.matches?.('[data-upload]') || !input.files?.length) return;
  const kind = input.dataset.upload;
  const key = kind === 'photo' ? 'photos' : 'receipts';
  const files = [];
  const problems = [];
  for (const file of [...input.files]) {
    try {
      let mime = file.type || 'application/octet-stream';
      let data;
      if (mime.startsWith('image/')) ({ mime, data } = await photoData(file));
      else if (kind === 'receipt') data = (await readAsDataURL(file)).split(',')[1];
      else { problems.push(`${file.name} is not an image`); continue; }
      files.push(makeFile(ctx.db, { item: input.dataset.item, kind, name: file.name, mime, data, at: nowOf(ctx) }));
    } catch (err) {
      problems.push(err?.message || `${file.name} could not be read`);
    }
  }
  input.value = '';
  if (files.length) {
    await ctx.store.add(...files);
    const item = ctx.store.getRecord(input.dataset.item) || ctx.db.item.get(input.dataset.item);
    await ctx.store.save({ ...item, [key]: [...(item[key] || []), ...files.map((f) => f.id)] });
  }
  if (problems.length) ctx.toast(problems.join('; '), 'danger');
}
