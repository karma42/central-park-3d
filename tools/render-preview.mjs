// Offline preview renderer: rasterizes the same scene data and camera presets
// the browser viewer uses, writing PNG images without a browser or GPU.
// Lighting approximates the WebGL shader (per-vertex, no water ripples).
//
// Usage: node tools/render-preview.mjs [--out docs/images] [--width 1280] [--height 720] [--view name]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { CameraController } from '../viewer/src/camera.js';
import { dot, multiply, normalize, perspective } from '../viewer/src/math.js';
import {
  AMBIENT_GROUND,
  AMBIENT_SKY,
  FOG_COLOR,
  FOG_DISTANCE,
  FOV_Y,
  LAMPLIT_EMISSIVE,
  SKY_TOP,
  SUN_DIR,
} from '../viewer/src/renderer.js';
import { VIEWPOINTS, buildScene } from '../viewer/src/scene.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outDir = arg('out', 'docs/images');
const width = Number(arg('width', 1280));
const height = Number(arg('height', 720));
const only = arg('view', null);
const SS = 2; // supersampling factor

function shadeVertex(p, n, c, eye, water, emissive) {
  const v = normalize([eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]]);
  if (dot(n, v) < 0) n = [-n[0], -n[1], -n[2]];
  const sun = Math.max(dot(n, SUN_DIR), 0);
  const t = n[1] * 0.5 + 0.5;
  const hemi = [0, 1, 2].map((k) => AMBIENT_GROUND[k] + (AMBIENT_SKY[k] - AMBIENT_GROUND[k]) * t);
  const sunC = [1, 0.95, 0.85];
  const lampC = [1, 0.9, 0.7];
  let out = [0, 1, 2].map((k) => c[k] * (hemi[k] * 0.62 + sunC[k] * sun * 0.72 + lampC[k] * emissive));
  if (water) {
    const fres = Math.min(0.8, Math.pow(1 - Math.max(dot(v, n), 0), 3) * 0.8);
    out = out.map((x, k) => x + (SKY_TOP[k] - x) * fres);
  }
  const dist = Math.hypot(eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]);
  const fog = Math.min(1, 1 - Math.exp(-Math.pow(dist / FOG_DISTANCE, 2)));
  return out.map((x, k) => x + (FOG_COLOR[k] - x) * fog);
}

// Clip a polygon of {clip:[x,y,z,w], col:[r,g,b]} against the near plane (z > -w).
function clipNear(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a.clip[2] + a.clip[3], db = b.clip[2] + b.clip[3];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({
        clip: a.clip.map((v, k) => v + (b.clip[k] - v) * t),
        col: a.col.map((v, k) => v + (b.col[k] - v) * t),
      });
    }
  }
  return out;
}

function render(scene, camera) {
  const W = width * SS, H = height * SS;
  const color = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  const proj = perspective(FOV_Y, width / height, 0.25, 2500);
  const vp = multiply(proj, camera.viewMatrix());
  const eye = camera.eye();

  // Sky gradient matching the viewer's horizon placement.
  const tgt = camera.target();
  const dir = normalize([tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]);
  const horizonY = -Math.tan(Math.asin(dir[1])) / Math.tan(FOV_Y / 2);
  for (let y = 0; y < H; y++) {
    const ndcY = 1 - (2 * (y + 0.5)) / H;
    const t = Math.sqrt(Math.min(1, Math.max(0, (ndcY - horizonY) * 1.2)));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) color[i + k] = FOG_COLOR[k] + (SKY_TOP[k] - FOG_COLOR[k]) * t;
    }
  }

  const toClip = (p) => [
    vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12],
    vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13],
    vp[2] * p[0] + vp[6] * p[1] + vp[10] * p[2] + vp[14],
    vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15],
  ];

  for (const comp of scene.components) {
    const { positions: P, normals: N, colors: C } = comp;
    const water = comp.material === 'water';
    const emissive = comp.material === 'lamplit' ? LAMPLIT_EMISSIVE : 0;
    for (let t = 0; t < comp.vertexCount; t += 3) {
      const poly = [];
      let allOut = true;
      for (let k = 0; k < 3; k++) {
        const o = (t + k) * 3;
        const p = [P[o], P[o + 1], P[o + 2]];
        const clip = toClip(p);
        if (clip[2] + clip[3] >= 0) allOut = false;
        poly.push({ p, n: [N[o], N[o + 1], N[o + 2]], c: [C[o], C[o + 1], C[o + 2]], clip });
      }
      if (allOut) continue;
      // Cheap frustum reject on x/y.
      if (poly.every((v) => v.clip[0] > v.clip[3]) || poly.every((v) => v.clip[0] < -v.clip[3])) continue;
      if (poly.every((v) => v.clip[1] > v.clip[3]) || poly.every((v) => v.clip[1] < -v.clip[3])) continue;
      for (const v of poly) v.col = shadeVertex(v.p, v.n, v.c, eye, water, emissive);
      const clipped = clipNear(poly);
      const scr = clipped.map((v) => ({
        x: ((v.clip[0] / v.clip[3]) * 0.5 + 0.5) * W,
        y: (1 - ((v.clip[1] / v.clip[3]) * 0.5 + 0.5)) * H,
        z: v.clip[2] / v.clip[3],
        col: v.col,
      }));
      for (let i = 1; i < scr.length - 1; i++) rasterize(scr[0], scr[i], scr[i + 1], W, H, color, depth);
    }
  }

  // Downsample.
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) s += color[((y * SS + sy) * W + x * SS + sx) * 3 + k];
        rgb[(y * width + x) * 3 + k] = Math.round(Math.min(1, Math.max(0, s / (SS * SS))) * 255);
      }
    }
  }
  return rgb;
}

function rasterize(a, b, c, W, H, color, depth) {
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 1e-9) return;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
      const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a.z + w1 * b.z + w2 * c.z;
      const idx = y * W + x;
      if (z >= depth[idx] || z < -1) continue;
      depth[idx] = z;
      const o = idx * 3;
      for (let k = 0; k < 3; k++) color[o + k] = w0 * a.col[k] + w1 * b.col[k] + w2 * c.col[k];
    }
  }
}

// ------------------------------------------------------------------ PNG

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ main

const scene = buildScene();
mkdirSync(outDir, { recursive: true });
for (const name of Object.keys(VIEWPOINTS)) {
  if (only && name !== only) continue;
  const camera = new CameraController(VIEWPOINTS, name);
  const t0 = performance.now();
  const rgb = render(scene, camera);
  const file = join(outDir, `preview-${name}.png`);
  writeFileSync(file, encodePng(rgb, width, height));
  console.log(`${file} (${Math.round(performance.now() - t0)} ms)`);
}
