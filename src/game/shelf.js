// flow/src/game/shelf.js — the bookshelf in Play (SPEC.md › The bookshelf):
// which of the player's bookcases a piece of furniture is, the shelves inside
// it, the books on a shelf left to right, and what the text box says about a
// book. Pure: the Play view draws the menu and does every write.

import { placePath, placeTree, placesWithin } from '../model.js';

const fold = (s) => String(s ?? '').trim().toLowerCase();
const BOOKCASE = /book\s*case|book\s*shelf|shelf/i;
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
const live = (db) => db.items.filter((i) => !i.archived);

/** How many items sit anywhere inside a place. */
const holds = (db, placeId) => {
  const inside = placesWithin(db, placeId);
  return live(db).filter((i) => inside.has(i.place)).length;
};

/**
 * The bookcases a piece of furniture stands for: the place it names (an id,
 * or a name in any case); else, for a shelf, every top-level place whose name
 * says bookcase / bookshelf / shelf and holds something, by name.
 */
export function shelfPlaces(db, furniture) {
  const named = furniture?.place;
  if (named) {
    const p = db.place.get(named) || db.places.find((x) => fold(x.name) === fold(named));
    return p ? [p] : [];
  }
  if (furniture?.model !== 'shelf') return [];
  return db.places
    .filter((p) => !(p.parent && db.place.has(p.parent)) && BOOKCASE.test(p.name) && holds(db, p.id) > 0)
    .sort(byName);
}

/**
 * The shelves of a bookcase: the bookcase itself when things sit on it
 * directly, then every place inside it, depth first. `label` is the path
 * below the bookcase; `count` is what sits directly on that place.
 */
export function shelfRows(db, placeId) {
  const inside = placesWithin(db, placeId);
  const depth = placePath(db, placeId).length;
  const direct = (id) => live(db).filter((i) => i.place === id).length;
  const rows = [];
  const self = db.place.get(placeId);
  if (self && direct(placeId)) rows.push({ place: self, label: self.name, count: direct(placeId) });
  for (const { place } of placeTree(db)) {
    if (place.id === placeId || !inside.has(place.id)) continue;
    rows.push({ place, label: placePath(db, place.id).slice(depth).map((p) => p.name).join(' › '), count: direct(place.id) });
  }
  return rows;
}

/**
 * The books on one shelf, left to right: in the order of the latest-written
 * reshelve plan that sends books there, then the rest by name.
 */
export function shelfBooks(db, placeId) {
  const here = live(db).filter((i) => i.place === placeId);
  let order = null;
  for (const plan of db.reshelves || []) {
    const moves = (plan.moves || []).filter((m) => m.to === placeId);
    if (moves.length && (!order || (plan.updatedAt ?? 0) >= (order.at ?? 0))) order = { at: plan.updatedAt ?? 0, n: new Map(moves.map((m) => [m.item, m.n])) };
  }
  const pos = (i) => order?.n.get(i.id) ?? Infinity;
  return here.sort((a, b) => pos(a) - pos(b) || byName(a, b));
}

/** What the text box says about a book: title (and author), where it is, then its notes. */
export function bookText(db, item) {
  const where = placePath(db, item.place).map((p) => p.name).join(' › ') || 'Unfiled';
  const lines = [`${item.name}${item.brand ? ` — ${item.brand}` : ''}${item.qty > 1 ? ` (×${item.qty})` : ''}`, `On ${where}.`];
  for (const l of String(item.notes || '').split('\n').map((x) => x.trim()).filter(Boolean)) lines.push(l);
  return lines;
}

const xml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A box label (model.labelSheet) as one US Letter page in points, lines shrinking to fit a full shelf. */
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
