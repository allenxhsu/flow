// flow/src/replay/world.js — the overworld: one tilemap that lays out the
// zones, the buildings that stand for each place, and grid paths between
// them. Pure data and pure functions: no DOM, so the tests run it under Node.

export const TILE = 16;
export const MAP_W = 40;
export const MAP_H = 28;

// Tile codes:
//   .  grass   *  flowers   :  dirt path   _  plaza stone   d  dock planks
//   =  road (east–west)   |  road (north–south)   #  asphalt (junction, parking)
//   T  tree   b  bush   ~  water   F  fence   x  crate
const WALK_COST = { ':': 1, '_': 1, d: 1, '=': 2, '|': 2, '#': 2, '.': 6, '*': 7 };
export const ROAD_TILES = new Set(['=', '|', '#']);

export const ZONE_NAMES = { home: 'Home', road: 'The Road', factory: 'The Factory', town: 'Town', elsewhere: 'Elsewhere' };

/** Where the car parks in each zone it can reach. */
export const PARKING = {
  home: { x: 10, y: 8 },
  factory: { x: 26, y: 10 },
  town: { x: 24, y: 15 },
  elsewhere: { x: 12, y: 15 },
};

/**
 * The buildings of the default places. `door` is the door tile on the
 * building's bottom row; the place's spot is the tile just below it.
 */
export const BUILDINGS = [
  { id: 'place_bedroom', name: 'Bedroom', zone: 'home', x: 2, y: 2, w: 4, h: 3, door: 3, style: 'house', roof: 'blue', wall: 'white', icon: 'bed' },
  { id: 'place_kitchen', name: 'Kitchen', zone: 'home', x: 7, y: 2, w: 3, h: 3, door: 8, style: 'house', roof: 'red', wall: 'sand', icon: 'pot', chimney: true },
  { id: 'place_laundry', name: 'Laundry', zone: 'home', x: 2, y: 7, w: 3, h: 2, door: 3, style: 'house', roof: 'green', wall: 'white', icon: 'basket' },
  { id: 'place_desk', name: 'Desk', zone: 'factory', x: 23, y: 2, w: 4, h: 3, door: 24, style: 'office', roof: 'grey', wall: 'sand', icon: 'paper' },
  { id: 'place_meeting', name: 'Meeting room', zone: 'factory', x: 28, y: 2, w: 3, h: 3, door: 29, style: 'house', roof: 'orange', wall: 'white', icon: 'chat' },
  { id: 'place_floor', name: 'Factory floor', zone: 'factory', x: 32, y: 1, w: 7, h: 4, door: 35, style: 'factory', roof: 'grey', wall: 'grey', icon: 'gear' },
  { id: 'place_warehouse', name: 'Warehouse', zone: 'factory', x: 32, y: 8, w: 7, h: 3, door: 35, style: 'warehouse', roof: 'grey', wall: 'brown', icon: 'box' },
  { id: 'place_gym', name: 'Gym', zone: 'town', x: 18, y: 16, w: 5, h: 3, door: 20, style: 'shop', roof: 'green', wall: 'grey', icon: 'dumbbell' },
  { id: 'place_restaurant', name: 'Restaurant', zone: 'town', x: 26, y: 16, w: 5, h: 3, door: 28, style: 'shop', roof: 'red', wall: 'white', icon: 'fork', awning: true },
  { id: 'place_friends', name: "Friends'", zone: 'town', x: 33, y: 16, w: 4, h: 3, door: 34, style: 'house', roof: 'orange', wall: 'sand', icon: 'heart' },
  { id: 'place_elsewhere', name: 'Elsewhere', zone: 'elsewhere', x: 9, y: 16, w: 3, h: 2, door: 10, style: 'tent', roof: 'orange', wall: 'sand', icon: 'star', spare: true },
];

