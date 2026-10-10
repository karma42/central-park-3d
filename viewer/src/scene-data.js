// Validation and normalization of scene data produced by scene/index.js `buildScene()`.
//
// Accepted mesh fields: name, positions (xyz), indices (optional), normals (optional, computed
// if absent), colors (per-vertex rgb 0-1) or color ([r,g,b] for the whole mesh), doubleSided,
// opacity (0-1, default 1; translucent meshes are drawn after opaque ones).
// Plain arrays are accepted and converted to typed arrays.

const DEFAULT_COLOR = [0.7, 0.7, 0.7];

export function computeNormals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      n[k] += nx; n[k + 1] += ny; n[k + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (len > 0) {
      n[i] /= len; n[i + 1] /= len; n[i + 2] /= len;
    } else {
      n[i + 1] = 1;
    }
  }
  return n;
}

export function meshBoundingSphere(positions) {
  const { min, max } = positionBounds(positions);
  const centre = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  let r2 = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - centre[0], dy = positions[i + 1] - centre[1], dz = positions[i + 2] - centre[2];
    r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
  }
  return { centre, radius: Math.sqrt(r2) };
}

export function positionBounds(positions, into) {
  const min = into ? into.min : [Infinity, Infinity, Infinity];
  const max = into ? into.max : [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

function toIndexArray(indices, vertexCount) {
  if (vertexCount <= 65536) {
    return indices instanceof Uint16Array ? indices : Uint16Array.from(indices);
  }
  return indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
}

export function normalizeMesh(mesh, i = 0) {
  const name = mesh.name || `mesh-${i}`;
  if (!mesh.positions || mesh.positions.length % 3 !== 0 || mesh.positions.length === 0) {
    throw new Error(`Mesh "${name}": positions must be a non-empty xyz array`);
  }
  const positions = mesh.positions instanceof Float32Array ? mesh.positions : Float32Array.from(mesh.positions);
  const vertexCount = positions.length / 3;
  for (let k = 0; k < positions.length; k++) {
    if (!Number.isFinite(positions[k])) throw new Error(`Mesh "${name}": non-finite position at ${k}`);
  }
  let rawIndices = mesh.indices;
  if (!rawIndices) {
    rawIndices = new Uint32Array(vertexCount);
    for (let k = 0; k < vertexCount; k++) rawIndices[k] = k;
  }
  if (rawIndices.length % 3 !== 0) throw new Error(`Mesh "${name}": indices length must be a multiple of 3`);
  for (let k = 0; k < rawIndices.length; k++) {
    if (rawIndices[k] >= vertexCount || rawIndices[k] < 0) {
      throw new Error(`Mesh "${name}": index ${rawIndices[k]} out of range`);
    }
  }
  const indices = toIndexArray(rawIndices, vertexCount);
  let normals = mesh.normals;
  if (normals && normals.length === positions.length) {
    normals = normals instanceof Float32Array ? normals : Float32Array.from(normals);
  } else {
    normals = computeNormals(positions, indices);
  }
  let colors = mesh.colors;
  if (colors && colors.length === positions.length) {
    colors = colors instanceof Float32Array ? colors : Float32Array.from(colors);
  } else {
    const c = mesh.color || DEFAULT_COLOR;
    colors = new Float32Array(positions.length);
    for (let k = 0; k < colors.length; k += 3) {
      colors[k] = c[0]; colors[k + 1] = c[1]; colors[k + 2] = c[2];
    }
  }
  const opacity = Number.isFinite(mesh.opacity) ? Math.min(Math.max(mesh.opacity, 0), 1) : 1;
  return { name, positions, normals, colors, indices, doubleSided: !!mesh.doubleSided, opacity };
}

/** Validate and normalize a scene; computes bounds when missing. */
export function normalizeScene(scene) {
  if (!scene || !Array.isArray(scene.meshes) || scene.meshes.length === 0) {
    throw new Error('Scene must have a non-empty meshes array');
  }
  const meshes = scene.meshes.map(normalizeMesh);
  let bounds = scene.bounds;
  if (!bounds) {
    bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const m of meshes) positionBounds(m.positions, bounds);
  }
  const ground = scene.groundHeight || scene.heightAt;
  const groundHeight = typeof ground === 'function' ? ground : null;
  return { ...scene, meshes, bounds, groundHeight };
}

export function sceneStats(scene) {
  let vertices = 0, triangles = 0, bytes = 0;
  for (const m of scene.meshes) {
    vertices += m.positions.length / 3;
    triangles += m.indices.length / 3;
    bytes += m.positions.byteLength + m.normals.byteLength + m.colors.byteLength + m.indices.byteLength;
  }
  return { meshes: scene.meshes.length, vertices, triangles, gpuBytes: bytes };
}
