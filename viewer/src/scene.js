// Procedural, modular scene for Bethesda Terrace & Fountain.
// Each exported builder returns one MeshBuilder ("component") so parts can be
// inspected, tested and rendered independently.

import { MeshBuilder } from './geometry.js';
import { lerp, mulberry32, smoothstep } from './math.js';
import { buildSurroundings } from './surroundings.js';
import {
  DECK,
  DECK_PAVED_X,
  DECK_PROMENADE_Z,
  DRIVE_PATH,
  PATHS,
  SITE,
  isPavedOrBuilt,
  lakeInside,
  smoothPath,
  stairHeight,
  terrainHeight,
} from './site.js';

export const COLORS = {
  stone: [0.8, 0.72, 0.58],
  stoneDark: [0.64, 0.55, 0.42],
  stoneLight: [0.87, 0.81, 0.69],
  paving: [0.75, 0.7, 0.61],
  pavingAlt: [0.71, 0.66, 0.57],
  pavingBand: [0.6, 0.5, 0.4],
  grass: [0.32, 0.5, 0.21],
  grassDry: [0.45, 0.55, 0.26],
  lakeBed: [0.28, 0.3, 0.2],
  water: [0.17, 0.35, 0.42],
  waterFall: [0.8, 0.9, 0.95],
  bronze: [0.27, 0.38, 0.33],
  asphalt: [0.24, 0.24, 0.26],
  gravel: [0.63, 0.59, 0.5],
  tileA: [0.95, 0.68, 0.36],
  tileB: [0.72, 0.36, 0.24],
  tileC: [0.98, 0.92, 0.74],
  tileD: [0.36, 0.5, 0.66],
  bark: [0.3, 0.23, 0.17],
  bench: [0.36, 0.28, 0.2],
  iron: [0.12, 0.13, 0.12],
  lampGlass: [0.95, 0.92, 0.75],
  boat: [0.52, 0.34, 0.2],
};

const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------------------------------------------------------------- terrain

export const TERRAIN_STEP = 4;

export function buildTerrain() {
  const m = new MeshBuilder('terrain');
  const { xMin, xMax, zMin, zMax } = SITE.bounds;
  const step = TERRAIN_STEP;
  const nx = Math.round((xMax - xMin) / step);
  const nz = Math.round((zMax - zMin) / step);
  const H = [];
  const C = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = xMin + i * step, z = zMin + j * step;
      const h = terrainHeight(x, z);
      H.push(h);
      C.push(terrainColor(x, z, h));
    }
  }
  const idx = (i, j) => j * (nx + 1) + i;
  const normalAt = (i, j) => {
    const hl = H[idx(Math.max(0, i - 1), j)], hr = H[idx(Math.min(nx, i + 1), j)];
    const hd = H[idx(i, Math.max(0, j - 1))], hu = H[idx(i, Math.min(nz, j + 1))];
    const n = [hl - hr, 2 * step, hd - hu];
    const len = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / len, n[1] / len, n[2] / len];
  };
  const N = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) N.push(normalAt(i, j));
  const inside = (x, z, r) => x > r.xMin && x < r.xMax && z > r.zMin && z < r.zMax;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = xMin + (i + 0.5) * step, cz = zMin + (j + 0.5) * step;
      // The plaza and the upper deck are modeled as explicit paved slabs.
      if (inside(cx, cz, SITE.plaza) || inside(cx, cz, DECK)) continue;
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      const P = (k, ii, jj) => [xMin + ii * step, H[k], zMin + jj * step];
      const pa = P(a, i, j), pb = P(b, i + 1, j), pc = P(c, i, j + 1), pd = P(d, i + 1, j + 1);
      m.triSmooth(pa, pc, pb, N[a], N[c], N[b], C[a], C[c], C[b]);
      m.triSmooth(pb, pc, pd, N[b], N[c], N[d], C[b], C[c], C[d]);
    }
  }
  return m;
}

