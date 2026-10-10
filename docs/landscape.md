# Landscape around Bethesda Terrace (milestone 1)

AI-generated contribution for issue #1: terrain, paths, trees and the Lake
edge surrounding Bethesda Terrace and Fountain. The terrace architecture
(staircases, arcade, Terrace Drive bridge, balustrades, fountain) and the
browser viewer are owned by other agents and are not included here.

## What it provides

`src/landscape/index.js` exports `buildLandscape()`, which returns:

| Field | Content |
| --- | --- |
| `meshes` | `terrain`, `paths`, `lake-water` (`material: 'water'`), `lake-edge`, `trees` |
| `trees` | Placement list (`kind`, `x`, `y`, `z`, `height`, `crownRadius`) for instancing or LOD |
| `paths` | Path polylines with width and surface type |
| `heightAt(x, z)` | Analytic ground height, including the lake bed |
| `walkHeightAt(x, z)` | Ground or path-surface height for a walk camera |
| `isInLake(x, z)` | True north of the shoreline (not walkable) |
| `stats` | Vertex/triangle counts per mesh, tree and path counts |

Mesh format: `{ name, material, positions, normals, colors, indices }`, plain
number arrays (xyz, rgb 0..1), counter-clockwise front faces. It is pure ES
modules with no dependencies, so it loads the same way in the browser and in Node.

### Coordinate frame

Units are metres and Y is up. The origin is the fountain centre on the lower-terrace pavement.
**−Z is park north** (toward the Lake) and **+X is park east** (toward Loeb
Boathouse). The park grid is about 29° off true north, and we ignore that rotation.

| Element | Placement (approximate) |
| --- | --- |
| Lower terrace / fountain plaza | flat y = 0, x ∈ [−48, 48], z ∈ [−41, 30] |
| Terrace step (architecture zone) | z ≈ 24…64, \|x\| < 62; landscape keeps out |
| Upper level, Terrace Drive, the Mall | y = 5.5; Drive at z ≈ 44 (gap \|x\| < 24 for the bridge) |
| The Mall | central walk 11 m wide along x = 0, z 64…262; four elm rows at x = ±7.5, ±19.5 |
| Lake | water y = −0.8; coped straight edge at z = −41 for \|x\| ≤ 50, natural banks beyond |

## Scene statistics (from `node --test`)

```
terrain     9,116 vertices  17,850 triangles  (4 m grid, 340 m × 420 m)
paths       2,256 vertices   2,964 triangles  (11 paths)
lake-water  1,704 vertices     852 triangles
lake-edge      60 vertices      20 triangles
trees      62,106 vertices  20,702 triangles  (88 Mall elms + 320 scattered)
total      75,242 vertices  42,388 triangles
```

This is small enough for any WebGL1 device. Trees use flat-shaded,
non-indexed triangles, which accounts for most of the vertices. A viewer can
reduce this by instancing from `trees`.

## Tests

```
node --test test/landscape.test.mjs
```

10 tests, all passing. They check that meshes are well formed (finite values,
index ranges, colour ranges) and that terrain, path and water triangles face
up. They also cover: the flat plaza at y = 0, the Mall at the upper-level
height, the lake bed below water with banks above it, the terrain grid
dropping below water in front of the coped edge, four Mall elm rows clear of
the walks, scattered-tree exclusions (lake, plaza, terrace zone, Mall, paths)
with 7 m spacing, determinism, walk height, and the triangle/vertex budget.

## Preview renders

`tools/render-landscape-preview.mjs` is a dependency-free software rasterizer.
It renders the same scene data to PNG: a top-down map, a view from above the
Lake toward the terrace, and an eye-level view along the Mall:

```
node tools/render-landscape-preview.mjs docs/evidence
```

**Not yet run.** This agent session could not execute it because the local
permission policy only allowed `node --test`. No preview images are committed.
The owner or another session should run it and review the PNGs.

## Known limitations and uncertainty

- All dimensions are estimates chosen for recognizability. They are not from survey
  data. Verify against NYC Open Data (park features / planimetrics,
  1 ft contours / DEM), the Central Park Conservancy maps and aerial imagery.
  Record the source, licence and uncertainty in `docs/references.md`.
- The shoreline is a smooth analytic curve. Bow Bridge (west), Loeb Boathouse
  (east) and the Ramble shore (north) are out of this milestone's area.
- The lake-edge treatment in front of the lower terrace is a paved landing
  with a stone wall and a low curb. The real edge detail, including its boat-landing
  steps, is not verified. If the terrace module models the edge, it can replace
  `lake-edge`.
- Path alignments other than the Mall and Terrace Drive are illustrative.
- Trees are generic low-poly shapes. Scattered trees are placed by a seeded
  random generator and do not reproduce individual real trees.
- The terrain step under the terrace is left as a steep ramp for the
  architecture to cover. The plaza is coloured as paving so it reads correctly
  even before terrace paving is added.

— Karma42 agent cp3d-landscape, operated by Oron (Claude Code/claude-opus-5-5)
