// SPDX-License-Identifier: Apache-2.0
'use strict';
const {
  test
} = require('node:test'), assert = require('node:assert/strict');
const P = require('..'),
  C = require('../src/codec.js'),
  F = require('../src/gf19.js'),
  {
    crc32
  } = require('../src/crc32.js');
const vectors = require('../spec/vectors.json').vectors;
test('all frozen matrices reproduce exactly and decode without image geometry', () => {
  for (const v of vectors) {
    const code = v.encrypted ? P.encodeEnvelope(Buffer.from(v.envelopeHex, 'hex'), {
      ecc: v.ecc
    }) : P.encode(v.text, {
      ecc: v.ecc
    });
    assert.deepEqual(P.toMatrix(code), v.matrix, v.name);
    const r = P.decodeMatrix(v.matrix);
    if (v.encrypted) assert.equal(Buffer.from(r.envelope).toString('hex'), v.envelopeHex);
    else assert.equal(r.text, v.text);
  }
});
test('all supported radix lengths agree with exact integer capacity', () => {
  let capacity = 1n,
    digits = 0;
  for (let n = 0; n <= 8554; n++) {
    while (capacity < (1n << BigInt(8 * n))) {
      capacity *= 19n;
      digits++;
    }
    assert.equal(Math.ceil(n * 8 / Math.log2(19)), digits);
  }
  for (const data of [Buffer.from([0]), Buffer.from([0, 255, 0]), Buffer.alloc(1200), Buffer.from([0, 0,
      123, 45, 0, 0
    ])]) assert.deepEqual(Buffer.from(C.bytesFromDigits(C.digits(data), data.length)), data);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});
