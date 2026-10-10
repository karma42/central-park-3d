import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshBuilder, icosphere } from '../viewer/src/geometry.js';

// Check every flat triangle's normal points away from `center`.
function assertOutward(m, center) {
  const { positions: P, normals: N } = m;
  for (let i = 0; i < P.length; i += 9) {
    const c = [0, 1, 2].map((k) => (P[i + k] + P[i + 3 + k] + P[i + 6 + k]) / 3 - center[k]);
    const d = c[0] * N[i] + c[1] * N[i + 1] + c[2] * N[i + 2];
    assert.ok(d > 0, `triangle ${i / 9} faces inward`);
  }
}

test('box: 12 outward-facing triangles (10 without bottom)', () => {
  const m = new MeshBuilder('t');
  m.box([0, 0, 0], [2, 1, 3], [1, 0, 0], { bottom: true });
  assert.equal(m.triangleCount, 12);
  assertOutward(m, [1, 0.5, 1.5]);
  const n = new MeshBuilder('t');
  n.box([0, 0, 0], [1, 1, 1], [1, 0, 0]);
  assert.equal(n.triangleCount, 10);
});

test('orientedBox faces outward for any yaw', () => {
  for (const yaw of [0, 0.3, Math.PI / 2, 2.5]) {
    const m = new MeshBuilder('t');
    m.orientedBox([5, 0, -2], [2, 1, 4], yaw, [0, 1, 0]);
    assertOutward(m, [5, 0.5, -2]);
  }
});

test('frustum and blob face outward', () => {
  const f = new MeshBuilder('t');
  f.frustum([0, 0, 0], 2, 1, 2, 12, [1, 1, 1], { bottom: true });
  assertOutward(f, [0, 0.8, 0]);
  const b = new MeshBuilder('t');
  b.blob([3, 4, 5], [2, 1, 2], [0, 1, 0], { subdivisions: 1 });
  assert.equal(b.triangleCount, 80);
  assertOutward(b, [3, 4, 5]);
});

test('icosphere subdivision counts', () => {
  assert.equal(icosphere(0).faces.length, 20);
  assert.equal(icosphere(1).faces.length, 80);
  for (const v of icosphere(1).vertices) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
});

test('ribbon normals point up', () => {
  const m = new MeshBuilder('t');
  m.ribbon([[0, 0, 0], [5, 0, 1], [10, 0, -3]], 3, [1, 1, 1]);
  for (let i = 1; i < m.normals.length; i += 3) assert.ok(m.normals[i] > 0.99);
});

test('build() returns typed arrays with matching lengths', () => {
  const m = new MeshBuilder('t', 'water');
  m.disc([0, 0, 0], 3, 8, [0, 0, 1]);
  const out = m.build();
  assert.equal(out.material, 'water');
  assert.equal(out.positions.length, out.vertexCount * 3);
  assert.equal(out.normals.length, out.colors.length);
  assert.ok(out.positions instanceof Float32Array);
});
