// SPDX-License-Identifier: Apache-2.0
// Replay user-exported camera evidence locally; never print recovered content.
'use strict';
const fs = require('node:fs'), P = require('..'), PNG = require('../bin/png.cjs');
const file = process.argv[2];
if (!file) throw Error('Usage: npm run test:report -- path/to/prism-scan-report.json');
if (fs.statSync(file).size > 48 * 1024 * 1024) throw Error('Report exceeds 48 MiB.');
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
if (report.schema !== 'prism-scan-report' || report.schemaVersion !== 1 || !Array.isArray(report.frames) || report.frames.length > 3)
  throw Error('Unsupported report format.');
if (!report.frames.length) console.log('No images were included; inspect the report events for camera and decoder errors.');
for (const frame of report.frames) {
  if (frame.encoding !== 'png' || typeof frame.data !== 'string') throw Error('Expected PNG frame.');
  const image = PNG.decode(Buffer.from(frame.data, 'base64'));
  if (image.width !== frame.width || image.height !== frame.height) throw Error('Frame dimensions do not match.');
  const options = { diagnostics: true, maxTimeMs: 10000 };
  for (const key of ['soft', 'equations', 'spatial', 'refine'])
    if (typeof frame.metadata?.options?.[key] === 'boolean') options[key] = frame.metadata.options[key];
  const result = P.scan(image, options);
  console.log(JSON.stringify({ id: frame.id, originalVersion: report.decoderVersion, currentVersion: P.version,
    source: frame.metadata?.source, kind: result.kind, ms: Math.round(result.ms), timedOut: !!result.timedOut,
    grid: result.grid, diagnostics: result.diagnostics }));
}
