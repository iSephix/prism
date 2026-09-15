// SPDX-License-Identifier: Apache-2.0
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const P = require('..'), C = require('../src/codec.js'), A = require('../src/alphabet19.js');

function erase(image, code, cells, scale) {
  for (const cell of cells) for (let y = 0; y < scale; y++) {
    const start = 4 * (((Math.floor(cell / code.n) + 4) * scale + y) * image.width +
      (cell % code.n + 4) * scale);
    image.data.fill(255, start, start + scale * 4);
  }
  return image;
}

test('raster tiles preserve every glyph mask, finder, quiet zone and opaque alpha', () => {
  const code = P.encode('Raster conformance');
  for (const scale of [1, 3, 8, 12, 19, 32]) {
    const image = P.toRGBA(code, scale), visited = new Set();
    for (let cell = 0; cell < code.cells.length; cell++) {
      const fixed = code.layout.fixed[cell], symbol = code.cells[cell];
      const key = fixed >= 0 ? `fixed-${fixed}` : symbol;
      if (visited.has(key)) continue;
      visited.add(key);
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
        const p = 4 * (((Math.floor(cell / code.n) + 4) * scale + y) * image.width +
          (cell % code.n + 4) * scale + x);
        const rgb = fixed >= 0 ? Array(3).fill(fixed ? 0 : 255) :
          A.pixel(A.symbols[symbol], (x + .5) / scale, (y + .5) / scale);
        assert.deepEqual(Array.from(image.data.subarray(p, p + 4)), [...rgb, 255]);
      }
    }
    assert.equal(visited.size, 21);
    for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1],
      [image.width - 1, image.height - 1], [3 * scale, image.height / 2 | 0]]) {
      const p = 4 * (y * image.width + x);
      assert.deepEqual(Array.from(image.data.subarray(p, p + 4)), [255, 255, 255, 255]);
    }
  }
});

test('washed-out pilot copies and inconsistent recovery equations still recover exact bytes', () => {
  const text = 'Compare the same payload at the same camera footprint. '.repeat(3), code = P.encode(text);
  const damagedPilots = erase(P.toRGBA(code, 12), code, code.layout.pilots.slice(0, 12), 12);
  assert.equal(P.scan(damagedPilots, { maxTimeMs: 10000 }).text, text);
  const repairText = 'Equation rescue: entire block is gone.', repair = P.encode(repairText);
  for (let i = 0; i < 6; i++) {
    const cell = repair.layout.slots[76 + repair.blocks * 19 + i];
    repair.cells[cell] = (repair.cells[cell] + 7) % 19;
  }
  const image = erase(P.toRGBA(repair, 16), repair,
    Array.from({ length: 19 }, (_, j) => repair.layout.slots[76 + j * repair.blocks]), 16);
  assert.equal(P.scan(image, { soft: false, equations: false, spatial: false, refine: false, maxTimeMs: 10000 }).kind, 'partial19');
  const result = P.scan(image, { maxTimeMs: 10000 });
  assert.equal(result.text, repairText);
  assert.equal(result.repaired, repair.k);
});

test('pose tracking re-reads changed payloads and rejects stale results; invalidation redetects', () => {
  const original = Date.now;
  let time = 1000;
  Date.now = () => time;
  try {
    const session = P.createSession(), config = { session, diagnostics: true, maxTimeMs: 10000 };
    const a = P.toRGBA(P.encode('Tracking message 1')), b = P.toRGBA(P.encode('Tracking message 2'));
    const first = P.scan(a, config);
    assert.equal(first.text, 'Tracking message 1');
    assert.ok(first.diagnostics.locateCalls > 0);
    time += 20;
    const next = P.scan(b, config);
    assert.equal(next.text, 'Tracking message 2');
    assert.equal(next.diagnostics.locateCalls, 0);
    assert.equal(next.diagnostics.tracked, true);
    const blank = { ...b, data: new Uint8ClampedArray(b.data.length).fill(255) };
    assert.equal(P.scan(blank, config).kind, 'none');
    assert.ok(P.scan(b, { ...config, tracking: false }).diagnostics.locateCalls > 0);
    time += 1001;
    assert.ok(P.scan(b, config).diagnostics.locateCalls > 0);
    session.clear();
    assert.ok(P.scan(b, config).diagnostics.locateCalls > 0);
    const resized = P.toRGBA(P.encode('Tracking message 2'), 16);
    assert.ok(P.scan(resized, config).diagnostics.locateCalls > 0);
    const locate = require('../vendor/jsqr-locator.js');
    assert.ok(P.scan(resized, { ...config, locate: (...args) => locate(...args) }).diagnostics.locateCalls > 0);
  } finally { Date.now = original; }
});

test('a frame ID contributes evidence once, while distinct IDs and reset work', () => {
  const s = P.createSession(), scores = new Float32Array([1, 2, 3]), header = { key: 'A' };
  assert.equal(s.add(scores, header, 0).count, 1);
  const duplicate = s.add(new Float32Array([10, 20, 30]), header, 0);
  assert.equal(duplicate.count, 1);
  assert.deepEqual(Array.from(duplicate.scores), [1, 2, 3]);
  assert.equal(s.add(scores, header, 1).count, 2);
  assert.equal(s.add(scores, header, 0).count, 2);
  s.clear();
  assert.equal(s.add(scores, header, 0).count, 1);
});

test('time budgets stop after a slow locator and report no unverified payload', () => {
  let clock = 0, calls = 0;
  const c = vm.createContext({ TextEncoder, TextDecoder, performance: { now: () => clock },
    PrismCRC: require('../src/crc32.js'), GF19: require('../src/gf19.js'), Alphabet19: A });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/codec.js'), 'utf8'), c);
  const result = c.Prism19Core.scan(P.toRGBA(P.encode('Deadline')), {
    maxTimeMs: 10, diagnostics: true, locate: () => { calls++; clock += 11; return []; }
  });
  assert.equal(calls, 1);
  assert.equal(result.kind, 'none');
  assert.equal(result.timedOut, true);
  assert.equal(result.diagnostics.locateMs, 11);
});

test('new scan controls validate their types and bounds', () => {
  const image = P.toRGBA(P.encode('Options'));
  for (const maxTimeMs of [0, 9, 10001, NaN, Infinity, '250'])
    assert.throws(() => P.scan(image, { maxTimeMs }), /maxTimeMs/);
  for (const frameId of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1'])
    assert.throws(() => P.scan(image, { frameId }), /frameId/);
  for (const name of ['tracking', 'diagnostics']) assert.throws(() => P.scan(image, { [name]: 1 }), /boolean/);
  const result = P.scan(image, { locate: () => [], maxTimeMs: 10, frameId: 0, diagnostics: true });
  assert.equal(result.kind, 'none');
  assert.ok(Number.isFinite(result.diagnostics.locateMs));
});
