import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLOCKED,
  DECK,
  PATHS,
  SITE,
  lakeInside,
  smoothPath,
  stairHeight,
  terrainHeight,
  walkHeight,
  walkSurfaces,
} from '../viewer/src/site.js';

test('plaza is flat at level 0 and the upper deck at the terrace level', () => {
  for (let x = SITE.plaza.xMin; x <= SITE.plaza.xMax; x += 6) {
    for (let z = SITE.plaza.zMin; z <= SITE.plaza.zMax; z += 6) assert.equal(terrainHeight(x, z), 0);
  }
  for (let x = DECK.xMin; x <= DECK.xMax; x += 10) assert.equal(terrainHeight(x, 60), SITE.upperY);
  assert.ok(SITE.upperY > 4 && SITE.upperY < 7, 'terrace drop is roughly one storey');
});

test('the Lake lies park-north of the plaza and its bed is under water', () => {
  for (const [x, z] of [[0, -60], [0, -120], [-120, -100], [100, -110]]) {
    assert.ok(lakeInside(x, z) > 0, `(${x}, ${z}) should be in the lake`);
    assert.ok(terrainHeight(x, z) < SITE.lake.waterY, `(${x}, ${z}) bed below water`);
  }
  for (const [x, z] of [[0, 0], [0, 100], [-150, 50], [0, -240]]) {
    assert.ok(lakeInside(x, z) < 0, `(${x}, ${z}) should be land`);
  }
});

test('terrain heights are finite and within a plausible range', () => {
  const { xMin, xMax, zMin, zMax } = SITE.bounds;
  for (let x = xMin; x <= xMax; x += 7) {
    for (let z = zMin; z <= zMax; z += 7) {
      const h = terrainHeight(x, z);
      assert.ok(Number.isFinite(h));
      assert.ok(h >= SITE.lake.bedY - 0.01 && h < 10, `h=${h} at (${x}, ${z})`);
    }
  }
});

test('footpaths stay on land above the water line', () => {
  for (const p of PATHS) {
    for (const [x, z] of smoothPath(p.points, 2)) {
      assert.ok(terrainHeight(x, z) > SITE.lake.waterY + 0.2, `${p.name} dips into the lake at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
});

test('stairs climb monotonically from plaza to terrace with small risers', () => {
  for (const st of [...SITE.grandStairs, SITE.centralStairs]) {
    let prev = 0;
    for (let z = st.zBottom; z <= st.zTop; z += 0.05) {
      const h = stairHeight(st, z);
      assert.ok(h >= prev, 'monotonic');
      assert.ok(h - prev <= 0.2, 'riser at most 20 cm');
      prev = h;
    }
    assert.ok(Math.abs(prev - SITE.upperY) < 1e-9, 'top step reaches the terrace');
  }
});

test('walk surfaces: arcade has floor and deck; pool and deep lake are blocked', () => {
  assert.deepEqual(walkSurfaces(0, 45), [0, SITE.upperY]);
  assert.equal(walkHeight(0, 45, 0), 0, 'walker in the arcade stays on its floor');
  assert.equal(walkHeight(0, 45, SITE.upperY), SITE.upperY, 'walker on Terrace Drive stays on the deck');
  assert.equal(walkHeight(0, 5, 0), BLOCKED, 'fountain pool');
  assert.equal(walkHeight(0, -100, 0), BLOCKED, 'lake');
  assert.equal(walkHeight(0, SITE.fountain.poolRadius + 0.3, 0), SITE.fountain.rimHeight, 'basin rim is walkable');
});
