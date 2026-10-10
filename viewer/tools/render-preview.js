#!/usr/bin/env node
// Headless preview renderer: rasterizes the same scene data and camera code the browser viewer
// uses, on the CPU, and writes PNGs. No dependencies, no GPU or browser needed.
//
//   node viewer/tools/render-preview.js [--scene placeholder|<module path>] [--out dir]
//        [--width 1280] [--height 720] [--view name=querystring ...]
//
// Each view is the same query string the browser accepts, e.g. "mode=walk&x=0&z=30&yaw=0",
// so a preview can be reproduced at viewer/index.html?<querystring>.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { normalizeScene, sceneStats, meshBoundingSphere } from '../src/scene-data.js';
import { createCamera, eyePosition, viewMatrix } from '../src/camera.js';
import { applyViewParams } from '../src/view-params.js';
import { mat4Multiply, mat4Perspective } from '../src/math.js';
import { SKY_COLOR, sortFarToNear } from '../src/renderer.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

// Viewpoints follow the agreed layout (TERRACE_LAYOUT): fountain pool r≈14.75 at the origin,
// plaza z[-42,36] at y=0, arcade wall z=36, Terrace Drive deck z[36,50] and upper terrace
// z[50,64] at y=5.5, Lake beyond z=-42, Mall south of z=64.
export const DEFAULT_VIEWS = {
  'overview-orbit': 'mode=orbit',
  'fountain-orbit': 'mode=orbit&tx=0&tz=0&dist=90&yaw=0.5&pitch=-0.45',
  'walk-plaza-to-lake': 'mode=walk&x=4&z=28&yaw=0&pitch=0.02',
  'walk-plaza-to-arcade': 'mode=walk&x=-6&z=-36&yaw=3.14159&pitch=0.1',
  'walk-upper-terrace': 'mode=walk&x=0&z=60&yaw=0&pitch=-0.12',
};

// ---- shading, kept in step with the fragment shader in renderer.js ----
const SUN = (() => { const s = [0.45, 0.8, 0.35]; const l = Math.hypot(...s); return s.map((v) => v / l); })();
const FOG_DENSITY = 0.0025;

function shade(color, normal, dist) {
  const len = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const nx = normal[0] / len, ny = normal[1] / len, nz = normal[2] / len;
  const sun = Math.max(nx * SUN[0] + ny * SUN[1] + nz * SUN[2], 0);
  const sky = 0.5 + 0.5 * ny;
  const amb = [0.32 + (0.55 - 0.32) * sky, 0.30 + (0.60 - 0.30) * sky, 0.26 + (0.70 - 0.26) * sky];
  const sunC = [0.75, 0.72, 0.62];
  const fog = Math.min(Math.max(1 - Math.exp(-FOG_DENSITY * dist), 0), 1);
  return [0, 1, 2].map((k) => {
    const c = color[k] * (amb[k] + sunC[k] * sun);
    return c + (SKY_COLOR[k] - c) * fog;
  });
}

// ---- rasterizer ----
export function renderScene(scene, cam, width, height, ss = 2) {
  const W = width * ss, H = height * ss;
  const color = new Float32Array(W * H * 3);
  const depth = new Float32Array(W * H).fill(Infinity);
  for (let i = 0; i < W * H; i++) color.set(SKY_COLOR, i * 3);

  const near = cam.mode === 'walk' ? 0.1 : 0.5;
  const proj = mat4Perspective((60 * Math.PI) / 180, width / height, near, 3000);
  const vp = mat4Multiply(proj, viewMatrix(cam));
  const eye = eyePosition(cam);
  let triangles = 0;

  const withSpheres = scene.meshes.map((m) => ({ m, sphere: meshBoundingSphere(m.positions) }));
  const ordered = [
    ...withSpheres.filter((e) => e.m.opacity === undefined || e.m.opacity >= 1),
    ...sortFarToNear(withSpheres.filter((e) => e.m.opacity < 1), eye),
  ].map((e) => e.m);

  for (const m of ordered) {
    const opacity = m.opacity ?? 1;
    const n = m.positions.length / 3;
    const clip = new Float32Array(n * 4);
    const lit = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
      for (let r = 0; r < 4; r++) clip[i * 4 + r] = vp[r] * x + vp[4 + r] * y + vp[8 + r] * z + vp[12 + r];
      const dist = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
      lit.set(shade(m.colors.subarray(i * 3, i * 3 + 3), m.normals.subarray(i * 3, i * 3 + 3), dist), i * 3);
    }
    const vert = (i) => ({
      c: [clip[i * 4], clip[i * 4 + 1], clip[i * 4 + 2], clip[i * 4 + 3]],
      col: [lit[i * 3], lit[i * 3 + 1], lit[i * 3 + 2]],
    });
    for (let t = 0; t < m.indices.length; t += 3) {
      const poly = clipNear([vert(m.indices[t]), vert(m.indices[t + 1]), vert(m.indices[t + 2])]);
      if (poly.length < 3) continue;
      const s = poly.map((v) => ({
        x: (v.c[0] / v.c[3] * 0.5 + 0.5) * W,
        y: (1 - (v.c[1] / v.c[3] * 0.5 + 0.5)) * H,
        z: v.c[2] / v.c[3],
        col: v.col,
      }));
      for (let k = 1; k + 1 < s.length; k++) {
        if (drawTriangle(s[0], s[k], s[k + 1], m.doubleSided, opacity, W, H, color, depth)) triangles++;
      }
    }
  }
  return { pixels: downsample(color, W, H, ss), triangles };
}

