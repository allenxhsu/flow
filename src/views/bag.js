// Bag: the house inventory (SPEC.md "House inventory"). Where everything is,
// down to the shelf and the box: the place tree, a search across items and
// the places they sit in, the item editor with photos and receipts, box
// labels and a CSV. The same item and place records as "I have it", the
// shopping list and loadouts — this screen only files and finds them.

import {
  makeItem, makePlace, movePlace, placeRemoval, placeTree, placePath, placesWithin, searchItems,
  makeFile, filesOf, inventoryCSV, labelSheet, ZONES, PHOTO_MAX_PX, FILE_MAX_BYTES,
} from '../model.js';
import { esc, materialize } from '../util.js';

const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
const usd = (x) => (x ? `$${Number.isInteger(x) ? x : Number(x).toFixed(2)}` : '');
const pathText = (path) => path.map((p) => p.name).join(' › ');
const src = (f) => `data:${f.mime};base64,${f.data}`;
const kb = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** The items the list shows: a search (inside the chosen place), or what is in the chosen place. */
function listed(ctx) {
  const { db, ui } = ctx;
  const where = ui.bagPlace && ui.bagPlace !== 'unfiled' && db.place.has(ui.bagPlace) ? ui.bagPlace : null;
  let hits = searchItems(db, ui.bagQuery || '', where);
  if (ui.bagPlace === 'unfiled') hits = hits.filter((h) => !h.item.place || !db.place.has(h.item.place));
  return hits;
}

function countsByPlace(db) {
  const direct = new Map();
  for (const i of db.items) if (!i.archived) direct.set(i.place || null, (direct.get(i.place || null) || 0) + (1));
  const counts = new Map();
  for (const p of db.places) {
    let n = 0;
    for (const id of placesWithin(db, p.id)) n += direct.get(id) || 0;
    counts.set(p.id, n);
  }
  const unfiled = db.items.filter((i) => !i.archived && (!i.place || !db.place.has(i.place))).length;
  return { counts, unfiled };
}

function treeSection(ctx) {
  const { db, ui } = ctx;
  const { counts, unfiled } = countsByPlace(db);
  const row = (id, label, depth, count, extra = '') => `
    <button class="bag-place ${ui.bagPlace === id || (!ui.bagPlace && id === '') ? 'is-active' : ''}" data-action="bag-place" data-bag-place="${esc(id)}" style="--depth: ${depth}"${extra}>
      <span class="bag-place-name">${esc(label)}</span><span class="bag-count">${count || ''}</span></button>`;
  const total = db.items.filter((i) => !i.archived).length;
  return `<section class="sc-panel pad stack bag-tree" id="bag-tree">
    <div class="row-between"><h2>Places</h2><button class="sc-button sc-button--sm" data-action="bag-new-place">+ Place</button></div>
    <div class="bag-places">
      ${row('', 'Everything', 0, total)}
      ${placeTree(db).map(({ place, depth }) => row(place.id, place.name, depth, counts.get(place.id), ` title="${esc(place.zone)}"`)).join('')}
      ${unfiled ? row('unfiled', 'Unfiled', 0, unfiled) : ''}
    </div>
    ${placeEditor(ctx)}
  </section>`;
}

