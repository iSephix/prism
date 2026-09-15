// SPDX-License-Identifier: Apache-2.0
'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const P = require('..'), C = require('../src/codec.js');

test('capacity is the exact largest byte count that fits each RS profile', () => {
  const expected = { L: 8554, M: 7413, Q: 6273, H: 5132 }, ks = { L: 15, M: 13, Q: 11, H: 9 };
  const blocks = BigInt(Math.floor((C.layout(145).slots.length - 76) / 19));
  for (const [ecc, maximum] of Object.entries(expected)) {
    assert.equal(P.capacity({ ecc }), maximum);
    const radixCapacity = 19n ** (blocks * BigInt(ks[ecc]));
    assert.ok(256n ** BigInt(maximum) <= radixCapacity);
    assert.ok(256n ** BigInt(maximum + 1) > radixCapacity);
    const code = P.encode('x'.repeat(maximum), { ecc });
    assert.equal(code.version, 3); assert.equal(code.n, 145);
    assert.equal(P.decodeMatrix(P.toMatrix(code)).text.length, maximum);
    assert.throws(() => P.encode('x'.repeat(maximum + 1), { ecc }));
    assert.equal(P.capacity({ ecc, encrypted: true }), maximum - 44);
  }
  assert.equal(P.encode('legacy').version, 2);
  assert.equal(P.encode('x'.repeat(1200)).version, 2);
  assert.equal(P.encode('x'.repeat(1201)).version, 3);
  assert.throws(() => P.encode('x'.repeat(1201), { wireVersion: 2 }));
  assert.equal(P.capacity({ wireVersion: 2, encrypted: true }), 1200);
  assert.throws(() => P.capacity({ wireVersion: 4 }));
});

