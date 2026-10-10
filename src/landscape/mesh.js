// Minimal mesh helpers shared by the landscape modules.
// Mesh format: { name, material, positions, normals, colors, indices } using
// plain number arrays (xyz / rgb in 0..1), Y up, metres.

export function createMesh(name, material = 'opaque') {
  return { name, material, positions: [], normals: [], colors: [], indices: [] };
}

export function addVertex(mesh, p, n, c) {
  mesh.positions.push(p[0], p[1], p[2]);
  mesh.normals.push(n[0], n[1], n[2]);
  mesh.colors.push(c[0], c[1], c[2]);
  return mesh.positions.length / 3 - 1;
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// Flat-shaded triangle (counter-clockwise when seen from the front).
export function addTriangle(mesh, a, b, c, color) {
  const n = normalize(cross(sub(b, a), sub(c, a)));
  const i = addVertex(mesh, a, n, color);
  addVertex(mesh, b, n, color);
  addVertex(mesh, c, n, color);
  mesh.indices.push(i, i + 1, i + 2);
}

export function addQuad(mesh, a, b, c, d, color) {
  addTriangle(mesh, a, b, c, color);
  addTriangle(mesh, a, c, d, color);
}

export function meshStats(mesh) {
  return { name: mesh.name, vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3 };
}

export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Deterministic PRNG so the scene is identical on every load and in tests.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
