// flow/src/game/worlds/generic.js — the generic world the public app plays in:
// a small two-room-plus-kitchen home, the street with a shop and a
// restaurant, the parking lot of a workplace and its floor. Every name and
// line here is made up. A player's own world is a private pack (the `world`
// record), never this file. Same format as any pack: see ../world.js.

const g = (x0, z0, x1, z1, c, y = 0.01) => ({ ground: [x0, z0, x1, z1, c, y] });
const box = (x0, y0, z0, x1, y1, z1, c) => ({ box: [x0, y0, z0, x1, y1, z1, c] });

const streetScene = [
  ...Array.from({ length: 12 }, (_, k) => g(k * 3, 12.42, k * 3 + 1.6, 12.58, '#f0d050', 0.012)),
  // house windows and a porch light
  ...[3.6, 9.2].map((x) => box(x, 0.9, 7.98, x + 1.3, 1.8, 8.04, '#9cc8e8')),
  box(3.5, 0.82, 7.97, 5.0, 0.9, 8.05, '#ffffff'), box(9.1, 0.82, 7.97, 10.6, 0.9, 8.05, '#ffffff'),
  // the shop: a window band and a green sign
  box(17.6, 0.6, 7.98, 19.8, 1.7, 8.04, '#bfe0f8'), box(21.2, 0.6, 7.98, 23.4, 1.7, 8.04, '#bfe0f8'),
  box(18.5, 2.0, 7.96, 22.5, 2.5, 8.08, '#3aa894'),
  // the restaurant: an awning and warm windows
  box(26.2, 1.55, 7.9, 32.8, 1.7, 8.7, '#e8c048'), box(26.8, 0.5, 7.98, 28.4, 1.4, 8.04, '#f8d8a0'), box(30.2, 0.5, 7.98, 31.8, 1.4, 8.04, '#f8d8a0'),
];

const lotScene = [
  ...Array.from({ length: 12 }, (_, k) => g(k * 3, 1.92, k * 3 + 1.6, 2.08, '#f0d050', 0.012)),
  ...Array.from({ length: 10 }, (_, k) => g(2 + k * 2, 6.2, 2.08 + k * 2, 9.8, '#f4f4f4', 0.012)),
  ...Array.from({ length: 10 }, (_, k) => g(2 + k * 2, 16.2, 2.08 + k * 2, 19.8, '#f4f4f4', 0.012)),
  // the workplace: a band of windows, a blue entrance with an awning
  ...Array.from({ length: 6 }, (_, k) => box(22.96, 1.6, 6 + k * 2.4, 23.02, 2.6, 7.6 + k * 2.4, '#9cc8e8')),
  box(22.94, 0, 11.6, 23.0, 2.2, 13.4, '#3a5a88'), box(21.8, 2.3, 11.3, 23.0, 2.42, 13.7, '#5a6a88'),
];