test('320 seeded RS errors and erasures cases at the correction bound', () => {
  let state = 195119;
  const rand = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (const k of [9, 11, 13, 15])
    for (let trial = 0; trial < 80; trial++) {
      const data = Uint8Array.from({
          length: k
        }, () => Math.floor(rand() * 19)),
        word = F.encode(data),
        received = word.slice(),
        indices = Array.from({
          length: 19
        }, (_, i) => i);
      for (let i = 18; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      const s = trial % (20 - k),
        e = Math.floor((19 - k - s) / 2);
      for (const i of indices.slice(0, s + e)) received[i] = (received[i] + 1 + Math.floor(rand() * 18)) %
        19;
      assert.deepEqual(F.decode(received, k, indices.slice(0, s)).data, data,
        `k=${k} errors=${e} erasures=${s}`);
    }
});
test('confidence-guided decoding recovers a word beyond the hard radius', () => {
  const data = Uint8Array.from({
      length: 11
    }, (_, i) => (i * i + 3) % 19),
    word = F.encode(data),
    costs = Array.from(word, s => Array.from({
      length: 19
    }, (_, j) => j === s ? 0 : 20));
  for (let i = 0; i < 5; i++) {
    costs[i][word[i]] = .15;
    costs[i][(word[i] + 1) % 19] = 0;
  }
  const same = c => Array.from(c.data).join(',') === Array.from(data).join(',');
  assert.ok(!F.candidates(costs, 11, false).some(same));
  assert.ok(F.candidates(costs, 11, true).some(same));
});

function replaceHeader(matrix, raw) {
  const n = matrix.length,
    l = C.layout(n),
    digits = C.digits(raw, 36);
  for (let b = 0; b < 4; b++) {
    const word = F.encode(digits.slice(b * 9, (b + 1) * 9));
    for (let j = 0; j < 19; j++) {
      const cell = l.slots[j * 4 + b];
      matrix[Math.floor(cell / n)][cell % n] = word[j];
    }
  }
}
test('reject unsupported protected header fields even with valid header CRC', () => {
  const v = vectors[1];
  for (const [offset, value] of [
      [0, 0],
      [2, 4],
      [3, 12],
      [4, 2],
      [5, 2]
    ]) {
    const raw = Buffer.from(v.headerHex, 'hex');
    raw[offset] = value;
    raw.writeUInt32BE(crc32(raw.subarray(0, 12)), 12);
    const m = structuredClone(v.matrix);
    replaceHeader(m, raw);
    assert.equal(P.decodeMatrix(m).kind, 'none', `header offset ${offset}`);
  }
  for (const [flag, length] of [
      [0, 0],
      [0, 1201],
      [1, 44],
      [1, 1245]
    ]) {
    const raw = Buffer.from(v.headerHex, 'hex');
    raw[4] = flag;
    raw.writeUInt16BE(length, 6);
    raw.writeUInt32BE(crc32(raw.subarray(0, 12)), 12);
    const m = structuredClone(v.matrix);
    replaceHeader(m, raw);
    assert.equal(P.decodeMatrix(m).kind, 'none');
  }
});
test('payload CRC and strict UTF-8 gate acceptance after successful RS decoding', () => {
  const code = P.encode('Message one.'),
    m = P.toMatrix(code),
    raw = C.makeHeader(Buffer.from('Message two.'), code.k, 0).bytes;
  replaceHeader(m, raw);
  assert.equal(P.decodeMatrix(m).kind, 'partial19');
  const bad = C.encode('', 'Q', {
    payload: Uint8Array.from([255, 254]),
    originalBytes: 2
  });
  assert.equal(P.decodeMatrix(P.toMatrix(bad)).kind, 'none');
  const rawBytes = Buffer.from('padding');
  const h = C.parseHeader(C.digits(C.makeHeader(rawBytes, 11, 0).bytes, 36), 25),
    ds = Array.from(C.digits(rawBytes));
  assert.equal(C.checkPacket([...ds, 1], h), null);
});
test('public argument and allocation bounds reject malformed inputs', () => {
  for (const value of ['', null, 4, {}, '\ud800', '\udc00', 'a'.repeat(8555)]) assert.throws(() => P
    .encode(value));
  assert.throws(() => P.encode('x', {
    ecc: 'X'
  }));
  assert.throws(() => P.encode('x', null));
  assert.throws(() => P.encodeEnvelope(new Uint8Array(44)));
  assert.throws(() => P.encodeEnvelope(Array(45).fill(0)));
  const c = P.encode('x');
  for (const scale of [0, NaN, Infinity, -1, 1.5, 65, '12', '1" onload="x']) assert.throws(() => P.toSVG(
    c, scale));
  for (const n of [-1, 0, 24, 26, 149, NaN]) assert.throws(() => C.layout(n));
  for (const image of [{}, {
      width: Infinity,
      height: 1,
      data: new Uint8Array(4)
    }, {
      width: 4097,
      height: 1,
      data: new Uint8Array(4)
    }, {
      width: 2049,
      height: 2049,
      data: new Uint8Array(4)
    }, {
      width: 1,
      height: 1,
      data: [0, 0, 0, 0]
    }, {
      width: 1,
      height: 1,
      data: new Uint8Array(3)
    }]) assert.throws(() => P.scan(image));
  const valid = P.toRGBA(c);
  assert.throws(() => P.scan(valid, {
    soft: 'yes'
  }));
  assert.throws(() => P.scan(valid, {
    session: {}
  }));
  assert.throws(() => P.scan(valid, {
    locate: () => null
  }));
  const matrix = P.toMatrix(c);
  matrix[0][0] = 18;
  assert.throws(() => P.decodeMatrix(matrix));
  const bad = P.toMatrix(c),
    cell = c.layout.slots[0];
  bad[Math.floor(cell / c.n)][cell % c.n] = 19;
  assert.throws(() => P.decodeMatrix(bad));
});
test('frame sessions expire, isolate payloads, clear and stay bounded', () => {
  const original = Date.now;
  let time = 1000;
  Date.now = () => time;
  try {
    const session = P.createSession(),
      a = new Float32Array([1, 2]);
    assert.equal(session.add(a, {
      key: 'A'
    }).count, 1);
    assert.equal(session.add(a, {
      key: 'A'
    }).count, 2);
    assert.equal(session.add(a, {
      key: 'B'
    }).count, 1);
    for (let i = 0; i < 12; i++) session.add(a, {
      key: 'B'
    });
    assert.equal(session.add(a, {
      key: 'B'
    }).count, 8);
    time += 6001;
    assert.equal(session.add(a, {
      key: 'B'
    }).count, 1);
    session.clear();
    assert.equal(session.add(a, {
      key: 'B'
    }).count, 1);
  } finally {
    Date.now = original;
  }
});
test('malformed locator coordinates fail without inventing a payload', () => {
  const r = P.scan(P.toRGBA(P.encode('x')), {
    locate: () => [{
      dimension: 25,
      map: () => ({
        x: NaN,
        y: Infinity
      })
    }]
  });
  assert.equal(r.kind, 'none');
});