/** Add a place inside the selected one, or edit / move / delete the selected one. */
function placeEditor(ctx) {
  const { db, ui } = ctx;
  const editing = ui.bagPlaceEdit && ui.bagPlaceEdit !== 'new' ? db.place.get(ui.bagPlaceEdit) : null;
  if (!ui.bagPlaceEdit || (ui.bagPlaceEdit !== 'new' && !editing)) {
    const sel = ui.bagPlace && db.place.get(ui.bagPlace);
    return sel ? `<div class="row"><button class="sc-button sc-button--ghost sc-button--sm" data-action="bag-edit-place" data-id="${esc(sel.id)}">Edit ${esc(sel.name)}</button>
      <button class="sc-button sc-button--ghost sc-button--sm" data-action="bag-labels" data-id="${esc(sel.id)}">Label</button></div>` : '';
  }
  const parent = editing ? editing.parent || '' : (db.place.has(ui.bagPlace) ? ui.bagPlace : '');
  const exclude = editing ? placesWithin(db, editing.id) : new Set();
  const parents = placeTree(db).filter(({ place }) => !exclude.has(place.id));
  return `<form class="stack bag-place-form" data-form="bag-place">
    <input type="hidden" name="id" value="${esc(editing?.id || '')}">
    <label class="sc-field"><span>${editing ? 'Name' : 'New place'}</span><input class="sc-input" name="name" required value="${esc(editing?.name || '')}" placeholder="e.g. Shelf B, Box 3"></label>
    <label class="sc-field"><span>Inside</span><select class="sc-select" name="parent">${opt('', '— top level —', !parent)}${parents.map(({ place, depth }) => opt(place.id, `${'  '.repeat(depth)}${place.name}`, place.id === parent)).join('')}</select></label>
    <label class="sc-field"><span>Zone</span><select class="sc-select" name="zone">${opt('', editing ? editing.zone : 'as the place it is in', !editing)}${ZONES.map((z) => opt(z, z, false)).join('')}</select></label>
    <div class="row"><button class="sc-button sc-button--primary sc-button--sm" type="submit">${editing ? 'Save' : 'Add'}</button>
      <button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="bag-cancel-place">Cancel</button>
      ${editing ? `<span class="sc-spacer"></span><button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="bag-remove-place" data-id="${esc(editing.id)}">Delete</button>` : ''}</div>
  </form>`;
}

function itemRow(ctx, { item, path }) {
  const { db } = ctx;
  const [photo] = filesOf(db, item).photos;
  const detail = [item.brand, item.model].filter(Boolean).join(' ');
  return `<div class="bag-item" data-bag-item="${esc(item.id)}">
    <button class="bag-thumb" data-action="bag-edit" data-id="${esc(item.id)}" aria-label="Edit ${esc(item.name)}">${photo ? `<img src="${esc(src(photo))}" alt="">` : '<span></span>'}</button>
    <div class="bag-item-main">
      <div class="item-title">${esc(item.name)}${item.qty !== 1 ? ` <span class="sc-muted num">×${esc(item.qty)}</span>` : ''}${detail ? ` <span class="small sc-muted">${esc(detail)}</span>` : ''}</div>
      <div class="small sc-muted wrap">${esc(pathText(path) || 'Unfiled')}${item.category ? ` · ${esc(item.category)}` : ''}${item.receipts?.length ? ` · ${item.receipts.length} receipt${item.receipts.length === 1 ? '' : 's'}` : ''}</div>
    </div>
    <span class="num small">${esc(usd(item.price * (item.qty || 1)))}</span>
    <button class="sc-button sc-button--ghost sc-button--sm" data-action="bag-edit" data-id="${esc(item.id)}">Edit</button>
  </div>`;
}

function listSection(ctx) {
  const { db, ui } = ctx;
  const hits = listed(ctx);
  const here = ui.bagPlace === 'unfiled' ? 'Unfiled' : db.place.has(ui.bagPlace) ? pathText(placePath(db, ui.bagPlace)) : 'Everything';
  const value = hits.reduce((n, h) => n + (h.item.price || 0) * (h.item.qty || 1), 0);
  return `<section class="stack" id="bag-list">
    <div class="row-between"><h2>${esc(here)}</h2>
      <div class="row"><button class="sc-button sc-button--sm" data-action="bag-csv">CSV</button>
        <button class="sc-button sc-button--sm" data-action="bag-labels" data-id="${esc(db.place.has(ui.bagPlace) ? ui.bagPlace : '')}">Labels</button>
        <button class="sc-button sc-button--primary sc-button--sm" data-action="bag-edit" data-id="new">+ Item</button></div></div>
    <form data-form="bag-search" role="search"><input class="sc-input" type="search" name="q" data-bag-search value="${esc(ui.bagQuery || '')}" placeholder="Find anything: “garage drill”, a brand, a serial, a box…" autocomplete="off"></form>
    <div class="small sc-faint" id="bag-summary">${hits.length} item${hits.length === 1 ? '' : 's'}${value ? ` · ${esc(usd(Math.round(value * 100) / 100))}` : ''}</div>
    <div class="list" id="bag-results">${results(ctx, hits)}</div>
  </section>`;
}

