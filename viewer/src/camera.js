// Camera controller with two navigation modes:
//   orbit - circle, pan and zoom around a target point (overview)
//   walk  - first-person at eye height, following terrain, stairs and terraces
// Pure logic (no DOM), so it can be unit-tested in Node.

import { clamp, lookAt } from './math.js';
import { BLOCKED, SITE, walkHeight } from './site.js';

export const EYE_HEIGHT = 1.7;
export const WALK_SPEED = 4.5; // m/s
export const RUN_FACTOR = 3;
export const MAX_STEP = 0.6; // highest step a walker climbs without blocking

export function forwardVector(yaw, pitch) {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

export class CameraController {
  constructor(viewpoints, initial = 'overview') {
    this.viewpoints = viewpoints;
    this.initial = initial;
    this.reset();
  }

  reset() {
    this.setViewpoint(this.initial);
  }

  setViewpoint(name) {
    const vp = this.viewpoints[name];
    if (!vp) throw new Error(`Unknown viewpoint: ${name}`);
    this.viewpoint = name;
    if (vp.mode === 'orbit') {
      this.mode = 'orbit';
      this.orbit = { target: [...vp.target], yaw: vp.yaw, pitch: vp.pitch, distance: vp.distance };
    } else {
      this.mode = 'walk';
      const [x, z] = vp.position;
      this.walk = { x, z, feet: walkHeight(x, z, vp.level ?? Infinity, MAX_STEP), yaw: vp.yaw, pitch: vp.pitch, vy: 0 };
    }
  }

  // Switch modes while keeping roughly the same view.
  toggleMode() {
    if (this.mode === 'orbit') {
      const { target, yaw } = this.orbit;
      const x = clamp(target[0], SITE.bounds.xMin + 2, SITE.bounds.xMax - 2);
      const z = clamp(target[2], SITE.bounds.zMin + 2, SITE.bounds.zMax - 2);
      let feet = walkHeight(x, z, Infinity, MAX_STEP);
      if (feet >= BLOCKED) {
        // Target is in water or the fountain basin: start at the terrace overlook.
        this.setViewpoint('terrace');
        return;
      }
      this.mode = 'walk';
      this.walk = { x, z, feet, yaw, pitch: 0, vy: 0 };
    } else {
      const { x, z, feet, yaw } = this.walk;
      this.mode = 'orbit';
      const f = forwardVector(yaw, 0);
      this.orbit = { target: [x + f[0] * 25, feet + 1, z + f[2] * 25], yaw, pitch: 0.45, distance: 60 };
    }
    this.viewpoint = null;
  }

  eye() {
    if (this.mode === 'walk') return [this.walk.x, this.walk.feet + EYE_HEIGHT, this.walk.z];
    const { target, yaw, pitch, distance } = this.orbit;
    return [
      target[0] - Math.sin(yaw) * Math.cos(pitch) * distance,
      target[1] + Math.sin(pitch) * distance,
      target[2] + Math.cos(yaw) * Math.cos(pitch) * distance,
    ];
  }

  target() {
    if (this.mode === 'orbit') return this.orbit.target;
    const e = this.eye();
    const f = forwardVector(this.walk.yaw, this.walk.pitch);
    return [e[0] + f[0], e[1] + f[1], e[2] + f[2]];
  }

  viewMatrix() {
    return lookAt(this.eye(), this.target());
  }

  // Pointer drag in pixels: orbit rotates around the target, walk looks around.
  rotate(dx, dy) {
    const k = 0.005;
    if (this.mode === 'orbit') {
      this.orbit.yaw += dx * k;
      this.orbit.pitch = clamp(this.orbit.pitch + dy * k, 0.04, 1.5);
    } else {
      this.walk.yaw += dx * k * 0.6;
      this.walk.pitch = clamp(this.walk.pitch - dy * k * 0.6, -1.3, 1.3);
    }
    this.viewpoint = null;
  }

  // Pan the orbit target across the ground plane (screen-relative).
  pan(dx, dy) {
    if (this.mode !== 'orbit') return;
    const { yaw, distance } = this.orbit;
    const k = distance * 0.0015;
    const right = [Math.cos(yaw), Math.sin(yaw)];
    const fwd = [Math.sin(yaw), -Math.cos(yaw)];
    const t = this.orbit.target;
    t[0] = clamp(t[0] - right[0] * dx * k + fwd[0] * dy * k, SITE.bounds.xMin, SITE.bounds.xMax);
    t[2] = clamp(t[2] - right[1] * dx * k + fwd[1] * dy * k, SITE.bounds.zMin, SITE.bounds.zMax);
    this.viewpoint = null;
  }

  // Positive delta zooms out (orbit) or steps back (walk).
  zoom(delta) {
    if (this.mode === 'orbit') {
      this.orbit.distance = clamp(this.orbit.distance * Math.exp(delta * 0.001), 6, 450);
    } else {
      this.moveWalker(-delta * 0.01, 0);
    }
    this.viewpoint = null;
  }

  // input: {forward, right, up, run} in [-1, 1]; dt in seconds.
  update(dt, input) {
    const { forward = 0, right = 0, up = 0, run = false, turn = 0 } = input;
    if (this.mode === 'orbit') {
      const { yaw, distance } = this.orbit;
      const speed = distance * 0.6 * (run ? RUN_FACTOR : 1) * dt;
      const t = this.orbit.target;
      t[0] = clamp(t[0] + (Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed, SITE.bounds.xMin, SITE.bounds.xMax);
      t[2] = clamp(t[2] + (-Math.cos(yaw) * forward + Math.sin(yaw) * right) * speed, SITE.bounds.zMin, SITE.bounds.zMax);
      this.orbit.distance = clamp(this.orbit.distance * Math.exp(-up * dt), 6, 450);
      this.orbit.yaw += turn * dt;
    } else {
      this.walk.yaw += turn * 1.6 * dt;
      const step = WALK_SPEED * (run ? RUN_FACTOR : 1) * dt;
      this.moveWalker(forward * step, right * step);
      this.applyGravity(dt);
    }
    if (forward || right || up || turn) this.viewpoint = null;
  }

  // Move the walker; blocked axes slide along walls instead of stopping.
  moveWalker(forward, right) {
    const w = this.walk;
    const dx = Math.sin(w.yaw) * forward + Math.cos(w.yaw) * right;
    const dz = -Math.cos(w.yaw) * forward + Math.sin(w.yaw) * right;
    const tryMove = (nx, nz) => {
      nx = clamp(nx, SITE.bounds.xMin + 1, SITE.bounds.xMax - 1);
      nz = clamp(nz, SITE.bounds.zMin + 1, SITE.bounds.zMax - 1);
      const h = walkHeight(nx, nz, w.feet, MAX_STEP);
      if (h > w.feet + MAX_STEP) return false;
      w.x = nx;
      w.z = nz;
      if (h >= w.feet - MAX_STEP) {
        w.feet = h; // walk up/down steps and slopes
        w.vy = 0;
      }
      return true;
    };
    if (!tryMove(w.x + dx, w.z + dz)) {
      if (!tryMove(w.x + dx, w.z)) tryMove(w.x, w.z + dz);
    }
  }

  applyGravity(dt) {
    const w = this.walk;
    const ground = walkHeight(w.x, w.z, w.feet, MAX_STEP);
    if (w.feet > ground + 1e-3) {
      w.vy -= 9.81 * dt;
      w.feet = Math.max(ground, w.feet + w.vy * dt);
      if (w.feet === ground) w.vy = 0;
    }
  }

  // Serializable state for the URL hash / debugging.
  state() {
    if (this.mode === 'orbit') return { mode: 'orbit', ...this.orbit, target: [...this.orbit.target] };
    return { mode: 'walk', ...this.walk };
  }
}
