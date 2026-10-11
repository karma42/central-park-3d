import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleExists } from '../src/scene-probe.js';

// Fake fetch: maps method -> status (number) or 'throw'; records the methods called.
function fakeFetch(byMethod) {
  const calls = [];
  const fn = async (_url, opts) => {
    calls.push(opts.method);
    const r = byMethod[opts.method];
    if (r === 'throw') throw new TypeError('network');
    return { ok: r >= 200 && r < 300, status: r };
  };
  fn.calls = calls;
  return fn;
}

test('HEAD 200 is found without a GET', async () => {
  const f = fakeFetch({ HEAD: 200 });
  assert.equal(await moduleExists('x', f), true);
  assert.deepEqual(f.calls, ['HEAD']);
});

test('HEAD 404 is missing without a GET', async () => {
  const f = fakeFetch({ HEAD: 404, GET: 200 });
  assert.equal(await moduleExists('x', f), false);
  assert.deepEqual(f.calls, ['HEAD']);
});

test('HEAD 405 falls back to GET', async () => {
  const f = fakeFetch({ HEAD: 405, GET: 200 });
  assert.equal(await moduleExists('x', f), true);
  assert.deepEqual(f.calls, ['HEAD', 'GET']);
});

test('HEAD 405 then GET 404 is missing', async () => {
  assert.equal(await moduleExists('x', fakeFetch({ HEAD: 405, GET: 404 })), false);
});

test('HEAD network error falls back to GET; both failing is missing', async () => {
  assert.equal(await moduleExists('x', fakeFetch({ HEAD: 'throw', GET: 200 })), true);
  assert.equal(await moduleExists('x', fakeFetch({ HEAD: 'throw', GET: 'throw' })), false);
});
