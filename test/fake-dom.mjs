// A tiny stand-in for the browser, just enough to mount the Day Replay under
// `node --test`: elements that remember listeners and attributes, a 2D
// context that records what was drawn (text, paths, gradients), and a manual
// requestAnimationFrame. Not a DOM — only what src/replay/index.js touches.

/** A 2D context that accepts every call and records the interesting ones. */
export function fakeContext(canvas) {
  const log = { text: [], calls: new Map(), gradients: 0 };
  const count = (name) => log.calls.set(name, (log.calls.get(name) || 0) + 1);
  const gradient = () => { log.gradients++; return { addColorStop(o, c) { if (!(o >= 0 && o <= 1)) throw new RangeError(`colour stop ${o}`); if (typeof c !== 'string' || !c) throw new TypeError('colour stop colour'); } }; };
  const state = { font: '10px sans-serif', canvas, imageSmoothingEnabled: true, globalAlpha: 1 };
  const fontPx = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] || 10);
  const methods = {
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    createConicGradient: gradient,
    createPattern: () => ({ setTransform() {} }),
    measureText: (s) => ({ width: Array.from(String(s)).length * fontPx() * 0.55, actualBoundingBoxAscent: fontPx() * 0.75, actualBoundingBoxDescent: fontPx() * 0.2 }),
    fillText: (s, x, y) => { count('fillText'); if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError(`fillText at ${x},${y}`); log.text.push(String(s)); },
    strokeText: (s) => { count('strokeText'); log.text.push(String(s)); },
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }),
    isPointInPath: () => false,
    drawImage: (img) => { count('drawImage'); if (!img) throw new TypeError('drawImage of nothing'); },
    arc: (x, y, r) => { count('arc'); if (!(r >= 0)) throw new RangeError(`arc radius ${r}`); },
    ellipse: (x, y, rx, ry) => { count('ellipse'); if (!(rx >= 0) || !(ry >= 0)) throw new RangeError(`ellipse radius ${rx},${ry}`); },
  };
  return new Proxy(state, {
    get(t, k) {
      if (k === '__log') return log;
      if (k in methods) return methods[k];
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return (...args) => { count(k); return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class FakeElement {
  constructor(doc, tag = 'div') {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.children = [];
    this.parent = null;
    this.hidden = false;
    this.textContent = '';
    this.value = '0';
    this._html = '';
    this._q = new Map();
    this.width = 300;
    this.height = 150;
    this.clientWidth = doc.width;
    this._ctx = null;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._q.clear(); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; this.removed = true; }
  insertAdjacentHTML(_, html) { this._html += html; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  dispatch(type, ev = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, stopPropagation() {}, target: this, ...ev }); }
  closest() { return null; }
  matches() { return false; }
  focus() {}
  getBoundingClientRect() {
    const w = parseFloat(this.style.width) || this.width;
    const h = parseFloat(this.style.height) || this.height;
    return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
  }
  querySelector(sel) {
    if (!this._q.has(sel)) {
      const el = new FakeElement(this.ownerDocument, sel === 'canvas' ? 'canvas' : 'div');
      el.parent = this;
      el.selector = sel;
      this._q.set(sel, el);
    }
    return this._q.get(sel);
  }
  querySelectorAll() { return []; }
  getContext(kind) { if (kind !== '2d') return null; this._ctx ||= fakeContext(this); return this._ctx; }
}

/** A document + window pair. `width` is the CSS width the replay is mounted in. */
export function fakeBrowser({ width = 820, dpr = 1 } = {}) {
  const frames = [];
  let now = 0;
  const doc = { width, byId: new Map() };
  const win = {
    devicePixelRatio: dpr,
    performance: { now: () => now },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: (id) => { frames[id - 1] = null; },
    ResizeObserver: class { observe() {} disconnect() {} },
  };
  Object.assign(doc, {
    defaultView: win,
    head: new FakeElement(doc, 'head'),
    body: new FakeElement(doc, 'body'),
    createElement: (tag) => new FakeElement(doc, tag),
    getElementById: (id) => doc.byId.get(id) || null,
  });
  const origAppend = doc.head.appendChild.bind(doc.head);
  doc.head.appendChild = (c) => { if (c.id) doc.byId.set(c.id, c); return origAppend(c); };
  /** Run queued animation frames, advancing the clock `ms` each. */
  const tick = (n = 1, ms = 16) => {
    for (let i = 0; i < n; i++) {
      now += ms;
      const queued = frames.splice(0);
      for (const fn of queued) if (fn) fn(now);
    }
  };
  return { doc, win, tick, element: () => new FakeElement(doc, 'div') };
}

/** Every canvas context created under an element tree (the stage and its caches). */
export function contextsOf(root) {
  const out = [];
  const walk = (el) => {
    if (el._ctx) out.push(el._ctx);
    for (const c of el.children) walk(c);
    for (const c of el._q?.values?.() || []) walk(c);
  };
  walk(root);
  return out;
}
