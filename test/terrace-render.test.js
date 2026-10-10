// Rendering smoke tests for the terrace and fountain, in memory only (no files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, previewMeshes, VIEWS } from '../tools/terrace-preview.mjs';

const size = { width: 300, height: 190 };
const meshes = previewMeshes();
const opaque = meshes.filter((m) => (m.opacity ?? 1) >= 1);

function differingFraction(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) diff++;
  }
  return diff / (a.length / 3);
}

function skyFraction(color) {
  let sky = 0;
  for (let i = 0; i < color.length; i += 3) if (color[i + 2] === 235 && color[i] >= 150 && color[i] < 221) sky++;
  return sky / (color.length / 3);
}

// If any visible face were wound inward, back-face culling would punch a hole
// (or reveal hidden geometry) and the two renders would differ.
for (const view of VIEWS) {
  test(`${view.name}: back-face culling does not change the image`, () => {
    const culled = render(opaque, view, { ...size, cull: true }).color;
    const both = render(opaque, view, { ...size, cull: false }).color;
    const frac = differingFraction(culled, both);
    assert.ok(frac < 0.01, `${(frac * 100).toFixed(2)}% of pixels differ`);
  });
}

test('every preview view shows geometry, not just sky', () => {
  for (const view of VIEWS) {
    const { color } = render(meshes, view, size);
    const sky = skyFraction(color);
    assert.ok(sky < 0.85, `${view.name}: ${(sky * 100).toFixed(0)}% sky`);
  }
});

test('angel close-up shows bronze at the image centre', () => {
  const view = VIEWS.find((v) => v.name === 'angel-closeup');
  const bronze = meshes.filter((m) => m.name === 'fountain-bronze');
  const { color } = render(bronze, view, size);
  let hits = 0;
  const cx = size.width / 2, cy = size.height / 2;
  for (let y = cy - 20; y < cy + 20; y++) {
    for (let x = cx - 20; x < cx + 20; x++) {
      const i = (y * size.width + x) * 3;
      if (color[i + 2] !== 235) hits++;
    }
  }
  assert.ok(hits > 400, `bronze pixels near centre: ${hits}`);
});
