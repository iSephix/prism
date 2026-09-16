// SPDX-License-Identifier: Apache-2.0
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const Log = require('../examples/diagnostics.js'), PNG = require('../bin/png.cjs');
test('scan reports retain a bounded lossless sample and omit recovered content', () => {
  const log = Log.create('test'), image = { width: 16, height: 16, data: new Uint8ClampedArray(1024).fill(255) };
  for (let i = 0; i < 200; i++) {
    image.data[0] = i;
    log.capture(i, image, { options: { maxTimeMs: 10000 } }, true);
    log.result(i, { kind: 'encrypted', ms: 1, envelope: [1, 2, 3], text: 'private', payload: { text: 'private' } });
  }
  image.data[0] = 0;
  const report = log.report(frame => PNG.encode(frame).toString('base64'));
  assert.equal(report.events.length, 160); assert.equal(report.frames.length, 3);
  assert.equal(report.attempts, 200);
  assert.equal(PNG.decode(Buffer.from(report.frames[2].data, 'base64')).data[0], 199);
  assert.ok(!JSON.stringify(report).includes('private'));
  assert.equal(log.report(() => { throw Error('Should not encode excluded frames'); }, false).frames.length, 0);
  log.clearFrames(); assert.equal(log.counts().frames, 0);
});
