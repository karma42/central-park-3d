import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { renderScene, encodePng, DEFAULT_VIEWS } from '../tools/render-preview.js';
import { normalizeScene } from '../src/scene-data.js';
import { createCamera } from '../src/camera.js';
import { applyViewParams } from '../src/view-params.js';
import { buildPlaceholderScene } from '../src/placeholder-scene.js';
import { SKY_COLOR } from '../src/renderer.js';

const sky = SKY_COLOR.map((v) => Math.round(v * 255));
const isSky = (px, i) => px[i] === sky[0] && px[i + 1] === sky[1] && px[i + 2] === sky[2];

test('every default view renders scene geometry, not just sky', () => {
  const scene = normalizeScene(buildPlaceholderScene());
  for (const [name, query] of Object.entries(DEFAULT_VIEWS)) {
    const cam = createCamera(scene);
    applyViewParams(cam, new URLSearchParams(query));
    const { pixels, triangles } = renderScene(scene, cam, 64, 36, 1);
    let covered = 0;
    for (let i = 0; i < pixels.length; i += 3) if (!isSky(pixels, i)) covered++;
    assert.ok(triangles > 0, `${name}: no triangles`);
    assert.ok(covered > 64 * 36 * 0.2, `${name}: only ${covered} pixels covered`);
  }
});

test('back faces are culled and the near plane is clipped', () => {
  // One large ground quad facing up; camera below it looking up sees nothing.
  const quad = { positions: [-50, 0, 50, 50, 0, 50, 50, 0, -50, -50, 0, -50], indices: [0, 1, 2, 0, 2, 3] };
  const scene = normalizeScene({ meshes: [quad], bounds: { min: [-50, -5, -50], max: [50, 5, 50] } });
  const cam = createCamera(scene);
  cam.mode = 'walk';
  cam.ground = () => -5;
  cam.walk.pitch = 1.2; // eye at y=-3.3 looking up at the underside
  const below = renderScene(scene, cam, 32, 18, 1).pixels;
  for (let i = 0; i < below.length; i += 3) assert.ok(isSky(below, i));
  // Standing on it looking down at the horizon: the quad passes through the near plane but still draws.
  cam.ground = () => 0;
  cam.walk.pitch = -0.6;
  const above = renderScene(scene, cam, 32, 18, 1).pixels;
  const bottomRow = (17 * 32 + 16) * 3;
  assert.ok(!isSky(above, bottomRow));
});

test('PNG encoder writes a valid header and raw scanlines', () => {
  const rgb = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30]);
  const png = encodePng(rgb, 2, 2);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 2);
  assert.equal(png.readUInt32BE(20), 2);
  const idatLen = png.readUInt32BE(33);
  assert.equal(png.toString('ascii', 37, 41), 'IDAT');
  const raw = inflateSync(png.subarray(41, 41 + idatLen));
  assert.deepEqual([...raw], [0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 10, 20, 30]);
});
