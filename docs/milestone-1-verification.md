# Milestone 1: independent integration check and owner review guide

Tracking issue: #1. Scene contract: #7. Main evidence: `docs/milestone-1.md` in #6.

This report was written by an AI agent (Karma42 agent bamba42, operated by Oron, Claude Code / claude-opus-5-5). Its job was to **reproduce** the integrated result on its own and list what the owner still has to check. It doesn't replace #6's evidence, and it claims no human review or approval. The owner approves the outcome.

## Team status for the owner (running; latest update 2026-10-11 09:21 UTC)

bamba42 coordinates and reviews at the owner's request. It doesn't take over claimed work or merge anything. #1 is claimed by cp3d-builder; the other agents are contributors. **All four agents are holding for owner review, and none has pending code work.**

### GitHub PR heads, verified together

| PR | Agent | GitHub head | State |
|---|---|---|---|
| #2 | cp3d-landscape | `5ef834d` | Reviewed; no blocking findings |
| #4 | cp3d-terrace | `022802e` | Reviewed. **The fountain is now solid** in walk mode: `terraceHeightAt` returns the 0.75 m rim inside the pool, so the 0.6 m step rule blocks it. All zero-area triangles removed. New tests |
| #3 | cp3d-viewer | `734f1ad` | Reviewed. `HEAD`→`GET` scene-probe fallback, page zoom allowed, and a new integration test: "the fountain basin stops a walker heading north from spawn" |
| #6 | cp3d-builder | `0b8c6bc` | Reviewed. Code is correct, but `docs/milestone-1.md` is now **slightly stale** (see the owner actions) |

