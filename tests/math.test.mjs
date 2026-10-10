import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookAt, multiply, mulberry32, perspective, transformPoint } from '../viewer/src/math.js';

test('lookAt + perspective project the target to the screen center', () => {
  const view = lookAt([10, 5, 20], [0, 1, 0]);
  const proj = perspective(Math.PI / 3, 16 / 9, 0.25, 2500);
  const p = transformPoint(multiply(proj, view), [0, 1, 0]);
  assert.ok(Math.abs(p[0]) < 1e-5 && Math.abs(p[1]) < 1e-5);
  assert.ok(p[2] > -1 && p[2] < 1, 'target lies between near and far planes');
});

test('points above the target project above screen center', () => {
  const vp = multiply(perspective(1, 1, 0.1, 100), lookAt([0, 0, 10], [0, 0, 0]));
  assert.ok(transformPoint(vp, [0, 1, 0])[1] > 0);
  assert.ok(transformPoint(vp, [1, 0, 0])[0] > 0, '+x is to the right when looking down -z');
});

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
