import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScene, placeTrees } from '../viewer/src/scene.js';
import { SITE, isPavedOrBuilt, lakeInside } from '../viewer/src/site.js';

const scene = buildScene();
const byName = Object.fromEntries(scene.components.map((c) => [c.name, c]));

function bbox(c) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < c.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], c.positions[i + k]);
      max[k] = Math.max(max[k], c.positions[i + k]);
    }
  }
  return { min, max };
}

test('scene contains the milestone-1 components', () => {
  for (const name of ['terrain', 'lake', 'plaza', 'fountain', 'fountain-water', 'terrace', 'arcade-ceiling', 'paths', 'mall', 'trees', 'surroundings']) {
    assert.ok(byName[name], `missing component ${name}`);
    assert.ok(byName[name].vertexCount > 0, `${name} is empty`);
  }
});

test('all vertex data is finite with unit normals and colors in [0, 1]', () => {
  for (const c of scene.components) {
    assert.equal(c.vertexCount % 3, 0, `${c.name} is not a triangle list`);
    for (let i = 0; i < c.positions.length; i += 3) {
      assert.ok(Number.isFinite(c.positions[i] + c.positions[i + 1] + c.positions[i + 2]), `${c.name} position`);
      const n = Math.hypot(c.normals[i], c.normals[i + 1], c.normals[i + 2]);
      assert.ok(Math.abs(n - 1) < 1e-3, `${c.name} normal length ${n}`);
      for (let k = 0; k < 3; k++) assert.ok(c.colors[i + k] >= 0 && c.colors[i + k] <= 1, `${c.name} color`);
    }
  }
});

test('fountain is centered on the origin, about 29 m across and 8 m tall', () => {
  const { min, max } = bbox(byName.fountain);
  assert.ok(Math.abs(min[0] + max[0]) < 0.5 && Math.abs(min[2] + max[2]) < 0.5, 'centered');
  const diameter = max[0] - min[0];
  assert.ok(diameter > 28 && diameter < 32, `diameter ${diameter}`);
  assert.ok(max[1] > 7.4 && max[1] < 8.4, `height ${max[1]}`);
});

test('terrace steps up park-south of the plaza; arcade sits under the drive', () => {
  const { min, max } = bbox(byName.terrace);
  assert.ok(max[1] > SITE.upperY && max[1] < SITE.upperY + 4.5, `top at ${max[1]} (balustrades and lamps)`);
  assert.ok(min[2] >= SITE.grandStairs[0].zBottom - 2, 'terrace starts at the foot of the stairs');
  assert.ok(SITE.arcade.zMin < SITE.drive.zMin && SITE.arcade.zMax > SITE.drive.zMax, 'drive passes over the arcade');
});

test('trees avoid paved areas and water; the Mall has an elm allée', () => {
  const trees = placeTrees();
  assert.ok(trees.length > 400, `only ${trees.length} trees`);
  const elms = trees.filter((t) => t.type === 'elm');
  assert.ok(elms.length >= 80);
  for (const t of trees) {
    if (t.type === 'elm') continue;
    assert.ok(!isPavedOrBuilt(t.x, t.z), `tree on pavement at (${t.x}, ${t.z})`);
    assert.ok(lakeInside(t.x, t.z) < 0, `tree in the lake at (${t.x}, ${t.z})`);
  }
  for (const e of elms) assert.ok(Math.abs(e.x) > SITE.mall.xHalf, 'elms flank, not block, the Mall');
});

test('scene generation is deterministic', () => {
  const again = buildScene();
  assert.deepEqual(again.stats, scene.stats);
  assert.deepEqual(Array.from(again.components[0].positions.slice(0, 300)), Array.from(scene.components[0].positions.slice(0, 300)));
});

test('triangle budget stays practical for browsers', () => {
  assert.ok(scene.stats.triangles < 400000, `${scene.stats.triangles} triangles`);
});
