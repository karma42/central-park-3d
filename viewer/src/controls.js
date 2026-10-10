// Keyboard, mouse and touch input mapped onto camera operations.
import { rotate, zoom, pan, walk } from './camera.js';

const LOOK_SPEED = 0.005; // radians per CSS pixel
const KEY_TURN_SPEED = 1.6; // radians per second

export class Controls {
  constructor(element, cam, { onModeToggle, onReset } = {}) {
    this.el = element;
    this.cam = cam;
    this.keys = new Set();
    this.pointers = new Map();
    this.touchMove = { forward: 0, right: 0 };
    this.onModeToggle = onModeToggle || (() => {});
    this.onReset = onReset || (() => {});
    this.lastPinch = null;

    element.addEventListener('pointerdown', (e) => this.pointerDown(e));
    element.addEventListener('pointermove', (e) => this.pointerMove(e));
    element.addEventListener('pointerup', (e) => this.pointerUp(e));
    element.addEventListener('pointercancel', (e) => this.pointerUp(e));
    element.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  pointerDown(e) {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
    this.lastPinch = null;
  }

  pointerUp(e) {
    this.pointers.delete(e.pointerId);
    this.lastPinch = null;
  }

  pointerMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (this.pointers.size >= 2) {
      this.twoFinger();
      return;
    }
    const panning = this.cam.mode === 'orbit' && (p.button === 2 || p.button === 1 || p.shift || e.shiftKey);
    if (panning) {
      const scale = this.cam.orbit.distance * 0.0015;
      pan(this.cam, -dx * scale, dy * scale);
    } else {
      rotate(this.cam, -dx * LOOK_SPEED, -dy * LOOK_SPEED);
    }
  }

  twoFinger() {
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (this.lastPinch) {
      if (this.cam.mode === 'orbit') {
        if (dist > 0) zoom(this.cam, this.lastPinch.dist / dist);
        const scale = this.cam.orbit.distance * 0.0015;
        pan(this.cam, -(mid.x - this.lastPinch.mid.x) * scale, (mid.y - this.lastPinch.mid.y) * scale);
      }
    }
    this.lastPinch = { dist, mid };
  }

  wheel(e) {
    e.preventDefault();
    if (this.cam.mode !== 'orbit') return;
    const lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    zoom(this.cam, Math.exp(e.deltaY * lines * 0.001));
  }

  keyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'KeyC' || e.code === 'Tab') {
      e.preventDefault();
      this.onModeToggle();
      return;
    }
    if (e.code === 'KeyR') {
      this.onReset();
      return;
    }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    this.keys.add(e.code);
  }

  /** Apply held keys and touch buttons; call once per frame with dt seconds. */
  update(dt) {
    const k = (c) => (this.keys.has(c) ? 1 : 0);
    const forward = k('KeyW') - k('KeyS') + this.touchMove.forward;
    const strafe = k('KeyD') - k('KeyA') + this.touchMove.right;
    const turn = k('ArrowLeft') - k('ArrowRight') + k('KeyQ') - k('KeyE');
    const fwdArrow = k('ArrowUp') - k('ArrowDown');
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.cam.mode === 'walk') {
      if (turn) rotate(this.cam, turn * KEY_TURN_SPEED * dt, 0);
      walk(this.cam, forward + fwdArrow, strafe, dt, run);
    } else {
      if (turn) rotate(this.cam, turn * KEY_TURN_SPEED * dt, 0);
      const speed = this.cam.orbit.distance * 0.8 * dt * (run ? 3 : 1);
      if (forward + fwdArrow || strafe) pan(this.cam, strafe * speed, (forward + fwdArrow) * speed);
      const z = k('Equal') + k('NumpadAdd') - k('Minus') - k('NumpadSubtract');
      if (z) zoom(this.cam, Math.exp(-z * dt * 1.5));
    }
  }
}
