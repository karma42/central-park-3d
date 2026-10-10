// URL parameters for reproducible viewpoints (used for documented screenshots):
//   ?mode=walk&x=0&z=30&yaw=0&pitch=0           walk camera at ground position x,z
//   ?mode=orbit&tx=0&tz=0&dist=120&yaw=0.6&pitch=-0.5  orbit camera around target
// Angles are radians. Unknown or invalid values are ignored.
import { setMode, ORBIT_MIN_DISTANCE, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH, WALK_PITCH_LIMIT } from './camera.js';
import { clamp } from './math.js';

function num(params, name) {
  if (!params.has(name)) return null;
  const v = Number(params.get(name));
  return Number.isFinite(v) ? v : null;
}

export function applyViewParams(cam, params) {
  const mode = params.get('mode');
  if (mode === 'walk' || mode === 'orbit') setMode(cam, mode);
  const { min, max } = cam.bounds;
  const yaw = num(params, 'yaw'), pitch = num(params, 'pitch');
  if (cam.mode === 'walk') {
    const x = num(params, 'x'), z = num(params, 'z');
    const w = cam.walk;
    if (x !== null) w.position[0] = clamp(x, min[0], max[0]);
    if (z !== null) w.position[2] = clamp(z, min[2], max[2]);
    w.position[1] = cam.ground(w.position[0], w.position[2]);
    if (yaw !== null) w.yaw = yaw;
    if (pitch !== null) w.pitch = clamp(pitch, -WALK_PITCH_LIMIT, WALK_PITCH_LIMIT);
  } else {
    const o = cam.orbit;
    const tx = num(params, 'tx'), tz = num(params, 'tz'), dist = num(params, 'dist');
    if (tx !== null) o.target[0] = clamp(tx, min[0], max[0]);
    if (tz !== null) o.target[2] = clamp(tz, min[2], max[2]);
    o.target[1] = cam.ground(o.target[0], o.target[2]);
    if (dist !== null) o.distance = clamp(dist, ORBIT_MIN_DISTANCE, o.maxDistance);
    if (yaw !== null) o.yaw = yaw;
    if (pitch !== null) o.pitch = clamp(pitch, ORBIT_MIN_PITCH, ORBIT_MAX_PITCH);
  }
  return cam;
}
