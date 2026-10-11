# Bethesda Terrace and Fountain (milestone 1, terrace part)

AI-generated contribution to issue #1. It models the terrace architecture
(lower plaza, arcade, grand staircases, Mall staircase, Terrace Drive deck,
balustrades) and the Bethesda Fountain with the Angel of the Waters.
Landscape (terrain, paths, trees, the Lake) and the browser viewer are other
contributors' work and are not part of this change.

## Files

| File | Content |
| --- | --- |
| `src/scene/terrace-geom.js` | Dependency-free mesh builder: boxes, sloped hexahedra, lathes, prisms, limbs, transforms (mirroring safe) |
| `src/scene/terrace.js` | `buildTerrace()`, `terraceHeightAt(x, z)`, `TERRACE_LAYOUT`, `TERRACE_COLORS` |
| `src/scene/fountain.js` | `buildFountain()`, `FOUNTAIN_LAYOUT`, `FOUNTAIN_COLORS` |
| `tools/terrace-preview.mjs` | CPU preview renderer (PNG, back-face culled) for evidence images |
| `test/terrace.test.js` | Geometry, layout, walk-height and triangle-budget tests |
| `test/terrace-render.test.js` | In-memory render checks (no holes under back-face culling, views not empty) |

## Interface

`buildTerrace({ balusterSegments = 4 })` and `buildFountain()` each return an
array of plain meshes:

```js
{ name, color: [r, g, b], positions: Float32Array, normals: Float32Array, indices: Uint32Array, opacity? }
```

Front faces are counter-clockwise, and normals point outward. `fountain-spray`
carries `opacity: 0.55`. It is a single-sided shell, so viewers that ignore
opacity still draw it as a light veil. `terraceHeightAt(x, z)` returns the
walkable surface height, or `null` outside the terrace footprint, where landscape
terrain applies. In the arcade it returns the floor (y = 0) rather than the
drive deck above it, so walk mode can go from the plaza through the arcade to
the Mall stair. Inside the fountain pool (radius 14.75 m) it returns the rim
height (0.75 m). That rise is more than the viewer's 0.6 m step limit, so walkers
are stopped at the rim and go around the fountain instead of through it.

## Frame and layout (agreed with landscape and viewer in the #1 thread)

Units are meters and Y is up. The origin is the fountain center at plaza level.
−Z is park north (the Lake), +Z is park south (the Mall), and +X is park east.
The park grid is about 29° off true north; that rotation is ignored.

| Element | Placement |
| --- | --- |
| Lower plaza (y = 0) | x ∈ [−50, 50], z ∈ [−42, 36] |
| Fountain pool | radius 14.75 m at the origin |
| Lake seawall + balustrade | z = −42; central landing steps x ∈ [−6, 6] down to z = −45, y = −0.9 (water y = −0.8) |
| Arcade north facade | z = 36, three arched bays, x ∈ [−13, 13] |
| Grand staircases | x ∈ [−28, −16] and [16, 28], z ∈ [24, 36], 32 risers of 0.17 m |
| Terrace Drive deck (y = 5.5) | x ∈ [−50, 50], z ∈ [36, 50]; asphalt strip z ∈ [39, 47] |
| Upper terrace (y = 5.5) | z ∈ [50, 64], central Mall stair x ∈ [−6, 6] descending north into the arcade |
| Deck end walls | x = ±50, z ∈ [36, 64], from y = −4 up to the deck (hide lower terrain beside the deck) |
| Mall entry | z = 64, y = 5.5, centered on x = 0 |

## Fountain and statue

| Part | Model value |
| --- | --- |
| Pool | outer radius 14.75 m, coping top 0.75 m, water 0.45 m |
| Lower bowl | radius 3.05 m, rim 2.8 m, with a water veil to the pool |
| Four cherubs | standing in the lower bowl around the shaft |
| Upper bowl | radius 1.55 m, rim 4.62 m, with a water veil to the lower bowl |
| Angel of the Waters | stands on a plinth at 5.4 m; top of the wings ≈ 8.1 m |

The angel is built from primitives. A robe flares to the hem, the torso and
shoulders are flattened, and the head has a hair mass. The right arm extends
forward over the water in blessing. The left arm holds a lily stem with a
bloom. Two swept-back wings are mirrored copies of one extruded outline.

