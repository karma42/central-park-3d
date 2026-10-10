import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLandscape, heightAt, walkHeightAt, isInLake, shoreZ, farShoreZ, LAYOUT, distanceToPaths } from '../src/landscape/index.js';
import { treeExclusion } from '../src/landscape/trees.js';
import { SLAB_CLEARANCE } from '../src/landscape/terrain.js';

const scene = buildLandscape();

function checkMesh(mesh) {
  const nv = mesh.positions.length / 3;
  assert.equal(mesh.normals.length, mesh.positions.length, `${mesh.name} normals`);
  assert.equal(mesh.colors.length, mesh.positions.length, `${mesh.name} colors`);
  assert.equal(mesh.indices.length % 3, 0, `${mesh.name} indices`);
  for (const v of mesh.positions) assert.ok(Number.isFinite(v), `${mesh.name} finite position`);
  for (const c of mesh.colors) assert.ok(c >= 0 && c <= 1, `${mesh.name} color range`);
  for (const i of mesh.indices) assert.ok(Number.isInteger(i) && i >= 0 && i < nv, `${mesh.name} index range`);
}

// Signed y-component of a triangle's geometric normal (counter-clockwise front).
function faceNormalY(mesh, t) {
  const p = (k) => {
    const i = mesh.indices[t * 3 + k] * 3;
    return [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
  };
  const [a, b, c] = [p(0), p(1), p(2)];
  const u = [b[0] - a[0], b[2] - a[2]];
  const v = [c[0] - a[0], c[2] - a[2]];
  return u[1] * v[0] - u[0] * v[1];
}

test('all meshes are well formed', () => {
  assert.deepEqual(scene.meshes.map((m) => m.name), ['terrain', 'paths', 'lake-water', 'trees']);
  for (const m of scene.meshes) checkMesh(m);
});

test('ground-like meshes face up (counter-clockwise from above)', () => {
  for (const name of ['terrain', 'paths', 'lake-water']) {
    const m = scene.meshes.find((x) => x.name === name);
    for (let t = 0; t < m.indices.length / 3; t++) assert.ok(faceNormalY(m, t) > 0, `${name} triangle ${t} faces up`);
  }
});

test('ground is flat just under the plaza slab and the Mall sits ~5.5 m higher', () => {
  for (const [x, z] of [[0, 0], [30, -20], [-45, 30], [0, -35]]) assert.ok(Math.abs(heightAt(x, z) + SLAB_CLEARANCE) < 1e-6, `plaza at ${x},${z}`);
  for (const z of [80, 150, 250]) assert.ok(Math.abs(heightAt(0, z) - LAYOUT.upper.height) < 0.05, `Mall at z=${z}`);
});

test('lake bed is below water and land near the shore is above it', () => {
  const w = LAYOUT.lake.waterLevel;
  for (let x = -160; x <= 160; x += 10) {
    assert.ok(heightAt(x, shoreZ(x) - 6) < w - 0.5, `bed at x=${x}`);
    assert.ok(heightAt(x, shoreZ(x) + 3) > w, `bank at x=${x}`);
    if (Math.abs(x) > LAYOUT.lake.landingSteps.halfWidth) assert.ok(isInLake(x, shoreZ(x) - 1));
    assert.ok(!isInLake(x, shoreZ(x) + 1));
  }
  for (let x = -160; x <= 160; x += 10) {
    const fz = farShoreZ(x);
    assert.ok(fz > LAYOUT.bounds.minZ + 30 && fz < shoreZ(x) - 60, `far shore at x=${x}`);
    assert.ok(heightAt(x, fz - 3) > w, `far bank at x=${x}`);
    assert.ok(heightAt(x, (fz + shoreZ(x)) / 2) < w - 1, `mid-lake at x=${x}`);
    assert.ok(isInLake(x, fz + 1) && !isInLake(x, fz - 1));
  }
  const ramble = scene.trees.filter((t) => t.z < farShoreZ(t.x));
  assert.ok(ramble.length >= 40, `wooded far shore: ${ramble.length} trees`);
  assert.ok(!isInLake(0, -44), 'terrace landing steps are walkable');
  assert.ok(isInLake(0, -46) && isInLake(10, -44));
  assert.ok(heightAt(0, -45) < -0.9, 'lake bed below the bottom landing step');
});

// Terrain grid vertices inside the terrace footprint (see TERRACE_LAYOUT in
// src/scene/terrace.js) must stay clearly below the slab (y=0) and deck
// (y=5.5); coplanar terrain z-fought with the paving in the stack renders.
test('terrain stays under the terrace slab and deck', () => {
  const { cellSize, bounds, plaza, upper, mall } = LAYOUT;
  const gap = SLAB_CLEARANCE - 1e-9;
  for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
    if (Math.abs(x) > plaza.halfWidth) continue;
    for (let z = bounds.minZ; z <= bounds.maxZ; z += cellSize) {
      if (z >= plaza.northZ && z <= plaza.southZ) assert.ok(heightAt(x, z) <= -gap, `slab at ${x},${z}: ${heightAt(x, z)}`);
      if (z > plaza.southZ && z <= mall.startZ) assert.ok(heightAt(x, z) <= upper.height - gap, `deck at ${x},${z}`);
    }
  }
});

test('terrain grid is below water right in front of the seawall', () => {
  const { cellSize, bounds, lake, plaza } = LAYOUT;
  const row = bounds.minZ + Math.floor((lake.plazaShoreZ - bounds.minZ) / cellSize) * cellSize;
  for (let x = -plaza.halfWidth; x <= plaza.halfWidth; x += cellSize) {
    assert.ok(heightAt(x, row) < lake.waterLevel, `grid row ${row} at x=${x}`);
    assert.ok(heightAt(x, row - cellSize) < lake.waterLevel, `grid row ${row - cellSize} at x=${x}`);
  }
});

test('mall has four rows of elms along the central walk', () => {
  const elms = scene.trees.filter((t) => t.kind === 'elm');
  const rows = new Set(elms.map((t) => t.x));
  assert.equal(rows.size, 4);
  assert.ok(elms.length >= 80);
  for (const t of elms) assert.ok(distanceToPaths(t.x, t.z) > 0, 'elm not on a path');
});

test('scattered trees respect exclusions and spacing', () => {
  const others = scene.trees.filter((t) => t.kind !== 'elm');
  assert.ok(others.length >= 250, `got ${others.length}`);
  for (const t of others) {
    assert.equal(treeExclusion(t.x, t.z), null);
    assert.ok(Math.abs(t.y - heightAt(t.x, t.z)) < 1e-9);
  }
  for (let i = 0; i < others.length; i++)
    for (let j = i + 1; j < others.length; j++) assert.ok(Math.hypot(others[i].x - others[j].x, others[i].z - others[j].z) >= 7);
});

test('scene is deterministic', () => {
  const again = buildLandscape();
  assert.deepEqual(again.stats, scene.stats);
  assert.deepEqual(again.trees.slice(0, 20), scene.trees.slice(0, 20));
});

test('walk height follows paths and stays above ground', () => {
  assert.ok(walkHeightAt(0, 120) > heightAt(0, 120));
  assert.equal(walkHeightAt(-130, 150), heightAt(-130, 150));
});

test('budget stays browser friendly', (t) => {
  t.diagnostic(JSON.stringify(scene.stats));
  assert.ok(scene.stats.triangles < 120000, `triangles ${scene.stats.triangles}`);
  assert.ok(scene.stats.vertices < 250000, `vertices ${scene.stats.vertices}`);
});
