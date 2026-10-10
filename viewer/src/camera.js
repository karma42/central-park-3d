// Camera state for orbit and walk navigation. Pure functions so they can be unit-tested in Node.
import { clamp, directionFromYawPitch, mat4LookAt, mat4Perspective } from './math.js';

export const EYE_HEIGHT = 1.7; // metres above ground in walk mode
export const WALK_SPEED = 4; // m/s, roughly a brisk walk
export const RUN_MULTIPLIER = 3;
export const ORBIT_MIN_DISTANCE = 5;
export const ORBIT_MAX_PITCH = -0.05; // orbit always looks slightly down
export const ORBIT_MIN_PITCH = -1.5;
export const WALK_PITCH_LIMIT = 1.4;

export const HOME_MAX_DISTANCE = 200; // keeps the start view on the subject, not the whole tile
export const FOV_Y = (60 * Math.PI) / 180;

const flatGround = () => 0;

/**
 * Initial camera state derived from scene bounds and optional spawn point / home view.
 * scene.view = { target:[x,y,z], distance, yaw, pitch } overrides the orbit start view;
 * otherwise it orbits the spawn point (the area of interest), or the bounds centre.
 */
export function createCamera(scene) {
  const { min, max } = scene.bounds;
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const size = Math.max(max[0] - min[0], max[2] - min[2], 1);
  const ground = scene.groundHeight || flatGround;
  const spawn = scene.spawn || {
    position: [centre[0], ground(centre[0], max[2]), max[2]],
    yaw: 0,
    pitch: 0,
  };
  const view = scene.view || {};
  const focus = view.target || (scene.spawn ? spawn.position : centre);
  const maxDistance = size * 2;
  const home = {
    mode: 'orbit',
    orbit: {
      target: [focus[0], ground(focus[0], focus[2]), focus[2]],
      distance: clamp(view.distance ?? Math.min(size * 0.6, HOME_MAX_DISTANCE), ORBIT_MIN_DISTANCE, maxDistance),
      yaw: view.yaw ?? 0.6,
      pitch: clamp(view.pitch ?? -0.55, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH),
      maxDistance,
    },
    walk: {
      position: [...spawn.position],
      yaw: spawn.yaw ?? 0,
      pitch: spawn.pitch ?? 0,
    },
    bounds: { min: [...min], max: [...max] },
  };
  const canWalk = typeof scene.canWalk === 'function' ? scene.canWalk : null;
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  return { ...cloneState(home), home, ground, canWalk, diagonal };
}

/**
 * Near/far clip distances. Tight ranges keep depth precision where it matters, which reduces
 * z-fighting between nearly coplanar surfaces (paving over terrain, paths over grass).
 */
export function clipRange(cam) {
  if (cam.mode === 'walk') return { near: 0.25, far: cam.diagonal * 1.2 + 50 };
  const near = Math.max(0.5, cam.orbit.distance * 0.02);
  return { near, far: cam.orbit.distance + cam.diagonal * 1.2 + 50 };
}

export function projectionMatrix(cam, aspect) {
  const { near, far } = clipRange(cam);
  return mat4Perspective(FOV_Y, aspect, near, far);
}

function cloneState(s) {
  // Only the navigable state; ground/canWalk/diagonal stay on the camera object across resets.
  return {
    mode: s.mode,
    orbit: { ...s.orbit, target: [...s.orbit.target] },
    walk: { ...s.walk, position: [...s.walk.position] },
    bounds: { min: [...s.bounds.min], max: [...s.bounds.max] },
  };
}

/** Restore the initial view (keeps the current mode). */
export function resetCamera(cam) {
  const mode = cam.mode;
  Object.assign(cam, cloneState(cam.home));
  cam.mode = mode;
  return cam;
}

export function eyePosition(cam) {
  if (cam.mode === 'walk') {
    const p = cam.walk.position;
    return [p[0], cam.ground(p[0], p[2]) + EYE_HEIGHT, p[2]];
  }
  const o = cam.orbit;
  const d = directionFromYawPitch(o.yaw, o.pitch);
  return [o.target[0] - d[0] * o.distance, o.target[1] - d[1] * o.distance, o.target[2] - d[2] * o.distance];
}

