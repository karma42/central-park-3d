// Bethesda Fountain with the Angel of the Waters (Emma Stebbins, 1873).
// Procedural and approximate; see docs/terrace.md for dimensions and
// uncertainty. Same frame as terrace.js: origin = fountain center at plaza
// level, Y up, -Z north (Lake), +Z south (terrace / arcade).

import { MeshBuilder, compose, translate, rotateY, rotateZ, scale } from './terrace-geom.js';

export const FOUNTAIN_LAYOUT = Object.freeze({
  center: [0, 0, 0],
  poolOuterRadius: 14.75,
  poolInnerRadius: 14.0,
  poolRimY: 0.75,
  poolWaterY: 0.45,
  lowerBowl: { radius: 3.05, rimY: 2.8 },
  upperBowl: { radius: 1.55, rimY: 4.62 },
  angelBaseY: 5.4,
  angelTopY: 8.15,
  // Uncertain: the statue's real heading should be verified against photos.
  angelFacing: 'south (+Z, toward the arcade)',
});

export const FOUNTAIN_COLORS = Object.freeze({
  stone: [0.82, 0.74, 0.6],
  bronze: [0.33, 0.44, 0.37],
  water: [0.24, 0.43, 0.52],
  spray: [0.7, 0.82, 0.88],
});

// Angel figure, base at local y = 0, facing +Z. Its right side is -X.
function angel(b) {
  // Rock/cloud plinth the figure stands on.
  b.lathe([[0, 0], [0.5, 0], [0.55, 0.12], [0.42, 0.24], [0, 0.26]], 10);
  // Robe falling to the feet, slightly fuller at the hem.
  b.with(translate(0, 0.24, 0), (r) =>
    r.lathe([[0, 0], [0.42, 0], [0.4, 0.12], [0.3, 0.7], [0.23, 1.05], [0.2, 1.1], [0, 1.1]], 14, { smooth: true }));
  // Torso, flattened front-to-back.
  b.with(compose(translate(0, 1.32, 0), scale(1, 1, 0.72)), (t) => t.cylinder(0.21, 0.18, 0, 0.5, 12));
  // Shoulders.
  b.with(compose(translate(0, 1.8, 0), scale(1.45, 0.55, 0.8)), (s) => s.sphere(0.17, 10, 6));
  // Head and hair.
  b.limb([0, 1.82, 0], [0, 1.95, 0.01], 0.06, 0.06, 8);
  b.with(translate(0, 2.06, 0.02), (h) => h.sphere(0.12, 12, 8));
  b.with(compose(translate(0, 2.08, -0.04), scale(1.05, 1.0, 1.0)), (h) => h.sphere(0.125, 10, 6));

  // Right arm extended forward and out over the water (gesture of blessing).
  const rShoulder = [-0.24, 1.8, 0.0], rElbow = [-0.48, 1.86, 0.22], rHand = [-0.66, 1.98, 0.48];
  b.limb(rShoulder, rElbow, 0.065, 0.055);
  b.limb(rElbow, rHand, 0.055, 0.045);
  b.with(translate(...rHand), (h) => h.sphere(0.05, 8, 4));
  // Left arm lowered, holding a lily stem across the body.
  const lShoulder = [0.24, 1.8, 0.0], lElbow = [0.3, 1.5, 0.12], lHand = [0.12, 1.42, 0.24];
  b.limb(lShoulder, lElbow, 0.065, 0.055);
  b.limb(lElbow, lHand, 0.055, 0.045);
  b.limb([0.16, 1.18, 0.26], [0.06, 1.98, 0.22], 0.018, 0.014, 5); // lily stem
  b.with(translate(0.06, 1.98, 0.22), (f) => f.cylinder(0.01, 0.08, 0, 0.12, 6)); // lily bloom

  // Wings rising from the upper back, swept back and spread wide.
  const wingOutline = [
    [0, 0], [0.22, -0.3], [0.5, -0.2], [0.82, 0.15], [1.08, 0.62], [1.2, 1.05],
    [1.02, 0.98], [0.84, 0.86], [0.58, 0.72], [0.3, 0.58], [0.06, 0.4],
  ];
  for (const side of [1, -1]) {
    b.with(compose(scale(side, 1, 1), translate(0.08, 1.68, -0.12), rotateY(0.45), rotateZ(0.18)), (w) =>
      w.prism(wingOutline, -0.04, 0.04));
  }
}