function results(ctx, hits = listed(ctx)) {
  if (hits.length) return hits.map((h) => itemRow(ctx, h)).join('');
  return `<div class="muted-box">${ctx.ui.bagQuery ? `Nothing matches “${esc(ctx.ui.bagQuery)}”.` : 'Nothing filed here yet.'}</div>`;
}

function editor(ctx) {
  const { db, ui } = ctx;
  if (!ui.bagEdit) return '';
  const item = ui.bagEdit === 'new' ? null : db.item.get(ui.bagEdit);
  if (ui.bagEdit !== 'new' && !item) return '';
  const f = item || { qty: 1, place: db.place.has(ui.bagPlace) ? ui.bagPlace : null };
  const field = (name, label, value, attrs = '') => `<label class="sc-field"><span>${label}</span><input class="sc-input" name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
  const files = item ? filesOf(db, item) : null;
  return `<form class="sc-panel sc-panel--lit pad stack" data-form="bag-item" id="bag-editor">
    <div class="row-between"><h2>${item ? 'Edit item' : 'New item'}</h2><button class="sc-button sc-button--ghost sc-button--sm" type="button" data-action="bag-close">Close</button></div>
    <input type="hidden" name="id" value="${esc(item?.id || '')}">
    <div class="form-grid">
      <label class="sc-field wide"><span>Name</span><input class="sc-input" name="name" required value="${esc(f.name || '')}" autocomplete="off"></label>
      <label class="sc-field"><span>Where</span><select class="sc-select" name="place">${opt('', 'Unfiled', !f.place)}${placeTree(db).map(({ place, depth }) => opt(place.id, `${'  '.repeat(depth)}${place.name}`, place.id === f.place)).join('')}</select></label>
      ${field('qty', 'Quantity', f.qty, 'type="number" min="0" step="1"')}
      ${field('category', 'Category', f.category)}
      ${field('aliases', 'Also called', (f.aliases || []).join(', '), 'placeholder="comma, separated"')}
      ${field('brand', 'Brand', f.brand)}
      ${field('model', 'Model', f.model)}
      ${field('serial', 'Serial number', f.serial, 'class="sc-input sc-mono"')}
      ${field('bought', 'Bought', f.bought, 'type="date"')}
      ${field('price', 'Price (each, $)', f.price || '', 'type="number" min="0" step="0.01"')}
      ${field('warranty', 'Warranty until', f.warranty, 'type="date"')}
      <label class="check-field"><input class="sc-check" type="checkbox" name="consumable" ${f.consumable ? 'checked' : ''}> Consumable</label>
      ${field('lowStock', 'Low at', f.lowStock ?? 0, 'type="number" min="0" step="1"')}
      <label class="sc-field wide"><span>Notes</span><textarea class="sc-textarea" name="notes" rows="2">${esc(f.notes || '')}</textarea></label>
    </div>
    ${files ? `<div class="stack">
      <h3>Photos</h3>
      <div class="bag-photos">${files.photos.map((p) => `<figure><button type="button" class="bag-photo" data-action="bag-view" data-file="${esc(p.id)}"><img src="${esc(src(p))}" alt="${esc(p.name)}"></button>
        <button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-unlink" data-kind="photos" data-file="${esc(p.id)}" aria-label="Remove photo">✕</button></figure>`).join('')}
        <label class="sc-button sc-button--sm bag-add">Add photos…<input type="file" accept="image/*" multiple hidden data-upload="photo" data-item="${esc(item.id)}"></label></div>
      <h3>Receipts</h3>
      <div class="list">${files.receipts.map((r) => `<div class="row small"><button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-save-file" data-file="${esc(r.id)}">${esc(r.name || 'receipt')}</button>
        <span class="sc-faint">${esc(kb(r.size))}</span><button type="button" class="sc-button sc-button--ghost sc-button--sm" data-action="bag-unlink" data-kind="receipts" data-file="${esc(r.id)}" aria-label="Remove receipt">✕</button></div>`).join('')}</div>
      <label class="sc-button sc-button--sm bag-add">Attach receipt…<input type="file" accept="image/*,application/pdf" multiple hidden data-upload="receipt" data-item="${esc(item.id)}"></label>
      <p class="small sc-faint" style="margin:0">Photos are resized to ${PHOTO_MAX_PX} px; a file is at most ${FILE_MAX_BYTES / 1024 / 1024} MB. They sync with everything else.</p>
    </div>` : '<p class="small sc-faint" style="margin:0">Save the item, then add photos and receipts.</p>'}
    <div class="row"><button class="sc-button sc-button--primary" type="submit">Save</button>
      ${item ? `<span class="sc-spacer"></span><button class="sc-button sc-button--ghost" type="button" data-action="bag-remove" data-id="${esc(item.id)}">Remove item</button>` : ''}</div>
  </form>`;
}

export function render(ctx) {
  return `<div class="view bag">
    ${editor(ctx)}
    <div class="bag-layout">${treeSection(ctx)}${listSection(ctx)}</div>
  </div>`;
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

function printLabels(ctx, placeId) {
  const { db } = ctx;
  const ids = placeId ? [placeId] : placeTree(db).map((x) => x.place.id).filter((id) => db.items.some((i) => !i.archived && i.place === id));
  const sheets = ids.map((id) => labelSheet(db, id)).filter((s) => s.lines.length);
  if (!sheets.length) { ctx.toast('Nothing filed there to label yet.'); return; }
  const w = window.open('', '_blank');
  if (!w) { ctx.toast('Allow pop-ups to print labels.', 'danger'); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Box labels</title><style>@page{size:letter;margin:0}body{margin:0}svg{display:block;width:8.5in;height:11in;page-break-after:always}</style>${sheets.map((s) => labelSvg(s)).join('')}`);
  w.document.close();
  w.focus();
  w.print();
}

// ─── files ──────────────────────────────────────────────────────────────────

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
  const url = await readAsDataURL(file);
  const img = new Image();
  img.src = url;
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

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Places: the first edit writes the default places it replaces (util.materialize). */
async function savePlaces(ctx, ...records) {
  const base = materialize('place', ctx.store.allRecords().filter((r) => !r.deletedAt));
  const byId = new Map(base.map((r) => [r.id, r]));
  for (const r of records) byId.set(r.id, { ...(byId.get(r.id) || ctx.store.getRecord(r.id) || {}), ...r });
  await ctx.store.save([...byId.values()]);
}

const itemRecord = (ctx, id) => ctx.store.getRecord(id) || ctx.db.item.get(id);

export const actions = {
  'bag-place': (el, ctx) => { ctx.ui.bagPlace = el.dataset.bagPlace || null; ctx.ui.bagPlaceEdit = null; ctx.render({ force: true }); },
  'bag-new-place': (el, ctx) => { ctx.ui.bagPlaceEdit = 'new'; ctx.render({ force: true }); },
  'bag-edit-place': (el, ctx) => { ctx.ui.bagPlaceEdit = el.dataset.id; ctx.render({ force: true }); },
  'bag-cancel-place': (el, ctx) => { ctx.ui.bagPlaceEdit = null; ctx.render({ force: true }); },
  'bag-remove-place': async (el, ctx) => {
    const place = ctx.db.place.get(el.dataset.id);
    const up = place.parent && ctx.db.place.get(place.parent);
    const moved = placeRemoval(ctx.db, place.id);
    const what = moved.length ? `Everything in it moves to <b>${esc(up ? up.name : 'Unfiled / the top level')}</b>.` : 'Nothing is filed there.';
    if (!(await ctx.confirm(`Delete ${esc(place.name)}?`, `<p>${what} Past moments keep it by id.</p>`, 'Delete', 'danger'))) return;
    await savePlaces(ctx, ...moved);
    await ctx.store.remove(ctx.store.getRecord(place.id));
    ctx.ui.bagPlace = up ? up.id : null;
    ctx.ui.bagPlaceEdit = null;
    ctx.toast(`${place.name} deleted.`, 'success');
  },
  'bag-edit': (el, ctx) => { ctx.ui.bagEdit = el.dataset.id; ctx.render({ force: true }); document.getElementById('view')?.scrollTo?.({ top: 0 }); },
  'bag-close': (el, ctx) => { ctx.ui.bagEdit = null; ctx.render({ force: true }); },
  'bag-remove': async (el, ctx) => {
    const item = itemRecord(ctx, el.dataset.id);
    if (!(await ctx.confirm('Remove item?', `Take <b>${esc(item.name)}</b> out of the inventory? Skips and purchases that name it stay.`, 'Remove', 'danger'))) return;
    await ctx.store.save({ ...item, archived: true });
    ctx.ui.bagEdit = null;
  },
  'bag-unlink': async (el, ctx) => {
    const item = itemRecord(ctx, ctx.ui.bagEdit);
    const kind = el.dataset.kind === 'receipts' ? 'receipts' : 'photos';
    await ctx.store.save({ ...item, [kind]: (item[kind] || []).filter((id) => id !== el.dataset.file) });
  },
  'bag-view': async (el, ctx) => {
    const f = ctx.db.file.get(el.dataset.file);
    await ctx.choose(esc(f.name || 'Photo'), `<img class="bag-viewer" src="${esc(src(f))}" alt="">`, [{ id: 'close', label: 'Close', kind: 'primary' }]);
  },
  'bag-save-file': async (el, ctx) => {
    const f = ctx.db.file.get(el.dataset.file);
    download(await (await fetch(src(f))).blob(), f.name || 'receipt');
  },
  'bag-csv': (el, ctx) => {
    const items = listed(ctx).map((h) => h.item);
    download(new Blob([inventoryCSV(ctx.db, items)], { type: 'text/csv' }), `inventory-${ctx.g.day || 'flow'}.csv`);
  },
  'bag-labels': (el, ctx) => printLabels(ctx, el.dataset.id || null),
};

export const forms = {
  // Enter in the search box: the list already follows every keystroke (onInput).
  'bag-search': (d, form, ctx) => { ctx.ui.bagQuery = d.q || ''; },
  'bag-item': async (d, form, ctx) => {
    const was = d.id ? itemRecord(ctx, d.id) : null;
    const rec = makeItem(ctx.db, {
      ...(was || {}),
      name: d.name, place: d.place || null, qty: d.qty === '' ? 1 : d.qty, category: d.category.trim(),
      aliases: d.aliases.split(','), brand: d.brand, model: d.model, serial: d.serial,
      bought: d.bought || null, warranty: d.warranty || null, price: d.price === '' ? 0 : d.price, notes: d.notes,
      consumable: d.consumable === 'on', lowStock: d.lowStock === '' ? 0 : d.lowStock,
      usual: was && was.usual > Number(d.lowStock || 0) ? was.usual : undefined,
      id: was?.id || null,
    });
    await ctx.store.save(rec);
    // A new item stays open, so photos and receipts can go on it next.
    ctx.ui.bagEdit = was ? null : rec.id;
    ctx.toast(`${rec.name} ${was ? 'saved' : 'added'}.`, 'success');
  },
  'bag-place': async (d, form, ctx) => {
    const name = d.name.trim();
    if (d.id) {
      let rec = { ...ctx.db.place.get(d.id), name };
      if (d.zone) rec.zone = d.zone;
      rec = { ...rec, parent: movePlace(ctx.db, d.id, d.parent || null).parent };
      await savePlaces(ctx, rec);
    } else {
      const rec = makePlace(ctx.db, { name, parent: d.parent || null, zone: d.zone || undefined });
      await savePlaces(ctx, rec);
      ctx.ui.bagPlace = rec.id;
    }
    ctx.ui.bagPlaceEdit = null;
  },
};

/** Typing in the search box filters in place: no re-render, so the field keeps its focus. */
export function onInput(ev, ctx) {
  if (!ev.target.matches('[data-bag-search]')) return;
  ctx.ui.bagQuery = ev.target.value;
  const hits = listed(ctx);
  document.getElementById('bag-results').innerHTML = results(ctx, hits);
  document.getElementById('bag-summary').textContent = `${hits.length} item${hits.length === 1 ? '' : 's'}`;
}

export async function onChange(ev, ctx) {
  const input = ev.target;
  if (!input.matches('[data-upload]') || !input.files?.length) return;
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
      files.push(makeFile(ctx.db, { item: input.dataset.item, kind, name: file.name, mime, data }));
    } catch (err) {
      problems.push(err?.message || `${file.name} could not be read`);
    }
  }
  input.value = '';
  if (files.length) {
    await ctx.store.add(...files);
    const item = itemRecord(ctx, input.dataset.item);
    await ctx.store.save({ ...item, [key]: [...(item[key] || []), ...files.map((f) => f.id)] });
  }
  if (problems.length) ctx.toast(problems.join('; '), 'danger');
}