function terrainColor(x, z, h) {
  const n = 0.5 + 0.5 * Math.sin(x * 0.09 + Math.cos(z * 0.07) * 2) * Math.cos(z * 0.05 - x * 0.02);
  let c = [
    lerp(COLORS.grass[0], COLORS.grassDry[0], n * 0.6),
    lerp(COLORS.grass[1], COLORS.grassDry[1], n * 0.6),
    lerp(COLORS.grass[2], COLORS.grassDry[2], n * 0.6),
  ];
  const wet = smoothstep(SITE.lake.waterY + 0.6, SITE.lake.waterY - 0.2, h);
  c = c.map((v, k) => lerp(v, COLORS.lakeBed[k], wet));
  return c;
}

export function buildWater() {
  const m = new MeshBuilder('lake', 'water');
  const y = SITE.lake.waterY;
  // One sheet over the Lake's extent; terrain above water level hides it
  // outside the basin.
  const [x0, x1, z0, z1] = [-218, 194, -216, -26];
  m.face([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], COLORS.water);
  return m;
}

// ---------------------------------------------------------------- plaza

export function pavingColor(x, z) {
  const r = Math.hypot(x, z);
  const { poolRadius, rimWidth } = SITE.fountain;
  const ringIn = poolRadius + rimWidth;
  if (r > ringIn && r < ringIn + 0.8) return COLORS.pavingBand;
  if (r >= ringIn + 0.8 && r < ringIn + 6) {
    // Radial paving fan around the basin.
    const a = Math.atan2(z, x);
    return Math.floor((a / (Math.PI * 2)) * 48 + 48) % 2 ? COLORS.paving : COLORS.pavingAlt;
  }
  if (r >= ringIn + 6 && r < ringIn + 6.8) return COLORS.pavingBand;
  const { xMin, xMax, zMin, zMax } = SITE.plaza;
  const edge = Math.min(x - xMin, xMax - x, z - zMin, zMax - z);
  if (edge < 1.5) return COLORS.pavingBand;
  // Axis from the arcade to the fountain.
  if (Math.abs(x) < 4.5 && z > 0) return Math.floor(z / 1.5) % 2 ? COLORS.stoneLight : COLORS.paving;
  const checker = (Math.floor(x / 3) + Math.floor(z / 3)) & 1;
  return checker ? COLORS.paving : COLORS.pavingAlt;
}

export function buildPlaza() {
  const m = new MeshBuilder('plaza');
  const { xMin, xMax, zMin, zMax } = SITE.plaza;
  const step = 1;
  for (let x = xMin; x < xMax; x += step) {
    for (let z = zMin; z < zMax; z += step) {
      const c = pavingColor(x + step / 2, z + step / 2);
      m.face([[x, 0, z], [x + step, 0, z], [x + step, 0, z + step], [x, 0, z + step]], [0, 1, 0], c);
    }
  }
  // Lakeside edge: coping wall down to the lake bed, with a central boat landing.
  const bed = SITE.lake.bedY;
  const stone = { top: COLORS.stoneLight, side: COLORS.stoneDark };
  m.box([xMin, bed, zMin - 0.7], [-10, 0.55, zMin], stone);
  m.box([10, bed, zMin - 0.7], [xMax, 0.55, zMin], stone);
  for (let k = 0; k < 4; k++) {
    // Landing steps down toward the water.
    const y = -0.25 * (k + 1);
    m.box([-10, bed, zMin - 0.7 - k * 0.6], [10, y + 0.25, zMin - 0.1 - k * 0.6], stone);
  }
  // Low curbs on the east and west edges.
  m.box([xMin - 0.6, -0.5, zMin - 0.7], [xMin, 0.3, zMax], stone);
  m.box([xMax, -0.5, zMin - 0.7], [xMax + 0.6, 0.3, zMax], stone);
  // Benches facing the fountain.
  for (const sx of [-1, 1]) {
    for (const z of [-18, -6, 6]) {
      bench(m, [sx * 40, 0, z], sx * (Math.PI / 2));
    }
  }
  return m;
}

