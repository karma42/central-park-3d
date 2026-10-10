import { LAYOUT, COLORS, shoreZ } from './layout.js';
import { createMesh, addTriangle, addQuad, mulberry32 } from './mesh.js';
import { heightAt, plazaWeight } from './terrain.js';
import { distanceToPaths } from './paths.js';

// The Mall's four rows of American elms (two either side of the central walk).
export function mallElmPlacements() {
  const { mall } = LAYOUT;
  const rng = mulberry32(72);
  const out = [];
  for (const x of [-mall.outerRowX, -mall.innerRowX, mall.innerRowX, mall.outerRowX]) {
    for (let z = mall.startZ + 4; z <= mall.endZ - 4; z += mall.treeSpacing) {
      out.push({ kind: 'elm', x, z, y: heightAt(x, z), height: 17 + rng() * 3, crownRadius: 7 + rng() * 1.2 });
    }
  }
  return out;
}

// Why a candidate spot cannot hold a scattered tree, or null when it can.
export function treeExclusion(x, z) {
  const { bounds, terraceZone: tz, mall } = LAYOUT;
  if (x < bounds.minX + 4 || x > bounds.maxX - 4 || z < bounds.minZ + 4 || z > bounds.maxZ - 4) return 'bounds';
  if (z - shoreZ(x) < 4) return 'lake';
  if (plazaWeight(x, z) > 0.02) return 'plaza';
  if (Math.abs(x) < tz.halfWidth && z > tz.minZ && z < tz.maxZ) return 'terrace';
  if (Math.abs(x) < mall.outerRowX + 6 && z > mall.startZ - 4) return 'mall';
  if (distanceToPaths(x, z) < 2.5) return 'path';
  return null;
}

// Deterministic scattered woodland/lawn trees with a minimum spacing.
export function scatteredTreePlacements(count = 320, seed = 1859) {
  const { bounds } = LAYOUT;
  const rng = mulberry32(seed);
  const out = [];
  const minSpacing = 7;
  for (let attempt = 0; attempt < count * 30 && out.length < count; attempt++) {
    const x = bounds.minX + rng() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rng() * (bounds.maxZ - bounds.minZ);
    if (treeExclusion(x, z)) continue;
    // Thin out open lawns in the middle distance so the terrace stays visible from the Lake.
    if (Math.abs(x) < 90 && z < 20 && rng() < 0.6) continue;
    if (out.some((t) => Math.hypot(t.x - x, t.z - z) < minSpacing)) continue;
    const conifer = rng() < 0.12;
    out.push({
      kind: conifer ? 'conifer' : 'deciduous',
      x,
      z,
      y: heightAt(x, z),
      height: conifer ? 10 + rng() * 6 : 9 + rng() * 8,
      crownRadius: conifer ? 2.5 + rng() * 1.2 : 3.5 + rng() * 2.5,
      tint: Math.floor(rng() * COLORS.foliage.length),
    });
  }
  return out;
}

function addTrunk(mesh, t, topY, radius) {
  const sides = 6;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p = (a, y) => [t.x + Math.cos(a) * radius, y, t.z + Math.sin(a) * radius];
    // Start slightly below ground so slopes never show a gap.
    addQuad(mesh, p(a0, t.y - 0.5), p(a0, topY), p(a1, topY), p(a1, t.y - 0.5), COLORS.trunk);
  }
}

// Low-poly faceted ellipsoid crown.
function addCrown(mesh, cx, cy, cz, rx, ry, color) {
  const segs = 7;
  const rings = 4;
  const pt = (r, s) => {
    const phi = (r / rings) * Math.PI;
    const th = (s / segs) * Math.PI * 2;
    return [cx + Math.sin(phi) * Math.cos(th) * rx, cy + Math.cos(phi) * ry, cz + Math.sin(phi) * Math.sin(th) * rx];
  };
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = pt(r, s);
      const b = pt(r, s + 1);
      const c = pt(r + 1, s + 1);
      const d = pt(r + 1, s);
      if (r > 0) addTriangle(mesh, a, b, d, color);
      if (r < rings - 1) addTriangle(mesh, b, c, d, color);
    }
  }
}

function addCone(mesh, cx, y0, y1, cz, radius, color) {
  const segs = 7;
  const apex = [cx, y1, cz];
  for (let s = 0; s < segs; s++) {
    const a0 = (s / segs) * Math.PI * 2;
    const a1 = ((s + 1) / segs) * Math.PI * 2;
    addTriangle(mesh, [cx + Math.cos(a1) * radius, y0, cz + Math.sin(a1) * radius], [cx + Math.cos(a0) * radius, y0, cz + Math.sin(a0) * radius], apex, color);
  }
}

export function buildTreeMesh(trees) {
  const mesh = createMesh('trees');
  for (const t of trees) {
    if (t.kind === 'conifer') {
      addTrunk(mesh, t, t.y + 2, 0.25);
      addCone(mesh, t.x, t.y + 1.5, t.y + t.height, t.z, t.crownRadius, COLORS.foliage[2]);
    } else if (t.kind === 'elm') {
      // Tall clear trunk and a broad vase-like crown that arches over the walk.
      addTrunk(mesh, t, t.y + t.height * 0.55, 0.4);
      addCrown(mesh, t.x, t.y + t.height * 0.68, t.z, t.crownRadius, t.height * 0.32, COLORS.elm);
    } else {
      addTrunk(mesh, t, t.y + t.height * 0.45, 0.3);
      const ry = t.height * 0.32;
      addCrown(mesh, t.x, t.y + t.height - ry, t.z, t.crownRadius, ry, COLORS.foliage[t.tint]);
    }
  }
  return mesh;
}
