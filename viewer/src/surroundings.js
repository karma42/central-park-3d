// Context beyond the modeled area: the rest of the park as a low tree canopy,
// and an illustrative Manhattan skyline around it. Positions and heights of
// named buildings are rough approximations for orientation only.

import { MeshBuilder } from './geometry.js';
import { mulberry32 } from './math.js';
import { SITE, terrainHeight } from './site.js';

// Park-aligned distances from the Bethesda Fountain (meters, approximate).
export const CONTEXT = {
  parkHalfWidth: 410, // Central Park is ~800 m wide; Bethesda sits near its middle
  parkSouthZ: 1100, // 59th Street, ~13 blocks park-south
  parkNorthZ: -3000, // 110th Street, well beyond the fog
  canopyY: 9,
  streetY: 3,
};

const C = {
  canopy: [0.2, 0.36, 0.17],
  canopyDark: [0.15, 0.3, 0.15],
  street: [0.46, 0.46, 0.45],
  buildingWarm: [0.72, 0.64, 0.55],
  buildingStone: [0.78, 0.75, 0.7],
  buildingBrick: [0.6, 0.45, 0.37],
  buildingGlass: [0.52, 0.6, 0.68],
  roof: [0.4, 0.4, 0.42],
};

// Named landmarks along Central Park West and Billionaires' Row.
// x: park-east (+) / park-west (-), z: park-south (+) / park-north (-).
export const LANDMARKS = [
  { name: 'The San Remo', x: -440, z: -200, footprint: [60, 70], base: 60, towers: { count: 2, size: 16, height: 122 } },
  { name: 'The Majestic', x: -440, z: 70, footprint: [60, 60], base: 50, towers: { count: 2, size: 15, height: 100 } },
  { name: 'The Century', x: -440, z: 760, footprint: [60, 60], base: 55, towers: { count: 2, size: 14, height: 98 } },
  { name: 'Central Park Tower', x: -290, z: 1270, footprint: [34, 34], base: 472, glass: true },
  { name: '111 West 57th', x: -110, z: 1260, footprint: [18, 26], base: 435, glass: false },
  { name: 'One57', x: -200, z: 1265, footprint: [34, 30], base: 306, glass: true },
  { name: '432 Park Avenue', x: 520, z: 1290, footprint: [28, 28], base: 426, glass: false },
];

