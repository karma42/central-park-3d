// Site layout for the Bethesda Terrace & Fountain area.
//
// Coordinates are meters in a park-aligned local frame (Central Park's grid
// runs about 29 degrees east of true north; "north" here means park-north):
//   +x = park-east, +y = up, -z = park-north (toward the Lake),
//   origin = center of Bethesda Fountain at lower-plaza paving level.
// All dimensions are approximate; see docs/references.md for sources and
// uncertainty.

import { clamp, lerp, smoothstep } from './math.js';

export const SITE = {
  // Lower terrace (plaza) around the fountain.
  plaza: { xMin: -48, xMax: 48, zMin: -30, zMax: 34 },
  // Upper terrace level: Terrace Drive / 72nd Street Transverse and the Mall.
  upperY: 5.5,
  // North face (retaining wall) of the upper terrace.
  wall: { z: 34, thickness: 2, xMin: -60, xMax: 60 },
  // Terrace Drive crossing over the arcade.
  drive: { zMin: 38, zMax: 50, width: 12 },
  // Arcade beneath Terrace Drive, linking the Mall stairs to the plaza.
  arcade: { xMin: -9, xMax: 9, zMin: 34, zMax: 52, ceilingY: 4.5 },
  // Central staircase from the Mall's north end down into the arcade.
  centralStairs: { xMin: -7, xMax: 7, zTop: 70, zBottom: 52 },
  // Two grand staircases from the upper terrace down to the plaza.
  grandStairs: [
    { xMin: -31, xMax: -17, zTop: 34, zBottom: 20 },
    { xMin: 17, xMax: 31, zTop: 34, zBottom: 20 },
  ],
  fountain: {
    poolRadius: 14.5, // basin roughly 29 m (~96 ft) across
    rimWidth: 0.7,
    rimHeight: 0.6,
    waterY: 0.38,
    statueTopY: 7.9, // ~26 ft overall height
  },
  lake: { waterY: -1.0, bedY: -2.6 },
  // The Mall: tree-lined promenade running park-south from the terrace.
  mall: { xHalf: 6, zStart: 70, zEnd: 330, elmRowsX: [-17, -9.5, 9.5, 17], elmSpacing: 9 },
  // Terrain extent. Edges are chosen so plaza and deck edges fall on the
  // 4 m terrain grid.
  bounds: { xMin: -220, xMax: 220, zMin: -262, zMax: 342 },
};

// Far (park-north) shore of the Lake, toward the Ramble.
export function northShoreZ(x) {
  return -185 + 20 * Math.sin(x / 45 + 0.5) + 8 * Math.cos(x / 19);
}

// Signed distance-like measure: > 0 inside the Lake, < 0 on land.
export function lakeInside(x, z) {
  const east = 175 + 15 * Math.sin(z / 20) - x;
  const west = x + 205 + 10 * Math.cos(z / 17);
  return Math.min(shoreZ(x) - z, z - northShoreZ(x), east, west);
}

// Lake shoreline: the lake lies park-north of this z for a given x.
export function shoreZ(x) {
  const ax = Math.abs(x);
  if (ax <= SITE.plaza.xMax) return SITE.plaza.zMin;
  // The shore bends away north-east (toward the boathouse cove) and
  // north-west (toward Bow Bridge) beyond the plaza.
  const t = ax - SITE.plaza.xMax;
  const drift = x > 0 ? 0.12 : 0.05;
  return SITE.plaza.zMin - 4 * smoothstep(0, 10, t) - t * drift + 2.5 * Math.sin(x / 23) * smoothstep(0, 20, t);
}

// Low-frequency rolling terrain (deterministic, no textures needed).
function hills(x, z) {
  return (
    0.9 * Math.sin(x * 0.031 + 1.3) * Math.cos(z * 0.027 - 0.4) +
    0.6 * Math.sin(x * 0.067 - z * 0.041 + 2.1) +
    0.35 * Math.cos(x * 0.11 + z * 0.093)
  );
}

export function distanceToRect(x, z, r) {
  const dx = Math.max(r.xMin - x, 0, x - r.xMax);
  const dz = Math.max(r.zMin - z, 0, z - r.zMax);
  return Math.hypot(dx, dz);
}

function inRect(x, z, r) {
  return x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax;
}

// Upper-terrace deck footprint (flat at SITE.upperY).
export const DECK = { xMin: -60, xMax: 60, zMin: SITE.wall.z, zMax: 78 };
// Paved parts of the deck: promenade along the terrace edge (z < this) and
// the surround of the central stairwell (|x| < this).
export const DECK_PROMENADE_Z = 39;
export const DECK_PAVED_X = 15;

// Rendered top surface of the landscape (grass/lake bed/plaza/deck),
// ignoring stairs and the arcade void.
export function terrainHeight(x, z) {
  const { plaza, upperY, lake } = SITE;
  if (inRect(x, z, plaza)) return 0;
  if (inRect(x, z, DECK)) return upperY;

  // General slope: the land rises park-south toward the upper terrace level.
  const rise = upperY * smoothstep(-40, 30, z);
  // Keep the Mall and Terrace Drive corridors gently graded.
  const mallMask = z > 60 ? 1 - smoothstep(14, 32, Math.abs(x)) : 0;
  const driveMask = 1 - smoothstep(8, 24, distanceToPolyline(x, z, DRIVE_PATH.points));
  const hillMask = (1 - Math.max(mallMask, driveMask)) * smoothstep(0, 25, distanceToRect(x, z, DECK));
  let h = rise + hills(x, z) * 1.2 * hillMask;

  // Blend down to the plaza level around the plaza edges.
  const dPlaza = distanceToRect(x, z, plaza);
  h = lerp(0, h, smoothstep(0, 22, dPlaza));
  // Blend up to the deck level around the deck.
  const dDeck = distanceToRect(x, z, DECK);
  h = lerp(upperY, h, smoothstep(0, 18, dDeck));

  // Dry land stays above the water line; only the Lake basin dips below it.
  h = Math.max(h, lake.waterY + 1.2);
  // Lake basin.
  const s = lakeInside(x, z);
  if (s > -8) h = lerp(h, lake.bedY, smoothstep(-8, 5, s));
  return h;
}

