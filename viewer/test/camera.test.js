import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCamera, resetCamera, eyePosition, rotate, zoom, pan, walk, setMode, clipRange,
  EYE_HEIGHT, WALK_SPEED, ORBIT_MIN_DISTANCE, ORBIT_MAX_PITCH, WALK_PITCH_LIMIT, HOME_MAX_DISTANCE,
} from '../src/camera.js';
import { applyViewParams } from '../src/view-params.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const slope = (x, z) => 0.1 * x; // ground rises toward +X
const scene = (extra = {}) => ({
  bounds: { min: [-100, 0, -100], max: [100, 20, 100] },
  spawn: { position: [0, 0, 50], yaw: 0, pitch: 0 },
  ...extra,
});

test('orbit eye sits above the target at the configured distance', () => {
  const cam = createCamera(scene());
  assert.equal(cam.mode, 'orbit');
  const eye = eyePosition(cam);
  const t = cam.orbit.target;
  near(Math.hypot(eye[0] - t[0], eye[1] - t[1], eye[2] - t[2]), cam.orbit.distance, 1e-4);
  assert.ok(eye[1] > t[1], 'orbit camera looks down');
});

test('walk keeps the eye at EYE_HEIGHT above the ground function', () => {
  const cam = createCamera(scene({ groundHeight: slope }));
  setMode(cam, 'walk');
  walk(cam, 0, 1, 2); // strafe right toward +X for 2 s
  const eye = eyePosition(cam);
  near(eye[1], slope(eye[0], eye[2]) + EYE_HEIGHT);
  assert.ok(eye[0] > 0);
});

test('walking forward at yaw 0 moves toward -Z at WALK_SPEED', () => {
  const cam = createCamera(scene());
  cam.mode = 'walk';
  walk(cam, 1, 0, 1);
  near(cam.walk.position[0], 0);
  near(cam.walk.position[2], 50 - WALK_SPEED);
});

test('diagonal walking is not faster than straight walking', () => {
  const cam = createCamera(scene());
  cam.mode = 'walk';
  walk(cam, 1, 1, 1);
  const moved = Math.hypot(cam.walk.position[0], cam.walk.position[2] - 50);
  near(moved, WALK_SPEED, 1e-6);
});

test('walk and pan are clamped to scene bounds', () => {
  const cam = createCamera(scene());
  cam.mode = 'walk';
  walk(cam, 1, 0, 1000);
  near(cam.walk.position[2], -100);
  pan(cam, 1e6, 1e6);
  assert.ok(cam.orbit.target[0] <= 100 && cam.orbit.target[0] >= -100);
  assert.ok(cam.orbit.target[2] <= 100 && cam.orbit.target[2] >= -100);
});

test('canWalk blocks movement and slides along the walkable axis', () => {
  const lakeNorthOf = -10; // z < -10 is water
  const cam = createCamera(scene({ canWalk: (x, z) => z >= lakeNorthOf, spawn: { position: [0, 0, -9], yaw: 0, pitch: 0 } }));
  cam.mode = 'walk';
  walk(cam, 1, 0, 2); // straight into the water: walks up to the shore and stops there
  const shoreZ = cam.walk.position[2];
  assert.ok(shoreZ >= lakeNorthOf && shoreZ < lakeNorthOf + 0.5, `stopped at z=${shoreZ}`);
  cam.walk.yaw = Math.PI / 4; // diagonal toward -X and -Z: slides along the shore
  walk(cam, 1, 0, 1);
  near(cam.walk.position[2], shoreZ);
  assert.ok(cam.walk.position[0] < -2);
});

test('home orbit view focuses the spawn area at a bounded distance, or scene.view', () => {
  const big = { bounds: { min: [-1000, 0, -1000], max: [1000, 20, 1000] }, spawn: { position: [4, 0, 28] } };
  const cam = createCamera(big);
  assert.deepEqual(cam.orbit.target, [4, 0, 28]);
  near(cam.orbit.distance, HOME_MAX_DISTANCE);
  const custom = createCamera({ ...big, view: { target: [0, 0, 10], distance: 120, yaw: 0.2, pitch: -0.4 } });
  assert.deepEqual(custom.orbit.target, [0, 0, 10]);
  near(custom.orbit.distance, 120);
  near(custom.orbit.yaw, 0.2);
});