// Clip a polygon against the near plane (z > -w in clip space).
function clipNear(poly) {
  const out = [];
  const d = (v) => v.c[2] + v.c[3];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = d(a), db = d(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({
        c: a.c.map((v, k) => v + (b.c[k] - v) * t),
        col: a.col.map((v, k) => v + (b.col[k] - v) * t),
      });
    }
  }
  return out;
}

// Opaque triangles write depth; translucent ones (opacity < 1) blend over and leave depth untouched.
function drawTriangle(a, b, c, doubleSided, opacity, W, H, color, depth) {
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (area === 0) return false;
  // Screen y points down, so counter-clockwise (front-facing) triangles have negative area.
  if (!doubleSided && area > 0) return false;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  if (minX > maxX || minY > maxY) return false;
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5;
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const w0 = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) * inv;
      const w1 = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a.z + w1 * b.z + w2 * c.z;
      if (z < -1 || z > 1) continue;
      const idx = y * W + x;
      if (z >= depth[idx]) continue;
      if (opacity >= 1) depth[idx] = z;
      for (let k = 0; k < 3; k++) {
        const src = w0 * a.col[k] + w1 * b.col[k] + w2 * c.col[k];
        color[idx * 3 + k] = opacity >= 1 ? src : src * opacity + color[idx * 3 + k] * (1 - opacity);
      }
    }
  }
  return true;
}

function downsample(color, W, H, ss) {
  const w = W / ss, h = H / ss;
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let dy = 0; dy < ss; dy++) for (let dx = 0; dx < ss; dx++) s += color[((y * ss + dy) * W + x * ss + dx) * 3 + k];
        out[(y * w + x) * 3 + k] = Math.round(Math.min(Math.max(s / (ss * ss), 0), 1) * 255);
      }
    }
  }
  return out;
}

// ---- PNG encoding (RGB, 8-bit) ----
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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
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

export function encodePng(rgb, width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- CLI ----
async function loadScene(spec) {
  if (spec === 'placeholder') {
    const { buildPlaceholderScene } = await import('../src/placeholder-scene.js');
    return { raw: buildPlaceholderScene(), source: 'placeholder' };
  }
  const candidates = spec ? [resolve(spec)] : ['src/scene/index.js', 'scene/index.js'].map((p) => join(repoRoot, p));
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href);
    return { raw: await mod.buildScene(), source: file.replace(repoRoot + '/', '') };
  }
  if (spec) throw new Error(`Scene module not found: ${spec}`);
  return loadScene('placeholder');
}

function parseArgs(argv) {
  const args = { out: join(repoRoot, 'docs/previews'), width: 1280, height: 720, views: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--scene') { args.scene = v; i++; }
    else if (a === '--out') { args.out = resolve(v); i++; }
    else if (a === '--width') { args.width = Number(v); i++; }
    else if (a === '--height') { args.height = Number(v); i++; }
    else if (a === '--view') { const [name, ...q] = v.split('='); args.views[name] = q.join('='); i++; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (Object.keys(args.views).length === 0) args.views = DEFAULT_VIEWS;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const t0 = performance.now();
  const { raw, source } = await loadScene(args.scene);
  const scene = normalizeScene(raw);
  const buildMs = Math.round(performance.now() - t0);
  const stats = sceneStats(scene);
  mkdirSync(args.out, { recursive: true });
  console.log(`scene: ${source} | meshes ${stats.meshes} | vertices ${stats.vertices} | triangles ${stats.triangles} | ` +
    `GPU buffers ${(stats.gpuBytes / 1048576).toFixed(2)} MB | build+normalize ${buildMs} ms`);
  for (const [name, query] of Object.entries(args.views)) {
    const cam = createCamera(scene);
    applyViewParams(cam, new URLSearchParams(query));
    const t = performance.now();
    const { pixels, triangles } = renderScene(scene, cam, args.width, args.height);
    const file = join(args.out, `${name}.png`);
    writeFileSync(file, encodePng(pixels, args.width, args.height));
    console.log(`${name}: ${file.replace(repoRoot + '/', '')} | viewer/index.html?${query} | ` +
      `${triangles} tris rasterized | ${Math.round(performance.now() - t)} ms`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
