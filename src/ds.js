// The handheld look's building blocks, as HTML strings: original pixel icons
// drawn from little bitmaps, the status strip every screen carries (hearts =
// stamina, magic bar = mana, gem counter = points, level), the framed text
// box with a speaker tab (toasts and confirmations), and the paper-doll hero.
// Pure, so the tests render them under Node.

import { esc, fmtPts } from './util.js';

// '#' is ink (currentColor); other letters name a colour in the palette passed in.
const ICONS = {
  now: ['....##..', '...##...', '..##....', '.######.', '....##..', '...##...', '..##....', '.##.....'],
  tasks: ['########', '#......#', '#.####.#', '#......#', '#.####.#', '#......#', '#.###..#', '########'],
  skills: ['....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '.##...##.', '##.....##'],
  bag: ['..####..', '.#....#.', '########', '#......#', '#.####.#', '#.#..#.#', '#.####.#', '########'],
  shop: ['########', '#.#.#.#.', '########', '.#....#.', '.#.##.#.', '.#.##.#.', '.#.##.#.', '########'],
  review: ['.#....#.', '########', '#......#', '########', '#.#.#.##', '#......#', '#.#.#..#', '########'],
  replay: ['########', '#......#', '#.#....#', '#.##...#', '#.###..#', '#.##...#', '#.#....#', '########'],
  settings: ['...##...', '.######.', '.##..##.', '###..###', '###..###', '.##..##.', '.######.', '...##...'],
  rules: ['..####..', '.#....#.', '#..##..#', '#......#', '#..##..#', '#..##..#', '.#.##.#.', '..####..'],
  // Equipment slots.
  head: ['........', '..####..', '.######.', '.######.', '########', '........'],
  body: ['.##..##.', '########', '########', '.######.', '.######.', '.######.'],
  legs: ['.######.', '.######.', '.##..##.', '.##..##.', '.##..##.', '.##..##.'],
  feet: ['.###....', '.###....', '.###....', '.######.', '########', '........'],
  hands: ['.#.#.#..', '.#.#.#..', '.######.', '.#######', '.######.', '..####..'],
  tech: ['.######.', '.#....#.', '.#....#.', '.######.', '########', '........'],
  vehicle: ['..####..', '.#.#..#.', '########', '########', '.##..##.', '........'],
  item: ['.######.', '#......#', '#.####.#', '#......#', '########', '........'],
  skip: ['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....'],
  // The strip.
  heart: ['.oo.oo.', 'orrorro', 'orrrrro', '.orrro.', '..oro..', '...o...'],
  gem: ['..ooo..', '.obwbo.', 'obbbbbo', '.obbbo.', '..obo..', '...o...'],
};

/** An original pixel icon as inline SVG, `size` CSS pixels per bitmap pixel. */
export function pixelIcon(name, { size = 2, colors = {}, label = '' } = {}) {
  const rows = ICONS[name] || ICONS.item;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.') continue;
      let e = x;
      while (row[e + 1] === c) e++;
      const fill = c === '#' ? '' : ` fill="${colors[c] || 'currentColor'}"`;
      rects += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1"${fill}/>`;
      x = e;
    }
  });
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg class="px-icon" ${a11y} viewBox="0 0 ${w} ${h}" width="${w * size}" height="${h * size}" shape-rendering="crispEdges" fill="currentColor">${rects}</svg>`;
}

const INK = 'var(--ink)';
/** One heart: full, half (left half red) or empty. */
function heart(state) {
  const rows = ICONS.heart;
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === '.') continue;
      const fill = c === 'o' ? INK : state === 'full' || (state === 'half' && x <= 3) ? 'var(--heart)' : 'var(--heart-empty)';
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  });
  return `<svg class="heart ${state}" aria-hidden="true" focusable="false" viewBox="0 0 7 6" width="21" height="18" shape-rendering="crispEdges">${rects}</svg>`;
}

const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/**
 * The strip along the top of every screen: five hearts for stamina (one per
 * 2 points), the green magic bar for mana, the gem counter for points, the
 * player's level and the clock.
 */
export function statusStrip(g) {
  const e = g.energy || {};
  const rated = !!e.rated;
  const st = rated ? e.stamina : 0;
  const hearts = [0, 1, 2, 3, 4].map((i) => heart(st >= 2 * (i + 1) ? 'full' : st >= 2 * i + 1 ? 'half' : 'empty')).join('');
  const mana = rated ? e.mana : 0;
  const pct = Math.max(0, Math.min(100, (mana / 10) * 100));
  return `<div class="ds-strip">
    <span class="hearts" role="img" aria-label="${rated ? `Stamina ${st} of 10` : 'Stamina not rated yet'}">${hearts}</span>
    <span class="mp"><span class="mp-label" aria-hidden="true">MP</span><span class="magic" role="meter" aria-label="Mana" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${mana}"${rated ? '' : ' aria-valuetext="not rated yet"'}><i style="width:${pct}%"></i></span></span>
    <span class="gem" title="Points balance${g.balance < 0 ? ' (in debt)' : ''}">${pixelIcon('gem', { colors: { o: INK, b: 'var(--gem)', w: '#ffffff' }, size: 3 })}<span id="strip-gem" class="num${g.balance < 0 ? ' debt' : ''}">${fmtPts(g.balance)}</span></span>
    <span class="lv" id="strip-level" title="Player level · difficulty ${esc(g.difficulty?.name || 'Push')}">LV ${g.player?.level ?? 1}</span>
    <span class="clock num" aria-hidden="true">${hhmm(g.now ?? Date.now())}</span>
  </div>`;
}

/** The framed text box with a speaker name tab. `body` is HTML; the speaker is text. */
export function textBox({ speaker = 'Flow', body = '', tone = 'info', id = '' } = {}) {
  return `<div class="textbox textbox--${esc(tone)}"${id ? ` id="${esc(id)}"` : ''}><span class="textbox-speaker">${esc(speaker)}</span><div class="textbox-body">${body}</div></div>`;
}

/** The paper-doll hero: an original little figure in the player's chosen colours. */
export function heroSprite(hero = {}, { size = 6 } = {}) {
  const c = { h: hero.hair || '#4a3222', s: hero.skin || '#e0b48c', t: hero.shirt || '#2f7fd0', p: hero.trousers || '#34405a', k: '#1b2340', e: '#1b2340', w: '#ffffff' };
  const rows = [
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..hhssssshh.',
    '..hsesseshh.',
    '..hssssssh..',
    '...ssswss...',
    '....tttt....',
    '..tttttttt..',
    '.sttttttttS.',
    '.s.tttttt.s.',
    '.s.tttttt.s.',
    '...pppppp...',
    '...pp..pp...',
    '...pp..pp...',
    '...kk..kk...',
    '..kkk..kkk..',
  ];
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] === 'S' ? 's' : row[x];
      if (ch === '.') continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${esc(c[ch])}"/>`;
    }
  });
  return `<svg class="hero" aria-hidden="true" focusable="false" viewBox="0 0 12 16" width="${12 * size}" height="${16 * size}" shape-rendering="crispEdges">${rects}</svg>`;
}
