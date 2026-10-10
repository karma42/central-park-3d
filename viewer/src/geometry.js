// Procedural mesh builder. Produces non-indexed triangle lists with
// per-vertex position, normal and color, ready for WebGL drawArrays.

import { cross, dot, normalize, sub } from './math.js';

export class MeshBuilder {
  constructor(name, material = 'standard') {
    this.name = name;
    this.material = material;
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.vertexCount / 3;
  }

  vertex(p, n, c) {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(c[0], c[1], c[2]);
  }

  // Flat-shaded triangle; normal follows the winding a -> b -> c.
  tri(a, b, c, color) {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    this.vertex(a, n, color);
    this.vertex(b, n, color);
    this.vertex(c, n, color);
  }

  // Triangle with explicit (smooth) normals.
  triSmooth(a, b, c, na, nb, nc, ca, cb = ca, cc = ca) {
    this.vertex(a, na, ca);
    this.vertex(b, nb, cb);
    this.vertex(c, nc, cc);
  }

  // Convex planar polygon whose winding is corrected so its normal points
  // along `outward`.
  face(points, outward, color) {
    let pts = points;
    const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    if (dot(n, outward) < 0) pts = [...pts].reverse();
    for (let i = 1; i < pts.length - 1; i++) this.tri(pts[0], pts[i], pts[i + 1], color);
  }

