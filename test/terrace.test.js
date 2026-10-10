import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, bounds, triangleCount, scale } from '../src/scene/terrace-geom.js';
import { buildTerrace, terraceHeightAt, TERRACE_LAYOUT } from '../src/scene/terrace.js';
import { buildFountain, FOUNTAIN_LAYOUT } from '../src/scene/fountain.js';

// Every triangle's winding must agree with its stored vertex normals.
function assertWindingMatchesNormals(mesh) {
  const { positions: p, normals: n, indices: idx } = mesh;
  let bad = 0, checked = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const area = Math.hypot(...fn);
    if (area < 1e-9) continue; // degenerate pole triangles of lathes
    const avg = [n[a] + n[b] + n[c], n[a + 1] + n[b + 1] + n[c + 1], n[a + 2] + n[b + 2] + n[c + 2]];
    checked++;
    if (fn[0] * avg[0] + fn[1] * avg[1] + fn[2] * avg[2] <= 0) bad++;
  }
  assert.ok(checked > 0, `${mesh.name}: no triangles`);
  assert.equal(bad, 0, `${mesh.name}: ${bad}/${checked} triangles wound against their normals`);
}

function assertWellFormed(mesh) {
  assert.ok(mesh.positions instanceof Float32Array);
  assert.ok(mesh.normals instanceof Float32Array);
  assert.ok(mesh.indices instanceof Uint32Array);
  assert.equal(mesh.positions.length, mesh.normals.length);
  assert.equal(mesh.indices.length % 3, 0);
  const vc = mesh.positions.length / 3;
  for (const i of mesh.indices) assert.ok(i < vc, `${mesh.name}: index out of range`);
  for (const v of mesh.positions) assert.ok(Number.isFinite(v), `${mesh.name}: non-finite position`);
  assert.equal(mesh.color.length, 3);
}

test('box faces point outward', () => {
  const b = new MeshBuilder().box(-1, -1, -1, 1, 1, 1);
  const m = b.toMesh('box', [1, 1, 1]);
  assert.equal(b.triangleCount, 12);
  for (let i = 0; i < m.positions.length; i += 3) {
    const dot = m.positions[i] * m.normals[i] + m.positions[i + 1] * m.normals[i + 1] + m.positions[i + 2] * m.normals[i + 2];
    assert.ok(dot > 0);
  }
  assertWindingMatchesNormals(m);
});

test('mirrored transforms keep consistent winding', () => {
  const b = new MeshBuilder();
  b.with(scale(-1, 1, 1), (m) => m.box(0, 0, 0, 1, 2, 3).sphere(1).prism([[0, 0], [1, 0], [1, 1], [0, 1]], 0, 0.1));
  assertWindingMatchesNormals(b.toMesh('mirrored', [1, 1, 1]));
});

test('terrace meshes are well formed and consistently wound', () => {
  const meshes = buildTerrace();
  assert.ok(meshes.length >= 5);
  for (const m of meshes) {
    assertWellFormed(m);
    assertWindingMatchesNormals(m);
  }
});

test('fountain meshes are well formed and consistently wound', () => {
  const meshes = buildFountain();
  for (const m of meshes) {
    assertWellFormed(m);
    assertWindingMatchesNormals(m);
  }
});

test('terrace sits inside its declared layout and reaches the upper level', () => {
  const L = TERRACE_LAYOUT;
  const { min, max } = bounds(buildTerrace());
  assert.ok(min[0] >= L.plaza.x[0] - 1 && max[0] <= L.plaza.x[1] + 1);
  assert.ok(min[2] >= L.lakeLandingSteps.z[0] - 1);
  assert.ok(max[2] <= L.mallEntry.z + 1);
  assert.ok(max[1] > L.upperLevelY + 1, 'balustrades rise above the upper level');
  assert.ok(min[1] >= -4.1);
});

test('fountain is centered on the origin and the angel crowns it', () => {
  const F = FOUNTAIN_LAYOUT;
  const meshes = buildFountain();
  const { min, max } = bounds(meshes);
  assert.ok(Math.abs(min[0] + max[0]) < 0.3, 'pool symmetric in x');
  assert.ok(Math.abs(max[0] - F.poolOuterRadius) < 0.05);
  const bronze = bounds(meshes.filter((m) => m.name === 'fountain-bronze'));
  assert.ok(bronze.max[1] > 7.6 && bronze.max[1] < 8.6, `statue top ${bronze.max[1]}`);
  // The fountain basin fits in the plaza in front of the arcade.
  assert.ok(F.poolOuterRadius + 3 < TERRACE_LAYOUT.facadeZ - 12, 'room for grand stairs in front of facade');
});

test('stairs climb from plaza to upper level', () => {
  const L = TERRACE_LAYOUT;
  for (const gs of L.grandStairs) {
    const rise = L.upperLevelY / 32;
    const tread = (gs.z[1] - gs.z[0]) / 32;
    assert.ok(rise > 0.12 && rise < 0.2, `riser ${rise}`);
    assert.ok(tread > 0.28, `tread ${tread}`);
  }
});

test('walk height follows plaza, stairs, arcade and upper terrace', () => {
  const L = TERRACE_LAYOUT;
  assert.equal(terraceHeightAt(0, -20), 0);
  assert.equal(terraceHeightAt(0, 43), 0, 'arcade floor under the drive');
  assert.equal(terraceHeightAt(40, 43), L.upperLevelY, 'drive deck beside the arcade');
  assert.equal(terraceHeightAt(30, 57), L.upperLevelY);
  const mid = terraceHeightAt(22, 30);
  assert.ok(mid > 0 && mid < L.upperLevelY, `grand stair mid ${mid}`);
  const mall = terraceHeightAt(0, 57);
  assert.ok(mall > 0 && mall < L.upperLevelY, `mall stair mid ${mall}`);
  assert.ok(terraceHeightAt(0, -44) < 0, 'lake landing steps descend');
  assert.equal(terraceHeightAt(80, 0), null);
  assert.equal(terraceHeightAt(0, 80), null);
});

test('combined terrace and fountain stay within a browser-friendly budget', (t) => {
  const all = [...buildTerrace(), ...buildFountain()];
  for (const m of all) t.diagnostic(`${m.name}: ${m.positions.length / 3} vertices, ${m.indices.length / 3} triangles`);
  const tris = triangleCount(all);
  t.diagnostic(`total: ${tris} triangles`);
  assert.ok(tris < 120000, `triangles: ${tris}`);
  const fine = triangleCount(buildTerrace({ balusterSegments: 8 }));
  assert.ok(fine > triangleCount(buildTerrace()));
});
