// SPDX-License-Identifier: Apache-2.0
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const P = require('..');
const report = { packageVersion: P.version, wireVersion: 3, physicalTrial: false,
  measuredAt: new Date().toISOString(), runtime: process.version, platform: process.platform, cases: [] };
for (const ecc of ['L', 'M', 'Q', 'H']) {
  const text = 'x'.repeat(P.capacity({ ecc })), code = P.encode(text, { ecc });
  const result = P.scan(P.toRGBA(code), { maxTimeMs: 10000 });
  assert.equal(result.text, text);
  report.cases.push({ name: `Maximum text / ${ecc}`, bytes: code.bodyBytes, grid: code.n,
    exact: true, ms: result.ms, decoder: result.decoder });
}
const fixture = require('./fixtures/png.json')[0].file;
const binary = Uint8Array.from({ length: 4096 }, (_, i) => (i * 137 + 19) % 256);
for (const [type, data, options] of [
  ['binary', binary, { name: 'all-values.bin' }],
  ['image', fs.readFileSync(path.join(__dirname, 'fixtures', fixture)), { mimeType: 'image/png', name: fixture }],
  ['calculation', 'sqrt(81) + 2^8 / 4', {}]
]) {
  const code = P.encodePayload(type, data, options), result = P.scan(P.toRGBA(code), { maxTimeMs: 10000 });
  assert.equal(result.kind, 'payload'); assert.equal(result.payload.type, type);
  assert.deepEqual(Buffer.from(result.payload.data), Buffer.from(data));
  report.cases.push({ name: type, bytes: code.bodyBytes, contentBytes: result.payload.data.length,
    grid: code.n, exact: true, ms: result.ms, decoder: result.decoder });
}
const out = path.join(__dirname, '../release'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'extensions-optical-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: four maximum-capacity codes and three typed payloads decoded from pixels alone.');
