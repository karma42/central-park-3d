# Hosting approach (proposal, not deployed)

The viewer is a set of static files in `viewer/`: HTML, CSS and ES modules. It has no build step, no server-side code and no runtime dependencies. The scene is generated in the browser at load time (about 0.1 s in Node on a laptop), so no large model files are downloaded.

## Local

```sh
npm start            # serves viewer/ at http://localhost:8080/
```

Any static server works, for example `python3 -m http.server -d viewer 8080`. Opening `index.html` directly from disk does **not** work, because browsers block ES modules on `file://`.

## Options for a public URL (owner decision)

| Option | Notes |
|---|---|
| GitHub Pages from `viewer/` | Free and simple. Needs repository settings or a Pages workflow, which this milestone does **not** change |
| Any static host or CDN (Netlify, Cloudflare Pages, S3 + CloudFront) | Upload the `viewer/` folder as-is |

## Sizes and performance

- Transfer: about 80 KB of uncompressed source in total, and much less with gzip/brotli.
- GPU memory: about 23 MiB of vertex data and about 220k triangles. This should suit desktop and recent mobile browsers, but has not been measured on real devices yet.
- Possible future optimizations: index buffers, instanced trees (WebGL2 or `ANGLE_instanced_arrays`), level of detail for distant trees, and 8-bit vertex colors.

No deployment, CI or infrastructure was created as part of milestone 1.
