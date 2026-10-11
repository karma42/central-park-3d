// Renders PNG previews of the terrace + fountain meshes with a tiny CPU
// rasterizer (z-buffer, back-face culling, Lambert shading). No dependencies.
// Usage: node tools/terrace-preview.mjs [outDir]   (default docs/previews)

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { join } from 'node:path';
import { buildTerrace } from '../src/scene/terrace.js';
import { buildFountain } from '../src/scene/fountain.js';
import { triangleCount } from '../src/scene/terrace-geom.js';

import { pathToFileURL } from 'node:url';

const W = 1200, H = 750;

export const VIEWS = [
  { name: 'terrace-overview', eye: [70, 45, -75], target: [0, 2, 14], fov: 50 },
  { name: 'terrace-from-lake', eye: [0, 3, -70], target: [0, 4, 20], fov: 45 },
  { name: 'fountain-closeup', eye: [9, 6.5, 16], target: [0, 5.2, 0], fov: 45 },
  { name: 'angel-closeup', eye: [1.2, 7.4, 4.6], target: [0, 6.8, 0], fov: 40 },
  { name: 'arcade-and-stairs', eye: [-30, 4, 8], target: [0, 3, 40], fov: 55 },
  { name: 'from-upper-terrace', eye: [-18, 9, 62], target: [0, 1, 0], fov: 55 },
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

/** Render meshes from a view. cull=false draws back faces too (for checks). */
export function render(meshes, view, { width = W, height = H, cull = true } = {}) {
  return renderSized(meshes, view, width, height, cull);
}

function renderSized(meshes, view, W, H, cull) {
  const color = new Uint8Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      color[i] = 150 + 70 * t; color[i + 1] = 190 + 45 * t; color[i + 2] = 235;
    }
  }
  const fwd = norm(sub(view.target, view.eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const f = 1 / Math.tan((view.fov * Math.PI) / 360);
  const sun = norm([0.45, 0.8, 0.35]);
  const NEAR = 0.1;
  const toCamera = (p) => {
    const d = sub(p, view.eye);
    return [dot(d, right), dot(d, up), dot(d, fwd)];
  };
  const toScreen = (c) => [W / 2 + (c[0] / c[2]) * f * (H / 2), H / 2 - (c[1] / c[2]) * f * (H / 2), c[2]];
  // Clip a camera-space polygon against the near plane (Sutherland-Hodgman).
  const clipNear = (poly) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
      }
    }
    return out;
  };
  let drawn = 0;
  for (const m of meshes) {
    const P = m.positions, N = m.normals, I = m.indices;
    const alpha = m.opacity ?? 1;
    for (let t = 0; t < I.length; t += 3) {
      const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      const poly = clipNear([ia, ib, ic].map((k) => toCamera([P[k], P[k + 1], P[k + 2]])));
      if (poly.length < 3) continue;
      const n = norm([N[ia] + N[ib] + N[ic], N[ia + 1] + N[ib + 1] + N[ic + 1], N[ia + 2] + N[ib + 2] + N[ic + 2]]);
      const light = 0.42 + 0.58 * Math.max(0, dot(n, sun));
      const rgb = m.color.map((c) => Math.min(255, c * light * 255));
      const screen = poly.map(toScreen);
      for (let k = 1; k + 1 < screen.length; k++) {
        drawn += raster(screen[0], screen[k], screen[k + 1], rgb, alpha);
      }
    }
  }
  return { color, drawn };

  function raster(pa, pb, pc, rgb, alpha) {
    let drawn = 0;
    {
      const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0]);
      if (area === 0 || (cull && area > 0)) return 0; // back face (screen y points down) or degenerate
      const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
      const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((pc[0] - pb[0]) * (py - pb[1]) - (pc[1] - pb[1]) * (px - pb[0])) / area;
          const w1 = ((pa[0] - pc[0]) * (py - pc[1]) - (pa[1] - pc[1]) * (px - pc[0])) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w0 / pa[2] + w1 / pb[2] + w2 / pc[2]);
          const k = y * W + x;
          if (z >= depth[k]) continue;
          if (alpha >= 1) depth[k] = z;
          const i = k * 3;
          for (let c = 0; c < 3; c++) color[i + c] = color[i + c] * (1 - alpha) + rgb[c] * alpha;
          drawn++;
        }
      }
    }
    return drawn;
  }
}

function png(rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Terrace + fountain meshes, opaque first so translucent spray blends over them. */
export function previewMeshes() {
  return [...buildTerrace(), ...buildFountain()].sort((a, b) => (b.opacity ?? 1) - (a.opacity ?? 1));
}

function main() {
  const outDir = process.argv[2] || 'docs/previews';
  mkdirSync(outDir, { recursive: true });
  const meshes = previewMeshes();
  for (const view of VIEWS) {
    const { color } = render(meshes, view);
    writeFileSync(join(outDir, `${view.name}.png`), png(color));
    console.log(`${view.name}.png  eye=${view.eye.join(',')} target=${view.target.join(',')}`);
  }
  for (const m of meshes) console.log(`${m.name}: ${m.positions.length / 3} verts, ${m.indices.length / 3} tris`);
  console.log(`total triangles: ${triangleCount(meshes)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
