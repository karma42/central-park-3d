// Scene aggregator: combines the terrace, fountain and landscape modules into
// the scene contract the viewer loads (see viewer/README.md).
import { buildFountain } from './fountain.js';
import { buildTerrace, terraceHeightAt } from './terrace.js';
import { buildLandscape } from '../landscape/index.js';

const asList = (r) => (Array.isArray(r) ? r : r.meshes);

export function buildScene() {
  const landscape = buildLandscape();
  return {
    meshes: [...asList(buildTerrace()), ...asList(buildFountain()), ...landscape.meshes],
    groundHeight: (x, z) => terraceHeightAt(x, z) ?? landscape.walkHeightAt(x, z),
    canWalk: (x, z) => !landscape.isInLake(x, z),
    spawn: { position: [4, 0, 28], yaw: 0, pitch: 0 },
  };
}
