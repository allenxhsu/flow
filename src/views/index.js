// The screens, in tab order. Each is a module with render(ctx) and, as it
// needs them, actions, forms, mounted, onInput, onChange and stable.

import * as now from './now.js';
import * as tasks from './tasks.js';
import * as skills from './skills.js';
import * as bag from './bag.js';
import * as shop from './shop.js';
import * as review from './review.js';
import * as replay from './replay.js';
import * as play from './play.js';
import * as settings from './settings.js';
import * as rules from './rules.js';

export const VIEWS = [
  { id: 'now', label: 'Now', mod: now },
  { id: 'tasks', label: 'Tasks', mod: tasks },
  { id: 'skills', label: 'Skills', mod: skills },
  { id: 'bag', label: 'Bag', mod: bag },
  { id: 'shop', label: 'Shop', mod: shop },
  { id: 'review', label: 'Review', mod: review },
  { id: 'play', label: 'Play', mod: play },
  { id: 'replay', label: 'Replay', mod: replay },
  { id: 'settings', label: 'Settings', mod: settings },
  { id: 'rules', label: 'Rules', mod: rules },
];