test('typed content preserves exact bytes, metadata, UTF-8 and zero-length files', () => {
  const cases = [
    ['binary', Uint8Array.from({ length: 256 }, (_, i) => i), { name: 'bytes.bin' }],
    ['binary', new Uint8Array(), {}],
    ['json', '{"name":"Grüße 🛰️","value":19}', {}],
    ['calculation', '-2^2 + sqrt(81)', {}],
    ['url', 'https://example.com/path?q=%E2%9C%93', {}],
    ['contact', 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Example\r\nEND:VCARD\r\n', {}],
    ['image', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { name: '图.png' }],
    ['audio', Uint8Array.from([82, 73, 70, 70]), { name: 'clip.wav' }]
  ];
  for (const [type, data, options] of cases) {
    const expected = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    const code = P.encodePayload(type, data, options), r = P.decodeMatrix(P.toMatrix(code));
    assert.equal(code.version, 3); assert.equal(r.kind, 'payload'); assert.equal(r.wireVersion, 3);
    assert.equal(r.payload.type, type); assert.equal(r.payload.name, options.name || '');
    assert.deepEqual(Buffer.from(r.payload.data), expected);
    assert.deepEqual(P.unpackPayload(P.packPayload(type, data, options)), r.payload);
  }
});

test('typed encrypted transport authenticates its bytes, metadata and distinct context', async () => {
  const bytes = Uint8Array.from([0, 255, 13, 10, 0, 19]), pass = 'typed regression passphrase';
  const code = await P.encodePayloadEncrypted('binary', bytes, pass, { name: 'original.bin' });
  const r = P.scan(P.toRGBA(code));
  assert.equal(r.kind, 'encrypted'); assert.equal(r.typed, true); assert.equal(r.payload, undefined);
  const packet = Uint8Array.from(r.envelope), decoded = await P.decryptPayload(packet, pass);
  assert.deepEqual(decoded.data, bytes); assert.equal(decoded.name, 'original.bin');
  await assert.rejects(P.decryptPayload(packet, 'wrong'));
  await assert.rejects(P.decrypt(packet, pass));
  const altered = packet.slice(); altered[30] ^= 1;
  await assert.rejects(P.decryptPayload(altered, pass));
  await assert.rejects(P.decryptPayload(await P.encrypt('ordinary text', pass), pass));
  const large = 'secret'.repeat(250), largeCode = await P.encodeEncrypted(large, pass);
  assert.equal(largeCode.version, 3);
  assert.equal(await P.decrypt(Uint8Array.from(P.decodeMatrix(P.toMatrix(largeCode)).envelope), pass), large);
});

test('calculation grammar has mathematical precedence and rejects executable or unbounded input', () => {
  for (const [expression, expected] of [['-2^2', -4], ['2^3^2', 512], ['2^-2', .25],
    ['sqrt(81)+2^8/4', 73], ['max(1,2,3)*4', 12], ['sin(pi/2)', 1], ['1e2 + .5', 100.5]])
    assert.equal(P.evaluateCalculation(expression), expected);
  for (const expression of ['globalThis.alert(1)', 'constructor(1)', '1;fetch("x")', 'x=1',
    '2**3', '2(3)', 'Infinity', '1/0', 'sqrt(-1)', '1e999', 'min()', '('.repeat(33) + '1' + ')'.repeat(33), '1+'.repeat(256) + '1'])
    assert.throws(() => P.evaluateCalculation(expression), expression);
  // Transport validates grammar, without performing a calculation on scan.
  const r = P.decodeMatrix(P.toMatrix(P.encodePayload('calculation', '1/0')));
  assert.equal(r.kind, 'payload'); assert.equal(r.payload.text, '1/0');
});

test('unsupported markers, malformed metadata and invalid structured content are rejected', () => {
  for (const [type, data, options] of [['script', 'x', {}], ['json', '{broken}', {}],
    ['url', 'javascript:alert(1)', {}], ['url', 'https://example.com\n', {}], ['contact', 'not a vCard', {}],
    ['image', new Uint8Array(), { mimeType: 'image/svg+xml' }], ['binary', [1, 2], {}],
    ['binary', new Uint8Array(), { name: '../file.bin' }], ['binary', new Uint8Array(), { name: '\ud800' }],
    ['json', '{}', { mimeType: 'text/html' }], ['binary', new Uint8Array(), { mimeType: 'a/b\n' }]])
    assert.throws(() => P.encodePayload(type, data, options));
  assert.throws(() => P.encodePayload('binary', new Uint8Array(), { wireVersion: 2 }));
  const valid = P.packPayload('json', '{}');
  for (const [at, value] of [[0, 2], [1, 255], [2, 97], [3, 121]]) {
    const bad = valid.slice(); bad[at] = value;
    assert.throws(() => P.unpackPayload(bad));
    const code = C.encode('', 'Q', { payload: bad, typed: true });
    assert.equal(P.decodeMatrix(P.toMatrix(code)).kind, 'none');
  }
  assert.throws(() => P.unpackPayload(valid.subarray(0, 5)));
  assert.throws(() => P.encodePayload('binary', new Uint8Array(6270)));
});

test('independent format-3 vectors reproduce and the typed AES fixture authenticates', async () => {
  for (const v of require('../spec/vectors-v3.json').vectors) {
    const code = v.typed ? C.encode('', v.ecc, { payload: Buffer.from(v.payloadHex, 'hex'),
      typed: true, encrypted: v.encrypted, wireVersion: 3 }) : P.encode(v.text, { ecc: v.ecc, wireVersion: 3 });
    assert.deepEqual(P.toMatrix(code), v.matrix, v.name);
    const result = P.decodeMatrix(v.matrix);
    assert.equal(Buffer.from(result.envelope).toString('hex'), v.payloadHex);
    if (v.encrypted) {
      const content = await P.decryptPayload(Buffer.from(v.envelopeHex, 'hex'), v.passphrase);
      assert.equal(Buffer.from(P.packPayload(content.type, content.data, content)).toString('hex'), v.plaintextContainerHex);
    } else if (v.typed) {
      const content = P.unpackPayload(Buffer.from(v.payloadHex, 'hex'));
      assert.deepEqual(P.toMatrix(P.encodePayload(content.type, content.data, { ...content, ecc: v.ecc })), v.matrix);
    } else assert.equal(result.text, v.text);
  }
});

test('CLI writes and recovers typed binary bytes without text or Base64 conversion', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-payload-'));
  try {
    const input = path.join(directory, 'bytes.bin'), matrix = path.join(directory, 'code.json'),
      output = path.join(directory, 'recovered.bin'), data = Buffer.from([0, 255, 0, 10, 128, 13]);
    fs.writeFileSync(input, data);
    const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '../bin/prism19.cjs'), ...args], { encoding: 'utf8' });
    let r = run('encode', '--input', input, '--type', 'binary', '--out', matrix);
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(fs.readFileSync(matrix)).wireVersion, 3);
    r = run('decode', '--input', matrix, '--out', output);
    assert.equal(r.status, 0, r.stderr); assert.deepEqual(fs.readFileSync(output), data);
    assert.notEqual(run('decode', '--input', matrix, '--out', output).status, 0);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
