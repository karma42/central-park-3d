import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CameraController, EYE_HEIGHT, MAX_STEP } from '../viewer/src/camera.js';
import { VIEWPOINTS } from '../viewer/src/scene.js';
import { BLOCKED, SITE } from '../viewer/src/site.js';

const walkTo = (cam, frames, input, dt = 1 / 60) => {
  const trace = [];
  for (let i = 0; i < frames; i++) {
    cam.update(dt, input);
    trace.push(cam.walk.feet);
  }
  return trace;
};

test('every viewpoint is valid and walk viewpoints stand on a surface', () => {
  for (const name of Object.keys(VIEWPOINTS)) {
    const cam = new CameraController(VIEWPOINTS, name);
    for (const v of cam.eye()) assert.ok(Number.isFinite(v));
    if (cam.mode === 'walk') {
      assert.ok(cam.walk.feet < BLOCKED, `${name} is inside a blocked area`);
      assert.ok(Math.abs(cam.eye()[1] - cam.walk.feet - EYE_HEIGHT) < 1e-9);
    }
  }
  assert.equal(new CameraController(VIEWPOINTS, 'arcade').walk.feet, 0, 'arcade viewpoint is on the arcade floor');
  assert.equal(new CameraController(VIEWPOINTS, 'terrace').walk.feet, SITE.upperY, 'overlook is on the upper terrace');
});

test('reset returns to the overview after navigating', () => {
  const cam = new CameraController(VIEWPOINTS);
  const start = cam.eye();
  cam.rotate(200, -50);
  cam.pan(30, 10);
  cam.zoom(500);
  cam.toggleMode();
  cam.update(0.5, { forward: 1 });
  assert.notDeepEqual(cam.eye(), start);
  cam.reset();
  assert.equal(cam.mode, 'orbit');
  assert.equal(cam.viewpoint, 'overview');
  assert.deepEqual(cam.eye(), start);
});

test('walking down a grand staircase descends smoothly to the plaza', () => {
  const cam = new CameraController(VIEWPOINTS, 'terrace');
  const st = SITE.grandStairs[1];
  Object.assign(cam.walk, { x: (st.xMin + st.xMax) / 2, z: st.zTop + 1.5, feet: SITE.upperY, yaw: 0 });
  const trace = walkTo(cam, 400, { forward: 1 });
  assert.equal(cam.walk.feet, 0, 'arrived on the plaza');
  for (let i = 1; i < trace.length; i++) assert.ok(trace[i - 1] - trace[i] <= MAX_STEP + 1e-9, 'no drops');
  assert.ok(cam.walk.z < st.zBottom);
});

test('walking through the arcade and up the central stairs reaches the Mall', () => {
  const cam = new CameraController(VIEWPOINTS, 'fountain');
  Object.assign(cam.walk, { x: 0, z: 20, feet: 0, yaw: Math.PI });
  walkTo(cam, 60 * 15, { forward: 1 });
  assert.ok(cam.walk.z > SITE.centralStairs.zTop, `stopped at z=${cam.walk.z}`);
  assert.equal(cam.walk.feet, SITE.upperY);
});

test('the terrace wall and the fountain pool block a walker', () => {
  const cam = new CameraController(VIEWPOINTS, 'fountain');
  Object.assign(cam.walk, { x: 45, z: 30, feet: 0, yaw: Math.PI }); // facing the wall, away from stairs
  walkTo(cam, 120, { forward: 1 });
  assert.ok(cam.walk.z <= SITE.wall.z, 'did not climb the wall');
  assert.equal(cam.walk.feet, 0);

  Object.assign(cam.walk, { x: 0, z: 20, feet: 0, yaw: 0 }); // facing the fountain
  walkTo(cam, 300, { forward: 1 });
  assert.ok(Math.hypot(cam.walk.x, cam.walk.z) >= SITE.fountain.poolRadius, 'stayed out of the pool');
});

test('stepping off the terrace edge falls under gravity to the plaza', () => {
  const cam = new CameraController(VIEWPOINTS, 'terrace');
  Object.assign(cam.walk, { x: 45, z: 34.5, feet: SITE.upperY, yaw: 0 });
  walkTo(cam, 120, { forward: 1 });
  assert.equal(cam.walk.feet, 0);
});

test('orbit controls clamp pitch and distance', () => {
  const cam = new CameraController(VIEWPOINTS);
  cam.rotate(0, 10000);
  assert.ok(cam.orbit.pitch <= 1.5);
  cam.rotate(0, -10000);
  assert.ok(cam.orbit.pitch >= 0.04);
  cam.zoom(1e6);
  assert.ok(cam.orbit.distance <= 450);
  cam.zoom(-1e6);
  assert.ok(cam.orbit.distance >= 6);
});

test('mode toggle keeps the view near the same place', () => {
  const cam = new CameraController(VIEWPOINTS, 'mall');
  const before = [cam.walk.x, cam.walk.z];
  cam.toggleMode();
  assert.equal(cam.mode, 'orbit');
  cam.toggleMode();
  assert.equal(cam.mode, 'walk');
  assert.ok(Math.hypot(cam.walk.x - before[0], cam.walk.z - before[1]) < 30);
});