export function buildSurroundings() {
  const m = new MeshBuilder('surroundings');
  const rand = mulberry32(5959);
  const { xMin, xMax, zMin, zMax } = SITE.bounds;
  const { parkHalfWidth: W, parkSouthZ: S, parkNorthZ: N, canopyY, streetY } = CONTEXT;

  // Skirt from the terrain edge down/up to the canopy floor level.
  const skirt = (a, b, out) => {
    const ha = terrainHeight(a[0], a[1]) - 0.2, hb = terrainHeight(b[0], b[1]) - 0.2;
    const fa = [a[0] + out[0] * 30, streetY + 2, a[1] + out[1] * 30];
    const fb = [b[0] + out[0] * 30, streetY + 2, b[1] + out[1] * 30];
    m.face([[a[0], ha, a[1]], [b[0], hb, b[1]], fb, fa], [0, 1, 0], C.canopyDark);
  };
  for (let x = xMin; x < xMax; x += 4) {
    skirt([x, zMin], [x + 4, zMin], [0, -1]);
    skirt([x, zMax], [x + 4, zMax], [0, 1]);
  }
  for (let z = zMin; z < zMax; z += 4) {
    skirt([xMin, z], [xMin, z + 4], [-1, 0]);
    skirt([xMax, z], [xMax, z + 4], [1, 0]);
  }
  // Corner fill between skirts.
  for (const [cx, cz, sx, sz] of [[xMin, zMin, -1, -1], [xMax, zMin, 1, -1], [xMin, zMax, -1, 1], [xMax, zMax, 1, 1]]) {
    const y = streetY + 2;
    m.face([[cx, terrainHeight(cx, cz) - 0.2, cz], [cx + sx * 30, y, cz], [cx + sx * 30, y, cz + sz * 30], [cx, y, cz + sz * 30]], [0, 1, 0], C.canopyDark);
  }

  // Belt of tree crowns hiding the terrain edge.
  const belt = (x, z) => {
    const r = 5 + rand() * 4;
    const y = Math.max(terrainHeight(Math.min(xMax, Math.max(xMin, x)), Math.min(zMax, Math.max(zMin, z))), streetY) + r * 0.6;
    m.blob([x, y, z], [r, r * 0.8, r], rand() < 0.5 ? C.canopy : C.canopyDark, { subdivisions: 0, rand, jitter: 0.2 });
  };
  for (let x = xMin - 10; x <= xMax + 10; x += 9) {
    belt(x + rand() * 3, zMin - 8 - rand() * 6);
    belt(x + rand() * 3, zMax + 8 + rand() * 6);
  }
  for (let z = zMin - 10; z <= zMax + 10; z += 9) {
    belt(xMin - 8 - rand() * 6, z + rand() * 3);
    belt(xMax + 8 + rand() * 6, z + rand() * 3);
  }

  // Remaining park as a flat canopy surface (between the belt and the park walls).
  const ox0 = xMin - 30, ox1 = xMax + 30, oz0 = zMin - 30, oz1 = zMax + 30;
  const flat = (x0, z0, x1, z1, y, c) => m.face([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], c);
  flat(-W, N, W, oz0, canopyY - 4, C.canopy);
  flat(-W, oz1, W, S, canopyY - 4, C.canopy);
  flat(-W, oz0, ox0, oz1, canopyY - 4, C.canopy);
  flat(ox1, oz0, W, oz1, canopyY - 4, C.canopy);
  // Low walls of canopy at the park perimeter so it reads as woodland.
  for (const sx of [-1, 1]) m.box([sx > 0 ? W - 8 : -W, 0, N], [sx > 0 ? W : -W + 8, canopyY + 6, S], C.canopyDark);
  m.box([-W, 0, S - 8], [W, canopyY + 6, S], C.canopyDark);

  // City streets around the park.
  const far = 4000;
  flat(-far, -far, -W, far, streetY, C.street);
  flat(W, -far, far, far, streetY, C.street);
  flat(-W, S, W, far, streetY, C.street);

  // Generic blocks: Central Park West / Fifth Avenue frontage and beyond.
  const facade = () => [C.buildingWarm, C.buildingStone, C.buildingBrick][Math.floor(rand() * 3)];
  for (const side of [-1, 1]) {
    for (let z = -2600; z < S + 300; z += 42) {
      for (let row = 0; row < 3; row++) {
        const x0 = side * (W + 25 + row * 90);
        const h = row === 0 ? 35 + rand() * 70 : 20 + rand() * 45;
        const d = 40 + rand() * 30;
        const len = 30 + rand() * 10;
        building(m, x0 + side * d * 0.5, z, d, len, h, facade());
      }
    }
  }
  // Midtown south of the park.
  for (let z = S + 60; z < S + 900; z += 70) {
    for (let x = -900; x <= 900; x += 60) {
      if (rand() < 0.15) continue;
      const near = 1 - Math.min(1, (z - S) / 900);
      const h = 30 + rand() * (60 + 200 * rand() * (0.4 + near));
      building(m, x + rand() * 10, z + rand() * 10, 40, 50, h, rand() < 0.35 ? C.buildingGlass : facade());
    }
  }
  for (const lm of LANDMARKS) landmark(m, lm);
  return m;
}

function building(m, cx, cz, sx, sz, h, color) {
  const y0 = CONTEXT.streetY - 1;
  m.box([cx - sx / 2, y0, cz - sz / 2], [cx + sx / 2, y0 + h, cz + sz / 2], { top: C.roof, side: color });
}

function landmark(m, lm) {
  const [fx, fz] = lm.footprint;
  const color = lm.glass ? C.buildingGlass : C.buildingStone;
  building(m, lm.x, lm.z, fx, fz, lm.base, color);
  if (!lm.towers) return;
  const { count, size, height } = lm.towers;
  for (let i = 0; i < count; i++) {
    const tz = lm.z + (i - (count - 1) / 2) * (fz * 0.55);
    building(m, lm.x, tz, size, size, height - 6, C.buildingStone);
    // Temple-like crowns.
    m.frustum([lm.x, CONTEXT.streetY - 1 + height - 6, tz], size * 0.45, 0.6, 12, 4, C.buildingWarm);
  }
}