// Park bench; yaw = +PI/2 puts the backrest on the +x side.
function bench(m, pos, yaw) {
  const [x, y, z] = pos;
  m.orientedBox([x, y + 0.42, z], [1.8, 0.08, 0.5], yaw, COLORS.bench);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  m.orientedBox([x + sn * 0.22, y + 0.5, z + cs * 0.22], [1.8, 0.4, 0.06], yaw, COLORS.bench);
  for (const s of [-0.8, 0.8]) m.orientedBox([x + cs * s, y, z - sn * s], [0.06, 0.42, 0.45], yaw, COLORS.iron);
}

// ---------------------------------------------------------------- fountain

export function buildFountain() {
  const m = new MeshBuilder('fountain');
  const f = SITE.fountain;
  const stone = { top: COLORS.stoneLight, side: COLORS.stone };
  const segs = 48;
  m.ring([0, 0, 0], f.poolRadius, f.poolRadius + f.rimWidth, -0.3, f.rimHeight, segs, stone);
  // Central pedestal and lower basin.
  m.frustum([0, f.waterY - 0.1, 0], 3.0, 2.3, 1.5, 16, COLORS.stone);
  m.frustum([0, 1.75, 0], 1.3, 4.6, 1.0, 24, { top: COLORS.water, side: COLORS.stoneDark });
  m.ring([0, 0, 0], 4.4, 4.7, 2.5, 2.85, 24, stone);
  // Column with four cherubs (Temperance, Purity, Health, Peace).
  m.frustum([0, 2.75, 0], 0.95, 0.8, 1.7, 12, COLORS.stoneDark);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a) * 1.05, cz = Math.sin(a) * 1.05;
    m.frustum([cx, 2.85, cz], 0.32, 0.18, 0.75, 8, COLORS.bronze);
    m.blob([cx, 3.75, cz], 0.2, COLORS.bronze, { subdivisions: 1 });
  }
  // Upper basin.
  m.frustum([0, 4.4, 0], 0.6, 2.25, 0.7, 20, { top: COLORS.water, side: COLORS.stoneDark });
  m.ring([0, 0, 0], 2.1, 2.3, 4.95, 5.15, 20, stone);
  // Plinth and the Angel of the Waters.
  m.frustum([0, 5.1, 0], 0.6, 0.5, 0.75, 10, COLORS.stoneDark);
  buildAngel(m, [0, 5.85, 0]);
  return m;
}

function buildAngel(m, base) {
  const [x, y, z] = base;
  const b = COLORS.bronze;
  m.frustum([x, y, z], 0.48, 0.24, 1.35, 10, b); // robe
  m.frustum([x, y + 1.35, z], 0.24, 0.17, 0.25, 8, b); // shoulders
  m.blob([x, y + 1.75, z], 0.16, b, { subdivisions: 1 }); // head
  // Wings: two upswept slabs.
  for (const s of [-1, 1]) {
    const root = [x + s * 0.15, y + 1.4, z + 0.12];
    const tip = [x + s * 1.25, y + 2.05, z + 0.45];
    const low = [x + s * 0.95, y + 0.55, z + 0.35];
    m.tri(root, tip, low, b);
    m.tri(root, low, tip, b);
  }
  // Raised right arm (blessing the water) and left arm holding a lily.
  m.orientedBox([x + 0.25, y + 1.3, z - 0.05], [0.1, 0.75, 0.1], 0, b);
  m.orientedBox([x - 0.3, y + 0.9, z - 0.15], [0.1, 0.5, 0.1], 0, b);
  m.blob([x - 0.3, y + 1.45, z - 0.15], [0.09, 0.12, 0.09], COLORS.bronze, { subdivisions: 0 });
}