## Sources to verify and uncertainty

The dimensions here are **not from a survey**. They are estimates from general
knowledge of the site, chosen so the scene is recognizable and internally
consistent. Each item should be checked against a citable source, for example
NYC Parks or Central Park Conservancy pages, the Historic American Buildings
Survey, NYC open GIS data such as planimetrics and elevation, or licensed
photographs.

- Historical facts (high confidence, still worth citing): the terrace was
  designed by Calvert Vaux with Jacob Wrey Mould. The *Angel of the Waters* is by
  Emma Stebbins and was dedicated in 1873. It commemorates the Croton Aqueduct.
  The four cherubs represent Temperance, Purity, Health and Peace. The arcade
  ceiling uses Minton encaustic tiles.
- Pool diameter (≈ 29 m / 96 ft) and fountain height (≈ 8 m / 26 ft): medium
  confidence.
- Plaza extent, fountain-to-arcade distance (36 m here), and the deck and Terrace
  Drive widths: low confidence. Chosen to fit the pool, the stairs and a
  recognizable promenade.
- Level difference between the plaza and the Mall/drive (5.5 m): low to medium
  confidence.
- Number and shape of the arcade's north-facing arches (3 equal semicircular
  bays here): low confidence. The real facade differs in proportions and detail.
- The angel's facing direction (+Z, toward the arcade here), wing pose and arm
  pose: low confidence. Check against photographs.
- Not modeled: carved stone ornament (bird, plant and seasonal panels), lamp
  posts, the arcade interior beyond two columns and a flat tile ceiling, tile patterns,
  animated water.

## Evidence

Test commands (only `node --test` was available to this agent):

```sh
node --test test/terrace.test.js test/terrace-render.test.js
```

Result recorded by the agent on 2026-10-11 (Node v25.7.0): 19 tests pass.

The render tests rasterize six views in memory. For each view they check that
back-face culling does not change the image (under 1% of pixels differ). That
means every visible face is wound outward and nothing renders inside-out in a
culling WebGL viewer. They also check that every view shows geometry and that
the angel close-up has statue pixels at its center.

Mesh statistics, from the test diagnostics with the default `balusterSegments = 4`:

| Mesh | Vertices | Triangles |
| --- | ---: | ---: |
| terrace-stone | 3,408 | 1,732 |
| terrace-balusters | 37,660 | 25,824 |
| terrace-paving | 2,520 | 1,260 |
| terrace-paving-accent | 170 | 132 |
| terrace-drive | 24 | 12 |
| arcade-tile-ceiling | 24 | 12 |
| fountain-stone | 900 | 856 |
| fountain-bronze | 2,610 | 2,376 |
| fountain-water | 246 | 120 |
| fountain-spray | 116 | 112 |
| **Total** | | **32,436** |

`lathe()` skips the triangles that would collapse to zero area at a pole
(radius 0), so none of the meshes contain degenerate triangles.

The balusters make up most of the triangle count. `balusterSegments: 8` gives
rounder balusters at about twice that cost.

### Preview images (owner action)

For evidence of the combined scene (terrace, fountain, landscape), use the
viewer's renderer, `node viewer/tools/render-preview.js` (PR #3). It renders
the same scene data with the viewer's own camera. The terrace-only tool below
also supports `test/terrace-render.test.js` (the culling and winding checks).

This agent's session cannot run `node` scripts other than `node --test`, so no
PNGs are committed. To produce them, run:

```sh
node tools/terrace-preview.mjs docs/previews
```

That writes `terrace-overview`, `terrace-from-lake`, `fountain-closeup`,
`angel-closeup`, `arcade-and-stairs` and `from-upper-terrace` PNGs
(1200×750) and prints per-mesh statistics. The render tests use the same
renderer, so any image it writes has passed the checks above.

## Known limitations

- Shapes are approximate, and the statue is stylized. The goal is
  recognizability (two-level terrace, arcade, flanking stairs, balustrades,
  central fountain with an angel on top), not fidelity.
- Each material is one color. There are no textures.
- The walk-height function is 2D, so in walk mode the drive deck directly
  above the arcade is not walkable.
