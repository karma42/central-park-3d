# Browser viewer

Dependency-free WebGL viewer for the Central Park 3D scene (milestone 1: Bethesda Terrace and Fountain). Plain ES modules, no build step, no third-party libraries.

## Run it locally

ES modules do not load from `file://`, so serve the repository root with any static file server:

```sh
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000/viewer/
```

`npx serve .` or any other static server works the same way. Requires a browser with WebGL (WebGL 2 preferred; WebGL 1 works).

### Scene source

On start the viewer looks for a scene module, first match wins:

1. `src/scene/index.js`
2. `scene/index.js`

The module must export `buildScene()` (sync or async). If neither exists, the viewer shows a small built-in **placeholder scene** with a yellow notice. That placeholder is a viewer test fixture, not the Bethesda Terrace model. Add `?scene=placeholder` to force it.

Errors thrown inside a scene module are not hidden. The viewer shows them in a red status box.

### Scene data contract

```js
buildScene() → {
  meshes: [{
    name,                       // string
    positions,                  // xyz, Float32Array or number[]; metres, Y up
    indices,                    // optional; Uint16/Uint32Array or number[] (non-indexed is fine)
    normals,                    // optional; computed from faces when absent
    colors | color,             // per-vertex rgb 0–1, or one [r,g,b] for the whole mesh
    doubleSided,                // optional; disables back-face culling for this mesh
    opacity,                    // optional 0–1 (default 1); translucent meshes are blended after opaque ones
  }],
  bounds,                       // optional { min:[x,y,z], max:[x,y,z] }; computed when absent
  spawn,                        // optional { position:[x,y,z], yaw, pitch } for walk mode
  groundHeight | heightAt,      // optional (x, z) => y; walk mode follows it
  canWalk,                      // optional (x, z) => boolean; walk mode won't enter false areas (e.g. the Lake)
}
```

Front faces are counter-clockwise. Yaw 0 looks toward −Z (the Lake, park-north), and positive yaw turns toward −X. The project convention puts the origin at the fountain centre on the plaza (y = 0).

## Controls

| | Orbit mode (default) | Walk mode |
|---|---|---|
| Mouse drag / one-finger drag | rotate around view centre | look around |
| Right-drag, Shift+drag, two-finger drag | pan | — |
| Wheel, pinch, `+` / `−` | zoom | — |
| `W A S D`, arrow keys | pan | walk (Shift: run) |
| `Q` / `E` | rotate | turn |
| Touch | — | on-screen arrow pad |

- `C` or `Tab` (or the toolbar button) switches modes. The viewpoint carries across, so walk starts where the orbit was centred.
- `R` (or **Reset view**) returns to the starting view in the current mode.
- Walk mode keeps the eye 1.7 m above the ground function, moves at 4 m/s (12 m/s running), stays inside the scene bounds and slides along `canWalk` edges such as the shoreline. Collisions with walls are not modelled.

### Reproducible viewpoints

The camera can be set from the URL, so reviewers can open the exact view in a screenshot:

```
viewer/index.html?mode=walk&x=4&z=28&yaw=0&pitch=0.02      # plaza, looking past the fountain to the Lake
viewer/index.html?mode=orbit&tx=0&tz=0&dist=90&yaw=0.5&pitch=-0.45
viewer/index.html?hud=0          # hide UI panels for clean screenshots
```

Angles are in radians. Invalid values are ignored, and positions are clamped to the scene bounds.

## Performance

- **Render on change.** A frame is drawn only when the camera or canvas size changes, so an idle viewer uses almost no GPU or battery. The HUD's fps figure counts these renders.
- **Frustum culling.** Each mesh gets a bounding sphere at upload, and meshes outside the view are skipped. The HUD shows `draws visible/total` and `tris visible/total`.
- **One draw call per mesh.** Scene modules should merge small repeated parts (balustrade posts, trees in a row) into a few meshes rather than one mesh per object.
- **Compact buffers.** 16-bit indices are used whenever a mesh has ≤ 65 536 vertices. Device pixel ratio is capped at 2.
- **Load timing.** The HUD reports total load time and scene build time, plus the GPU buffer size, which gives the owner a rough measure of practical loading.

## Evidence for review

### Headless previews

`viewer/tools/render-preview.js` rasterizes the same scene data on the CPU with the viewer's camera code and shading constants, then writes PNGs. It needs no browser and no GPU:

```sh
node viewer/tools/render-preview.js                 # scene module → docs/previews/*.png
node viewer/tools/render-preview.js --scene placeholder --out /tmp/previews
node viewer/tools/render-preview.js --view stairs=mode=walk\&x=22\&z=20\&yaw=3.14159
```

For each image it prints scene statistics and the matching `viewer/index.html?…` URL. Previews approximate the browser output (flat 2× supersampling, no perspective-correct colour interpolation). They are not browser screenshots.

### Browser screenshots

1. Serve the repository and open each URL printed by the preview tool, adding `&hud=0` for a clean frame.
2. Take a screenshot of each view and save it under `docs/screenshots/` with the same name as its preview.
3. Also take one screenshot with the HUD visible, so load time, triangle count and GPU memory are on record.

## Tests

```sh
node --test 'viewer/test/*.test.js'
```

`scene-integration.test.js` runs the real scene through the viewer pipeline whenever the scene modules are in the checkout, and skips otherwise. It uses `src/scene/index.js` if present, or else composes the terrace, fountain and landscape modules. It checks the triangle, GPU memory and draw-call budget, walk heights on the plaza, deck and upper terrace, the walker stopping at the Lake, and geometry in every default preview view. A local merge of PRs #2, #3 and #4 on 2026-10-10 measured 14 meshes, about 122k vertices, 79.6k triangles, 4.65 MB of GPU buffers and 6 ms to normalize, and all 33 tests passed.

The tests also cover the matrix and frustum maths, orbit/walk/reset camera behaviour and limits, URL viewpoints, scene-data validation and normalization, the preview rasterizer (coverage, back-face culling, near-plane clipping) and the PNG encoder.

## Hosting

The viewer and scene are static files: HTML, ES modules and no server code. They can be published from any static host or CDN that serves `.js` as `text/javascript`. Scene geometry is generated in the browser from code, so there are no large asset downloads. If later milestones switch to precomputed binary geometry, those files should be served compressed (gzip/brotli). No deployment is part of this milestone.

## Known limitations

- No collision with walls or stairs in walk mode. The walker follows the ground function, and `canWalk` blocks only whole areas such as water.
- No textures, shadows or water animation. Lighting is one sun plus sky ambient with distance fog.
- Real-browser screenshots are not yet in the repository; see *Evidence for review* above.