export function buildFountainWater() {
  const m = new MeshBuilder('fountain-water', 'water');
  const f = SITE.fountain;
  m.disc([0, f.waterY, 0], f.poolRadius, 48, COLORS.water);
  // Thin sheets of water spilling over both basin lips, flaring as they fall.
  m.frustum([0, f.waterY, 0], 5.7, 4.75, 2.42, 40, COLORS.waterFall, { top: false });
  m.frustum([0, 2.82, 0], 2.9, 2.33, 2.25, 28, COLORS.waterFall, { top: false });
  // Splash rings where the water lands.
  m.ring([0, 0, 0], 5.4, 6.3, f.waterY - 0.05, f.waterY + 0.04, 40, COLORS.waterFall);
  return m;
}

// ---------------------------------------------------------------- terrace

export function buildTerrace() {
  const m = new MeshBuilder('terrace');
  const { upperY, arcade, centralStairs, grandStairs } = SITE;
  const wallStone = { top: COLORS.paving, side: COLORS.stone };
  const lawn = { top: COLORS.grass, side: COLORS.stone };
  const z0 = DECK.zMin, z1 = DECK.zMax;
  // Deck slabs (solid down to plaza level) around the arcade and stairwell.
  // Their tops are lawn; paved promenades are laid over them below.
  m.box([DECK.xMin, -0.5, z0], [arcade.xMin, upperY, z1], lawn);
  m.box([arcade.xMax, -0.5, z0], [DECK.xMax, upperY, z1], lawn);
  const pave = (xa, xb, za, zb) => m.box([xa, upperY, za], [xb, upperY + 0.03, zb], COLORS.paving);
  pave(DECK.xMin, arcade.xMin, z0, DECK_PROMENADE_Z);
  pave(arcade.xMax, DECK.xMax, z0, DECK_PROMENADE_Z);
  pave(-DECK_PAVED_X, arcade.xMin, DECK_PROMENADE_Z, z1);
  pave(arcade.xMax, DECK_PAVED_X, DECK_PROMENADE_Z, z1);
  // Slab over the arcade (its underside is the arcade ceiling).
  m.box([arcade.xMin, arcade.ceilingY, z0], [arcade.xMax, upperY, arcade.zMax], wallStone);
  // Stairwell cheeks and the deck beyond the stairwell.
  m.box([arcade.xMin, -0.5, centralStairs.zBottom], [centralStairs.xMin, upperY, centralStairs.zTop], wallStone);
  m.box([centralStairs.xMax, -0.5, centralStairs.zBottom], [arcade.xMax, upperY, centralStairs.zTop], wallStone);
  m.box([arcade.xMin, -0.5, centralStairs.zTop], [arcade.xMax, upperY, z1], wallStone);
  // Arcade floor.
  m.box([arcade.xMin, -0.2, arcade.zMin], [arcade.xMax, 0.01, arcade.zMax], COLORS.paving);

  // Arched facades on both sides of the arcade.
  arcadeFacade(m, arcade.zMin - 0.4, arcade.zMin + 0.6);
  arcadeFacade(m, arcade.zMax - 0.6, arcade.zMax + 0.4);

  // Wall cornice along the terrace face.
  m.box([DECK.xMin, upperY - 0.35, z0 - 0.35], [DECK.xMax, upperY - 0.05, z0], COLORS.stoneLight);

  // Grand staircases and the central staircase.
  for (const st of grandStairs) stairs(m, st.xMin, st.xMax, st.zBottom, st.zTop, true);
  stairs(m, centralStairs.xMin, centralStairs.xMax, centralStairs.zBottom, centralStairs.zTop, false);

  // Balustrades along the terrace edge, leaving openings at stair heads.
  const openings = grandStairs.map((s) => [s.xMin, s.xMax]);
  let start = DECK.xMin;
  for (const [a, b] of [...openings, [DECK.xMax, DECK.xMax]]) {
    balustrade(m, [start, upperY, z0 + 0.3], [a, upperY, z0 + 0.3]);
    start = b;
  }
  // Around the central stairwell (sides and the arcade end).
  balustrade(m, [centralStairs.xMin - 0.3, upperY, centralStairs.zBottom], [centralStairs.xMin - 0.3, upperY, centralStairs.zTop]);
  balustrade(m, [centralStairs.xMax + 0.3, upperY, centralStairs.zBottom], [centralStairs.xMax + 0.3, upperY, centralStairs.zTop]);
  balustrade(m, [centralStairs.xMin, upperY, centralStairs.zBottom + 0.3], [centralStairs.xMax, upperY, centralStairs.zBottom + 0.3]);
  // Newel posts with lamps at the stair heads.
  for (const st of grandStairs) {
    for (const x of [st.xMin - 0.4, st.xMax + 0.4]) {
      m.box([x - 0.45, upperY, z0 - 0.2], [x + 0.45, upperY + 1.3, z0 + 0.7], COLORS.stoneLight);
      lamp(m, [x, upperY + 1.3, z0 + 0.25], 2.2);
    }
  }
  return m;
}

