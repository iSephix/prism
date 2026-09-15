// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrismCRC = factory();
})(globalThis, function() {
  'use strict';
  const table = Uint32Array.from({
    length: 256
  }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });

  function crc32(bytes) {
    let value = 0xffffffff;
    for (const byte of bytes) value = table[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }
  return {
    crc32
  };
});