// Small standing figures (Temperance, Purity, Health, Peace) under the upper bowl.
function cherub(b) {
  b.cylinder(0.14, 0.11, 0, 0.42, 8);
  b.with(translate(0, 0.52, 0), (h) => h.sphere(0.1, 8, 6));
  b.limb([0.1, 0.36, 0], [0.18, 0.62, 0.04], 0.03, 0.025, 5);
  b.limb([-0.1, 0.36, 0], [-0.18, 0.62, 0.04], 0.03, 0.025, 5);
}

export function buildFountain() {
  const F = FOUNTAIN_LAYOUT;
  const stone = new MeshBuilder();
  const bronze = new MeshBuilder();
  const water = new MeshBuilder();
  const spray = new MeshBuilder();

  // Great pool: rim with a molded coping; inner wall faces the water.
  const R = F.poolOuterRadius, r = F.poolInnerRadius;
  stone.lathe([[R - 0.15, 0], [R - 0.15, 0.55], [R, 0.6], [R, F.poolRimY], [r, F.poolRimY], [r, 0.2]], 64);
  water.lathe([[r, F.poolWaterY], [0, F.poolWaterY]], 64);

  // Central island and pedestal.
  stone.lathe([[3.7, 0.2], [3.7, 0.65], [3.4, 0.85], [1.4, 0.95], [1.1, 1.3], [0, 1.3]], 24);
  bronze.lathe([[0.75, 1.3], [0.6, 1.5], [0.48, 1.9], [0.55, 2.0], [0, 2.0]], 16);

  // Lower bowl with its water surface and the falling veil of water.
  bronze.lathe([[0.55, 1.95], [1.6, 2.25], [2.7, 2.5], [F.lowerBowl.radius, 2.62], [F.lowerBowl.radius, F.lowerBowl.rimY],
    [2.88, F.lowerBowl.rimY], [0, 2.55]], 32, { smooth: true });
  water.lathe([[2.88, 2.72], [0, 2.72]], 32);
  spray.lathe([[3.55, F.poolWaterY], [3.12, 2.72]], 32);

  // Central shaft with the four cherubs standing in the lower bowl.
  bronze.cylinder(0.42, 0.34, 2.55, 4.05, 12);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    bronze.with(compose(translate(Math.sin(a) * 1.0, 2.6, Math.cos(a) * 1.0), rotateY(a)), cherub);
  }

  // Upper bowl, its water and veil.
  bronze.lathe([[0.34, 4.0], [0.9, 4.28], [1.42, 4.46], [F.upperBowl.radius, F.upperBowl.rimY],
    [1.4, F.upperBowl.rimY], [0, 4.46]], 24, { smooth: true });
  water.lathe([[1.4, 4.56], [0, 4.56]], 24);
  spray.lathe([[1.95, 2.8], [1.6, 4.56]], 24);

  // Column carrying the angel.
  bronze.lathe([[0.5, 4.45], [0.42, 4.7], [0.36, 5.2], [0.46, F.angelBaseY], [0, F.angelBaseY]], 12);
  bronze.with(translate(0, F.angelBaseY, 0), angel);

  const C = FOUNTAIN_COLORS;
  return [
    stone.toMesh('fountain-stone', C.stone),
    bronze.toMesh('fountain-bronze', C.bronze),
    water.toMesh('fountain-water', C.water),
    { ...spray.toMesh('fountain-spray', C.spray), opacity: 0.55 },
  ];
}
