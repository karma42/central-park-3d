// Scene audit for the integrated milestone-1 scene (needs #2, #4, #3 and #6 merged).
// For each mesh, reports triangles whose winding disagrees with the supplied vertex normals
// (WebGL back-face culling would hide them) and zero-area triangles. Also checks the spawn
// point against groundHeight/canWalk. Exits non-zero if any triangle is reversed.
// Usage: node tools/scene-audit.mjs
import { buildScene } from '../src/scene/index.js';
import { normalizeScene } from '../viewer/src/scene-data.js';

const raw = buildScene();
const scene = normalizeScene(raw);
let total = 0, totalReversed = 0, totalDegenerate = 0;
for (const m of scene.meshes) {
  const p = m.positions, n = m.normals, idx = m.indices;
  let reversed = 0, degenerate = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 1e-9) { degenerate++; continue; }
    let nx = 0, ny = 0, nz = 0;
    for (const i of [a, b, c]) { nx += n[i * 3]; ny += n[i * 3 + 1]; nz += n[i * 3 + 2]; }
    if ((fx * nx + fy * ny + fz * nz) / fl < -0.1) reversed++;
  }
  const tris = idx.length / 3;
  total += tris; totalReversed += reversed; totalDegenerate += degenerate;
  const flags = `${m.doubleSided ? '  doubleSided' : ''}${m.opacity < 1 ? `  opacity ${m.opacity}` : ''}`;
  console.log(`${m.name.padEnd(24)} tris ${String(tris).padStart(6)}  reversed ${String(reversed).padStart(5)}  degenerate ${String(degenerate).padStart(5)}${flags}`);
}
console.log(`TOTAL ${scene.meshes.length} meshes, ${total} tris, reversed ${totalReversed}, degenerate ${totalDegenerate}`);
const [sx, , sz] = raw.spawn.position;
console.log(`spawn [${raw.spawn.position}] groundHeight ${raw.groundHeight(sx, sz)} canWalk ${raw.canWalk(sx, sz)}`);
if (totalReversed > 0) process.exitCode = 1;
