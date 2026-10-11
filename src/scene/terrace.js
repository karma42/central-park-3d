// Bethesda Terrace: upper terrace and Terrace Drive deck, the arcade under the
// drive, the two grand staircases, the central Mall staircase, the lower plaza
// and the balustrades. Procedural and approximate; see docs/terrace.md for the
// dimensions used and their uncertainty.
//
// Frame: meters, Y up. Origin = Bethesda Fountain center at lower plaza level.
// -Z points north (toward the Lake), +Z south (toward the Mall), +X east.

import { MeshBuilder, translate } from './terrace-geom.js';
import { FOUNTAIN_LAYOUT } from './fountain.js';

const FACADE_Z = 36; // north face of the arcade / drive retaining wall
const HALF_W = 50; // half width of plaza and deck
const DECK_D = 14; // depth of the drive deck over the arcade

export const TERRACE_LAYOUT = Object.freeze({
  plaza: { x: [-HALF_W, HALF_W], z: [-42, FACADE_Z], y: 0 },
  lakeEdgeZ: -42,
  lakeLandingSteps: { x: [-6, 6], z: [-45, -42], bottomY: -0.9 },
  lakeWaterY: -0.8,
  facadeZ: FACADE_Z,
  upperLevelY: 5.5,
  deck: { x: [-HALF_W, HALF_W], z: [FACADE_Z, FACADE_Z + DECK_D] },
  terraceDrive: { x: [-HALF_W, HALF_W], z: [FACADE_Z + 3, FACADE_Z + 11] },
  arcade: { x: [-13, 13], z: [FACADE_Z, FACADE_Z + DECK_D], ceilingY: 4.7 },
  grandStairs: [
    { x: [-28, -16], z: [FACADE_Z - 12, FACADE_Z] },
    { x: [16, 28], z: [FACADE_Z - 12, FACADE_Z] },
  ],
  mallStair: { x: [-6, 6], z: [FACADE_Z + DECK_D, FACADE_Z + DECK_D + 14] },
  upperTerrace: { x: [-HALF_W, HALF_W], z: [FACADE_Z + DECK_D, FACADE_Z + DECK_D + 14] },
  // The Mall continues south from here at upperLevelY, centered on x = 0.
  mallEntry: { x: [-6, 6], z: FACADE_Z + DECK_D + 14, y: 5.5 },
});

export const TERRACE_COLORS = Object.freeze({
  stone: [0.8, 0.7, 0.55],
  balustrade: [0.84, 0.76, 0.62],
  paving: [0.66, 0.58, 0.5],
  pavingAccent: [0.58, 0.42, 0.35],
  drive: [0.32, 0.32, 0.34],
  tileCeiling: [0.78, 0.5, 0.28],
});

const within = (v, [a, b]) => v >= a && v <= b;

/**
 * Walkable surface height of the terrace at plan point (x, z), or null outside
 * the terrace footprint (landscape terrain applies there). Stairs are ramps.
 * The arcade floor (y = 0) wins over the drive deck above it, so walkers can
 * pass from the plaza through the arcade to the Mall stair. The fountain pool
 * reports its rim height, a step too high to climb, so walkers go around it.
 */
export function terraceHeightAt(x, z) {
  const L = TERRACE_LAYOUT;
  const Y = L.upperLevelY;
  const ramp = (zLow, zHigh, yLow, yHigh) => yLow + ((z - zLow) / (zHigh - zLow)) * (yHigh - yLow);
  const ls = L.lakeLandingSteps;
  if (within(x, ls.x) && within(z, ls.z) && z < L.lakeEdgeZ) return ramp(ls.z[0], ls.z[1], ls.bottomY, 0);
  if (!within(x, L.plaza.x)) return null;
  if (within(z, [L.lakeEdgeZ, L.facadeZ])) {
    if (Math.hypot(x, z) <= FOUNTAIN_LAYOUT.poolOuterRadius) return FOUNTAIN_LAYOUT.poolRimY;
    for (const gs of L.grandStairs) {
      if (within(x, [gs.x[0] + 0.5, gs.x[1] - 0.5]) && z >= gs.z[0]) return ramp(gs.z[0], gs.z[1], 0, Y);
    }
    return 0;
  }
  const ms = L.mallStair;
  if (within(z, L.deck.z)) return within(x, [L.arcade.x[0] + 1, L.arcade.x[1] - 1]) ? 0 : Y;
  if (within(z, L.upperTerrace.z)) return within(x, ms.x) ? ramp(ms.z[0], ms.z[1], 0, Y) : Y;
  return null;
}

