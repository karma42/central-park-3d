// Landscape around Bethesda Terrace: terrain, paths, trees and the Lake edge.
// Pure data, no dependencies: works in the browser (ES modules) and in Node.
import { LAYOUT, pathDefinitions, shoreZ, farShoreZ } from './layout.js';
import { buildTerrainMesh, heightAt } from './terrain.js';
import { buildPathMesh, PATH_LIFT, distanceToPaths } from './paths.js';
import { buildWaterMesh } from './lake.js';
import { mallElmPlacements, scatteredTreePlacements, buildTreeMesh } from './trees.js';
import { meshStats } from './mesh.js';

export { LAYOUT, heightAt, shoreZ, farShoreZ, pathDefinitions, distanceToPaths, PATH_LIFT };

// Walkable surface height: path tops where on a path, otherwise ground.
// Water is not walkable; callers can test isInLake().
export function walkHeightAt(x, z) {
  return heightAt(x, z) + (distanceToPaths(x, z) <= 0 ? PATH_LIFT : 0);
}

// The terrace's landing steps project past the shore line but stay walkable.
export function isInLake(x, z) {
  const steps = LAYOUT.lake.landingSteps;
  if (Math.abs(x) <= steps.halfWidth && z >= steps.minZ) return false;
  return z < shoreZ(x) && z > farShoreZ(x);
}

export function buildLandscape(options = {}) {
  const paths = pathDefinitions();
  const trees = [...mallElmPlacements(), ...scatteredTreePlacements(options.scatteredTrees ?? 420)];
  const meshes = [buildTerrainMesh(), buildPathMesh(paths), buildWaterMesh(), buildTreeMesh(trees)];
  const perMesh = meshes.map(meshStats);
  const stats = {
    meshes: perMesh,
    vertices: perMesh.reduce((s, m) => s + m.vertices, 0),
    triangles: perMesh.reduce((s, m) => s + m.triangles, 0),
    trees: { mallElms: trees.filter((t) => t.kind === 'elm').length, scattered: trees.filter((t) => t.kind !== 'elm').length },
    paths: paths.length,
  };
  return { meshes, trees, paths, stats, heightAt, walkHeightAt, isInLake, layout: LAYOUT };
}
