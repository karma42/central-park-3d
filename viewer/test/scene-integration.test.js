// Runs the real scene modules (when present in the checkout) through the viewer pipeline:
// normalization, camera/ground wiring, preview rendering of every default viewpoint.
// Skips cleanly while the scene modules have not been merged yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeScene, sceneStats } from '../src/scene-data.js';
import { createCamera, eyePosition, setMode, walk } from '../src/camera.js';
// Every walk() below is subject to MAX_STEP_HEIGHT, so these checks also cover wall blocking.
import { applyViewParams } from '../src/view-params.js';
import { renderScene, DEFAULT_VIEWS } from '../tools/render-preview.js';
import { SKY_COLOR } from '../src/renderer.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const has = (p) => existsSync(root + p);
const load = (p) => import(pathToFileURL(root + p).href);

async function buildRealScene() {
  if (has('src/scene/index.js')) return (await load('src/scene/index.js')).buildScene();
  if (!has('src/scene/terrace.js') || !has('src/scene/fountain.js') || !has('src/landscape/index.js')) return null;
  // Same wiring proposed for src/scene/index.js until the aggregator lands.
  const { buildTerrace, terraceHeightAt } = await load('src/scene/terrace.js');
  const { buildFountain } = await load('src/scene/fountain.js');
  const landscape = (await load('src/landscape/index.js')).buildLandscape();
  const asList = (r) => (Array.isArray(r) ? r : r.meshes);
  return {
    meshes: [...asList(buildTerrace()), ...asList(buildFountain()), ...landscape.meshes],
    groundHeight: (x, z) => terraceHeightAt(x, z) ?? landscape.walkHeightAt(x, z),
    canWalk: (x, z) => !landscape.isInLake(x, z),
    spawn: { position: [4, 0, 28], yaw: 0, pitch: 0 },
  };
}

const raw = await buildRealScene();
const skip = raw ? false : 'scene modules not present in this checkout';

test('real scene normalizes within a practical browser budget', { skip }, (t) => {
  const t0 = performance.now();
  const scene = normalizeScene(raw);
  const st = sceneStats(scene);
  t.diagnostic(`meshes ${st.meshes}, vertices ${st.vertices}, triangles ${st.triangles}, ` +
    `GPU ${(st.gpuBytes / 1048576).toFixed(2)} MB, normalize ${Math.round(performance.now() - t0)} ms`);
  assert.ok(st.triangles > 1000, 'scene has geometry');
  assert.ok(st.triangles < 500_000, `triangle budget: ${st.triangles}`);
  assert.ok(st.gpuBytes < 64 * 1048576, `GPU buffers: ${st.gpuBytes}`);
  assert.ok(st.meshes < 200, `draw calls: ${st.meshes}`);
  const { min, max } = scene.bounds;
  assert.ok(min[2] < -42 && max[2] > 64, 'bounds span Lake edge to Mall entry');
});

test('walk mode stands on the plaza, deck and upper terrace, not in the Lake', { skip }, () => {
  const scene = normalizeScene(raw);
  const cam = createCamera(scene);
  setMode(cam, 'walk');
  const at = (x, z) => {
    applyViewParams(cam, new URLSearchParams(`mode=walk&x=${x}&z=${z}`));
    return eyePosition(cam)[1] - 1.7;
  };
  assert.ok(Math.abs(at(4, 28)) < 0.5, 'plaza near y=0');
  assert.ok(Math.abs(at(20, 58) - 5.5) < 0.5, `upper terrace near y=5.5, got ${at(20, 58)}`);
  assert.ok(Math.abs(at(-30, 43) - 5.5) < 0.5, `Terrace Drive deck near y=5.5, got ${at(-30, 43)}`);
  // Walking north from the plaza must stop before open water.
  applyViewParams(cam, new URLSearchParams('mode=walk&x=20&z=-30&yaw=0'));
  walk(cam, 1, 0, 30);
  assert.ok(scene.canWalk(cam.walk.position[0], cam.walk.position[2]));
  assert.ok(cam.walk.position[2] > -60, `walker stopped at z=${cam.walk.position[2]}`);
});

test('the arcade wall blocks the walker; the grand stairs lead up to the deck', { skip }, () => {
  const scene = normalizeScene(raw);
  const cam = createCamera(scene);
  // East of the stairs (x=40), walking south into the facade at z=36: stays on the plaza.
  applyViewParams(cam, new URLSearchParams(`mode=walk&x=40&z=30&yaw=${Math.PI}`));
  walk(cam, 1, 0, 5);
  assert.ok(cam.walk.position[2] < 36.5, `walked into the facade to z=${cam.walk.position[2]}`);
  assert.ok(Math.abs(cam.walk.position[1]) < 0.5);
  // Up the east grand stair (x 16..28, z 24..36) at a frame-sized pace.
  applyViewParams(cam, new URLSearchParams(`mode=walk&x=22&z=20&yaw=${Math.PI}`));
  for (let i = 0; i < 60 * 8; i++) walk(cam, 1, 0, 1 / 60);
  assert.ok(Math.abs(cam.walk.position[1] - 5.5) < 0.5, `stair top at y=${cam.walk.position[1]}, z=${cam.walk.position[2]}`);
});

test('the fountain basin stops a walker heading north from spawn', { skip }, () => {
  const scene = normalizeScene(raw);
  const cam = createCamera(scene);
  // Spawn [4,0,28] facing -Z: straight at the 29 m pool (rim radius ~14.75 m around the origin).
  applyViewParams(cam, new URLSearchParams('mode=walk&x=4&z=28&yaw=0'));
  for (let i = 0; i < 60 * 10; i++) walk(cam, 1, 0, 1 / 60);
  const [x, y, z] = cam.walk.position;
  assert.ok(Math.hypot(x, z) > 14, `walked into the fountain to (${x.toFixed(2)}, ${z.toFixed(2)})`);
  assert.ok(Math.abs(y) < 0.5, `left the plaza level: y=${y}`);
});

test('every default viewpoint shows scene geometry', { skip }, () => {
  const scene = normalizeScene(raw);
  const sky = SKY_COLOR.map((v) => Math.round(v * 255));
  for (const [name, query] of Object.entries(DEFAULT_VIEWS)) {
    const cam = createCamera(scene);
    applyViewParams(cam, new URLSearchParams(query));
    const { pixels } = renderScene(scene, cam, 96, 54, 1);
    let covered = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      if (pixels[i] !== sky[0] || pixels[i + 1] !== sky[1] || pixels[i + 2] !== sky[2]) covered++;
    }
    assert.ok(covered > 96 * 54 * 0.3, `${name}: only ${covered} of ${96 * 54} pixels covered`);
  }
});
