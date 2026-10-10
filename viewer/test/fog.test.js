import test from 'node:test';
import assert from 'node:assert/strict';
import { fogParams, fogFactor, FOG_DENSITY } from '../src/fog.js';

const bounds = { min: [-170, -5, -202], max: [170, 20, 270] };

test('edge fog fully hides geometry at the scene bounds', () => {
  const p = fogParams(bounds);
  for (const [x, z] of [[-170, 0], [170, 0], [0, -202], [0, 270]]) {
    assert.equal(fogFactor(p, 10, x, z), 1);
  }
});

test('the middle of the scene only gets distance fog', () => {
  const p = fogParams(bounds);
  // Far bank of the Lake seen from the plaza: ~180 m away, well inside the bounds.
  const f = fogFactor(p, 180, 0, -150);
  assert.ok(Math.abs(f - (1 - Math.exp(-FOG_DENSITY * 180))) < 1e-9);
  assert.ok(f < 0.5, `far bank stays visible, fog ${f}`);
});

test('edge fog rises smoothly over the margin', () => {
  const p = fogParams(bounds);
  assert.ok(p.margin >= 10 && p.margin <= 60);
  const inner = fogFactor(p, 0, 0, bounds.min[2] + p.margin);
  const mid = fogFactor(p, 0, 0, bounds.min[2] + p.margin / 2);
  const outer = fogFactor(p, 0, 0, bounds.min[2] + p.margin * 0.05);
  assert.equal(inner, 0);
  assert.ok(mid > 0.3 && mid < 0.7, `mid ${mid}`);
  assert.ok(outer > 0.95);
});

test('small scenes get a minimum margin, large ones a capped margin', () => {
  assert.equal(fogParams({ min: [-10, 0, -10], max: [10, 0, 10] }).margin, 10);
  assert.equal(fogParams({ min: [-5000, 0, -5000], max: [5000, 0, 5000] }).margin, 60);
});
