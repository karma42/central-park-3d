import { LAYOUT, COLORS, shoreZ, farShoreZ } from './layout.js';
import { createMesh, addVertex, normalize, smoothstep, lerp } from './mesh.js';

// Gentle deterministic undulation (sum of sines) for natural lawns/banks.
function undulation(x, z) {
  return (
    0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.038 - 0.4) +
    0.3 * Math.sin(x * 0.11 - z * 0.07 + 2.1) +
    0.2 * Math.cos(x * 0.19 + z * 0.13)
  );
}

// 1 on the lower-terrace pavement, falling to 0 just outside it.
export function plazaWeight(x, z) {
  const { plaza } = LAYOUT;
  const ax = Math.abs(x);
  return (1 - smoothstep(plaza.halfWidth, plaza.halfWidth + 8, ax)) * (1 - smoothstep(plaza.southZ, plaza.southZ + 4, z));
}

// Shore used for terrain shaping. Along the seawall it sits a little south of
// the real edge (under the plaza slab) so the 4 m grid is below water at the wall.
export function terrainShoreZ(x) {
  const { plaza, lake } = LAYOUT;
  return shoreZ(x) + lake.seawallInset * (1 - smoothstep(plaza.halfWidth, plaza.halfWidth + 6, Math.abs(x)));
}

// Distance to the nearer Lake bank: > 0 on land, < 0 in the water.
export function shoreDistance(x, z) {
  return Math.max(z - terrainShoreZ(x), farShoreZ(x) - z);
}

// Ground height (metres) at park coordinates (x, z). Includes the lake bed.
// Terrace architecture (slab, stairs, arcade, deck, fountain) sits on top of
// this; inside its footprint the ground stays at or below the slab/deck.
export function heightAt(x, z) {
  const { plaza, upper, lake } = LAYOUT;
  const ax = Math.abs(x);
  const s = shoreDistance(x, z);
  const p = plazaWeight(x, z);
  const nearPlaza = 1 - smoothstep(plaza.halfWidth, plaza.halfWidth + 14, ax);
  const n = undulation(x, z);

  // Lower ground: lawns/woods sloping down to the shore, flattened on the
  // plaza, and rising gently into the Ramble beyond the far shore.
  let low = 1.2 + 0.9 * n + 0.05 * Math.max(0, z - plaza.northZ) * (1 - nearPlaza) + 0.06 * Math.max(0, farShoreZ(x) - z);
  low = lerp(0.15, low, smoothstep(0, 14, s));
  low = lerp(low, 0, p);

  // Upper level: flat across the deck/Mall width, undulating further out.
  const high = upper.height + 0.6 * n * smoothstep(plaza.halfWidth, plaza.halfWidth + 15, ax);

  // Hard step hidden under the deck (starting one grid row past the arcade
  // wall so no triangle pokes through the plaza slab), soft slope on the flanks.
  const stepEnd = lerp(upper.startZ, upper.startZ + 4, nearPlaza);
  const ramp = lerp(30, 2, nearPlaza);
  const u = smoothstep(stepEnd - ramp, stepEnd, z);
  const land = lerp(low, high, u);

  if (s >= 0) return land;
  const depth = Math.min(lake.maxDepth, 0.5 + -s * 0.18);
  return Math.min(land, lake.waterLevel - depth);
}

export function groundColor(x, z, y) {
  const s = shoreDistance(x, z);
  if (s < 0) return COLORS.lakeBed;
  if (plazaWeight(x, z) > 0.5) return COLORS.plaza;
  if (s < 2.5) return COLORS.bank;
  const t = 0.5 + 0.5 * Math.sin(x * 0.07 + z * 0.05) * Math.cos(z * 0.09 - x * 0.03);
  const g = COLORS.grass;
  const d = COLORS.grassDry;
  return [lerp(g[0], d[0], t * 0.5), lerp(g[1], d[1], t * 0.5), lerp(g[2], d[2], t * 0.5)];
}

export function buildTerrainMesh() {
  const { bounds, cellSize } = LAYOUT;
  const mesh = createMesh('terrain');
  const nx = Math.round((bounds.maxX - bounds.minX) / cellSize) + 1;
  const nz = Math.round((bounds.maxZ - bounds.minZ) / cellSize) + 1;
  const e = 0.5;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = bounds.minX + i * cellSize;
      const z = bounds.minZ + j * cellSize;
      const y = heightAt(x, z);
      const n = normalize([heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)]);
      addVertex(mesh, [x, y, z], n, groundColor(x, z, y));
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      // Counter-clockwise seen from above (+Y).
      mesh.indices.push(a, c, b, b, c, d);
    }
  }
  mesh.grid = { nx, nz, cellSize };
  return mesh;
}
