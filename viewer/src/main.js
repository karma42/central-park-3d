// Browser entry point: builds the scene, wires input and runs the render loop.

import { CameraController } from './camera.js';
import { Renderer } from './renderer.js';
import { VIEWPOINTS, buildScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const loadingText = $('loading-text');

function fail(err) {
  console.error(err);
  $('loading').classList.add('error');
  loadingText.textContent = `Could not start the viewer: ${err.message}`;
}

// Let the loading message paint before the (synchronous) scene build.
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function start() {
  const canvas = $('view');
  const renderer = new Renderer(canvas);
  loadingText.textContent = 'Generating terrace, fountain, paths and trees…';
  await nextFrame();
  const t0 = performance.now();
  const scene = buildScene();
  const buildMs = performance.now() - t0;
  loadingText.textContent = 'Uploading geometry…';
  await nextFrame();
  for (const c of scene.components) renderer.upload(c);

  const params = new URLSearchParams(location.hash.slice(1));
  const initial = VIEWPOINTS[params.get('view')] ? params.get('view') : 'overview';
  const camera = new CameraController(VIEWPOINTS, 'overview');
  if (initial !== 'overview') camera.setViewpoint(initial);

  setupUi(camera);
  setupInput(canvas, camera);
  $('loading').remove();

  const status = $('status');
  let last = performance.now();
  let frames = 0, fpsTime = last, fps = 0;
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    camera.update(dt, keyInput());
    const drawn = renderer.render(camera, now / 1000);
    frames++;
    if (now - fpsTime > 500) {
      fps = Math.round((frames * 1000) / (now - fpsTime));
      frames = 0;
      fpsTime = now;
      const e = camera.eye();
      status.textContent =
        `${camera.mode === 'walk' ? 'Walk' : 'Orbit'} · ${fps} fps · ${Math.round(drawn / 1000)}k triangles · ` +
        `${scene.stats.trees} trees · built in ${Math.round(buildMs)} ms · ` +
        `camera (${e[0].toFixed(0)}, ${e[1].toFixed(1)}, ${e[2].toFixed(0)})`;
      syncUi(camera);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Small hook for manual inspection from the browser console.
  window.cp3d = { camera, renderer, scene };
}

// ------------------------------------------------------------------ UI

function setupUi(camera) {
  const select = $('viewpoint');
  for (const [key, vp] of Object.entries(VIEWPOINTS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = vp.label;
    select.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = '';
  custom.textContent = '(free camera)';
  custom.hidden = true;
  select.appendChild(custom);
  select.addEventListener('change', () => {
    if (select.value) camera.setViewpoint(select.value);
    syncUi(camera);
    $('view').focus();
  });
  $('reset').addEventListener('click', () => {
    camera.reset();
    syncUi(camera);
    $('view').focus();
  });
  $('mode').addEventListener('click', () => {
    camera.toggleMode();
    syncUi(camera);
    $('view').focus();
  });
  $('help-toggle').addEventListener('click', () => {
    $('help').hidden = !$('help').hidden;
  });
  syncUi(camera);
}

function syncUi(camera) {
  $('mode').textContent = `Mode: ${camera.mode === 'walk' ? 'Walk' : 'Orbit'}`;
  $('viewpoint').value = camera.viewpoint || '';
  $('touch-pad').hidden = !(camera.mode === 'walk' && matchMedia('(pointer: coarse)').matches);
}

// ------------------------------------------------------------------ input

const keys = new Set();
const touchMove = { forward: 0 };

function keyInput() {
  const k = (...codes) => codes.some((c) => keys.has(c));
  return {
    forward: (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0) + touchMove.forward,
    right: (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0),
    turn: (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0),
    up: (k('PageUp', 'Equal') ? 1 : 0) - (k('PageDown', 'Minus') ? 1 : 0),
    run: k('ShiftLeft', 'ShiftRight'),
  };
}

function setupInput(canvas, camera) {
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLSelectElement) return;
    if (e.code === 'KeyM') camera.toggleMode();
    else if (e.code === 'KeyR') camera.reset();
    else if (e.code === 'KeyH') $('help').hidden = !$('help').hidden;
    else if (/^Digit[1-6]$/.test(e.code)) camera.setViewpoint(Object.keys(VIEWPOINTS)[Number(e.code.slice(5)) - 1]);
    else {
      keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    syncUi(camera);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  const pointers = new Map();
  let pinchDist = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
    if (pointers.size === 2) pinchDist = pinchDistance(pointers);
    canvas.focus();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const d = pinchDistance(pointers);
      camera.zoom((pinchDist - d) * 4);
      pinchDist = d;
    } else if (p.button === 2 || p.shift || e.shiftKey) {
      camera.pan(dx, dy);
    } else {
      camera.rotate(dx, dy);
    }
  });
  const end = (e) => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom(e.deltaY * (e.deltaMode === 1 ? 30 : 1));
  }, { passive: false });

  for (const btn of document.querySelectorAll('#touch-pad button')) {
    const dir = btn.dataset.move === 'forward' ? 1 : -1;
    btn.addEventListener('pointerdown', () => { touchMove.forward = dir; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, () => { touchMove.forward = 0; });
    }
  }
}

function pinchDistance(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

start().catch(fail);
