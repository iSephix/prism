// SPDX-License-Identifier: Apache-2.0
'use strict';
const {
  test
} = require('node:test'), assert = require('node:assert/strict'), P = require('..'), v = require(
  '../spec/encryption-vector.json');
test('Web Crypto decrypts the independent Python envelope exactly, including BOM/NUL', async () => {
  assert.equal(await P.decrypt(Buffer.from(v.envelopeHex, 'hex'), v.passphrase), v.text);
  const scanned = P.scan(P.toRGBA(P.encodeEnvelope(Buffer.from(v.envelopeHex, 'hex'))));
  assert.equal(scanned.kind, 'encrypted');
  assert.equal(scanned.text, undefined);
  assert.equal(await P.decrypt(Uint8Array.from(scanned.envelope), v.passphrase), v.text);
});
test('fresh encryption is randomized, authenticates and preserves text', async () => {
  const text = 'Secret message 🔐',
    pass = 'test-only passphrase for unit tests',
    a = await P.encrypt(text, pass),
    b = await P.encrypt(text, pass);
  assert.equal(a.length, Buffer.byteLength(text) + 44);
  assert.notDeepEqual(a, b);
  assert.equal(await P.decrypt(a, pass), text);
  await assert.rejects(P.decrypt(a, 'wrong'));
  const altered = a.slice();
  altered[altered.length - 1] ^= 1;
  await assert.rejects(P.decrypt(altered, pass));
});
test('encryption input limits and Unicode validation', async () => {
  await assert.rejects(P.encrypt('', 'pass'));
  await assert.rejects(P.encrypt('x', ''));
  await assert.rejects(P.encrypt('x', '\ud800'));
  await assert.rejects(P.encrypt('x', 'a'.repeat(4097)));
  await assert.rejects(P.decrypt(new Uint8Array(44), 'pass'));
  await assert.rejects(P.encodeEncrypted('x', 'pass', {
    ecc: 'bad'
  }));
});
