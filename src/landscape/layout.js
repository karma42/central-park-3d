// Landscape layout around Bethesda Terrace, in "park grid" coordinates:
// metres, Y up, origin at the fountain centre on the lower-terrace pavement,
// -Z = park north (toward the Lake), +X = park east (toward Loeb Boathouse).
// The park grid is rotated roughly 29 degrees from true north; we ignore that.
//
// All dimensions are approximate, chosen for recognizability, and must be
// checked against survey/GIS references (see docs/landscape.md).

export const LAYOUT = {
  // Scene extent covered by the terrain grid.
  // minZ keeps z = -42 (seawall) on a grid row.
  bounds: { minX: -170, maxX: 170, minZ: -202, maxZ: 270 },
  cellSize: 4,

  // Lower terrace (fountain plaza): flat pavement at y = 0.
  // Extents match TERRACE_LAYOUT in src/scene/terrace.js: plaza slab
  // x[-50,50] z[-42,36], arcade wall z=36, deck + Terrace Drive z[36,50],
  // upper terrace z[50,64], Mall entry at z=64.
  plaza: { halfWidth: 50, northZ: -42, southZ: 36 },

  // Upper level (Terrace Drive / upper terrace / the Mall). The ground beside
  // the deck ends (|x| > 50) reaches this height by startZ.
  upper: { height: 5.5, startZ: 36 },

  // Zone reserved for terrace architecture (stairs, arcade, deck, upper
  // terrace). Landscape keeps trees and paths out of it.
  terraceZone: { halfWidth: 58, minZ: 28, maxZ: 66 },

  // Openings in the terrace that expose the ground below deck height: the
  // arcade under the deck (z 36..50) and the Mall stair cut (|x| < 6.5,
  // z 50..64), widened to the next terrain grid column.
  terrace: { deckEndZ: 50, stairCutHalfWidth: 10 },

  lake: {
    waterLevel: -0.8,
    // Seawall + balustrade along the plaza's north edge (terrace module).
    plazaShoreZ: -42,
    // Inside the seawall span the terrain bank is pulled back under the
    // plaza slab so the coarse grid is already below water at the wall.
    seawallInset: 2.5,
    copingHalfWidth: 52,
    // Terrace landing steps descending from the seawall toward the water.
    landingSteps: { halfWidth: 6, minZ: -45 },
    maxDepth: 3.0,
    farShoreZ: -150, // mean z of the Ramble-side bank (illustrative)
  },

  mall: { centreX: 0, startZ: 64, endZ: 262, walkWidth: 11, innerRowX: 7.5, outerRowX: 19.5, sidePathX: 13.5, treeSpacing: 9 },

  // Drive asphalt on the deck (z[39,47], |x| <= 50) is terrace's; landscape continues it.
  terraceDrive: { z: 43, width: 8, bridgeHalfSpan: 50 },
};

// Shore line as z (north edge of land) for a given x. Straight along the
// plaza, then wandering slightly south so the lower terrace reads as a
// promontory onto the Lake, as it does in aerial photos.
export function shoreZ(x) {
  const { plazaShoreZ, copingHalfWidth } = LAYOUT.lake;
  const ax = Math.abs(x);
  const t = Math.min(1, Math.max(0, (ax - copingHalfWidth) / 70));
  const bulge = 10 * t * t * (3 - 2 * t);
  const wobble = ax > copingHalfWidth ? 2.5 * Math.sin(x * 0.07) * t : 0;
  return plazaShoreZ + bulge + wobble;
}

// Far (park-north) shore of the Lake, toward the wooded Ramble. Gives the
// Lake a visible opposite bank instead of running off the scene edge.
export function farShoreZ(x) {
  return LAYOUT.lake.farShoreZ + 9 * Math.sin(x / 40 + 0.5) + 4 * Math.cos(x / 17);
}

// Path network: polylines of [x, z] points with a width and surface type.
// Terrace Drive is split around the bridge over the arcade (terrace module).
export function pathDefinitions() {
  const { mall, terraceDrive: td, bounds } = LAYOUT;
  const lakeside = (sign) => {
    const pts = [];
    for (let ax = 56; ax <= bounds.maxX - 4; ax += 6) {
      const x = sign * ax;
      pts.push([x, shoreZ(x) + 7]);
    }
    return pts;
  };
  return [
    { id: 'mall-walk', surface: 'mall', width: mall.walkWidth, points: [[0, mall.startZ], [0, mall.endZ]] },
    { id: 'mall-side-west', surface: 'gravel', width: 3, points: [[-mall.sidePathX, mall.startZ + 2], [-mall.sidePathX, mall.endZ]] },
    { id: 'mall-side-east', surface: 'gravel', width: 3, points: [[mall.sidePathX, mall.startZ + 2], [mall.sidePathX, mall.endZ]] },
    { id: 'terrace-drive-west', surface: 'asphalt', width: td.width, points: [[bounds.minX + 2, td.z + 6], [-90, td.z + 2], [-td.bridgeHalfSpan, td.z]] },
    { id: 'terrace-drive-east', surface: 'asphalt', width: td.width, points: [[td.bridgeHalfSpan, td.z], [90, td.z + 2], [bounds.maxX - 2, td.z + 6]] },
    { id: 'lakeside-west', surface: 'asphalt', width: 4, points: lakeside(-1) },
    { id: 'lakeside-east', surface: 'asphalt', width: 4, points: lakeside(1) },
    // Paths descending the wooded flanks from the upper level to the lakeside.
    { id: 'flank-west', surface: 'asphalt', width: 4, points: [[-66, 70], [-80, 40], [-92, 8], [-104, shoreZ(-104) + 7]] },
    { id: 'flank-east', surface: 'asphalt', width: 4, points: [[66, 70], [80, 40], [92, 8], [104, shoreZ(104) + 7]] },
    // Lateral walks along the south end of the Mall toward the flanks.
    { id: 'mall-cross-west', surface: 'asphalt', width: 4, points: [[-mall.outerRowX - 3, 74], [-66, 70]] },
    { id: 'mall-cross-east', surface: 'asphalt', width: 4, points: [[mall.outerRowX + 3, 74], [66, 70]] },
  ];
}

export const COLORS = {
  grass: [0.33, 0.5, 0.22],
  grassDry: [0.45, 0.52, 0.26],
  plaza: [0.72, 0.64, 0.52],
  bank: [0.42, 0.38, 0.28],
  lakeBed: [0.22, 0.24, 0.18],
  water: [0.18, 0.36, 0.42],
  coping: [0.66, 0.6, 0.5],
  asphalt: [0.4, 0.4, 0.41],
  gravel: [0.66, 0.6, 0.48],
  mall: [0.62, 0.57, 0.48],
  trunk: [0.32, 0.25, 0.18],
  elm: [0.22, 0.4, 0.16],
  foliage: [[0.2, 0.42, 0.17], [0.27, 0.46, 0.18], [0.17, 0.36, 0.15], [0.32, 0.47, 0.2]],
};