**Result** (main + #2 @ `5ef834d` + #4 @ `022802e` + #3 @ `734f1ad` + #6 @ `0b8c6bc`, merged in #7 order with no conflicts):
- `npm test`: **79/79 pass**, 0 skipped. That includes both new fountain tests.
- `node tools/scene-audit.mjs`: 0 reversed and **0 degenerate** triangles (previously 5,098). The scene is **81,742 triangles** and 5.36 MB. Spawn `groundHeight` is 0 and `canWalk` is true.
- A separate walk simulation with the viewer's `walk()` (from z = 28 toward −Z at x = 0, 4 and 10) stops at the pool edge (r ≈ 14.8–15.0 m).
- `npm run preview`: four images are byte-identical to the ones committed in #6. `fountain-orbit.png` differs by a few pixels from the removed degenerate triangles, with no visible change.

### Owner actions (optional, non-blocking)

Two agents committed small follow-ups locally but **their sessions couldn't `git push`**, because pushing needs human approval they couldn't get. bamba42 doesn't push other agents' branches.
- `cp3d-scene-index` @ `0296ee5` (#6; it builds on `b49fa45`): adds a root `index.html` that redirects to `viewer/`. It also refreshes `docs/milestone-1.md` against #4 @ `022802e` (81,742 triangles, the fountain fix in the fixed-issues table) and the regenerated `fountain-orbit.png`. **bamba42 verified it:** on the GitHub heads it gives 79/79, and the image is byte-identical to bamba42's render. One small staleness remains: the doc cites #3 @ `6227340` and 78 tests, but it's 79 at #3 @ `734f1ad`. The builder has been asked for a one-line follow-up. If you skip this push, read `docs/milestone-1.md` in #6 together with this report; the figures here are current.
- `cp3d-landscape-work` @ `7d6aa85` (#2): a regression test that none of the 508 tree trunks stands on a path, the plaza or terrace, or the Lake. It changes no geometry.

To publish them, run `git push origin cp3d-scene-index` and `git push origin cp3d-landscape-work` (both fast-forward their PR branches), or approve pushing in those agents' next sessions.

Scope is frozen to fixes only. Proposed merge order: **#2 → #4 → #3 → #6 → #8**. Open disagreements between agents: none. cp3d-builder agreed that the fountain fix belongs in #4 (`terraceHeightAt`), not in `index.js`.

## What was checked

*This is the **first** check, before the fixes, and it's kept as history. Current figures are in the team status above.* It was a fresh local merge on 2026-10-11, in the order #7 sets out, with no conflicts:

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
| Degenerate (zero-area) triangles | 5,098 (6%): terrace-balusters 4,304, fountain-bronze 570, fountain-water 120, terrace-stone 80, fountain-stone 24, landscape 0. They're harmless and only cost a little draw time; reported on #4 and **fixed in #4 @ `022802e`** (now 0) |

### Static review of the browser load path

No agent could launch a browser, so these are code-reading checks, not runtime checks:

- `viewer/index.html` → `viewer/src/main.js` → `../../src/scene/index.js` → terrace, fountain and landscape modules. Every import is a relative ES-module path with a `.js` extension. Nothing under `src/` or `viewer/src/` uses Node-only APIs (`node:`, `process`, `Buffer`).
- The viewer looks for the scene module with an HTTP `HEAD` request, which `python3 -m http.server` supports. Since #3 @ `734f1ad`, it retries with `GET` when `HEAD` is refused. If the module is missing, it shows a clearly labelled placeholder scene instead.
- The shaders are GLSL ES 1.00 (attribute/varying only, with a fragment precision guard), so they should compile on both WebGL1 and WebGL2.
- The CPU preview renderer culls back faces with the same counter-clockwise convention as the WebGL path (`render-preview.js:130`), so faces visible in the evidence images should also be visible on screen.

## Evidence images

These are offline CPU renders made with the viewer's own camera, shading and fog code. They are **not browser screenshots**. The files are committed in #6. The links point to that commit, so they work before #6 merges. With the current heads they're still accurate: four are byte-identical, and `fountain-orbit.png` differs only by a few pixels.

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

1. `npm test`: expect 79/79 pass at the heads listed in the team status (more if `7d6aa85` is pushed).
2. `node tools/scene-audit.mjs`: expect `reversed 0, degenerate 0`. This report adds the file.
3. `python3 -m http.server 8000`, then open **http://localhost:8000/viewer/**. The root URL only shows a directory listing unless `b49fa45` (the root redirect) is pushed.
4. In the browser, check the following. **No agent has verified these:**
   - [ ] The status box goes away, there's no yellow placeholder note, and **Help** shows `Scene source: src/scene/index.js`.
   - [ ] The scene looks like the overview image, with no shader error and no console errors.
   - [ ] Orbit mode: drag rotates, wheel zooms, right-drag pans, and **R** resets the view.
   - [ ] Walk mode (**C**): W/A/S/D moves at eye height on the plaza. The grand stairs climb to the deck, the arcade wall, seawall and **fountain basin** block you, and the Lake isn't walkable.
   - [ ] The five URLs above roughly match their images.
   - [ ] On a phone or tablet, if available, touch orbit, pinch and the on-screen walk arrows work.

## What's missing or not verified

- **Real-browser run:** not done by any agent. WebGL shader compilation and on-screen output haven't been tested at runtime.
- **Fixed during review:** at #4 @ `2f6b48e`, a walker could pass through the fountain basin and the angel. #4 @ `022802e` fixes it, and the new tests in #4 and #3 cover it.
- **Collisions** come from changes in ground height (a step of more than 0.6 m blocks). Balustrades and trees aren't in the ground height, so they aren't solid.
- **Accuracy:** dimensions are approximate and haven't been checked against surveys or primary sources. The models are illustrative and low-poly.
- **Hosting:** out of scope for this milestone. The `HEAD`-probe concern is handled by #3 @ `734f1ad`.
- **Stale numbers in #6's doc:** `docs/milestone-1.md` at `0b8c6bc` still gives 71 tests, 86,840 triangles and #2 @ `926d338`. See the owner actions above.
