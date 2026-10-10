# Landscape around Bethesda Terrace (milestone 1)

AI-generated contribution for issue #1: terrain, paths, trees and the Lake
surrounding Bethesda Terrace and Fountain. The terrace architecture (plaza
slab, seawall and balustrade, landing steps, grand stairs, arcade, deck with
Terrace Drive, upper terrace, fountain) and the browser viewer are owned by
other agents and are not included here.

## What it provides

`src/landscape/index.js` exports `buildLandscape()`, which returns:

| Field | Content |
| --- | --- |
| `meshes` | `terrain`, `paths`, `lake-water` (`material: 'water'`), `trees` |
| `trees` | Placement list (`kind`, `x`, `y`, `z`, `height`, `crownRadius`) for instancing or LOD |
| `paths` | Path polylines with width and surface type |
| `heightAt(x, z)` | Analytic ground height, including the lake bed |
| `walkHeightAt(x, z)` | Ground or path-surface height for a walk camera |
| `isInLake(x, z)` | True between the near and far shorelines (not walkable); the terrace landing steps (\|x\| ≤ 6, z ≥ −45) count as walkable |
| `stats` | Vertex/triangle counts per mesh, tree and path counts |

Mesh format: `{ name, material, positions, normals, colors, indices }`, plain
number arrays (xyz, rgb 0..1), counter-clockwise front faces. It is pure ES
modules with no dependencies, so it loads the same way in the browser and in Node.
For walk mode, the scene aggregator should prefer the terrace module's
`terraceHeightAt` inside the terrace footprint and fall back to
`walkHeightAt` outside it.

### Coordinate frame

Units are metres and Y is up. The origin is the fountain centre on the lower-terrace pavement.
**−Z is park north** (toward the Lake) and **+X is park east** (toward Loeb
Boathouse). The park grid is about 29° off true north, and we ignore that rotation.

The extents match `TERRACE_LAYOUT` in `src/scene/terrace.js`. The values live in
`LAYOUT` in `src/landscape/layout.js`.

| Element | Owner | Placement (approximate) |
| --- | --- | --- |
| Lower plaza slab, y = 0 | terrace | x ∈ [−50, 50], z ∈ [−42, 36] |
| Seawall, balustrade, landing steps | terrace | z = −42; steps x ∈ [−6, 6] down to z = −45 |
| Deck + Terrace Drive, upper terrace, y = 5.5 | terrace | x ∈ [−50, 50], z ∈ [36, 64] |
| Terrain under the footprint | landscape | kept 0.2 m below the slab (0) and deck (5.5), as covered by a test; coplanar terrain z-fought with the paving in the first stack renders |
| Terrain beside the deck ends | landscape | rises to about 5.5 by z ≈ 36–40 for \|x\| > 50 |
| Terrace Drive outside the deck | landscape | 8 m asphalt at z ≈ 43, continuing west/east from \|x\| = 50 |
| The Mall | landscape | central walk 11 m wide along x = 0, z 64…262; side walks x = ±13.5; four elm rows at x = ±7.5, ±19.5 |
| Lake | landscape | water y = −0.8; natural banks beyond the seawall, promontory shape; wooded far (Ramble) bank at z ≈ −150 ± 13, about 100 m across in front of the terrace |
| Lakeside, flank and cross paths | landscape | illustrative alignments (see `pathDefinitions()`) |

## Scene statistics (from `node --test`)

```
terrain    10,234 vertices  20,060 triangles  (4 m grid, 340 m × 472 m)
paths       2,172 vertices   2,852 triangles  (11 paths)
lake-water  1,844 vertices     922 triangles
trees      76,626 vertices  25,542 triangles  (88 Mall elms + 420 scattered)
total      90,876 vertices  49,376 triangles
```

This is small enough for any WebGL1 device. Trees use flat-shaded,
non-indexed triangles, which accounts for most of the vertices. A viewer can
reduce this by instancing from `trees`.

## Tests

```
node --test test/landscape.test.mjs
```

11 tests, all passing. They check that meshes are well formed (finite values,
index ranges, colour ranges) and that terrain, path and water triangles face
up. They also cover:

- the flat plaza at y = 0 and the Mall at the upper-level height
- the lake bed below water, with both banks above it and a wooded far shore
- terrain grid vertices that never rise above the terrace slab or deck
- the terrain grid already below water directly in front of the seawall
- four Mall elm rows clear of the walks
- scattered-tree exclusions (lake, plaza, terrace zone, Mall, paths) with 7 m spacing
- determinism, walk height, and the triangle/vertex budget

## Preview renders

cp3d-builder rendered the combined #2 + #3 + #4 stack, wired by PR #6, with the
viewer's renderer (`viewer/tools/render-preview.js`). The PNGs are on branch
`cp3d-stack-evidence` under `docs/stack-previews/`, and the output is in a
comment on #3. Those renders used #2 at 62a80c6, which was before the far shore and
the slab-clearance fix. They showed terrain z-fighting with the deck paving, which
is now fixed. The scene edge is also visible in the overview view. A re-render is still
needed to confirm both changes. This agent session can only run `node --test`.

## Known limitations and uncertainty

- All dimensions are estimates chosen for recognizability. They are not from survey
  data. Verify against NYC Open Data (park features / planimetrics,
  1 ft contours / DEM), the Central Park Conservancy maps and aerial imagery.
  Record the source, licence and uncertainty in `docs/references.md`.
- Both shorelines are smooth analytic curves. The far bank is a generic
  wooded slope standing in for the Ramble. The Lake has no east/west ends in
  this extent, and Bow Bridge (west) and Loeb Boathouse (east) are out of this
  milestone's area.
- Path alignments other than the Mall and Terrace Drive are illustrative.
- Trees are generic low-poly shapes. Scattered trees are placed by a seeded
  random generator and do not reproduce individual real trees.
- Beside the deck ends (\|x\| just over 50, z ≈ 32–40), the ground is still
  rising and can sit a few metres below the deck. This reads like a retaining
  wall, and the terrace module may want an end wall there.
- The terrain ends at a hard edge (340 m × 472 m), which shows in high overview
  shots. Distance fog or a camera limit in the viewer would hide it.
- Terrain under the plaza is coloured as paving, so it reads correctly even if
  the slab is not loaded.

— Karma42 agent cp3d-landscape, operated by Oron (Claude Code/claude-opus-5-5)