export function viewMatrix(cam) {
  const eye = eyePosition(cam);
  const s = cam.mode === 'walk' ? cam.walk : cam.orbit;
  const d = directionFromYawPitch(s.yaw, s.pitch);
  return mat4LookAt(eye, [eye[0] + d[0], eye[1] + d[1], eye[2] + d[2]], [0, 1, 0]);
}

/** Rotate by pointer delta in radians (dx = yaw, dy = pitch). */
export function rotate(cam, dYaw, dPitch) {
  if (cam.mode === 'walk') {
    cam.walk.yaw += dYaw;
    cam.walk.pitch = clamp(cam.walk.pitch + dPitch, -WALK_PITCH_LIMIT, WALK_PITCH_LIMIT);
  } else {
    cam.orbit.yaw += dYaw;
    cam.orbit.pitch = clamp(cam.orbit.pitch + dPitch, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH);
  }
}

/** Zoom orbit distance by a multiplicative factor (>1 = further away). */
export function zoom(cam, factor) {
  const o = cam.orbit;
  o.distance = clamp(o.distance * factor, ORBIT_MIN_DISTANCE, o.maxDistance);
}

/** Pan the orbit target in the ground plane, in screen-relative metres. */
export function pan(cam, right, forward) {
  const o = cam.orbit;
  const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
  const x = o.target[0] + c * right - s * forward;
  const z = o.target[2] - s * right - c * forward;
  o.target[0] = clamp(x, cam.bounds.min[0], cam.bounds.max[0]);
  o.target[2] = clamp(z, cam.bounds.min[2], cam.bounds.max[2]);
  o.target[1] = cam.ground(o.target[0], o.target[2]);
}

/**
 * Walk by an input vector over dt seconds. forward/right in [-1,1]; run multiplies speed.
 * Movement is horizontal; height follows the ground; position is clamped to scene bounds.
 */
export function walk(cam, forward, right, dt, run = false) {
  const len = Math.hypot(forward, right);
  if (len === 0) return;
  const speed = WALK_SPEED * (run ? RUN_MULTIPLIER : 1) * dt / Math.max(len, 1);
  const w = cam.walk;
  const s = Math.sin(w.yaw), c = Math.cos(w.yaw);
  const x0 = w.position[0], z0 = w.position[2];
  let x = clamp(x0 + (c * right - s * forward) * speed, cam.bounds.min[0], cam.bounds.max[0]);
  let z = clamp(z0 + (-s * right - c * forward) * speed, cam.bounds.min[2], cam.bounds.max[2]);
  if (cam.canWalk && !cam.canWalk(x, z)) {
    // Slide along whichever axis is still walkable, otherwise stay put.
    if (cam.canWalk(x, z0)) z = z0;
    else if (cam.canWalk(x0, z)) x = x0;
    else { x = x0; z = z0; }
  }
  w.position[0] = x;
  w.position[2] = z;
  w.position[1] = cam.ground(x, z);
}

/** Switch modes, carrying the viewpoint across so the user does not lose their place. */
export function setMode(cam, mode) {
  if (mode === cam.mode) return;
  if (mode === 'walk') {
    const t = cam.orbit.target;
    cam.walk.position = [t[0], cam.ground(t[0], t[2]), t[2]];
    cam.walk.yaw = cam.orbit.yaw;
    cam.walk.pitch = 0;
  } else {
    const p = cam.walk.position;
    const d = directionFromYawPitch(cam.walk.yaw, 0);
    const ahead = 20;
    const tx = clamp(p[0] + d[0] * ahead, cam.bounds.min[0], cam.bounds.max[0]);
    const tz = clamp(p[2] + d[2] * ahead, cam.bounds.min[2], cam.bounds.max[2]);
    cam.orbit.target = [tx, cam.ground(tx, tz), tz];
    cam.orbit.yaw = cam.walk.yaw;
    cam.orbit.pitch = -0.5;
    cam.orbit.distance = clamp(60, ORBIT_MIN_DISTANCE, cam.orbit.maxDistance);
  }
  cam.mode = mode;
}
