// The screens, in tab order. Each is a module with render(ctx) and, as it
// needs them, actions, forms, mounted, onInput, onChange and stable. `glyph`
// is the HUD sidebar's icon; Game mode draws pixelIcon(id) (src/ds.js).

import * as now from './now.js';
import * as tasks from './tasks.js';
import * as skills from './skills.js';
import * as bag from './bag.js';
import * as shop from './shop.js';
import * as review from './review.js';
import * as replay from './replay.js';
import * as play from './play.js';
import * as fix from './fix.js';
import * as settings from './settings.js';
import * as rules from './rules.js';

export const VIEWS = [
  { id: 'now', label: 'Now', glyph: '▶', mod: now },
  { id: 'tasks', label: 'Tasks', glyph: '☰', mod: tasks },
  { id: 'skills', label: 'Skills', glyph: '✦', mod: skills },
  { id: 'bag', label: 'Bag', glyph: '▣', mod: bag },
  { id: 'shop', label: 'Shop', glyph: '◆', mod: shop },
  { id: 'review', label: 'Review', glyph: '◷', mod: review },
  { id: 'play', label: 'Play', glyph: '◉', mod: play },
  { id: 'replay', label: 'Replay', glyph: '▦', mod: replay },
  { id: 'fix', label: 'Fix', glyph: '✎', mod: fix },
  { id: 'settings', label: 'Settings', glyph: '⚙', mod: settings },
  { id: 'rules', label: 'Rules', glyph: '§', mod: rules },
];
