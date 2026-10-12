import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mat4Identity, mat4Perspective, mat4LookAt, mat4Multiply, transformPoint,
  directionFromYawPitch, frustumPlanes, sphereInFrustum,
} from '../src/math.js';

const near = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('identity multiply is a no-op', () => {
  const p = mat4Perspective(1, 1.5, 0.1, 100);
  const r = mat4Multiply(mat4Identity(), p);
  for (let i = 0; i < 16; i++) near(r[i], p[i]);
});

test('lookAt maps the eye to the origin and the target onto -Z', () => {
  const v = mat4LookAt([10, 5, 3], [10, 5, -7], [0, 1, 0]);
  const e = transformPoint(v, [10, 5, 3]);
  e.forEach((c) => near(c, 0));
  const t = transformPoint(v, [10, 5, -7]);
  near(t[0], 0); near(t[1], 0); near(t[2], -10);
});

test('perspective maps near/far planes to NDC -1/+1', () => {
  const p = mat4Perspective(Math.PI / 3, 1, 1, 100);
  near(transformPoint(p, [0, 0, -1])[2], -1);
  near(transformPoint(p, [0, 0, -100])[2], 1, 1e-4);
});

test('yaw 0 looks toward -Z, positive yaw turns toward -X', () => {
  const d0 = directionFromYawPitch(0, 0);
  near(d0[0], 0); near(d0[1], 0); near(d0[2], -1);
  const d1 = directionFromYawPitch(Math.PI / 2, 0);
  near(d1[0], -1); near(d1[2], 0);
  const up = directionFromYawPitch(0, Math.PI / 2);
  near(up[1], 1);
});

test('frustum culling keeps objects in front and rejects ones behind', () => {
  const vp = mat4Multiply(mat4Perspective(Math.PI / 3, 1, 0.1, 500), mat4LookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]));
  const planes = frustumPlanes(vp);
  assert.equal(sphereInFrustum(planes, [0, 0, -50], 1), true);
  assert.equal(sphereInFrustum(planes, [0, 0, 50], 1), false);
  assert.equal(sphereInFrustum(planes, [0, 0, -1000], 1), false);
  assert.equal(sphereInFrustum(planes, [200, 0, -50], 1), false);
  // a big sphere straddling the edge counts as visible
  assert.equal(sphereInFrustum(planes, [0, 0, 5], 10), true);
});
