// Viewer entry point: load scene, create renderer and controls, run the frame loop.
import { Renderer } from './renderer.js';
import { Controls } from './controls.js';
import { createCamera, resetCamera, setMode, eyePosition, viewMatrix, projectionMatrix } from './camera.js';
import { mat4Multiply } from './math.js';
import { normalizeScene, sceneStats } from './scene-data.js';
import { applyViewParams } from './view-params.js';
import { fogParams } from './fog.js';
import { moduleExists } from './scene-probe.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
  el.hidden = !text;
}

// Candidate scene entry points (relative to this file), first match wins.
const SCENE_MODULES = ['../../src/scene/index.js', '../../scene/index.js'];

const nextFrame =() => new Promise((r) => requestAnimationFrame(() => r()));

async function loadSceneModule() {
  if (params.get('scene') === 'placeholder') {
    const { buildPlaceholderScene } = await import('./placeholder-scene.js');
    return { scene: buildPlaceholderScene(), source: 'placeholder (requested)' };
  }
  // Probe before importing so a missing module falls back, while errors inside a scene module stay visible.
  for (const path of SCENE_MODULES) {
    const url = new URL(path, import.meta.url);
    if (!(await moduleExists(url))) continue;
    const mod = await import(url.href);
    if (typeof mod.buildScene !== 'function') throw new Error(`${path} does not export buildScene()`);
    return { scene: await mod.buildScene(), source: path.replace('../../', '') };
  }
  console.warn('No scene module found, using placeholder scene');
  const { buildPlaceholderScene } = await import('./placeholder-scene.js');
  return { scene: buildPlaceholderScene(), source: 'placeholder (no scene module found)' };
}

async function start() {
  const t0 = performance.now();
  setStatus('Starting WebGL…');
  await nextFrame();
  const canvas = $('canvas');
  const renderer = new Renderer(canvas);

  setStatus('Building scene…');
  await nextFrame();
  const { scene: raw, source } = await loadSceneModule();
  const tBuild = performance.now();

  setStatus('Uploading geometry…');
  await nextFrame();
  const scene = normalizeScene(raw);
  renderer.upload(scene.meshes);
  renderer.setFog(fogParams(scene.bounds));
  const stats = sceneStats(scene);
  const loadMs = Math.round(performance.now() - t0);
  const buildMs = Math.round(tBuild - t0);

  const cam = createCamera(scene);
  applyViewParams(cam, params);

  const modeBtn = $('mode');
  const updateModeUi = () => {
    modeBtn.textContent = cam.mode === 'walk' ? 'Switch to orbit (C)' : 'Switch to walk (C)';
    document.body.dataset.mode = cam.mode;
  };
  const toggleMode = () => {
    setMode(cam, cam.mode === 'walk' ? 'orbit' : 'walk');
    updateModeUi();
  };
  const reset = () => resetCamera(cam);
  const controls = new Controls(canvas, cam, { onModeToggle: toggleMode, onReset: reset });
  modeBtn.addEventListener('click', toggleMode);
  $('reset').addEventListener('click', reset);
  $('help-toggle').addEventListener('click', () => { $('help').hidden = !$('help').hidden; });
  for (const btn of document.querySelectorAll('[data-move]')) {
    const [axis, value] = btn.dataset.move.split(':');
    const down = (e) => { e.preventDefault(); controls.touchMove[axis] = Number(value); };
    const up = () => { controls.touchMove[axis] = 0; };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }
  updateModeUi();

  $('source').textContent = source;
  if (raw.placeholder) $('placeholder-note').hidden = false;
  setStatus('');

  const hud = $('hud');
  if (params.get('hud') === '0') {
    for (const el of document.querySelectorAll('.ui')) el.hidden = true;
  }
  let last = performance.now();
  let frames = 0, fpsTime = last, fps = 0;
  let lastKey = '';
  let frameInfo = { drawCalls: 0, triangles: 0 };

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    controls.update(dt);
    const aspect = renderer.resize();
    const eye = eyePosition(cam);
    const view = viewMatrix(cam);
    const key = `${aspect}|${Array.from(view).map((v) => v.toFixed(5)).join(',')}`;
    if (key !== lastKey) {
      frameInfo = renderer.render(mat4Multiply(projectionMatrix(cam, aspect), view), eye);
      lastKey = key;
      frames++;
    }
    if (now - fpsTime >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsTime));
      frames = 0;
      fpsTime = now;
      hud.textContent =
        `${cam.mode} | ${fps} fps (renders on change) | draws ${frameInfo.drawCalls}/${stats.meshes} | ` +
        `tris ${Math.round(frameInfo.triangles).toLocaleString()}/${stats.triangles.toLocaleString()} | ` +
        `eye ${eye.map((v) => v.toFixed(1)).join(', ')} | load ${loadMs} ms (build ${buildMs} ms) | ` +
        `GPU ${(stats.gpuBytes / 1048576).toFixed(1)} MB`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__viewer = { cam, stats, loadMs, buildMs, source, ready: true };
}

start().catch((err) => {
  console.error(err);
  setStatus(`Could not start the viewer: ${err.message}`, true);
});
