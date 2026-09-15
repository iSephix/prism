// SPDX-License-Identifier: Apache-2.0
'use strict';
const {
  test
} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require(
  'node:path'), vm = require('node:vm'), {
  pathToFileURL
} = require('node:url'), {
  spawnSync
} = require('node:child_process');
const root = path.join(__dirname, '..'),
  P = require('..');

function context() {
  const c = vm.createContext({
    TextEncoder,
    TextDecoder,
    URL,
    performance,
    crypto: globalThis.crypto,
    console,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    Int16Array,
    Int8Array,
    Uint32Array,
    DataView,
    ArrayBuffer
  });
  c.self = c;
  return c;
}
test('CJS and ESM entries expose the same functions; encoding loads no vendor', async () => {
  const m = await import(pathToFileURL(path.join(root, 'index.mjs')).href);
  assert.equal(m.encode, P.encode);
  assert.equal(m.default, P);
  const r = spawnSync(process.execPath, ['-e',
    "const p=require('./');p.encode('x');if(Object.keys(require.cache).some(f=>f.includes('jsqr-locator')))process.exit(1)"
  ], {
    cwd: root
  });
  assert.equal(r.status, 0, r.stderr.toString());
});
test('core browser bundle encodes/matrix-decodes without the optical dependency', () => {
  const c = context();
  vm.runInContext(fs.readFileSync(path.join(root, 'dist/prism19-core.js'), 'utf8'), c);
  assert.equal(c.Prism19Locator, undefined);
  const code = c.Prism19.encode('Core browser');
  assert.equal(c.Prism19.decodeMatrix(c.Prism19.toMatrix(code)).text, 'Core browser');
  assert.throws(() => c.Prism19.scan(c.Prism19.toRGBA(code)), /locator|bundle/);
});
test('full browser bundle performs a blind optical decode and does not mutate alpha input', () => {
  const c = context();
  vm.runInContext(fs.readFileSync(path.join(root, 'dist/prism19.js'), 'utf8'), c);
  const image = P.toRGBA(P.encode('Browser bundle'));
  for (let i = 0; i < image.data.length; i += 4)
    if (image.data[i] === 255 && image.data[i + 1] === 255 && image.data[i + 2] === 255) image.data[i +
      3] = 0;
  const original = Buffer.from(image.data);
  assert.equal(c.Prism19.scan(image).text, 'Browser bundle');
  assert.deepEqual(Buffer.from(image.data), original);
});
test('the actual example worker loads and responds through its public message contract', () => {
  const c = context(),
    out = [];
  c.postMessage = v => out.push(v);
  c.importScripts = (...files) => {
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, 'examples', file),
      'utf8'), c, {
        filename: file
      });
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'examples/worker.js'), 'utf8'), c);
  c.onmessage({
    data: {
      id: 1,
      image: P.toRGBA(P.encode('Worker transport')),
      options: {},
      accumulate: true,
      burst: true
    }
  });
  assert.equal(out[0].result.text, 'Worker transport');
  c.onmessage({ data: { id: 2, image: P.toRGBA(P.encodePayload('url', 'https://example.com/prism')),
    options: {}, accumulate: false, burst: false } });
  assert.equal(out[1].result.kind, 'payload');
  assert.equal(out[1].result.payload.text, 'https://example.com/prism');
  c.onmessage({
    data: {
      reset: true
    }
  });
});
