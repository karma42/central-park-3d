// Boots viewer/src/main.js against stub DOM + mock WebGL objects to catch
// wiring errors (UI controls, keyboard shortcuts, render loop) without a
// browser. Real rendering is not verified here.

import assert from 'node:assert/strict';
import { test } from 'node:test';

function element(id) {
  const listeners = {};
  return {
    id,
    hidden: id === 'help' || id === 'touch-pad',
    textContent: '',
    value: '',
    children: [],
    dataset: {},
    style: {},
    classList: { add() {}, remove() {} },
    clientWidth: 640,
    clientHeight: 360,
    width: 0,
    height: 0,
    listeners,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    appendChild(c) { this.children.push(c); },
    remove() { this.removed = true; },
    focus() {},
    setPointerCapture() {},
    fire(type, ev = {}) { for (const fn of listeners[type] || []) fn(ev); },
  };
}

function mockGl() {
  let id = 0;
  return new Proxy({}, {
    get(_, prop) {
      if (typeof prop === 'string' && /^[A-Z_0-9]+$/.test(prop)) return prop;
      return (...args) => {
        if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return true;
        if (prop === 'getAttribLocation') return id++ % 8;
        if (prop.startsWith('create') || prop === 'getUniformLocation') return { id: id++, args };
        return undefined;
      };
    },
  });
}

test('main.js boots, renders frames and responds to controls', async () => {
  const els = {};
  const get = (id) => (els[id] ||= element(id));
  const canvas = get('view');
  canvas.getContext = () => mockGl();
  const windowListeners = {};
  const frames = [];
  let now = 0;

  globalThis.document = {
    getElementById: get,
    createElement: () => element('option'),
    querySelectorAll: () => [get('pad-forward'), get('pad-back')],
  };
  globalThis.window = {
    devicePixelRatio: 1,
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); },
  };
  globalThis.HTMLSelectElement = class {};
  globalThis.location = { hash: '#view=fountain' };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  const realConsoleError = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a);

  try {
    await import(`../viewer/src/main.js?boot=${Date.now()}`);
    // Drain the async start(): loading frames, then a few render-loop frames.
    for (let i = 0; i < 12 && (frames.length || !globalThis.window.cp3d); i++) {
      await new Promise((r) => setTimeout(r, 20));
      const pending = frames.splice(0);
      for (const fn of pending) fn((now += 300));
    }
    assert.deepEqual(errors, []);
    assert.ok(globalThis.window.cp3d, 'viewer exposed its debug hook');
    const { camera } = globalThis.window.cp3d;
    assert.ok(get('loading').removed, 'loading overlay removed');
    assert.equal(camera.viewpoint === null || camera.viewpoint === 'fountain', true, 'hash viewpoint honored');
    assert.equal(camera.mode, 'walk');
    assert.match(get('status').textContent, /fps/);
    assert.equal(get('viewpoint').children.length, 7, 'six viewpoints plus "free camera"');

    get('reset').fire('click');
    assert.equal(camera.viewpoint, 'overview');
    assert.equal(get('mode').textContent, 'Mode: Orbit');

    get('mode').fire('click');
    assert.equal(camera.mode, 'walk');
    assert.equal(get('mode').textContent, 'Mode: Walk');

    const key = (type, code) => windowListeners[type].forEach((fn) => fn({ code, target: {}, preventDefault() {} }));
    key('keydown', 'Digit5');
    assert.equal(camera.viewpoint, 'mall');
    const z0 = camera.walk.z;
    key('keydown', 'KeyW');
    for (const fn of frames.splice(0)) fn((now += 500));
    key('keyup', 'KeyW');
    assert.ok(camera.walk.z < z0, 'W walks park-north toward the terrace');
    key('keydown', 'KeyR');
    assert.equal(camera.viewpoint, 'overview');

    canvas.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
    canvas.fire('pointermove', { pointerId: 1, clientX: 160, clientY: 100 });
    canvas.fire('pointerup', { pointerId: 1 });
    assert.equal(camera.viewpoint, null, 'dragging leaves the preset');
    const d = camera.orbit.distance;
    canvas.fire('wheel', { deltaY: 200, deltaMode: 0, preventDefault() {} });
    assert.ok(camera.orbit.distance > d, 'wheel zooms out');
  } finally {
    console.error = realConsoleError;
    for (const k of ['document', 'window', 'HTMLSelectElement', 'location', 'matchMedia', 'requestAnimationFrame']) delete globalThis[k];
  }
});
