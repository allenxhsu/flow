// Bag: what you own, and using it before buying more (SPEC.md › Inventory).
// The paper doll of a loadout and the gear bonus, a stash per storage place,
// the "have it" lookup with its skip, buying anyway, the shopping list, and
// money saved vs spent — what the CLI's inventory, have, loadout and skip do.
// For the house inventory (SPEC.md › House inventory) an item carries its
// details, photos and receipts, and the place picker shows the nesting;
// browsing the bookcases and reshelving happen at the bookshelf in Play.

import {
  inventory, findItems, makeItem, makeSkip, makeSpend, restockFor, makeWish, makeLoadout, gearBonus, SLOTS, SKIP_DAILY_CAP, SKIP_POINTS_PER_DOLLAR,
  placeTree, makeFile, filesOf, PHOTO_MAX_PX, FILE_MAX_BYTES,
} from '../model.js';
import { esc } from '../util.js';
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

function stashSection(ctx, inv) {
  const left = skipLeft(inv);
  const shown = ctx.ui.itemShow ? ctx.db.item.get(ctx.ui.itemShow) : null;
  return `
  <section class="stack" id="stashes" aria-labelledby="stash-h">
    <div class="row-between"><h2 id="stash-h">Stash</h2><span class="small sc-muted">${inv.items.length} item${inv.items.length === 1 ? '' : 's'} · ${inv.inUse.size} in use</span></div>
    ${inv.stashes.length ? inv.stashes.map((s) => `
      <section class="stash" data-place="${esc(s.place || 'unfiled')}" aria-label="${esc(s.name)}">
        <h3 class="stash-tab">${esc(s.path?.length ? s.path.join(' › ') : s.name)} <span class="num">${s.items.length}</span></h3>
        <div class="cells">${s.items.map((i) => cell(ctx, inv, i, left)).join('')}</div>
      </section>`).join('') : '<div class="muted-box">Nothing stashed yet. Add what you own below — one room at a time.</div>'}
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
};

export const forms = {
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