// Arcade ceiling: patterned encaustic tiles (the Minton tile ceiling), shown
// lamp-lit since no daylight reaches it.
export function buildArcadeCeiling() {
  const m = new MeshBuilder('arcade-ceiling', 'lamplit');
  const { arcade } = SITE;
  for (let x = arcade.xMin; x < arcade.xMax; x += 1) {
    for (let z = arcade.zMin; z < arcade.zMax; z += 1) {
      const i = Math.round(x - arcade.xMin), j = Math.round(z - arcade.zMin);
      const c = (i + j) % 4 === 0 ? COLORS.tileD : (i + j) % 3 === 0 ? COLORS.tileB : (i * j) % 2 ? COLORS.tileA : COLORS.tileC;
      const y = arcade.ceilingY - 0.01;
      m.face([[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [0, -1, 0], c);
    }
  }
  // Hanging lamps.
  for (const z of [38, 43, 48]) {
    for (const x of [-4, 4]) {
      m.frustum([x, arcade.ceilingY - 0.8, z], 0.02, 0.02, 0.8, 4, COLORS.iron, { top: false });
      m.blob([x, arcade.ceilingY - 0.95, z], 0.22, COLORS.lampGlass, { subdivisions: 0 });
    }
  }
  return m;
}

function arcadeFacade(m, zA, zB) {
  const { arcade } = SITE;
  const stone = COLORS.stone;
  const piers = [arcade.xMin, -3.2, 3.2, arcade.xMax];
  const pierW = 1.1;
  for (let k = 1; k < piers.length - 1; k++) {
    m.box([piers[k] - pierW / 2, 0, zA], [piers[k] + pierW / 2, arcade.ceilingY, zB], stone);
  }
  // Fill above each opening with a segmental arch.
  for (let k = 0; k < piers.length - 1; k++) {
    const a = piers[k] + (k === 0 ? 0 : pierW / 2);
    const b = piers[k + 1] - (k === piers.length - 2 ? 0 : pierW / 2);
    const half = (b - a) / 2, mid = (a + b) / 2;
    const segs = 12;
    for (let s = 0; s < segs; s++) {
      const x0 = a + ((b - a) * s) / segs, x1 = a + ((b - a) * (s + 1)) / segs;
      const u = ((x0 + x1) / 2 - mid) / half;
      const yArch = 2.9 + 1.35 * Math.sqrt(Math.max(0, 1 - u * u));
      m.box([x0, yArch, zA], [x1, arcade.ceilingY + 0.02, zB], { top: stone, side: COLORS.stoneDark, bottom: COLORS.stoneDark }, { bottom: true });
    }
  }
  // Lintel band across the arcade front up to deck level.
  m.box([arcade.xMin, arcade.ceilingY, zA], [arcade.xMax, SITE.upperY, zB], COLORS.stoneLight);
}

// Flight of steps descending park-north from zTop to zBottom.
function stairs(m, xMin, xMax, zBottom, zTop, cheeks) {
  const { upperY } = SITE;
  const n = Math.round(upperY / 0.16);
  const run = (zTop - zBottom) / n;
  for (let k = 0; k < n; k++) {
    const za = zBottom + k * run;
    const h = stairHeight({ zTop, zBottom }, za + run / 2);
    const c = k % 2 ? COLORS.stoneLight : COLORS.paving;
    m.box([xMin, -0.2, za], [xMax, h, za + run], { top: c, side: COLORS.stoneDark });
    if (cheeks) {
      m.box([xMin - 0.8, -0.2, za], [xMin, h + 0.95, za + run], COLORS.stone);
      m.box([xMax, -0.2, za], [xMax + 0.8, h + 0.95, za + run], COLORS.stone);
    }
  }
  if (cheeks) {
    // Landing pedestals at the foot of each cheek wall.
    for (const x of [xMin - 0.4, xMax + 0.4]) {
      m.box([x - 0.55, 0, zBottom - 1.1], [x + 0.55, 1.4, zBottom], COLORS.stoneLight);
      lamp(m, [x, 1.4, zBottom - 0.55], 2.0);
    }
  }
}

// Balustrade from a to b (same y): base, balusters and handrail.
function balustrade(m, a, b, height = 1.0) {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  if (len < 0.5) return;
  const yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) - Math.PI / 2;
  const mid = [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2];
  m.orientedBox(mid, [len, 0.18, 0.5], yaw, COLORS.stoneLight);
  m.orientedBox([mid[0], a[1] + height - 0.14, mid[2]], [len, 0.14, 0.45], yaw, COLORS.stoneLight);
  const count = Math.floor(len / 0.45);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const p = [lerp(a[0], b[0], t), a[1] + 0.18, lerp(a[2], b[2], t)];
    m.orientedBox(p, [0.16, height - 0.32, 0.16], yaw, COLORS.stone);
  }
}

