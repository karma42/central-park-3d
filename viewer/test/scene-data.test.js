import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScene, normalizeMesh, computeNormals, meshBoundingSphere, sceneStats } from '../src/scene-data.js';
import { buildPlaceholderScene } from '../src/placeholder-scene.js';

test('a single triangle gets an upward normal, colour fill and 16-bit indices', () => {
  const m = normalizeMesh({ name: 't', positions: [0, 0, 0, 1, 0, 0, 0, 0, -1], color: [1, 0, 0] });
  assert.ok(m.indices instanceof Uint16Array);
  assert.deepEqual(Array.from(m.indices), [0, 1, 2]);
  assert.deepEqual(Array.from(m.normals.slice(0, 3)), [0, 1, 0]);
  assert.deepEqual(Array.from(m.colors.slice(6, 9)), [1, 0, 0]);
});

test('large meshes use 32-bit indices', () => {
  const n = 70000;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) positions[i * 3] = i;
  const indices = new Uint32Array([0, 1, n - 1]);
  const m = normalizeMesh({ positions, indices });
  assert.ok(m.indices instanceof Uint32Array);
});

test('invalid meshes are rejected with the mesh name', () => {
  assert.throws(() => normalizeMesh({ name: 'bad', positions: [0, 0] }), /bad/);
  assert.throws(() => normalizeMesh({ name: 'oob', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 3] }), /out of range/);
  assert.throws(() => normalizeMesh({ name: 'nan', positions: [0, 0, NaN, 1, 0, 0, 0, 1, 0] }), /non-finite/);
  assert.throws(() => normalizeScene({ meshes: [] }), /non-empty/);
});

test('bounds are computed when the scene omits them', () => {
  const s = normalizeScene({ meshes: [{ positions: [-1, 0, 2, 3, 4, 5, 0, 0, 0] }] });
  assert.deepEqual(s.bounds, { min: [-1, 0, 0], max: [3, 4, 5] });
  assert.equal(s.groundHeight, null);
});

test('opacity defaults to 1 and is clamped', () => {
  const tri = [0, 0, 0, 1, 0, 0, 0, 0, -1];
  assert.equal(normalizeMesh({ positions: tri }).opacity, 1);
  assert.equal(normalizeMesh({ positions: tri, opacity: 0.55 }).opacity, 0.55);
  assert.equal(normalizeMesh({ positions: tri, opacity: 3 }).opacity, 1);
});

test('heightAt is accepted as the ground function', () => {
  const heightAt = (x) => x * 2;
  const s = normalizeScene({ meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 0, -1] }], heightAt });
  assert.equal(s.groundHeight, heightAt);
});

test('computeNormals produces unit vectors', () => {
  const n = computeNormals(new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]), [0, 1, 2]);
  for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-6);
});

test('bounding sphere encloses all vertices', () => {
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 4, 0, 3, 3, -6]);
  const { centre, radius } = meshBoundingSphere(pos);
  for (let i = 0; i < pos.length; i += 3) {
    assert.ok(Math.hypot(pos[i] - centre[0], pos[i + 1] - centre[1], pos[i + 2] - centre[2]) <= radius + 1e-6);
  }
});

test('placeholder scene normalizes and reports stats', () => {
  const s = normalizeScene(buildPlaceholderScene());
  const st = sceneStats(s);
  assert.equal(st.meshes, s.meshes.length);
  assert.ok(st.triangles > 0 && st.vertices > 0 && st.gpuBytes > 0);
});
