// flow/src/game/scene3d.js — the dual-screen look: a real 3D room under a
// tilted perspective camera. Floors are textured with the 2D tile painters,
// walls are tall where a room's back wall faces you and cut low elsewhere,
// furniture is low-poly boxes (./models.js), buildings are boxes under hip or
// flat roofs, and people are flat sprites standing up to face the camera.
// Needs three.js (r128, vendored) passed in as THREE.

import { painter, T } from './paint.js';
import { MODELS, buildModel } from './models.js';

export const TILT = 52 * Math.PI / 180;
const WALL_H = 1.3;
const LOW_H = 0.3;

function texOf(THREE, canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

function tris(THREE, points, color) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

/** A hip roof over a rectangle: two trapezoids and two triangles meeting at a ridge. */
export function hip(THREE, x0, z0, x1, z1, y0, rise, c, overhang = 0.25) {
  x0 -= overhang; z0 -= overhang; x1 += overhang; z1 += overhang;
  const w = x1 - x0; const d = z1 - z0; const alongX = w >= d; const inset = (alongX ? d : w) / 2; const y1 = y0 + rise;
  const r0 = alongX ? [x0 + inset, y1, (z0 + z1) / 2] : [(x0 + x1) / 2, y1, z0 + inset];
  const r1 = alongX ? [x1 - inset, y1, (z0 + z1) / 2] : [(x0 + x1) / 2, y1, z1 - inset];
  const A = [x0, y0, z0]; const B = [x1, y0, z0]; const C = [x1, y0, z1]; const D = [x0, y0, z1];
  return tris(THREE, alongX ? [A, r0, B, B, r0, r1, C, r1, D, D, r1, r0, D, r0, A, B, r1, C] : [A, D, r0, D, r1, r0, B, r0, r1, B, r1, C, A, r0, B, D, C, r1], c);
}

/** A gable: the ridge runs north–south and the gable end faces south. */
export function gable(THREE, x0, z0, x1, z1, y0, rise, c) {
  const xm = (x0 + x1) / 2; const y1 = y0 + rise;
  const g = new THREE.Group();
  g.add(tris(THREE, [[x0, y0, z0], [xm, y1, z0], [xm, y1, z1], [x0, y0, z0], [xm, y1, z1], [x0, y0, z1], [x1, y0, z0], [xm, y1, z1], [xm, y1, z0], [x1, y0, z0], [x1, y0, z1], [xm, y1, z1]], c));
  g.add(tris(THREE, [[x0, y0, z1], [x1, y0, z1], [xm, y1, z1]], '#f4e6cc'));
  return g;
}

function boxMesh(THREE, x0, y0, z0, x1, y1, z1, c) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) || 0.001, Math.abs(y1 - y0) || 0.001, Math.abs(z1 - z0) || 0.001), new THREE.MeshLambertMaterial({ color: c }));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

function paintInto(doc, w, h, fn) {
  const c = doc.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  fn(painter(g), g);
  return c;
}

/**
 * Build one level's scene. Returns { scene, people: Map(id → sprite mesh),
 * hero, heroCanvas, shadow, setNight(dark) }.
 */
