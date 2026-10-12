// Fog model shared by the WebGL shader (renderer.js mirrors it in GLSL) and the CPU preview.
// Two terms, the stronger wins:
//  - distance fog from the eye (atmosphere);
//  - edge fog that fades geometry into the sky as it nears the scene bounds in x/z, so the
//    tile edge is hidden from any camera height without fogging the middle of the scene.

export const FOG_DENSITY = 0.0025;

export function fogParams(bounds) {
  const ex = bounds.max[0] - bounds.min[0];
  const ez = bounds.max[2] - bounds.min[2];
  const margin = Math.min(Math.max(0.12 * Math.min(ex, ez), 10), 60);
  return {
    density: FOG_DENSITY,
    edgeMin: [bounds.min[0], bounds.min[2]],
    edgeMax: [bounds.max[0], bounds.max[2]],
    margin,
  };
}

function smoothstep(e0, e1, x) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Fog amount 0..1 for a point at world (x, z), `dist` metres from the eye. */
export function fogFactor(p, dist, x, z) {
  const distanceFog = 1 - Math.exp(-p.density * dist);
  const toEdge = Math.min(x - p.edgeMin[0], p.edgeMax[0] - x, z - p.edgeMin[1], p.edgeMax[1] - z);
  const edgeFog = 1 - smoothstep(0, p.margin, toEdge);
  return Math.min(Math.max(distanceFog, edgeFog, 0), 1);
}