function lamp(m, base, height) {
  m.frustum(base, 0.09, 0.06, height, 6, COLORS.iron);
  m.blob([base[0], base[1] + height + 0.18, base[2]], 0.2, COLORS.lampGlass, { subdivisions: 0 });
}

// ---------------------------------------------------------------- paths

function drape(points, lift) {
  return smoothPath(points, 2.5).map(([x, z]) => [x, terrainHeight(x, z) + lift, z]);
}

export function buildPaths() {
  const m = new MeshBuilder('paths');
  m.ribbon(drape(DRIVE_PATH.points, 0.06), DRIVE_PATH.width, COLORS.asphalt);
  // Curb-side light stripes along the drive.
  for (const off of [-1, 1]) {
    const pts = smoothPath(DRIVE_PATH.points, 2.5);
    const shifted = pts.map((p, i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      const dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1;
      const x = p[0] - (dz / l) * off * (DRIVE_PATH.width / 2 + 0.6);
      const z = p[1] + (dx / l) * off * (DRIVE_PATH.width / 2 + 0.6);
      return [x, terrainHeight(x, z) + 0.08, z];
    });
    m.ribbon(shifted, 1.2, COLORS.gravel);
  }
  for (const p of PATHS) {
    m.ribbon(drape(p.points, 0.12), p.width, COLORS.gravel);
  }
  return m;
}

export function buildMall() {
  const m = new MeshBuilder('mall');
  const { mall } = SITE;
  const pts = [];
  for (let z = mall.zStart; z <= mall.zEnd; z += 5) pts.push([0, terrainHeight(0, z) + 0.05, z]);
  m.ribbon(pts, mall.xHalf * 2, (i) => (i % 2 ? COLORS.gravel : shade(COLORS.gravel, 0.96)));
  // Benches and lamps lining the promenade.
  for (let z = mall.zStart + 14; z < mall.zEnd; z += 12) {
    const y = terrainHeight(mall.xHalf + 1, z);
    bench(m, [-(mall.xHalf + 1), y, z], -Math.PI / 2);
    bench(m, [mall.xHalf + 1, y, z], Math.PI / 2);
  }
  for (let z = mall.zStart + 8; z < mall.zEnd; z += 18) {
    for (const s of [-1, 1]) lamp(m, [s * (mall.xHalf + 0.4), terrainHeight(s * 6, z), z], 3.6);
  }
  return m;
}

