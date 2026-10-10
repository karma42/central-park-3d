import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViewerServer } from '../tools/serve.mjs';

let server, base;
before(async () => {
  server = createViewerServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('serves the viewer page and its ES modules', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  assert.match(html, /src\/main\.js/);
  for (const m of ['main', 'scene', 'renderer', 'camera', 'site', 'geometry', 'math', 'surroundings']) {
    const r = await fetch(`${base}/src/${m}.js`);
    assert.equal(r.status, 200, m);
    assert.match(r.headers.get('content-type'), /javascript/);
  }
});

test('does not serve files outside the viewer directory', async () => {
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json']) {
    const r = await fetch(`${base}${p}`);
    assert.ok(r.status === 403 || r.status === 404, `${p} -> ${r.status}`);
  }
});

test('missing files return 404', async () => {
  assert.equal((await fetch(`${base}/nope.js`)).status, 404);
});
