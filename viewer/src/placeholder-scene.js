// Tiny stand-in scene so the viewer runs before scene/index.js exists.
// Not a model of Bethesda Terrace: a ground plane, a round basin and a few boxes.

function box(name, cx, cy, cz, sx, sy, sz, color) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy, y1 = cy + sy, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const faces = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], // +z
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], // -z
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], // +x
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], // -x
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], // +y
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], // -y
  ];
  const positions = [], indices = [];
  for (const f of faces) {
    const base = positions.length / 3;
    for (const v of f) positions.push(...v);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { name, positions, indices, color };
}

function disc(name, cx, cy, cz, r, segments, color) {
  const positions = [cx, cy, cz], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(cx + Math.cos(a) * r, cy, cz - Math.sin(a) * r);
    if (i > 0) indices.push(0, i, i + 1);
  }
  return { name, positions, indices, color };
}

export function buildPlaceholderScene() {
  const meshes = [
    box('ground', 0, -0.5, 0, 240, 0.5, 240, [0.36, 0.5, 0.28]),
    box('plaza', 0, -0.05, 0, 60, 0.05, 50, [0.7, 0.6, 0.48]),
    disc('basin-water', 0, 0.45, 0, 9, 48, [0.25, 0.42, 0.5]),
    box('basin-rim', 0, 0, 0, 2, 0.6, 2, [0.62, 0.55, 0.45]),
    box('terrace', 0, 0, 40, 80, 6, 20, [0.66, 0.52, 0.4]),
    box('statue-pedestal', 0, 0, 0, 1.6, 6, 1.6, [0.55, 0.5, 0.42]),
  ];
  for (let i = -3; i <= 3; i++) {
    meshes.push(box(`tree-trunk-${i}`, i * 12, 0, -40, 0.6, 4, 0.6, [0.35, 0.25, 0.18]));
    meshes.push(box(`tree-crown-${i}`, i * 12, 4, -40, 5, 5, 5, [0.2, 0.42, 0.2]));
  }
  return {
    meshes,
    bounds: { min: [-120, -0.5, -120], max: [120, 10, 120] },
    spawn: { position: [0, 0, 25], yaw: 0, pitch: -0.05 },
    placeholder: true,
  };
}
