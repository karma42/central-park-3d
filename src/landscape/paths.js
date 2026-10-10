import { COLORS, pathDefinitions } from './layout.js';
import { createMesh, addVertex } from './mesh.js';
import { heightAt } from './terrain.js';

// Height of path surfaces above the analytic ground. The terrain mesh is a
// coarse grid, so a small lift keeps paths from sinking into it.
export const PATH_LIFT = 0.15;
const STEP = 2;

function resample(points, step) {
  const out = [];
  for (let k = 0; k < points.length - 1; k++) {
    const [x0, z0] = points[k];
    const [x1, z1] = points[k + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
  }
  out.push(points[points.length - 1]);
  return out;
}

// Ribbon draped over the terrain: three lateral columns so wide paths follow cross-slope.
export function addPathRibbon(mesh, path) {
  const pts = resample(path.points, STEP);
  const color = COLORS[path.surface] || COLORS.asphalt;
  const half = path.width / 2;
  const base = mesh.positions.length / 3;
  const cols = [-1, 0, 1];
  for (let k = 0; k < pts.length; k++) {
    const prev = pts[Math.max(0, k - 1)];
    const next = pts[Math.min(pts.length - 1, k + 1)];
    const tx = next[0] - prev[0];
    const tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    const px = tz / tl;
    const pz = -tx / tl;
    for (const c of cols) {
      const x = pts[k][0] + px * half * c;
      const z = pts[k][1] + pz * half * c;
      addVertex(mesh, [x, heightAt(x, z) + PATH_LIFT, z], [0, 1, 0], color);
    }
  }
  for (let k = 0; k < pts.length - 1; k++) {
    for (let c = 0; c < cols.length - 1; c++) {
      const a = base + k * 3 + c;
      const b = base + (k + 1) * 3 + c;
      mesh.indices.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
}

export function buildPathMesh(paths = pathDefinitions()) {
  const mesh = createMesh('paths');
  for (const p of paths) addPathRibbon(mesh, p);
  return mesh;
}

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

// Distance from (x, z) to the nearest path edge (negative when on a path).
export function distanceToPaths(x, z, paths = pathDefinitions()) {
  let best = Infinity;
  for (const p of paths) {
    for (let k = 0; k < p.points.length - 1; k++) {
      best = Math.min(best, segmentDistance(x, z, p.points[k], p.points[k + 1]) - p.width / 2);
    }
  }
  return best;
}