const PLINTH_H = 0.22;
const BALUSTER_H = 0.62;
const RAIL_H = 0.14;
const BALUSTER_SPACING = 0.36;
const PIER_SPACING = 4.5;

const BALUSTER_PROFILE = [
  [0, 0], [0.1, 0], [0.1, 0.07], [0.12, 0.27], [0.05, 0.5],
  [0.09, 0.54], [0.09, BALUSTER_H], [0, BALUSTER_H],
];

// Order four (x, y, z) corners counter-clockwise as seen from above.
function ccwFromAbove(c) {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p = c[i], q = c[(i + 1) % 4];
    area += p[0] * q[2] - q[0] * p[2];
  }
  return area > 0 ? [c[0], c[3], c[2], c[1]] : c;
}

/**
 * A straight beam between two plan points whose bottom and top heights may
 * differ at each end (used for sloped walls, plinths and rails).
 */
export function beam(b, from, to, halfWidth, bottom0, top0, bottom1 = bottom0, top1 = top0) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const px = (-dz / len) * halfWidth, pz = (dx / len) * halfWidth;
  const plan = [
    [from[0] + px, from[1] + pz, 0], [to[0] + px, to[1] + pz, 1],
    [to[0] - px, to[1] - pz, 1], [from[0] - px, from[1] - pz, 0],
  ];
  const lower = ccwFromAbove(plan.map(([x, z, e]) => [x, e ? bottom1 : bottom0, z]));
  const upper = lower.map(([x, , z]) => {
    const atEnd = Math.abs(x - to[0]) + Math.abs(z - to[1]) < Math.abs(x - from[0]) + Math.abs(z - from[1]);
    return [x, atEnd ? top1 : top0, z];
  });
  return b.hexa([...lower, ...upper]);
}

/**
 * Balustrade from plan point `from` (base height y0) to `to` (base height y1):
 * plinth, turned balusters, handrail, intermediate piers and end newel posts.
 */
export function balustrade(stone, rail, from, to, y0, y1, { balusterSegments = 4 } = {}) {
  const dx = to[0] - from[0], dz = to[1] - from[1];
  const len = Math.hypot(dx, dz);
  const top = PLINTH_H + BALUSTER_H;
  beam(stone, from, to, 0.28, y0 - 0.05, y0 + PLINTH_H, y1 - 0.05, y1 + PLINTH_H);
  beam(stone, from, to, 0.3, y0 + top, y0 + top + RAIL_H, y1 + top, y1 + top + RAIL_H);

  const at = (t) => [from[0] + dx * t, y0 + (y1 - y0) * t, from[1] + dz * t];
  const pierCount = Math.max(1, Math.round(len / PIER_SPACING));
  const pierTs = [];
  for (let i = 0; i <= pierCount; i++) pierTs.push(i / pierCount);
  for (const t of pierTs) {
    const [x, y, z] = at(t);
    const isEnd = t === 0 || t === 1;
    const h = isEnd ? 0.36 : 0.26;
    stone.box(x - h, y - 0.05, z - h, x + h, y + top + RAIL_H + (isEnd ? 0.25 : 0.05), z + h);
  }

  const segLen = len / pierCount;
  const perSeg = Math.max(1, Math.floor((segLen - 0.6) / BALUSTER_SPACING));
  for (let s = 0; s < pierCount; s++) {
    for (let k = 0; k < perSeg; k++) {
      const t = (s * segLen + 0.3 + (k + 0.5) * ((segLen - 0.6) / perSeg)) / len;
      const [x, y, z] = at(t);
      rail.with(translate(x, y + PLINTH_H, z), (r) => r.lathe(BALUSTER_PROFILE, balusterSegments));
    }
  }
}

/**
 * Straight flight of steps rising along Z. Each step is a solid block from
 * baseY to its tread height. zLow/yLow is the bottom of the flight.
 */
export function stairs(b, x0, x1, zLow, zHigh, yLow, yHigh, count, baseY = yLow) {
  const dir = Math.sign(zHigh - zLow);
  const tread = Math.abs(zHigh - zLow) / count;
  const rise = (yHigh - yLow) / count;
  for (let i = 0; i < count; i++) {
    const za = zLow + dir * i * tread, zb = zLow + dir * (i + 1) * tread;
    const top = yLow + (i + 1) * rise;
    const bottom = Math.min(baseY, top - 0.05);
    b.box(x0, bottom, Math.min(za, zb), x1, top, Math.max(za, zb));
  }
}

