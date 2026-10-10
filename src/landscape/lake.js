import { LAYOUT, COLORS, shoreZ } from './layout.js';
import { createMesh, addVertex, addQuad } from './mesh.js';

// Flat water surface covering every grid cell that touches the Lake.
// Land terrain above water level hides the parts that run under the banks.
export function buildWaterMesh() {
  const { bounds, lake } = LAYOUT;
  const mesh = createMesh('lake-water', 'water');
  const cell = 10;
  const y = lake.waterLevel;
  for (let x = bounds.minX; x < bounds.maxX; x += cell) {
    for (let z = bounds.minZ; z < bounds.maxZ; z += cell) {
      const x1 = Math.min(bounds.maxX, x + cell);
      const z1 = Math.min(bounds.maxZ, z + cell);
      const wet = [[x, z], [x1, z], [x, z1], [x1, z1]].some(([px, pz]) => pz - shoreZ(px) < 6);
      if (!wet) continue;
      const base = mesh.positions.length / 3;
      for (const [px, pz] of [[x, z], [x, z1], [x1, z1], [x1, z]]) addVertex(mesh, [px, y, pz], [0, 1, 0], COLORS.water);
      mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return mesh;
}

// Axis-aligned box with outward faces (no bottom).
export function addBox(mesh, x0, x1, y0, y1, z0, z1, color) {
  addQuad(mesh, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color); // top
  addQuad(mesh, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color); // +z
  addQuad(mesh, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color); // -z
  addQuad(mesh, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color); // +x
  addQuad(mesh, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color); // -x
}

// Stone lake edge in front of the lower terrace: a paved landing flush with
// the plaza, a vertical wall into the water and a low curb along the edge.
// The terrace module owns any balustrades or boat-landing steps above this.
export function buildLakeEdgeMesh() {
  const { lake } = LAYOUT;
  const mesh = createMesh('lake-edge');
  const hw = lake.copingHalfWidth;
  const front = lake.plazaShoreZ - 0.8;
  addBox(mesh, -hw, hw, lake.waterLevel - 1.4, 0.04, front, lake.plazaShoreZ + lake.landingDepth - 0.8, COLORS.plaza);
  addBox(mesh, -hw, hw, 0.04, 0.45, front, front + 0.6, COLORS.coping);
  return mesh;
}
