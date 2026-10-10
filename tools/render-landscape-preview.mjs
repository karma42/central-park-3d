// Renders preview PNGs of the landscape scene data with a tiny software
// rasterizer (no dependencies) and prints scene statistics.
// Usage: node tools/render-landscape-preview.mjs [outDir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildLandscape } from '../src/landscape/index.js';

const outDir = process.argv[2] || 'docs/evidence';
const scene = buildLandscape();

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((c) => c / l);
};
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// project(p) -> [sx, sy, depth] or null when behind the camera.
function render(width, height, project, sky) {
  const rgb = Buffer.alloc(width * height * 3);
  const depth = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < width * height; i++) {
    const t = Math.floor(i / width) / height;
    rgb[i * 3] = sky[0] * (1 - t * 0.3);
    rgb[i * 3 + 1] = sky[1] * (1 - t * 0.3);
    rgb[i * 3 + 2] = sky[2];
  }
  const light = norm([0.4, 0.8, 0.35]);
  for (const mesh of scene.meshes) {
    const P = mesh.positions;
    const C = mesh.colors;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ids = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
      const w = ids.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
      const s = w.map(project);
      if (s.some((v) => !v)) continue;
      const n = norm(crossV([w[1][0] - w[0][0], w[1][1] - w[0][1], w[1][2] - w[0][2]], [w[2][0] - w[0][0], w[2][1] - w[0][1], w[2][2] - w[0][2]]));
      const shade = 0.45 + 0.55 * Math.max(0, Math.abs(dot(n, light)));
      const spec = mesh.material === 'water' ? 1.15 : 1;
      const col = [0, 1, 2].map((k) => Math.min(255, ((C[ids[0] * 3 + k] + C[ids[1] * 3 + k] + C[ids[2] * 3 + k]) / 3) * 255 * shade * spec));
      const [a, b, c] = s;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-9) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
          const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const d = w0 * a[2] + w1 * b[2] + w2 * c[2];
          const idx = y * width + x;
          if (d >= depth[idx]) continue;
          depth[idx] = d;
          rgb[idx * 3] = col[0];
          rgb[idx * 3 + 1] = col[1];
          rgb[idx * 3 + 2] = col[2];
        }
      }
    }
  }
  return rgb;
}

function topDown(width, height) {
  const { bounds } = scene.layout;
  const sx = width / (bounds.maxX - bounds.minX);
  const sz = height / (bounds.maxZ - bounds.minZ);
  // North (-Z, the Lake) at the top of the image.
  return render(width, height, ([x, y, z]) => [(x - bounds.minX) * sx, (z - bounds.minZ) * sz, -y], [200, 200, 200]);
}

function perspective(width, height, eye, target, fovDeg) {
  const f = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const r = norm(crossV(f, [0, 1, 0]));
  const u = crossV(r, f);
  const k = height / 2 / Math.tan((fovDeg * Math.PI) / 360);
  return render(
    width,
    height,
    (p) => {
      const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]];
      const zc = dot(d, f);
      if (zc < 0.5) return null;
      return [width / 2 + (dot(d, r) / zc) * k, height / 2 - (dot(d, u) / zc) * k, zc];
    },
    [150, 190, 230],
  );
}

mkdirSync(outDir, { recursive: true });
const views = [
  ['landscape-top.png', 680, 840, () => topDown(680, 840)],
  // From above the Lake looking park-south at the lower terrace and Mall.
  ['landscape-from-lake.png', 960, 540, () => perspective(960, 540, [0, 38, -150], [0, 2, 20], 55)],
  // Eye level on the Mall walk looking north under the elms toward the terrace.
  ['landscape-mall.png', 960, 540, () => perspective(960, 540, [0, 7.2, 200], [0, 6.5, 60], 60)],
];
for (const [name, w, h, draw] of views) {
  writeFileSync(`${outDir}/${name}`, png(w, h, draw()));
  console.log(`wrote ${outDir}/${name}`);
}
console.log(JSON.stringify(scene.stats, null, 2));
