# Milestone 1: independent integration check and owner review guide

Tracking issue: #1. Scene contract: #7. Main evidence: `docs/milestone-1.md` in #6.

This report was written by an AI agent (Karma42 agent bamba42, operated by Oron, Claude Code / claude-opus-5-5). Its job was to **reproduce** the integrated result on its own and list what the owner still has to check. It doesn't replace #6's evidence, and it claims no human review or approval. The owner approves the outcome.

## What was checked

A fresh local merge on 2026-10-11, in the order #7 sets out, merged without conflicts:

| Order | PR | Part | Head checked |
|---|---|---|---|
| 1 | #2 | Terrain, paths, trees, Lake (cp3d-landscape) | `5ef834d` |
| 2 | #4 | Bethesda Terrace, arcade, stairs, Fountain, *Angel of the Waters* (cp3d-terrace) | `2f6b48e` |
| 3 | #3 | Browser viewer and offline preview renderer (cp3d-viewer) | `8568a24` |
| 4 | #6 | `src/scene/index.js` aggregator, root `npm` scripts, evidence (cp3d-builder) | `0b8c6bc` |

## Results

| Check | Result |
|---|---|
| `npm test` (viewer + terrace + landscape, combined tree) | **71/71 pass**, 0 skipped, about 0.5 s |
| Scene size | 14 meshes, 138,344 vertices, **86,840 triangles**, 5.39 MB of GPU buffers, built and normalized in about 56 ms (Node) |
| `npm run preview` against the PNGs committed in #6 | All 5 viewpoints regenerate **byte-identical** |
| `src/scene/index.js` against the #7 entry point | Matches: mesh order, `groundHeight` fallback, `canWalk`, `spawn` |
| Spawn `[4, 0, 28]` | On the plaza: `groundHeight` = 0, `canWalk` = true |
| Winding against normals (`node tools/scene-audit.mjs`) | **0 reversed triangles** out of 86,840, so WebGL back-face culling shouldn't hide any face |
| Degenerate (zero-area) triangles | 5,098 (6%): terrace-balusters 4,304, fountain-bronze 570, fountain-water 120, terrace-stone 80, fountain-stone 24, landscape 0. They're harmless and only cost a little draw time; the cause and a fix are reported on #4 |

### Static review of the browser load path

No agent could launch a browser, so these are code-reading checks, not runtime checks:

- `viewer/index.html` → `viewer/src/main.js` → `../../src/scene/index.js` → terrace, fountain and landscape modules. Every import is a relative ES-module path with a `.js` extension. Nothing under `src/` or `viewer/src/` uses Node-only APIs (`node:`, `process`, `Buffer`).
- The viewer looks for the scene module with an HTTP `HEAD` request, which `python3 -m http.server` supports. If the module is missing, it shows a clearly labelled placeholder scene instead.
- The shaders are GLSL ES 1.00 (attribute/varying only, with a fragment precision guard), so they should compile on both WebGL1 and WebGL2.
- The CPU preview renderer culls back faces with the same counter-clockwise convention as the WebGL path (`render-preview.js:130`), so faces visible in the evidence images should also be visible on screen.

## Evidence images

These are offline CPU renders made with the viewer's own camera, shading and fog code. They are **not browser screenshots**. The files are committed in #6. The links point to that commit, so they work before #6 merges.

| View | Image | Reproduce in the browser |
|---|---|---|
| Overview | [overview-orbit.png](https://github.com/karma42/central-park-3d/blob/0b8c6bcc082df677ecbe004186200262e51fe952/docs/images/overview-orbit.png) | `viewer/index.html?mode=orbit` |
| Fountain | [fountain-orbit.png](https://github.com/karma42/central-park-3d/blob/0b8c6bcc082df677ecbe004186200262e51fe952/docs/images/fountain-orbit.png) | `?mode=orbit&tx=0&tz=0&dist=90&yaw=0.5&pitch=-0.45` |
| Plaza toward the Lake | [walk-plaza-to-lake.png](https://github.com/karma42/central-park-3d/blob/0b8c6bcc082df677ecbe004186200262e51fe952/docs/images/walk-plaza-to-lake.png) | `?mode=walk&x=4&z=28&yaw=0&pitch=0.02` |
| Plaza toward the arcade | [walk-plaza-to-arcade.png](https://github.com/karma42/central-park-3d/blob/0b8c6bcc082df677ecbe004186200262e51fe952/docs/images/walk-plaza-to-arcade.png) | `?mode=walk&x=-6&z=-36&yaw=3.14159&pitch=0.1` |
| Upper terrace | [walk-upper-terrace.png](https://github.com/karma42/central-park-3d/blob/0b8c6bcc082df677ecbe004186200262e51fe952/docs/images/walk-upper-terrace.png) | `?mode=walk&x=14&z=58&yaw=0.25&pitch=-0.12` |

What the renders show:
- The fountain with its two-tier basin, the *Angel of the Waters*, and translucent spray.
- The plaza paving ring and axis bands.
- The arcade facade with open arches.
- Both grand stairs and the balustraded deck and upper terrace.
- Terrace Drive.
- The Lake with landing steps and a tree-lined far bank.
- Paths and Mall elms.
- Edge fog that hides the scene boundary.

## Owner review checklist

Run all of these after merging #2 → #4 → #3 → #6, or on a local merge of their heads. You need Node 20 or later; there's no `npm install`.

1. `npm test`: expect 71/71 pass.
2. `node tools/scene-audit.mjs`: expect `reversed 0`. This report adds the file.
3. `python3 -m http.server 8000`, then open **http://localhost:8000/viewer/**. The root URL only shows a directory listing.
4. In the browser, check the following. **No agent has verified these:**
   - [ ] The status box goes away, there's no yellow placeholder note, and **Help** shows `Scene source: src/scene/index.js`.
   - [ ] The scene looks like the overview image, with no shader error and no console errors.
   - [ ] Orbit mode: drag rotates, wheel zooms, right-drag pans, and **R** resets the view.
   - [ ] Walk mode (**C**): W/A/S/D moves at eye height on the plaza. The grand stairs climb to the deck, the arcade wall and seawall block you, and the Lake isn't walkable. (Known: the fountain isn't solid yet; see below.)
   - [ ] The five URLs above roughly match their images.
   - [ ] On a phone or tablet, if available, touch orbit, pinch and the on-screen walk arrows work.

## What's missing or not verified

- **Real-browser run:** not done by any agent. WebGL shader compilation and on-screen output haven't been tested at runtime.
- **You can walk through the fountain.** `terraceHeightAt()` returns 0 for the whole lower plaza, including the pool (radius about 14.75 m), and `canWalk` only excludes the Lake. In walk mode you can pass through the basin rim, the water and the *Angel of the Waters*. The spawn faces the fountain, so this is the first thing a reviewer pressing W will see. It's reported on #4 and #6. Possible fixes: have `terraceHeightAt` return a rim height inside the pool, which the existing 0.6 m step rule then blocks, or exclude the pool in `canWalk` in `src/scene/index.js`.
- **Other collisions** come from changes in ground height (a step of more than 0.6 m blocks). Balustrades and trees aren't in the ground height, so they aren't solid.
- **Accuracy:** dimensions are approximate and haven't been checked against surveys or primary sources. The models are illustrative and low-poly.
- **Hosting:** out of scope for this milestone. If it comes later, note that the viewer's `HEAD` probe may fail on static hosts that reject `HEAD` (mentioned on #3).
- **Small cleanups (non-blocking):** about 5.1k degenerate triangles (#4). The #6 doc names #2 @ `926d338` while its head is `5ef834d`, a docs-only difference.
