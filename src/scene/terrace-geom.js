// Small dependency-free mesh builder used by the terrace and fountain modules.
// Output meshes are plain data: {name, color, positions, normals, indices}.
// Conventions: meters, Y up, right-handed, counter-clockwise front faces.

export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

// Affine 3x4 matrices stored row-major: [a b c tx, d e f ty, g h i tz].
export function multiply(m, n) {
  const r = new Array(12);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      let v = col === 3 ? m[row * 4 + 3] : 0;
      for (let k = 0; k < 3; k++) v += m[row * 4 + k] * n[k * 4 + col];
      r[row * 4 + col] = v;
    }
  }
  return r;
}

export const translate = (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
export const scale = (x, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
export function rotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
}
export function rotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
}
export function rotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}

/** Compose transforms left to right: compose(A, B, C) applies C first. */
export function compose(...ms) {
  return ms.reduce((acc, m) => multiply(acc, m), IDENTITY);
}

function applyPoint(m, p) {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

function det3(m) {
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
}

// Normal matrix = inverse transpose of the linear part.
function normalMatrix(m) {
  const [a, b, c, , d, e, f, , g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const s = 1 / det;
  // Cofactor matrix / det, which equals the inverse transpose.
  return [
    A * s, B * s, C * s,
    -(b * i - c * h) * s, (a * i - c * g) * s, -(a * h - b * g) * s,
    (b * f - c * e) * s, -(a * f - c * d) * s, (a * e - b * d) * s,
  ];
}

function applyNormal(nm, n) {
  const x = nm[0] * n[0] + nm[1] * n[1] + nm[2] * n[2];
  const y = nm[3] * n[0] + nm[4] * n[1] + nm[5] * n[2];
  const z = nm[6] * n[0] + nm[7] * n[1] + nm[8] * n[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.indices = [];
    this.matrix = IDENTITY;
    this.nmatrix = normalMatrix(IDENTITY);
    this.mirrored = false;
  }

  /** Push a triangle, keeping front faces counter-clockwise under mirroring. */
  tri(a, b, c) {
    if (this.mirrored) this.indices.push(a, c, b);
    else this.indices.push(a, b, c);
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  /** Run fn with an extra local transform applied on top of the current one. */
  with(m, fn) {
    const saved = this.matrix, savedN = this.nmatrix, savedM = this.mirrored;
    this.matrix = multiply(saved, m);
    this.nmatrix = normalMatrix(this.matrix);
    this.mirrored = det3(this.matrix) < 0;
    try {
      fn(this);
    } finally {
      this.matrix = saved;
      this.nmatrix = savedN;
      this.mirrored = savedM;
    }
    return this;
  }

  vertex(p, n) {
    const q = applyPoint(this.matrix, p);
    const k = applyNormal(this.nmatrix, n);
    this.positions.push(q[0], q[1], q[2]);
    this.normals.push(k[0], k[1], k[2]);
    return this.vertexCount - 1;
  }

  /** Flat-shaded polygon (convex, counter-clockwise seen from its front). */
  polygon(pts) {
    let n = [0, 0, 0];
    for (let i = 1; i + 1 < pts.length; i++) {
      const c = cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0]));
      n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]];
    }
    n = normalize(n);
    const base = pts.map((p) => this.vertex(p, n));
    for (let i = 1; i + 1 < base.length; i++) this.tri(base[0], base[i], base[i + 1]);
    return this;
  }

  quad(a, b, c, d) {
    return this.polygon([a, b, c, d]);
  }

  /**
   * Hexahedron from 8 corners: bottom face (y-) a0..a3 then top face b0..b3,
   * each listed counter-clockwise when seen from above. Supports sloped boxes.
   */
  hexa(c) {
    const [a0, a1, a2, a3, b0, b1, b2, b3] = c;
    this.quad(b0, b1, b2, b3); // top
    this.quad(a0, a3, a2, a1); // bottom
    this.quad(a0, a1, b1, b0);
    this.quad(a1, a2, b2, b1);
    this.quad(a2, a3, b3, b2);
    this.quad(a3, a0, b0, b3);
    return this;
  }

  /** Axis-aligned box given min and max corners (before the current transform). */
  box(x0, y0, z0, x1, y1, z1) {
    return this.hexa([
      [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0],
      [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0],
    ]);
  }

  /**
   * Surface of revolution around the local Y axis.
   * profile: [[radius, y], ...] traced so the outside is on the right-hand side
   * when walking along it (bottom-to-top for an outward-facing wall).
   */
  lathe(profile, segments = 16, { smooth = false } = {}) {
    const ringNormals = [];
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      const len = Math.hypot(r1 - r0, y1 - y0) || 1;
      ringNormals.push([(y1 - y0) / len, -(r1 - r0) / len]);
    }
    const ring = (r, y, nr, ny) => {
      const ids = [];
      for (let s = 0; s <= segments; s++) {
        const t = (s / segments) * Math.PI * 2;
        const cs = Math.cos(t), sn = Math.sin(t);
        ids.push(this.vertex([r * cs, y, r * sn], [nr * cs, ny, nr * sn]));
      }
      return ids;
    };
    // A ring of radius 0 is a pole: one triangle of each quad collapses there.
    const strip = (lower, upper, rLower, rUpper) => {
      for (let s = 0; s < segments; s++) {
        const a = lower[s], b = upper[s], c = upper[s + 1], d = lower[s + 1];
        // Sphere poles come out as r ~ 6e-17 from cos(±π/2), hence the tolerance.
        if (Math.abs(rUpper) > 1e-9) this.tri(a, b, c);
        if (Math.abs(rLower) > 1e-9) this.tri(a, c, d);
      }
    };
    if (smooth) {
      const rows = profile.map(([r, y], i) => {
        const prev = ringNormals[i - 1] || ringNormals[i];
        const next = ringNormals[i] || ringNormals[i - 1];
        const n = normalize([prev[0] + next[0], prev[1] + next[1], 0]);
        return ring(r, y, n[0], n[1]);
      });
      for (let i = 0; i + 1 < rows.length; i++) strip(rows[i], rows[i + 1], profile[i][0], profile[i + 1][0]);
    } else {
      for (let i = 0; i + 1 < profile.length; i++) {
        const [nr, ny] = ringNormals[i];
        const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
        strip(ring(r0, y0, nr, ny), ring(r1, y1, nr, ny), r0, r1);
      }
    }
    return this;
  }

  /** Closed cylinder or frustum standing on y0. */
  cylinder(r0, r1, y0, y1, segments = 12) {
    return this.lathe([[0, y0], [r0, y0], [r1, y1], [0, y1]], segments);
  }

  /** Tapered cylinder between two points (limbs, stems, rods). */
  limb(from, to, r0, r1 = r0, segments = 8) {
    const d = sub(to, from);
    const len = Math.hypot(d[0], d[1], d[2]);
    const y = normalize(d);
    const ref = Math.abs(y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const x = normalize(cross(y, ref));
    const z = cross(x, y);
    const m = [
      x[0], y[0] * len, z[0], from[0],
      x[1], y[1] * len, z[1], from[1],
      x[2], y[2] * len, z[2], from[2],
    ];
    // Only the local Y axis is scaled by the length, so radii stay in meters.
    return this.with(m, (b) => b.cylinder(r0, r1, 0, 1, segments));
  }

  sphere(r, segments = 12, rings = 8) {
    const profile = [];
    for (let i = 0; i <= rings; i++) {
      const a = -Math.PI / 2 + (i / rings) * Math.PI;
      profile.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return this.lathe(profile, segments, { smooth: true });
  }

  /**
   * Extrude a star-shaped 2D outline (in local XY, counter-clockwise) along Z
   * from z0 to z1. Triangulated as a fan from the outline centroid.
   */
  prism(outline, z0, z1) {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const n = outline.length;
    for (let i = 0; i < n; i++) {
      const p = outline[i], q = outline[(i + 1) % n];
      this.polygon([[cx, cy, z1], [p[0], p[1], z1], [q[0], q[1], z1]]);
      this.polygon([[cx, cy, z0], [q[0], q[1], z0], [p[0], p[1], z0]]);
      this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]);
    }
    return this;
  }

  toMesh(name, color) {
    return {
      name,
      color,
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      indices: new Uint32Array(this.indices),
    };
  }
}

/** Axis-aligned bounds of a list of meshes: {min:[x,y,z], max:[x,y,z]}. */
export function bounds(meshes) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = m.positions[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
  }
  return { min, max };
}

export function triangleCount(meshes) {
  return meshes.reduce((s, m) => s + m.indices.length / 3, 0);
}