/** Signposts for places the map does not know, a few per zone. */
export const SPARES = {
  home: [{ x: 12, y: 5, sign: { x: 13, y: 5 } }, { x: 8, y: 9, sign: { x: 8, y: 10 } }],
  road: [{ x: 6, y: 13, sign: { x: 6, y: 12 } }, { x: 18, y: 13, sign: { x: 18, y: 14 } }, { x: 33, y: 13, sign: { x: 33, y: 14 } }],
  factory: [{ x: 31, y: 7, sign: { x: 30, y: 7 } }, { x: 37, y: 5, sign: { x: 37, y: 6 } }],
  town: [{ x: 18, y: 20, sign: { x: 18, y: 21 } }, { x: 37, y: 20, sign: { x: 37, y: 21 } }, { x: 31, y: 20, sign: { x: 31, y: 21 } }],
  elsewhere: [{ x: 9, y: 22, sign: { x: 10, y: 21 } }, { x: 12, y: 20, sign: { x: 13, y: 20 } }],
};

/** Decorations that stand on the map and block walking. */
export const PROPS = [
  { kind: 'clothesline', x: 7, y: 7, w: 3, h: 1 },
  { kind: 'fountain', x: 27, y: 22, w: 2, h: 2 },
  { kind: 'bench', x: 23, y: 21, w: 1, h: 1 },
  { kind: 'bench', x: 31, y: 22, w: 1, h: 1 },
  { kind: 'lamp', x: 17, y: 18, w: 1, h: 1 },
  { kind: 'lamp', x: 32, y: 18, w: 1, h: 1 },
  { kind: 'mailbox', x: 11, y: 6, w: 1, h: 1 },
  { kind: 'barrel', x: 33, y: 7, w: 1, h: 1 },
  { kind: 'barrel', x: 34, y: 7, w: 1, h: 1 },
];

export const spotOfBuilding = (b) => ({ x: b.door, y: b.y + b.h });

/** Build the tilemap. Deterministic: the same map every time. */
export function buildTiles() {
  const t = Array.from({ length: MAP_H }, () => Array(MAP_W).fill('.'));
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) t[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const dots = (list, c) => { for (const [x, y] of list) set(x, y, c); };

  // The woods around the edge of the world.
  rect(0, 0, MAP_W - 1, 0, 'T'); rect(0, MAP_H - 1, MAP_W - 1, MAP_H - 1, 'T');
  rect(0, 0, 0, MAP_H - 1, 'T'); rect(MAP_W - 1, 0, MAP_W - 1, MAP_H - 1, 'T');
  rect(14, 1, 21, 2, 'T');
  dots([[14, 3], [16, 3], [19, 3], [21, 3], [21, 4], [14, 11], [20, 11], [21, 10], [1, 10], [12, 10], [13, 8]], 'T');
  // A pond in the meadow between home and the factory.
  rect(15, 6, 19, 9, '~');
  dots([[15, 6], [19, 6], [15, 9], [19, 9]], '.');
  dots([[14, 8], [20, 7], [17, 5], [18, 10]], 'b');
  dots([[16, 11], [17, 11], [18, 4], [20, 5], [15, 10]], '*');

  // Home: two houses and the laundry shed off one path, a garden, a fence.
  rect(2, 5, 12, 5, ':');
  rect(10, 6, 10, 7, ':');
  rect(6, 6, 6, 8, ':');
  rect(3, 9, 9, 9, ':');
  rect(11, 2, 12, 3, '*');
  dots([[1, 5], [5, 10], [9, 10], [7, 10]], '*');
  rect(1, 11, 8, 11, 'F');
  dots([[13, 2], [13, 3], [1, 7]], 'b');

  // The main road, east to west, with spurs to each zone's car park.
  rect(0, 13, MAP_W - 1, 13, '=');
  rect(10, 8, 10, 8, '#'); rect(10, 9, 10, 12, '|');
  rect(23, 9, 28, 11, '#'); rect(26, 12, 26, 12, '|');
  rect(24, 14, 24, 14, '|'); rect(23, 15, 25, 15, '#');
  rect(12, 14, 12, 14, '|'); rect(12, 15, 13, 15, '#');
  dots([[10, 13], [12, 13], [24, 13], [26, 13]], '#');

  // The factory: a fenced yard, offices along a path, the floor and the warehouse.
  rect(22, 1, 22, 11, 'F');
  rect(22, 12, 38, 12, 'F'); set(26, 12, '|');
  rect(23, 5, 37, 5, ':');
  rect(24, 6, 24, 8, ':');
  rect(31, 6, 31, 10, ':');
  rect(29, 11, 37, 11, ':');
  rect(29, 10, 29, 10, ':');
  dots([[36, 7], [37, 7], [38, 6]], 'x');
  dots([[27, 7], [28, 7], [23, 7]], 'b');

  // Town: shops on a plaza, a fountain square, flower beds.
  rect(24, 16, 24, 18, ':');
  rect(17, 19, 37, 20, '_');
  rect(25, 21, 30, 24, '_');
  rect(18, 22, 22, 23, '*');
  rect(33, 22, 36, 23, '*');
  dots([[15, 16], [15, 18], [15, 19], [15, 21], [15, 22], [15, 24], [16, 25], [19, 25], [21, 26], [34, 25], [37, 24], [38, 17], [17, 15], [31, 15], [37, 15]], 'T');
  dots([[16, 17], [23, 25], [31, 25], [32, 16]], 'b');

  // Elsewhere: a campsite by the lake, a dock.
  rect(12, 16, 12, 22, ':');
  rect(10, 18, 11, 18, ':');
  rect(10, 22, 11, 22, ':');
  rect(2, 19, 8, 25, '~');
  dots([[2, 19], [8, 19], [2, 25], [8, 25], [3, 19]], '.');
  dots([[8, 22], [9, 22]], 'd');
  set(9, 21, '~'); set(9, 23, '~');
  dots([[2, 15], [3, 16], [5, 15], [7, 16], [14, 22], [13, 25], [11, 25], [1, 17]], 'T');
  dots([[4, 17], [10, 20], [6, 17], [13, 18]], '*');
  dots([[9, 25], [14, 17]], 'b');
  return t.map((row) => row.join(''));
}