  // Axis-aligned box. `color` may be a single color or {top, side, bottom}.
  box(min, max, color, { bottom = false } = {}) {
    const top = color.top || color;
    const side = color.side || color;
    const bot = color.bottom || side;
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    this.face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], top);
    if (bottom) this.face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], bot);
    this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], side);
    this.face([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], side);
    this.face([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0], side);
    this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], side);
  }

  // Box rotated around the vertical axis. `size` = [sx, sy, sz]; base at center[1].
  orientedBox(center, size, yaw, color) {
    const [cx, cy, cz] = center;
    const hx = size[0] / 2, hz = size[2] / 2;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const corner = (dx, dz, y) => [cx + dx * cs + dz * sn, y, cz - dx * sn + dz * cs];
    const y0 = cy, y1 = cy + size[1];
    const b = [corner(-hx, -hz, y0), corner(hx, -hz, y0), corner(hx, hz, y0), corner(-hx, hz, y0)];
    const t = b.map((p) => [p[0], y1, p[2]]);
    this.face(t, [0, 1, 0], color.top || color);
    const side = color.side || color;
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const mid = [(b[i][0] + b[j][0]) / 2 - cx, 0, (b[i][2] + b[j][2]) / 2 - cz];
      this.face([b[i], b[j], t[j], t[i]], mid, side);
    }
  }

  // Truncated cone (or cylinder when r0 === r1) standing on `base`.
  frustum(base, r0, r1, height, segments, color, { top = true, bottom = false } = {}) {
    const [cx, cy, cz] = base;
    const y1 = cy + height;
    const sideColor = color.side || color;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p = (r, a, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      const out = [Math.cos(am), (r0 - r1) / Math.max(height, 1e-6), Math.sin(am)];
      if (r1 > 1e-6) this.face([p(r0, a0, cy), p(r0, a1, cy), p(r1, a1, y1), p(r1, a0, y1)], out, sideColor);
      else this.face([p(r0, a0, cy), p(r0, a1, cy), [cx, y1, cz]], out, sideColor);
      if (top && r1 > 1e-6) this.face([[cx, y1, cz], p(r1, a0, y1), p(r1, a1, y1)], [0, 1, 0], color.top || color);
      if (bottom && r0 > 1e-6) this.face([[cx, cy, cz], p(r0, a0, cy), p(r0, a1, cy)], [0, -1, 0], sideColor);
    }
  }

  // Thick ring (annulus) between rInner and rOuter, from y0 to y1.
  ring(center, rInner, rOuter, y0, y1, segments, color) {
    const [cx, , cz] = center;
    const top = color.top || color;
    const side = color.side || color;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      const p = (r, a, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      const radial = [Math.cos(am), 0, Math.sin(am)];
      this.face([p(rInner, a0, y1), p(rOuter, a0, y1), p(rOuter, a1, y1), p(rInner, a1, y1)], [0, 1, 0], top);
      this.face([p(rOuter, a0, y0), p(rOuter, a1, y0), p(rOuter, a1, y1), p(rOuter, a0, y1)], radial, side);
      this.face(
        [p(rInner, a0, y0), p(rInner, a1, y0), p(rInner, a1, y1), p(rInner, a0, y1)],
        [-radial[0], 0, -radial[2]],
        side,
      );
    }
  }

  // Flat horizontal disc.
  disc(center, radius, segments, color) {
    const [cx, cy, cz] = center;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      this.face(
        [[cx, cy, cz], [cx + Math.cos(a0) * radius, cy, cz + Math.sin(a0) * radius], [cx + Math.cos(a1) * radius, cy, cz + Math.sin(a1) * radius]],
        [0, 1, 0],
        color,
      );
    }
  }

  // Low-poly faceted sphere/ellipsoid. `radius` may be [rx, ry, rz].
  // `rand` (optional) jitters vertices for a more organic silhouette.
  blob(center, radius, color, { subdivisions = 1, rand = null, jitter = 0.12 } = {}) {
    const [rx, ry, rz] = Array.isArray(radius) ? radius : [radius, radius, radius];
    const { vertices, faces } = icosphere(subdivisions);
    const verts = vertices.map((v) => {
      const k = rand ? 1 + (rand() - 0.5) * 2 * jitter : 1;
      return [center[0] + v[0] * rx * k, center[1] + v[1] * ry * k, center[2] + v[2] * rz * k];
    });
    for (const [a, b, c] of faces) {
      const pa = verts[a], pb = verts[b], pc = verts[c];
      const centroid = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
      const shade = Array.isArray(color[0]) ? color[Math.floor((vertices[a][1] + 1) * 0.5 * (color.length - 0.001))] : color;
      this.face([pa, pb, pc], sub(centroid, center), shade);
    }
  }

  // Flat strip following a polyline of [x, y, z] points.
  ribbon(points, width, color) {
    const half = width / 2;
    const sides = points.map((p, i) => {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const d = normalize([next[0] - prev[0], 0, next[2] - prev[2]]);
      const off = [-d[2] * half, 0, d[0] * half];
      return [
        [p[0] + off[0], p[1], p[2] + off[2]],
        [p[0] - off[0], p[1], p[2] - off[2]],
      ];
    });
    for (let i = 0; i < sides.length - 1; i++) {
      const [l0, r0] = sides[i];
      const [l1, r1] = sides[i + 1];
      const c = typeof color === 'function' ? color(i) : color;
      this.face([l0, r0, r1], [0, 1, 0], c);
      this.face([l0, r1, l1], [0, 1, 0], c);
    }
  }

  // Merge another builder's triangles into this one.
  append(other) {
    for (let i = 0; i < other.positions.length; i++) {
      this.positions.push(other.positions[i]);
      this.normals.push(other.normals[i]);
      this.colors.push(other.colors[i]);
    }
  }

  build() {
    return {
      name: this.name,
      material: this.material,
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      vertexCount: this.vertexCount,
    };
  }
}

const icoCache = new Map();

// Unit icosphere: returns {vertices, faces} with outward-facing faces.
export function icosphere(subdivisions = 1) {
  if (icoCache.has(subdivisions)) return icoCache.get(subdivisions);
  const t = (1 + Math.sqrt(5)) / 2;
  let vertices = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(normalize);
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdivisions; s++) {
    const midCache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (midCache.has(key)) return midCache.get(key);
      const va = vertices[a], vb = vertices[b];
      vertices.push(normalize([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]));
      midCache.set(key, vertices.length - 1);
      return vertices.length - 1;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const result = { vertices, faces };
  icoCache.set(subdivisions, result);
  return result;
}