// ---------------------------------------------------------------- trees

function deciduousTree(m, x, z, rand, scale = 1, palette = 0) {
  const y = terrainHeight(x, z);
  const h = (4 + rand() * 3) * scale;
  m.frustum([x, y - 0.2, z], 0.28 * scale, 0.18 * scale, h + 0.2, 6, COLORS.bark, { top: false });
  const greens = [
    [[0.19, 0.36, 0.14], [0.27, 0.46, 0.18], [0.36, 0.55, 0.22]],
    [[0.24, 0.4, 0.12], [0.34, 0.5, 0.16], [0.45, 0.6, 0.22]],
    [[0.17, 0.33, 0.18], [0.24, 0.42, 0.22], [0.31, 0.5, 0.27]],
    [[0.55, 0.42, 0.16], [0.68, 0.52, 0.2], [0.78, 0.62, 0.28]],
  ][palette];
  const r = (2.6 + rand() * 1.6) * scale;
  m.blob([x, y + h + r * 0.55, z], [r, r * 0.85, r], greens, { subdivisions: 1, rand });
}

function conifer(m, x, z, rand) {
  const y = terrainHeight(x, z);
  const h = 8 + rand() * 5;
  m.frustum([x, y - 0.2, z], 0.25, 0.2, 1.8, 6, COLORS.bark, { top: false });
  const g = [0.13, 0.28, 0.17];
  m.frustum([x, y + 1.4, z], 2.8, 0, h * 0.6, 8, g, { bottom: true });
  m.frustum([x, y + 1.4 + h * 0.35, z], 2.1, 0, h * 0.6, 8, shade(g, 1.15), { bottom: true });
}

function elm(m, x, z, rand) {
  // American elm: tall trunk splitting into a broad vase-shaped crown.
  const y = terrainHeight(x, z);
  const h = 5.5 + rand() * 1.5;
  m.frustum([x, y - 0.2, z], 0.42, 0.3, h + 0.2, 7, COLORS.bark, { top: false });
  const greens = [[0.18, 0.34, 0.14], [0.25, 0.43, 0.17], [0.33, 0.52, 0.2]];
  m.frustum([x, y + h - 0.5, z], 0.26, 0.12, 3.2, 5, COLORS.bark, { top: false });
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    m.blob([x + dx * 2.6, y + h + 4.2, z + dz * 2.6], [3.4, 2.4, 3.4], greens, { subdivisions: 1, rand });
  }
  m.blob([x, y + h + 5.6, z], [4.2, 2.2, 4.2], greens, { subdivisions: 1, rand });
}

