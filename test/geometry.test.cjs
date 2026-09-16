// SPDX-License-Identifier: Apache-2.0
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const P = require('..'), locator = require('../vendor/jsqr-locator.js');
function frame(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) }; }
function paste(target, image, left, top) {
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const src = (y * image.width + x) * 4, dst = ((top + x) * target.width + left + image.height - 1 - y) * 4;
    target.data.set(image.data.subarray(src, src + 4), dst);
  }
}
test('a sheet of six independent codes is read without combining finders from different stickers', () => {
  const image = frame(800, 1150), messages = new Set();
  for (let i = 0; i < 6; i++) {
    const text = `Independent sticker ${i}. ` + 'Keep every byte separate. '.repeat(3); messages.add(text);
    paste(image, P.toRGBA(P.encode(text), 8), 40 + i % 2 * 380, 30 + Math.floor(i / 2) * 365);
  }
  const result = P.scan(image, { maxTimeMs: 6000 });
  assert.ok(messages.has(result.text));
  assert.equal(result.kind, 'prism19');
});
function curved(image, ripples = false) {
  const out = frame(image.width, image.height), size = image.width;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    let sx = x, sy = y;
    for (let step = 0; step < 6; step++) {
      const u = sx / size, v = sy / size;
      sx = x - (ripples ? 4 * Math.sin(v * Math.PI * 3) * Math.sin(u * Math.PI) :
        10 * 4 * v * (1 - v) * (2 * u - 1));
      sy = y - (ripples ? 6 * Math.sin(u * Math.PI * 3) * Math.sin(v * Math.PI) :
        16 * 4 * u * (1 - u));
    }
    const ix = Math.floor(sx), iy = Math.floor(sy), u = sx - ix, v = sy - iy;
    if (ix < 0 || iy < 0 || ix + 1 >= image.width || iy + 1 >= image.height) continue;
    for (let c = 0; c < 3; c++) {
      let value = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        value += (dx ? u : 1 - u) * (dy ? v : 1 - v) * image.data[((iy + dy) * image.width + ix + dx) * 4 + c];
      out.data[(y * out.width + x) * 4 + c] = value;
    }
  }
  return out;
}
test('a curved dense print recovers through a fitted cell grid instead of a flat homography', () => {
  const text = 'Curved paper must preserve exact bytes. '.repeat(30), image = curved(P.toRGBA(P.encode(text), 12));
  assert.equal(P.scan(image, { locate: locator, maxTimeMs: 6000 }).kind, 'none');
  const result = P.scan(image, { maxTimeMs: 6000 });
  assert.equal(result.text, text);
});

test('local cell centers recover uneven bends and never reuse pixels from the previous print', () => {
  const text = 'A printed code must survive bends between its corner markers. '.repeat(19);
  const image = curved(P.toRGBA(P.encode(text, { ecc: 'L', version: 2 }), 12), true);
  const session = P.createSession(), result = P.scan(image, { session, frameId: 1, maxTimeMs: 6000, diagnostics: true });
  assert.equal(result.text, text);
  assert.ok(result.diagnostics.cellRefinements > 0, 'The independent cell registration was exercised');
  image.data.fill(255);
  assert.equal(P.scan(image, { session, frameId: 2, maxTimeMs: 6000 }).kind, 'none');
});

test('a tracked pose sampled at a different scale always uses the newest camera pixels', () => {
  const text = 'Fresh scaled camera evidence', small = P.toRGBA(P.encode(text), 8);
  const large = frame(small.width * 2, small.height * 2);
  for (let y = 0; y < large.height; y++) for (let x = 0; x < large.width; x++) {
    const source = (Math.floor(y / 2) * small.width + Math.floor(x / 2)) * 4;
    large.data.set(small.data.subarray(source, source + 4), (y * large.width + x) * 4);
  }
  const poses = locator(small.data, small.width, small.height).map(p => ({ dimension: p.dimension,
    sampleWidth: small.width, sampleHeight: small.height,
    map(x, y) { const a = p.map(x, y); return { x: a.x * 2, y: a.y * 2 }; } }));
  const session = P.createSession(), locate = () => poses;
  assert.equal(P.scan(large, { locate, session, frameId: 1 }).text, text);
  large.data.fill(255);
  assert.equal(P.scan(large, { locate, session, frameId: 2 }).kind, 'none');
});