export function isLake(x, z) {
  return terrainHeight(x, z) < SITE.lake.waterY - 0.05;
}

export function stairHeight(st, z) {
  // Stairs descend park-north from zTop (upper level) to zBottom (plaza).
  const top = Math.max(st.zTop, st.zBottom);
  const bottom = Math.min(st.zTop, st.zBottom);
  const steps = Math.round(SITE.upperY / 0.16);
  const t = clamp((z - bottom) / (top - bottom), 0, 1);
  const idx = Math.min(steps - 1, Math.floor(t * steps));
  const descendingNorth = st.zTop > st.zBottom;
  const k = descendingNorth ? idx + 1 : steps - idx;
  return (k / steps) * SITE.upperY;
}

// Candidate walkable surface heights at (x, z), lowest first.
export function walkSurfaces(x, z) {
  const { arcade, centralStairs, grandStairs, upperY } = SITE;
  for (const st of grandStairs) {
    if (x >= st.xMin && x <= st.xMax && z >= st.zBottom && z <= st.zTop) return [stairHeight(st, z)];
  }
  if (x >= centralStairs.xMin && x <= centralStairs.xMax && z >= centralStairs.zBottom && z <= centralStairs.zTop) {
    return [stairHeight({ zTop: centralStairs.zTop, zBottom: centralStairs.zBottom }, z)];
  }
  if (x >= arcade.xMin && x <= arcade.xMax && z >= arcade.zMin && z <= arcade.zMax) {
    return [0, upperY];
  }
  const r = Math.hypot(x, z);
  const { poolRadius, rimWidth, rimHeight } = SITE.fountain;
  if (r < poolRadius) return [BLOCKED];
  if (r < poolRadius + rimWidth) return [rimHeight];
  const ground = terrainHeight(x, z);
  if (ground < SITE.lake.waterY - 0.4) return [BLOCKED];
  return [ground];
}

// Height used for surfaces a walker cannot enter (fountain pool, deep water).
export const BLOCKED = 1000;

// Height of the surface a walker standing with feet at `feetY` would stand on:
// the highest candidate not more than `maxStep` above the feet. A result more
// than `maxStep` above the feet means the move is blocked.
export function walkHeight(x, z, feetY = Infinity, maxStep = 0.6) {
  const surfaces = walkSurfaces(x, z);
  let best = surfaces[0];
  for (const s of surfaces) if (s <= feetY + maxStep) best = s;
  return best;
}

// Footpaths as smooth polylines in plan (x, z) with widths in meters.
export const PATHS = [
  // Lakeside walk heading west toward Bow Bridge / the Ramble shore.
  { name: 'west-lakeside', width: 5, points: [[-48, -24], [-75, -27], [-105, -27], [-140, -30], [-175, -34], [-215, -34]] },
  // Lakeside walk heading east toward the boathouse.
  { name: 'east-lakeside', width: 5, points: [[48, -24], [72, -28], [98, -33], [130, -36], [165, -37], [215, -44]] },
  // Paths climbing from the plaza corners up to Terrace Drive.
  { name: 'west-terrace-link', width: 4, points: [[-48, 10], [-70, 14], [-90, 26], [-104, 44]] },
  { name: 'east-terrace-link', width: 4, points: [[48, 10], [70, 14], [90, 26], [104, 44]] },
  // Cherry Hill direction (west) and toward the Bandshell (south-east).
  { name: 'west-hill', width: 4, points: [[-104, 44], [-130, 70], [-150, 110], [-160, 160], [-175, 210]] },
  { name: 'south-east', width: 4, points: [[24, 90], [45, 120], [70, 160], [95, 210], [115, 270]] },
  { name: 'south-west', width: 3.5, points: [[-24, 110], [-48, 150], [-70, 200], [-80, 260], [-90, 320]] },
];

// Terrace Drive (72nd Street Transverse), drawn as a road strip.
export const DRIVE_PATH = {
  width: SITE.drive.width,
  points: [[-220, 30], [-160, 38], [-100, 44], [-60, 44], [0, 44], [60, 44], [100, 44], [160, 50], [220, 62]],
};

// Catmull-Rom resampling of a plan polyline.
export function smoothPath(points, step = 3) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function distanceToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

// True when (x, z) is on or near a hard surface where trees must not grow.
export function isPavedOrBuilt(x, z, margin = 0) {
  if (distanceToRect(x, z, SITE.plaza) <= margin + 2) return true;
  if (distanceToRect(x, z, DECK) <= margin) {
    // The deck is lawn except the terrace promenade and the stairwell surround.
    if (z < DECK_PROMENADE_Z + margin || Math.abs(x) < DECK_PAVED_X + margin) return true;
    if (x < DECK.xMin + margin || x > DECK.xMax - margin || z > DECK.zMax - margin) return true;
  }
  if (Math.abs(x) <= SITE.mall.xHalf + margin && z >= SITE.mall.zStart - 2) return true;
  if (distanceToPolyline(x, z, DRIVE_PATH.points) <= DRIVE_PATH.width / 2 + margin + 1) return true;
  for (const p of PATHS) {
    if (distanceToPolyline(x, z, p.points) <= p.width / 2 + margin + 1) return true;
  }
  return false;
}