export function placeTrees(seed = 72) {
  const rand = mulberry32(seed);
  const trees = [];
  const { xMin, xMax, zMin, zMax } = SITE.bounds;
  const { mall } = SITE;
  // Elm allée along the Mall.
  for (const x of mall.elmRowsX) {
    for (let z = mall.zStart + 10; z <= mall.zEnd - 4; z += mall.elmSpacing) trees.push({ type: 'elm', x, z });
  }
  // Naturalistic groves elsewhere, with clearings for lawns.
  const minGap = 6.5;
  const grid = new Map();
  const key = (x, z) => `${Math.floor(x / minGap)},${Math.floor(z / minGap)}`;
  const tooClose = (x, z) => {
    const gx = Math.floor(x / minGap), gz = Math.floor(z / minGap);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const t of grid.get(`${gx + i},${gz + j}`) || []) if (Math.hypot(t.x - x, t.z - z) < minGap) return true;
    }
    return false;
  };
  for (const t of trees) {
    const k = key(t.x, t.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  for (let attempt = 0; attempt < 9000; attempt++) {
    const x = xMin + 6 + rand() * (xMax - xMin - 12);
    const z = zMin + 6 + rand() * (zMax - zMin - 12);
    const grove = 0.5 + 0.5 * Math.sin(x * 0.028 + 0.7) * Math.cos(z * 0.031 - 1.1);
    if (rand() > grove * 0.9) continue;
    if (isPavedOrBuilt(x, z, 2.5)) continue;
    if (Math.abs(x) < 26 && z > 60) continue; // keep the Mall allée tidy
    if (terrainHeight(x, z) < SITE.lake.waterY + 0.5) continue;
    if (lakeInside(x, z) > -3) continue;
    if (tooClose(x, z)) continue;
    const roll = rand();
    const type = roll < 0.12 ? 'conifer' : 'deciduous';
    const t = { type, x, z, palette: roll > 0.94 ? 3 : Math.floor(rand() * 3) };
    trees.push(t);
    const k = key(x, z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(t);
  }
  return trees;
}

export function buildTrees(trees) {
  const m = new MeshBuilder('trees');
  const rand = mulberry32(1858);
  for (const t of trees) {
    if (t.type === 'elm') elm(m, t.x, t.z, rand);
    else if (t.type === 'conifer') conifer(m, t.x, t.z, rand);
    else deciduousTree(m, t.x, t.z, rand, 0.9 + rand() * 0.35, t.palette);
  }
  return m;
}

// ---------------------------------------------------------------- lake life

export function buildBoats() {
  const m = new MeshBuilder('boats');
  const rand = mulberry32(7);
  const spots = [[-30, -62], [12, -78], [48, -58], [-70, -90], [80, -95], [-10, -120]];
  for (const [x, z] of spots) {
    const yaw = rand() * Math.PI;
    const y = SITE.lake.waterY - 0.1;
    m.orientedBox([x, y, z], [1.4, 0.45, 3.6], yaw, { top: COLORS.bench, side: COLORS.boat });
    m.orientedBox([x, y + 0.45, z], [1.3, 0.06, 0.35], yaw, COLORS.stoneLight);
  }
  return m;
}

// ---------------------------------------------------------------- scene

// Camera presets. yaw 0 looks park-north (-z), yaw PI looks park-south.
// Orbit presets give a target; walk presets give a standing position.
export const VIEWPOINTS = {
  overview: { label: 'Overview', mode: 'orbit', target: [0, 2, 10], yaw: -0.55, pitch: 0.48, distance: 150 },
  terrace: { label: 'Terrace overlook', mode: 'walk', position: [0, 36.5], yaw: 0, pitch: -0.14 },
  fountain: { label: 'Fountain', mode: 'walk', position: [7, 26], yaw: -0.2, pitch: 0.14 },
  arcade: { label: 'Arcade', mode: 'walk', position: [0, 50], level: 0, yaw: 0, pitch: 0.04 },
  mall: { label: 'The Mall', mode: 'walk', position: [0, 160], yaw: 0, pitch: 0.02 },
  lake: { label: 'From the Lake', mode: 'orbit', target: [0, 3, 12], yaw: Math.PI + 0.2, pitch: 0.12, distance: 95 },
};

export function buildScene() {
  const trees = placeTrees();
  const components = [
    buildTerrain(),
    buildWater(),
    buildPlaza(),
    buildFountain(),
    buildFountainWater(),
    buildTerrace(),
    buildArcadeCeiling(),
    buildPaths(),
    buildMall(),
    buildTrees(trees),
    buildBoats(),
    buildSurroundings(),
  ].map((b) => b.build());
  const triangles = components.reduce((s, c) => s + c.vertexCount / 3, 0);
  return {
    components,
    trees,
    stats: {
      components: components.map((c) => ({ name: c.name, material: c.material, triangles: c.vertexCount / 3 })),
      triangles,
      trees: trees.length,
      elms: trees.filter((t) => t.type === 'elm').length,
    },
  };
}
