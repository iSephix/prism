// SPDX-License-Identifier: Apache-2.0
// Optional private corpus gate: no photographs or recovered content are bundled.
// node test/physical.cjs /path/to/manifest.json
// Manifest: [{"file":"photo.png","kind":"encrypted","sha256":"body SHA-256"}]
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const P = require('..'), PNG = require('../bin/png.cjs');
const manifest = path.resolve(process.argv[2] || 'physical-manifest.json');
const cases = JSON.parse(fs.readFileSync(manifest, 'utf8'));
assert.ok(Array.isArray(cases) && cases.length > 0 && cases.length <= 100);
for (const [i, entry] of cases.entries()) {
  const image = PNG.decode(fs.readFileSync(path.resolve(path.dirname(manifest), entry.file)));
  const result = P.scan(image, { maxTimeMs: 6000, diagnostics: true });
  assert.equal(result.kind, entry.kind, `photo ${i + 1} result`);
  assert.equal(crypto.createHash('sha256').update(Uint8Array.from(result.envelope)).digest('hex'), entry.sha256, `photo ${i + 1} exact body`);
  console.log(JSON.stringify({ case: i + 1, width: image.width, height: image.height,
    kind: result.kind, bytes: result.bytes, ms: Math.round(result.ms), exact: true }));
}
