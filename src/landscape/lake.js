import { LAYOUT, COLORS, shoreZ } from './layout.js';
import { createMesh, addVertex } from './mesh.js';

// Flat water surface covering every grid cell that touches the Lake.
// Land terrain above water level hides the parts that run under the banks.
// The seawall, balustrade and landing steps in front of the lower terrace
// belong to the terrace module (src/scene/terrace.js).
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