export const GENERIC_WORLD = {
  format: 'flow.world',
  version: 1,
  name: 'Generic town',
  car: { name: 'Car', model: 'car', color: '#d05050' },
  start: { level: 'home', position: [3, 4], dir: 'up' },
  levels: [
    {
      id: 'home', name: 'Home', size: [16, 12],
      rooms: [
        { name: 'Bedroom', x: 1, y: 2, w: 6, h: 4, floor: 'wood' },
        { name: 'Kitchen', x: 1, y: 7, w: 6, h: 3, floor: 'tile' },
        { name: 'Living room', x: 8, y: 2, w: 7, h: 8, floor: 'light' },
      ],
      doors: [
        { x: 7, y: 5, floor: 'wood', room: 'Living room' },
        { x: 7, y: 8, floor: 'tile', room: 'Kitchen' },
        { x: 11, y: 10, floor: 'dark', room: 'Front door' },
      ],
      furniture: [
        { model: 'desk', x: 1, y: 2, w: 2, h: 1, name: 'desk', text: 'Your desk at home. Press A here for TASKS.' },
        { model: 'chair', x: 1, y: 3, name: 'chair', text: 'Your desk chair.' },
        { model: 'lamp', x: 4, y: 2, name: 'lamp', text: 'A reading lamp.' },
        { model: 'bed', x: 5, y: 2, w: 2, h: 3, name: 'bed', text: 'Your bed. Sleep is never behind a paywall.' },
        { model: 'fridge', x: 1, y: 7, name: 'fridge', text: 'The fridge. A meal restores stamina: log it as a moment on Now.' },
        { model: 'counter', x: 2, y: 7, w: 2, h: 1, name: 'counter', text: 'The kitchen counter, wiped clean.' },
        { model: 'stove', x: 4, y: 7, name: 'stove', text: 'The stove.' },
        { model: 'sink', x: 5, y: 7, name: 'sink', text: 'The sink. The laundry basket waits beside it.' },
        { model: 'rug', x: 10, y: 4, w: 2, h: 3, name: 'rug', walk: true, under: true },
        { model: 'tv', x: 9, y: 5, w: 1, h: 2, rot: 90, name: 'TV', text: 'The TV. It costs mana and earns nothing. Maybe later.' },
        { model: 'sofa', x: 13, y: 4, w: 1, h: 3, name: 'sofa', text: 'The sofa. Rest pauses a combo, never breaks it.' },
        { model: 'shelf', x: 11, y: 2, w: 2, h: 1, name: 'shelf', text: 'A shelf of books you mean to finish.' },
        { model: 'plant', x: 14, y: 2, name: 'plant', text: 'A happy plant.' },
        { model: 'lamp', x: 8, y: 2, name: 'lamp', text: 'A floor lamp.' },
      ],
      exits: [{ x: 11, y: 10, to: 'street', at: [7, 9], dir: 'down' }],
    },
    {
      id: 'street', name: 'The street', size: [34, 16], outdoor: true, sky: '#a8d8f0',
      ground: [
        { x: 0, y: 10, w: 34, h: 1, floor: 'walk', room: 'Sidewalk' },
        { x: 0, y: 11, w: 34, h: 3, floor: 'street', room: 'The road' },
        { x: 0, y: 14, w: 34, h: 1, floor: 'walk', room: 'Sidewalk' },
        { x: 7, y: 8, w: 1, h: 2, floor: 'path', room: 'Front path' },
        { x: 13, y: 3, w: 2, h: 7, floor: 'drive', room: 'Driveway' },
        { x: 17, y: 8, w: 16, h: 2, floor: 'brick', room: 'Shops' },
      ],
      buildings: [
        { x: 3, y: 2, w: 9, h: 6, name: 'Home', height: 2.6, wall: '#f0e2c8', roof: '#b86a50', rise: 1.6 },
        { x: 17, y: 3, w: 7, h: 5, name: 'Shop', height: 2.6, wall: '#dfe8f0', roof: '#9aa6b8', flat: true },
        { x: 26, y: 3, w: 7, h: 5, name: 'Restaurant', height: 2.4, wall: '#f4e0c8', roof: '#c85a4a', rise: 1.2 },
      ],
      furniture: [
        { model: 'door', x: 7, y: 8, name: 'front door', walk: true, under: true },
        { model: 'door', x: 20, y: 8, name: 'shop door', walk: true, under: true },
        { model: 'door', x: 29, y: 8, name: 'restaurant door', walk: true, under: true },
        { model: 'car', x: 13, y: 5, w: 2, h: 3, name: 'car', car: true, text: 'Your car.' },
        { model: 'mailbox', x: 6, y: 9, name: 'mailbox', text: 'The mailbox. A catalogue you did not ask for: skip it, save money.' },
        { model: 'tree', x: 1, y: 2, name: 'tree', text: 'A shady tree.' },
        { model: 'tree', x: 1, y: 7, name: 'tree', text: 'A shady tree.' },
        { model: 'tree', x: 15, y: 1, name: 'tree', text: 'A shady tree.' },
        { model: 'tree', x: 24, y: 2, name: 'tree', text: 'A shady tree.' },
        { model: 'bench', x: 24, y: 8, w: 2, h: 1, name: 'bench', text: 'A bench in the sun.' },
        { model: 'sign', x: 16, y: 9, name: 'sign', text: 'SHOP · RESTAURANT →' },
        ...[3, 4, 5, 8, 9, 10].map((x) => ({ model: 'hedge', x, y: 9, name: 'hedge', text: 'A trimmed hedge.' })),
      ],
      exits: [
        { x: 7, y: 8, to: 'home', at: [11, 9], dir: 'up' },
        { x: 20, y: 8, to: 'shop', at: [5, 7], dir: 'up' },
        { x: 29, y: 8, to: 'diner', at: [5, 7], dir: 'up' },
      ],
      scene: streetScene,
    },
    {
      id: 'shop', name: 'The shop', size: [12, 9],
      rooms: [{ name: 'Shop', x: 1, y: 2, w: 10, h: 6, floor: 'tile' }],
      doors: [{ x: 5, y: 8, floor: 'tile', room: 'Door' }],
      furniture: [
        { model: 'shelves', x: 1, y: 2, w: 3, h: 1, name: 'shelves', text: 'Snacks and batteries. Check your Bag first: you may own some already.' },
        { model: 'shelves', x: 5, y: 2, w: 3, h: 1, name: 'shelves', text: 'Tape, bulbs, cables. Skipping a buy you do not need pays points.' },
        { model: 'register', x: 8, y: 5, w: 2, h: 1, name: 'register', text: 'The till.' },
        { model: 'plant', x: 10, y: 2, name: 'plant', text: 'A plant by the window.' },
      ],
      exits: [{ x: 5, y: 8, to: 'street', at: [20, 9], dir: 'down' }],
    },
    {
      id: 'diner', name: 'The restaurant', size: [12, 9],
      rooms: [{ name: 'Restaurant', x: 1, y: 2, w: 10, h: 6, floor: 'wood' }],
      doors: [{ x: 5, y: 8, floor: 'wood', room: 'Door' }],
      furniture: [
        { model: 'booth', x: 1, y: 2, w: 2, h: 2, name: 'booth', text: 'A window booth.' },
        { model: 'booth', x: 4, y: 2, w: 2, h: 2, name: 'booth', text: 'A booth with a view of the street.' },
        { model: 'kitchen pass', x: 7, y: 2, w: 3, h: 1, name: 'kitchen', text: 'The kitchen pass. Something smells good.' },
        { model: 'table', x: 2, y: 5, w: 2, h: 2, name: 'table', text: 'A table for four.' },
        { model: 'plant', x: 10, y: 7, name: 'plant', text: 'A potted palm.' },
      ],
      exits: [{ x: 5, y: 8, to: 'street', at: [29, 9], dir: 'down' }],
    },
    {
      id: 'lot', name: 'The parking lot', size: [36, 24], outdoor: true, sky: '#a8d8f0',
      ground: [
        { x: 0, y: 0, w: 36, h: 24, floor: 'walk', room: 'Work' },
        { x: 0, y: 0, w: 36, h: 4, floor: 'street', room: 'The road' },
        { x: 2, y: 6, w: 19, h: 15, floor: 'lot', room: 'Parking lot' },
      ],
      buildings: [{ x: 23, y: 5, w: 12, h: 16, name: 'Work', height: 3.2, wall: '#d4d4cc', roof: '#e6e6e0', flat: true }],
      furniture: [
        { model: 'door', x: 22, y: 12, name: 'entrance', walk: true, under: true },
        { model: 'car', x: 4, y: 11, w: 2, h: 3, name: 'car', car: true, text: 'Your car.' },
        ...[2, 6, 8, 14, 18].map((x) => ({ model: 'parked car', x, y: 7, w: 2, h: 3, name: 'parked car', text: 'Somebody else’s car.' })),
        ...[4, 10, 12, 16].map((x) => ({ model: 'parked car', x, y: 17, w: 2, h: 3, name: 'parked car', text: 'Somebody else’s car.' })),
        ...[3, 9, 15].map((x) => ({ model: 'tree', x, y: 22, name: 'tree', text: 'A young tree in the median.' })),
        { model: 'bench', x: 25, y: 22, w: 2, h: 1, name: 'bench', text: 'The smokers’ bench, empty.' },
      ],
      exits: [{ x: 22, y: 12, to: 'floor', at: [9, 13], dir: 'up' }],
      scene: lotScene,
    },
    {
      id: 'floor', name: 'Work', size: [28, 16],
      rooms: [
        { name: 'Shop floor', x: 1, y: 2, w: 16, h: 12, floor: 'concrete' },
        { name: 'Office', x: 18, y: 2, w: 9, h: 6, floor: 'tile' },
        { name: 'Break room', x: 18, y: 9, w: 9, h: 5, floor: 'light' },
      ],
      doors: [
        { x: 17, y: 4, h: 2, floor: 'concrete', room: 'Shop floor' },
        { x: 17, y: 11, h: 2, floor: 'light', room: 'Break room' },
        { x: 8, y: 14, w: 2, floor: 'concrete', room: 'Exit' },
      ],
      furniture: [
        ...[2, 7, 12].map((x) => ({ model: 'machine', x, y: 2, w: 3, h: 2, name: 'machine', text: 'A machine, humming along.' })),
        ...[3, 7, 11].map((x) => ({ model: 'workbench', x, y: 8, w: 2, h: 1, name: 'workbench', text: 'A workbench: bins of parts and a little screen.' })),
        { model: 'rack', x: 15, y: 3, w: 1, h: 2, name: 'rack', text: 'Parts bins, all labelled.' },
        { model: 'rack', x: 15, y: 7, w: 1, h: 2, name: 'rack', text: 'More parts bins.' },
        { model: 'pallet', x: 3, y: 12, name: 'pallet', text: 'A pallet of boxed parts.' },
        { model: 'pallet', x: 4, y: 12, name: 'pallet', text: 'A pallet of boxed parts.' },
        { model: 'crate', x: 13, y: 12, name: 'crate', text: 'A crate, nailed shut.' },
        { model: 'desk', x: 19, y: 2, w: 2, h: 1, name: 'desk', text: 'Your desk. Press A here for TASKS.' },
        { model: 'chair', x: 19, y: 3, name: 'chair', text: 'Your chair.' },
        { model: 'desk', x: 22, y: 2, w: 2, h: 1, name: 'desk', text: 'Ana’s desk, very tidy.' },
        { model: 'whiteboard', x: 25, y: 2, w: 2, h: 1, name: 'whiteboard', text: 'The whiteboard: THIS WEEK — ship it, then rest.' },
        { model: 'plant', x: 26, y: 7, name: 'plant', text: 'The office plant. Somebody waters it.' },
        { model: 'counter', x: 18, y: 9, w: 2, h: 1, name: 'coffee', text: 'The coffee corner.' },
        { model: 'table', x: 21, y: 11, w: 2, h: 2, name: 'table', text: 'The break-room table.' },
        { model: 'vending', x: 25, y: 9, name: 'vending machine', text: 'The vending machine. A snack is a Shop reward; water is free.' },
        { model: 'water cooler', x: 26, y: 9, name: 'water cooler', text: 'The water cooler.' },
      ],
      exits: [{ x: 8, y: 14, w: 2, to: 'lot', at: [21, 12], dir: 'left' }],
    },
  ],
  places: [
    { id: 'home', name: 'Home', kind: 'home', position: [58, 72], level: 'street', at: [12, 8], dir: 'left', note: 'Your home: the bedroom desk, the kitchen, the sofa.' },
    { id: 'shop', name: 'Shop', kind: 'shop', position: [84, 62], level: 'street', at: [20, 9], dir: 'up', note: 'The corner shop. Check your Bag before you buy.' },
    { id: 'restaurant', name: 'Restaurant', kind: 'food', position: [100, 78], level: 'street', at: [29, 9], dir: 'up', note: 'Dinner out. Meals are never behind a paywall.' },
    { id: 'work', name: 'Work', kind: 'work', position: [184, 46], level: 'lot', at: [7, 12], dir: 'right', note: 'The workplace: the lot out front, the floor and your desk inside.' },
  ],
  npcs: [
    { id: 'npc_ana', name: 'Ana', level: 'floor', position: [22, 3], dir: 'down', sprite: { hair: '#2e2420', shirt: '#6a8ac8', trousers: '#3a3a4a', skin: '#e8b48c' },
      lines: ['Morning! The coffee is fresh.'],
      choices: [
        { label: 'How’s it going?', kind: 'talk', lines: ['Busy, the good kind of busy.', 'I batch the small stuff after lunch. It really helps.'] },
        { label: 'See you', kind: 'leave', lines: ['See you later!'] },
      ] },
    { id: 'npc_ben', name: 'Ben', level: 'floor', position: [6, 6], dir: 'right', sprite: { hair: '#c89a58', shirt: '#e8a038', trousers: '#3a4a6a' },
      lines: ['Hey! Race you to a clear head?'],
      choices: [
        { label: 'Challenge', kind: 'battle', lines: ['PING! A NEW MESSAGE', 'QUICK QUESTION…', 'CAN YOU HOP ON A CALL?', 'ONE MORE SMALL THING'] },
        { label: 'Later', kind: 'leave', lines: ['Anytime.'] },
      ] },
    { id: 'npc_kai', name: 'Kai', level: 'lot', position: [12, 5], dir: 'down', sprite: { hair: '#1e1a22', shirt: '#6ab468', trousers: '#4a4a58', skin: '#c8946c' },
      lines: ['Lap round the lot? Stretch the legs.'],
      choices: [
        { label: 'Walk a lap', kind: 'walk', with: ['npc_mo'], lap: [[1, 5], [21, 5], [21, 21], [1, 21], [1, 5]], lines: ['Nice day for it.', 'How many laps make a mile?', 'Let’s not find out today.', 'Same time tomorrow?'] },
        { label: 'Maybe later', kind: 'leave', lines: ['We’ll be out here.'] },
      ] },
    { id: 'npc_mo', name: 'Mo', level: 'lot', position: [13, 5], dir: 'down', sprite: { hair: '#8a8a94', shirt: '#d85050', trousers: '#b8a078' },
      lines: ['I’m trying a new app for my to-do list.'],
      choices: [
        { label: 'Tell me more', kind: 'app', lines: ['It turns chores into quests.', 'Finish one, get points. Streaks, levels, the lot.', 'Mostly it just gets me to start.'] },
        { label: 'Bye', kind: 'leave', lines: ['Bye!'] },
      ] },
    { id: 'npc_lu', name: 'Lu', level: 'shop', position: [9, 4], dir: 'down', sprite: { hair: '#4a3a2e', shirt: '#3aa894', trousers: '#2c3450' },
      lines: ['Welcome in!'],
      choices: [
        { label: 'Just looking', kind: 'talk', lines: ['Take your time. Checking what you already own saves more than any sale.'] },
        { label: 'Bye', kind: 'leave', lines: ['Come again!'] },
      ] },
    { id: 'npc_sol', name: 'Sol', level: 'diner', position: [8, 4], dir: 'down', sprite: { hair: '#a86a38', shirt: '#f4f4f0', trousers: '#2a2a34' },
      lines: ['Table for one?'],
      choices: [
        { label: 'Just a coffee', kind: 'talk', lines: ['Coming right up. Rest counts too.'] },
        { label: 'Not today', kind: 'leave', lines: ['Another time!'] },
      ] },
  ],
  desks: [{ level: 'home', position: [1, 2] }, { level: 'floor', position: [19, 2] }],
  spots: {
    place_bedroom: { level: 'home', position: [4, 4] },
    place_kitchen: { level: 'home', position: [3, 8] },
    place_laundry: { level: 'home', position: [5, 8] },
    place_office: { level: 'home', position: [2, 3] },
    place_car: { level: 'street', position: [12, 7] },
    place_floor: { level: 'floor', position: [8, 6] },
    place_desk: { level: 'floor', position: [20, 3] },
    place_meeting: { level: 'floor', position: [25, 4] },
    place_warehouse: { level: 'floor', position: [14, 6] },
    place_gym: { level: 'street', position: [16, 10] },
    place_restaurant: { level: 'diner', position: [5, 5] },
    place_friends: { level: 'street', position: [24, 9] },
    home: { level: 'home', position: [4, 4] },
    road: { level: 'street', position: [12, 7] },
    factory: { level: 'floor', position: [8, 6] },
    town: { level: 'street', position: [20, 9] },
    elsewhere: { level: 'street', position: [16, 10] },
  },
};