export function buildLevel(THREE, doc, { world, level, grid, carColor }) {
  const scene = new THREE.Scene();
  const outdoor = level.outdoor;
  scene.background = new THREE.Color(outdoor ? (level.sky || '#a8d8f0') : '#16121e');
  const amb = new THREE.AmbientLight(0xffffff, 0.62); scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff4e0, 0.55); sun.position.set(-0.5, 1, 0.7); scene.add(sun);
  const cache = new Map();
  const models = { ...MODELS, ...Object.fromEntries(Object.entries(world.models || {}).map(([k, v]) => [k, v.boxes])) };
  const { w, h, cell } = grid;

  // One floor texture: every tile, with flat things (rugs, mats) painted on top.
  const floorCanvas = paintInto(doc, w * T, h * T, (p) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = cell[y][x]; if (c.floor) p.floorTile(c.floor, x * T, y * T, x, y); else if (outdoor) p.floorTile('grass', x * T, y * T, x, y); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texOf(THREE, floorCanvas) }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(w / 2, 0, h / 2); scene.add(floor);

  // Walls, indoors: the classic cutaway.
  const wallTex = (fn, ww, hh) => new THREE.MeshLambertMaterial({ map: texOf(THREE, paintInto(doc, ww, hh, fn)) });
  const faceM = wallTex((p) => { p.wall({ face: true }, 0, 4); p.R(0, 0, 16, 4, '#efe4cf'); p.R(0, 0, 16, 1, '#b4a894'); }, 16, 20);
  const sideM = wallTex((p) => { p.wall({ face: true }, 0, 4); p.R(0, 0, 16, 4, '#efe4cf'); }, 16, 20);
  const topM = wallTex((p) => p.wall({ face: false }, 0, 0), 16, 16);
  const lowM = wallTex((p) => { p.R(0, 0, 16, 8, '#dccab0'); p.R(0, 0, 16, 1, '#fbf8f0'); p.R(0, 7, 16, 1, '#b8ac98'); }, 16, 8);
  const tallGeo = new THREE.BoxGeometry(1, WALL_H, 1); const lowGeo = new THREE.BoxGeometry(1, LOW_H, 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cell[y][x];
    if (!c.wall) continue;
    const tall = c.face; const H = tall ? WALL_H : LOW_H;
    const m = new THREE.Mesh(tall ? tallGeo : lowGeo, [sideM, sideM, topM, topM, tall ? faceM : lowM, sideM]);
    m.position.set(x + 0.5, H / 2, y + 0.5); scene.add(m);
  }

  // Buildings, outdoors: walls, then a hip or a flat roof.
  for (const b of level.buildings || []) {
    if (b.solid) continue;
    scene.add(boxMesh(THREE, b.x, 0, b.y, b.x + b.w, b.height, b.y + b.h, b.wall));
    if (b.noRoof) continue;
    if (b.flat) scene.add(boxMesh(THREE, b.x - 0.05, b.height, b.y - 0.05, b.x + b.w + 0.05, b.height + 0.1, b.y + b.h + 0.05, b.roof));
    else scene.add(hip(THREE, b.x, b.y, b.x + b.w, b.y + b.h, b.height, b.rise, b.roof, 0.3));
  }

  // Extra geometry from the pack.
  for (const p of level.scene || []) {
    if (p.box) scene.add(boxMesh(THREE, ...p.box));
    else if (p.ground) { const [x0, z0, x1, z1, c, y = 0.01] = p.ground; const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0) || 0.01, Math.abs(z1 - z0) || 0.01), new THREE.MeshLambertMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); scene.add(m); }
    else if (p.hip) scene.add(hip(THREE, ...p.hip));
    else if (p.gable) scene.add(gable(THREE, ...p.gable));
    else if (p.model) {
      const [name, x, z, rotY = 0, scale = 1] = p.model;
      const g = buildModel(THREE, models[name] || [], { carColor, cache });
      g.position.set(x, 0, z); g.rotation.y = rotY; g.scale.set(scale, scale, scale); scene.add(g);
    }
  }

  // Furniture.
  for (const f of level.furniture) {
    const boxes = models[f.model];
    if (!boxes) continue;
    const inner = buildModel(THREE, boxes, { carColor, cache });
    const native = f.rot === 90 || f.rot === 270 ? [f.h, f.w] : [f.w, f.h];
    inner.position.set(-native[0] / 2, 0, -native[1] / 2);
    const g = new THREE.Group(); g.add(inner);
    g.rotation.y = (f.rot || 0) * Math.PI / 180;
    g.position.set(f.x + f.w / 2, 0, f.y + f.h / 2);
    scene.add(g);
  }

  // People and the hero: sprites leaning back to face the tilted camera.
  const spriteMesh = (cw, ch) => {
    const canvas = doc.createElement('canvas'); canvas.width = cw; canvas.height = ch;
    const tex = texOf(THREE, canvas);
    const geo = new THREE.PlaneGeometry(cw / T, ch / T); geo.translate(0, ch / T / 2, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    mesh.rotation.x = -TILT;
    scene.add(mesh);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.6, 1); scene.add(shadow);
    return { mesh, canvas, tex, shadow, place(x, z) { mesh.position.set(x + 0.5, 0, z + 0.9); shadow.position.set(x + 0.5, 0.012, z + 0.8); } };
  };
  const people = new Map();
  for (const n of world.npcs) if (n.level === level.id) people.set(n.id, spriteMesh(16, 28));
  const hero = spriteMesh(16, 28);

  return {
    scene, people, hero, spriteMesh,
    setNight(dark) {
      amb.intensity = 0.62 * (1 - dark * 0.7);
      sun.intensity = 0.55 * (1 - dark);
      amb.color.setRGB(1 - dark * 0.4, 1 - dark * 0.3, 1);
    },
  };
}

/** The camera: over the hero's shoulder, tilted like the handheld's upper screen. */
export function aimCamera(cam, x, z, outdoor) {
  const D = outdoor ? 19 : 16;
  cam.position.set(x + 0.5, D * Math.sin(TILT), z + 0.5 + D * Math.cos(TILT));
  cam.lookAt(x + 0.5, 0.4, z + 0.5);
}