// North facade of the arcade: piers plus semicircular arch spandrels.
function arcadeFacade(b, z0, z1, bays, springY, topY) {
  const segs = 10;
  for (const { cx, r } of bays) {
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI - (i / segs) * Math.PI, a1 = Math.PI - ((i + 1) / segs) * Math.PI;
      const p0 = [cx + r * Math.cos(a0), springY + r * Math.sin(a0)];
      const p1 = [cx + r * Math.cos(a1), springY + r * Math.sin(a1)];
      // Front (north, z0) and back (z1) spandrel faces between arch and topY.
      b.quad([p0[0], p0[1], z0], [p0[0], topY, z0], [p1[0], topY, z0], [p1[0], p1[1], z0]);
      b.quad([p1[0], p1[1], z1], [p1[0], topY, z1], [p0[0], topY, z1], [p0[0], p0[1], z1]);
      // Intrados (underside of the arch), facing the arch center.
      b.quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1]);
    }
  }
}

/**
 * Build the terrace. Returns plain meshes grouped by material.
 * options.balusterSegments: radial segments per baluster (4 = light, 8 = fine).
 */
export function buildTerrace({ balusterSegments = 4 } = {}) {
  const L = TERRACE_LAYOUT;
  const Y = L.upperLevelY;
  const stone = new MeshBuilder();
  const rail = new MeshBuilder();
  const paving = new MeshBuilder();
  const accent = new MeshBuilder();
  const drive = new MeshBuilder();
  const tiles = new MeshBuilder();
  const bal = (from, to, y0, y1 = y0) => balustrade(stone, rail, from, to, y0, y1, { balusterSegments });

  // Lower plaza slab and its paving accents.
  paving.box(L.plaza.x[0], -1.5, L.plaza.z[0], L.plaza.x[1], 0, L.plaza.z[1]);
  accent.lathe([[17.5, 0.02], [15.2, 0.02]], 48); // paving ring around the fountain basin
  accent.box(-2.5, 0, 17.5, 2.5, 0.02, L.facadeZ); // axis band fountain -> arcade
  accent.box(-2.5, 0, L.plaza.z[0], 2.5, 0.02, -17.5); // axis band fountain -> Lake

  // Lake edge: landing steps down toward the water and its balustrades.
  const ls = L.lakeLandingSteps;
  stairs(paving, ls.x[0], ls.x[1], ls.z[0], ls.z[1], ls.bottomY, 0, 5, -1.5);
  bal([L.plaza.x[0], L.lakeEdgeZ + 0.3], [ls.x[0] - 0.4, L.lakeEdgeZ + 0.3], 0);
  bal([ls.x[1] + 0.4, L.lakeEdgeZ + 0.3], [L.plaza.x[1], L.lakeEdgeZ + 0.3], 0);

  // Solid masonry under the drive, outside the arcade.
  const ax = L.arcade.x, dz = L.deck.z;
  stone.box(L.deck.x[0], 0, dz[0], ax[0], 4.8, dz[1]);
  stone.box(ax[1], 0, dz[0], L.deck.x[1], 4.8, dz[1]);
  // Deck slab carrying Terrace Drive, with a cornice on the north face.
  paving.box(L.deck.x[0], 4.8, dz[0], L.deck.x[1], Y, dz[1]);
  drive.box(L.terraceDrive.x[0], Y, L.terraceDrive.z[0], L.terraceDrive.x[1], Y + 0.02, L.terraceDrive.z[1]);
  for (const [x0, x1] of [[L.deck.x[0], -28.4], [-15.6, 15.6], [28.4, L.deck.x[1]]]) {
    stone.box(x0, 4.55, dz[0] - 0.25, x1, 4.8, dz[0]);
  }

  // Arcade: three-bay arched north facade, back wall with the stair opening,
  // two interior columns and the encaustic (Minton) tile ceiling.
  const springY = 1.8, facadeTop = 4.8;
  const bays = [-8.5, 0, 8.5].map((cx) => ({ cx, r: 2.75 }));
  const fz0 = dz[0], fz1 = dz[0] + 1;
  arcadeFacade(stone, fz0, fz1, bays, springY, facadeTop);
  const pierEdges = [ax[0], -11.25, -5.75, -2.75, 2.75, 5.75, 11.25, ax[1]];
  for (let i = 0; i < pierEdges.length; i += 2) {
    stone.box(pierEdges[i], 0, fz0, pierEdges[i + 1], facadeTop, fz1);
    stone.box(pierEdges[i] - 0.1, 0, fz0 - 0.15, pierEdges[i + 1] + 0.1, 0.5, fz0); // pier bases
  }
  const ms = L.mallStair;
  stone.box(ax[0], 0, dz[1] - 1, ms.x[0], facadeTop, dz[1]);
  stone.box(ms.x[1], 0, dz[1] - 1, ax[1], facadeTop, dz[1]);
  stone.box(ms.x[0], 4.0, dz[1] - 1, ms.x[1], facadeTop, dz[1]);
  for (const x of [-4.5, 4.5]) {
    stone.with(translate(x, 0, (dz[0] + dz[1]) / 2), (c) => {
      c.cylinder(0.55, 0.55, 0, 0.4, 8);
      c.cylinder(0.32, 0.28, 0.4, 4.2, 12);
      c.box(-0.5, 4.2, -0.5, 0.5, L.arcade.ceilingY, 0.5);
    });
  }
  tiles.box(ax[0], L.arcade.ceilingY, fz1, ax[1], 4.8, dz[1] - 1);
  accent.box(ax[0], 0, fz0, ax[1], 0.02, dz[1]); // arcade floor

  // Grand staircases from the drive level down to the plaza, with side walls.
  for (const gs of L.grandStairs) {
    const [x0, x1] = gs.x;
    stairs(paving, x0 + 0.5, x1 - 0.5, gs.z[0], gs.z[1], 0, Y, 32);
    for (const wx of [x0 + 0.25, x1 - 0.25]) {
      beam(stone, [wx, gs.z[0]], [wx, gs.z[1]], 0.25, 0, 0.35, 0, Y + 0.05);
      bal([wx, gs.z[0] + 0.4], [wx, gs.z[1]], 0.3, Y);
    }
  }

  // Balustrade along the drive edge overlooking the plaza (gaps at stair heads).
  const edgeZ = dz[0] + 0.3;
  bal([L.deck.x[0], edgeZ], [-28.4, edgeZ], Y);
  bal([-15.6, edgeZ], [15.6, edgeZ], Y);
  bal([28.4, edgeZ], [L.deck.x[1], edgeZ], Y);

  // Upper terrace south of the drive with the central stair down into the arcade.
  const ut = L.upperTerrace;
  stone.box(ut.x[0], 0, ut.z[0], ms.x[0] - 0.5, Y - 0.1, ut.z[1]);
  stone.box(ms.x[1] + 0.5, 0, ut.z[0], ut.x[1], Y - 0.1, ut.z[1]);
  paving.box(ut.x[0], Y - 0.1, ut.z[0], ms.x[0] - 0.5, Y, ut.z[1]);
  paving.box(ms.x[1] + 0.5, Y - 0.1, ut.z[0], ut.x[1], Y, ut.z[1]);
  stairs(paving, ms.x[0], ms.x[1], ms.z[0], ms.z[1], 0, Y, 32);
  for (const wx of [ms.x[0] - 0.25, ms.x[1] + 0.25]) {
    stone.box(wx - 0.25, 0, ms.z[0], wx + 0.25, Y, ms.z[1]);
    bal([wx, ms.z[0] + 0.4], [wx, ms.z[1]], Y);
  }

  // End walls of the raised deck/upper terrace, hiding lower terrain beside them.
  for (const [x0, x1] of [[L.deck.x[0], L.deck.x[0] + 0.6], [L.deck.x[1] - 0.6, L.deck.x[1]]]) {
    stone.box(x0, -4, dz[0], x1, Y + 0.05, ut.z[1]);
  }

  const C = TERRACE_COLORS;
  return [
    stone.toMesh('terrace-stone', C.stone),
    rail.toMesh('terrace-balusters', C.balustrade),
    paving.toMesh('terrace-paving', C.paving),
    accent.toMesh('terrace-paving-accent', C.pavingAccent),
    drive.toMesh('terrace-drive', C.drive),
    tiles.toMesh('arcade-tile-ceiling', C.tileCeiling),
  ];
}
