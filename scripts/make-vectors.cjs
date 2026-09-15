// SPDX-License-Identifier: Apache-2.0
// Explicit maintenance command. Ordinary tests never regenerate their expectations.
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  P = require('../index.cjs'),
  C = require('../src/codec.js');
const items = [{
  name: 'single-byte-L',
  text: 'x',
  ecc: 'L'
}, {
  name: 'hello-Q',
  text: 'Hello world, testing b19 :)',
  ecc: 'Q'
}, {
  name: 'unicode-M',
  text: 'Grüße 🛰️ 日本語 العربية\nline two',
  ecc: 'M'
}, {
  name: 'bom-and-nul-H',
  text: '\ufeffBOM\u0000middle\u0000',
  ecc: 'H'
}, {
  name: 'multi-block-Q',
  text: 'Open optical format. '.repeat(12),
  ecc: 'Q'
}, {
  name: 'maximum-text-H',
  text: '0123456789'.repeat(120),
  ecc: 'H'
}, ];
const encrypted = JSON.parse(fs.readFileSync(path.join(__dirname, '../spec/encryption-vector.json'), 'utf8'));
items.push({
  name: 'encrypted-Q',
  text: encrypted.text,
  ecc: 'Q',
  encrypted: true,
  envelopeHex: encrypted.envelopeHex,
  passphrase: encrypted.passphrase
});
const vectors = items.map(item => {
  const payload = item.encrypted ? Buffer.from(item.envelopeHex, 'hex') : Buffer.from(item.text, 'utf8'),
    code = item.encrypted ? P.encodeEnvelope(payload, {
      ecc: item.ecc
    }) : P.encode(item.text, {
      ecc: item.ecc
    });
  return {
    ...item,
    n: code.n,
    k: code.k,
    blocks: code.blocks,
    repairCount: code.repairCount,
    payloadHex: payload.toString('hex'),
    headerHex: Buffer.from(C.makeHeader(payload, code.k, item.encrypted ? 1 : 0).bytes).toString('hex'),
    matrix: P.toMatrix(code)
  };
});
fs.writeFileSync(path.join(__dirname, '../spec/vectors.json'), JSON.stringify({
  format: 'prism19-conformance-vectors',
  revision: 1,
  wireVersion: 2,
  matrixLegend: {
    '-2': 'fixed white',
    '-1': 'fixed black',
    '0..18': 'alphabet symbol'
  },
  vectors
}, null, 2) + '\n');
console.log(
`Wrote ${vectors.length} vectors. Review changes against the normative format before committing.`);
