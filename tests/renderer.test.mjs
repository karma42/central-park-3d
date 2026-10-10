// Exercises the WebGL renderer against a recording mock context. This checks
// the call flow (buffers, uniforms, draw calls), not real GPU output.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CameraController } from '../viewer/src/camera.js';
import { Renderer } from '../viewer/src/renderer.js';
import { VIEWPOINTS, buildScene } from '../viewer/src/scene.js';

function mockGl() {
  const calls = [];
  let id = 0;
  const gl = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^[A-Z_0-9]+$/.test(prop)) return prop; // GL enums
      return (...args) => {
        calls.push([prop, ...args]);
        if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return true;
        if (prop === 'getAttribLocation') return id++ % 8;
        if (prop.startsWith('create') || prop === 'getUniformLocation') return { id: id++, name: args[1] };
        return undefined;
      };
    },
  });
  return { gl, calls };
}

test('renderer uploads every component and draws all triangles', () => {
  const { gl, calls } = mockGl();
  globalThis.window = { devicePixelRatio: 1 };
  const canvas = { clientWidth: 800, clientHeight: 450, width: 0, height: 0, getContext: () => gl };
  const renderer = new Renderer(canvas);
  const scene = buildScene();
  for (const c of scene.components) renderer.upload(c);
  const drawn = renderer.render(new CameraController(VIEWPOINTS), 1.5);
  assert.equal(drawn, scene.stats.triangles);
  assert.equal(canvas.width, 800);
  const draws = calls.filter((c) => c[0] === 'drawArrays');
  assert.equal(draws.length, scene.components.length + 1, 'one sky draw plus one per component');
  const uniformNames = calls.filter((c) => c[0] === 'getUniformLocation').map((c) => c[2]);
  for (const n of ['uViewProj', 'uEye', 'uFogDensity', 'uWater']) assert.ok(uniformNames.includes(n));
  delete globalThis.window;
});

test('renderer reports a clear error without WebGL', () => {
  const canvas = { getContext: () => null };
  assert.throws(() => new Renderer(canvas), /WebGL is not available/);
});

test('all viewer and tool sources parse', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = [
    ...readdirSync(`${root}viewer/src`).map((f) => `${root}viewer/src/${f}`),
    ...readdirSync(`${root}tools`).map((f) => `${root}tools/${f}`),
  ];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