/** The whole world: tiles plus a cost grid with buildings and props blocked out. */
export function buildWorld() {
  const tiles = buildTiles();
  const blocked = new Uint8Array(MAP_W * MAP_H);
  const block = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) blocked[y * MAP_W + x] = 1; };
  for (const b of BUILDINGS) block(b.x, b.y, b.w, b.h);
  for (const p of PROPS) block(p.x, p.y, p.w, p.h);
  for (const list of Object.values(SPARES)) for (const s of list) block(s.sign.x, s.sign.y, 1, 1);
  const tile = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? 'T' : tiles[y][x]);
  const cost = (x, y) => (blocked[y * MAP_W + x] ? Infinity : WALK_COST[tile(x, y)] ?? Infinity);
  const roadCost = (x, y) => (ROAD_TILES.has(tile(x, y)) ? 1 : Infinity);
  return { w: MAP_W, h: MAP_H, tiles, tile, blocked, cost, roadCost, buildings: BUILDINGS, props: PROPS, spares: SPARES, parking: PARKING };
}

/**
 * The cheapest 4-way path between two tiles (Dijkstra; paths are cheap and
 * grass is dear, so walks follow the paths and roads). Returns the tiles from
 * `a` to `b` inclusive, or null. `costFn(x, y)` gives the cost to enter a tile.
 */
export function findPath(world, a, b, costFn = world.cost) {
  const W = world.w;
  const H = world.h;
  const key = (x, y) => y * W + x;
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const start = key(a.x, a.y);
  const goal = key(b.x, b.y);
  dist[start] = 0;
  // A small binary heap of [cost, key].
  const heap = [[0, start]];
  const push = (item) => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
    return top;
  };
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    if (k === goal) break;
    const x = k % W; const y = (k / W) | 0;
    for (const [dx, dy] of dirs) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = key(nx, ny);
      // The goal is always enterable, so a door or a parked car can be reached.
      const c = nk === goal ? 1 : costFn(nx, ny);
      if (!Number.isFinite(c)) continue;
      const nd = d + c;
      if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push([nd, nk]); }
    }
  }
  if (!Number.isFinite(dist[goal])) return null;
  const out = [];
  for (let k = goal; k !== -1; k = prev[k]) out.push({ x: k % W, y: (k / W) | 0 });
  return out.reverse();
}
