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
function curved(image) {
  const out = frame(image.width, image.height), size = image.width;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    let sx = x, sy = y;
    for (let step = 0; step < 6; step++) {
      const u = sx / size, v = sy / size;
      sx = x - 10 * 4 * v * (1 - v) * (2 * u - 1);
      sy = y - 16 * 4 * u * (1 - u);
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
