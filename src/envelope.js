// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
/* Optional authenticated encryption. The password is never encoded or persisted. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis.crypto || require(
    'node:crypto').webcrypto);
  else root.PrismEnvelope = factory(root.crypto);
})(globalThis, function(crypto) {
  'use strict';
  const encoder = new TextEncoder(),
    AAD = encoder.encode('Prism19/protocol2/AES-256-GCM/PBKDF2-SHA256/600000'),
    ITERATIONS = 600000;
  async function key(password, salt) {
    if (!crypto?.subtle) throw Error('Encryption needs a secure browser context.');
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
      'deriveKey'
    ]);
    return crypto.subtle.deriveKey({
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: ITERATIONS
    }, material, {
      name: 'AES-GCM',
      length: 256
    }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(text, password) {
    if (!password) throw Error('Enter an encryption passphrase.');
    const salt = crypto.getRandomValues(new Uint8Array(16)),
      iv = crypto.getRandomValues(new Uint8Array(12)),
      k = await key(password, salt),
      plain = encoder.encode(text),
      cipher = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv,
        additionalData: AAD,
        tagLength: 128
      }, k, plain)),
      out = new Uint8Array(28 + cipher.length);
    out.set(salt);
    out.set(iv, 16);
    out.set(cipher, 28);
    return out;
  }
  async function decrypt(data, password) {
    if (!password) throw Error('Enter the passphrase for this code.');
    const bytes = Uint8Array.from(data);
    if (bytes.length < 44) throw Error('Invalid encrypted envelope.');
    try {
      const k = await key(password, bytes.slice(0, 16)),
        plain = await crypto.subtle.decrypt({
          name: 'AES-GCM',
          iv: bytes.slice(16, 28),
          additionalData: AAD,
          tagLength: 128
        }, k, bytes.slice(28));
      return new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true
      }).decode(plain);
    } catch {
      throw Error('Wrong passphrase or altered encrypted data.');
    }
  }
  return {
    encrypt,
    decrypt,
    ITERATIONS,
    overhead: 44
  };
});