test('clip range keeps the scene inside the far plane with a tight near plane', () => {
  const cam = createCamera(scene());
  zoom(cam, 1e6); // furthest orbit
  let { near: n, far } = clipRange(cam);
  const eye = eyePosition(cam);
  for (const corner of [[-100, 0, -100], [100, 20, 100], [-100, 20, 100], [100, 0, -100]]) {
    assert.ok(Math.hypot(...corner.map((v, i) => v - eye[i])) < far, 'scene corner within far plane');
  }
  assert.ok(far / n < 5000, `depth ratio ${far / n}`);
  setMode(cam, 'walk');
  ({ near: n, far } = clipRange(cam));
  assert.ok(n >= 0.2 && n <= 0.3);
  assert.ok(far > cam.diagonal, 'walker sees across the whole scene');
});

test('a long walk step cannot tunnel across a thin unwalkable strip', () => {
  const cam = createCamera(scene({ canWalk: (x, z) => z > -12 || z < -14, spawn: { position: [0, 0, 0], yaw: 0, pitch: 0 } }));
  cam.mode = 'walk';
  walk(cam, 1, 0, 10); // 40 m in one call
  assert.ok(cam.walk.position[2] > -12, `crossed the strip: z=${cam.walk.position[2]}`);
});

test('zoom and pitch limits hold', () => {
  const cam = createCamera(scene());
  zoom(cam, 1e-6);
  near(cam.orbit.distance, ORBIT_MIN_DISTANCE);
  zoom(cam, 1e6);
  near(cam.orbit.distance, cam.orbit.maxDistance);
  rotate(cam, 0, 10);
  near(cam.orbit.pitch, ORBIT_MAX_PITCH);
  setMode(cam, 'walk');
  rotate(cam, 0, -10);
  near(cam.walk.pitch, -WALK_PITCH_LIMIT);
});

test('reset restores the home view and keeps the mode', () => {
  const cam = createCamera(scene());
  const home = eyePosition(cam);
  rotate(cam, 1, -0.3);
  zoom(cam, 0.3);
  pan(cam, 10, 10);
  resetCamera(cam);
  eyePosition(cam).forEach((v, i) => near(v, home[i]));
  setMode(cam, 'walk');
  walk(cam, 1, 0, 3);
  resetCamera(cam);
  assert.equal(cam.mode, 'walk');
  assert.deepEqual(cam.walk.position, [0, 0, 50]);
  // reset must not alias the home state
  walk(cam, 1, 0, 1);
  assert.deepEqual(cam.home.walk.position, [0, 0, 50]);
});

test('switching modes carries the viewpoint across', () => {
  const cam = createCamera(scene());
  pan(cam, 0, 30);
  const t = [...cam.orbit.target];
  setMode(cam, 'walk');
  near(cam.walk.position[0], t[0]);
  near(cam.walk.position[2], t[2]);
  setMode(cam, 'orbit');
  assert.equal(cam.mode, 'orbit');
  // orbit target is ahead of where the walker stood
  assert.ok(cam.orbit.target[2] < t[2]);
});

test('view params set a reproducible walk viewpoint', () => {
  const cam = createCamera(scene({ groundHeight: slope }));
  applyViewParams(cam, new URLSearchParams('mode=walk&x=10&z=-20&yaw=1.5&pitch=0.2'));
  assert.equal(cam.mode, 'walk');
  assert.deepEqual(cam.walk.position, [10, slope(10, -20), -20]);
  near(cam.walk.yaw, 1.5);
  near(cam.walk.pitch, 0.2);
});

test('view params ignore invalid values and clamp to bounds', () => {
  const cam = createCamera(scene());
  const before = cam.orbit.distance;
  applyViewParams(cam, new URLSearchParams('mode=orbit&tx=999&dist=abc'));
  near(cam.orbit.target[0], 100);
  near(cam.orbit.distance, before);
});

test('camera works without spawn or groundHeight', () => {
  const cam = createCamera({ bounds: { min: [-10, 0, -10], max: [10, 5, 10] } });
  setMode(cam, 'walk');
  walk(cam, 1, 0, 0.5);
  const eye = eyePosition(cam);
  near(eye[1], EYE_HEIGHT);
  eye.forEach((v) => assert.ok(Number.isFinite(v)));
});
