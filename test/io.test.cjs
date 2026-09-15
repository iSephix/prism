// SPDX-License-Identifier: Apache-2.0
'use strict';
const {
  test
} = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require(
  'node:os'), path = require('node:path'), zlib = require('node:zlib'), {
  spawnSync
} = require('node:child_process');
const P = require('..'),
  PNG = require('../bin/png.cjs'),
  {
    crc32
  } = require('../src/crc32.js');
test('independently generated PNG fixtures support each advertised color type', () => {
  const manifest = require('./fixtures/png.json');
  for (const v of manifest) {
    const image = PNG.decode(fs.readFileSync(path.join(__dirname, 'fixtures', v.file)));
    assert.equal(image.width, v.width);
    assert.equal(image.height, v.height);
    assert.deepEqual(Array.from(image.data), v.rgba, v.file);
  }
});
test('PNG-rendered code survives PNG transport and optical decoding', () => {
  const text = 'PNG carries the same optical symbols.',
    code = P.encode(text),
    image = P.toRGBA(code);
  assert.equal(P.scan(PNG.decode(PNG.encode(image))).text, text);
});

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}
test('PNG CRCs, unsupported headers, truncation and decompression bounds', () => {
  const clean = PNG.encode({
      width: 1,
      height: 1,
      data: Uint8Array.from([0, 0, 0, 255])
    }),
    bad = Buffer.from(clean);
  bad[bad.length - 6] ^= 1;
  assert.throws(() => PNG.decode(bad));
  assert.throws(() => PNG.decode(clean.subarray(0, -1)));
  assert.throws(() => PNG.decode(Buffer.from('not a PNG')));
  const h = Buffer.alloc(13);
  h.writeUInt32BE(1);
  h.writeUInt32BE(1, 4);
  h[8] = 8;
  h[9] = 6;
  const forge = header => Buffer.concat([clean.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', zlib
    .deflateSync(Buffer.alloc(100000))), chunk('IEND', Buffer.alloc(0))]);
  assert.throws(() => PNG.decode(forge(h)));
  h.writeUInt32BE(4097);
  assert.throws(() => PNG.decode(forge(h)));
  h.writeUInt32BE(1);
  h[12] = 1;
  assert.throws(() => PNG.decode(forge(h)));
});
test('CLI encodes, scans, preserves existing files, and handles spaces', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism19 cli ')),
    cli = path.join(__dirname, '../bin/prism19.cjs');
  const run = (args) => spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8'
  });
  try {
    const output = path.join(temp, 'my code.png'),
      text = 'Portable CLI message.';
    let r = run(['encode', '--text', text, '--out', output]);
    assert.equal(r.status, 0, r.stderr);
    r = run(['decode', '--input', output]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, text + '\n');
    assert.notEqual(run(['encode', '--text', 'changed', '--out', output]).status, 0);
    const matrix = path.join(temp, 'matrix.json');
    assert.equal(run(['encode', '--text', text, '--out', matrix]).status, 0);
    r = run(['decode', '--input', matrix, '--json']);
    assert.equal(JSON.parse(r.stdout).text, text);
    assert.notEqual(run(['encode', '--text', 'x', '--scale', '-1', '--out', '-']).status, 0);
  } finally {
    fs.rmSync(temp, {
      recursive: true,
      force: true
    });
  }
});
test('CLI encrypted fixture needs a passphrase and validates it', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prism19 encrypted ')),
    cli = path.join(__dirname, '../bin/prism19.cjs'),
    v = require('../spec/vectors.json').vectors.find(v => v.encrypted),
    input = path.join(temp, 'cipher.json'),
    key = path.join(temp, 'key.txt');
  try {
    fs.writeFileSync(input, JSON.stringify({
      format: 'prism19-matrix',
      wireVersion: 2,
      matrix: v.matrix
    }));
    fs.writeFileSync(key, v.passphrase + '\n');
    const run = (...args) => spawnSync(process.execPath, [cli, 'decode', '--input', input, ...args], {
      encoding: 'utf8'
    });
    assert.equal(run().status, 3);
    const r = run('--passphrase-file', key);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, v.text + '\n');
  } finally {
    fs.rmSync(temp, {
      recursive: true,
      force: true
    });
  }
});
