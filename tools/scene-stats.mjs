// Prints scene statistics (component triangle counts, tree counts, sizes).
// Usage: node tools/scene-stats.mjs [--json]

import { buildScene } from '../viewer/src/scene.js';

const t0 = performance.now();
const scene = buildScene();
const ms = performance.now() - t0;
const bytes = scene.components.reduce((s, c) => s + c.positions.byteLength + c.normals.byteLength + c.colors.byteLength, 0);
const report = { ...scene.stats, buildMs: Math.round(ms), gpuBytes: bytes };

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Component            Material   Triangles');
  for (const c of report.components) {
    console.log(`${c.name.padEnd(20)} ${c.material.padEnd(10)} ${String(c.triangles).padStart(9)}`);
  }
  console.log(`${'total'.padEnd(31)} ${String(report.triangles).padStart(9)}`);
  console.log(`trees: ${report.trees} (of which Mall elms: ${report.elms})`);
  console.log(`vertex data: ${(bytes / 1048576).toFixed(1)} MiB, built in ${report.buildMs} ms (Node)`);
}
