/*! Prism 19 0.3.4 | Apache-2.0 | See LICENSE and NOTICE. */
(function(){
const module=undefined,exports=undefined,define=undefined;

/* src/crc32.js */
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

;

/* src/gf19.js */
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
/* Extended Reed-Solomon evaluation code over GF(19), length 19. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GF19 = factory();
})(globalThis, function() {
  'use strict';
  const Q = 19,
    mod = x => ((x % Q) + Q) % Q;
  const inv = Array.from({
    length: Q
  }, (_, a) => {
    for (let b = 1; b < Q; b++)
      if (a * b % Q === 1) return b;
    return 0;
  });
  const evaluate = (p, x) => {
    let y = 0;
    for (let i = p.length - 1; i >= 0; i--) y = mod(y * x + p[i]);
    return y;
  };
  const generators = new Map();
  const powers = Array.from({ length: Q }, (_, x) => {
    const row = new Uint8Array(Q + 1);
    row[0] = 1;
    for (let j = 1; j <= Q; j++) row[j] = row[j - 1] * x % Q;
    return row;
  });

  function generator(k) {
    if (generators.has(k)) return generators.get(k);
    const a = Array.from({
      length: 19
    }, () => new Uint8Array(k));
    for (let x = 0; x < 19; x++)
      for (let j = 0; j < k; j++) {
        let z = 1;
        for (let m = 0; m < k; m++)
          if (m !== j) z = mod(z * (x - m) * inv[mod(j - m)]);
        a[x][j] = z;
      }
    generators.set(k, a);
    return a;
  }

  function encode(data, k = data.length) {
    const g = generator(k);
    return Uint8Array.from(g, row => {
      let z = 0;
      for (let i = 0; i < k; i++) z += row[i] * (data[i] || 0);
      return z % 19;
    });
  }
  // Gauss-Jordan over a prime field, including overdetermined consistency checks.
  function solve(rows, rhs, n) {
    if (rows.length < n) return null;
    const a = rows.map((r, i) => {
      const row = new Uint8Array(n + 1);
      for (let j = 0; j < n; j++) row[j] = mod(r[j]);
      row[n] = mod(rhs[i]);
      return row;
    });
    let rank = 0;
    const pivots = [];
    for (let c = 0; c < n; c++) {
      let pivot = rank;
      while (pivot < a.length && !a[pivot][c]) pivot++;
      if (pivot === a.length) continue;
      [a[pivot], a[rank]] = [a[rank], a[pivot]];
      const v = inv[a[rank][c]];
      for (let j = c; j <= n; j++) a[rank][j] = a[rank][j] * v % Q;
      for (let i = 0; i < a.length; i++)
        if (i !== rank && a[i][c]) {
          const s = a[i][c];
          // Both factors are 0..18. Adding 19² keeps the dividend nonnegative.
          for (let j = c; j <= n; j++) a[i][j] = (a[i][j] - s * a[rank][j] + 361) % Q;
        }
      pivots.push(c);
      rank++;
    }
    for (let i = rank; i < a.length; i++)
      if (a[i].slice(0, n).every(x => !x) && a[i][n]) return null;
    if (rank !== n) return null;
    const out = new Uint8Array(n);
    for (let i = 0; i < rank; i++) out[pivots[i]] = a[i][n];
    return out;
  }

  function decode(received, k, erasures = []) {
    const erased = new Set(erasures),
      positions = Array.from({
        length: 19
      }, (_, i) => i).filter(i => !erased.has(i));
    if (positions.length < k) return null;
    const direct = encode(received.slice(0, k), k);
    if (!erasures.some(i => i < k) && positions.every(i => direct[i] === received[i])) return {
      data: direct.slice(0, k),
      code: direct,
      errors: 0,
      erasures: erasures.length
    };
    // Berlekamp-Welch: Q(x_i)=y_i E(x_i), with monic error locator E.
    for (let t = Math.floor((positions.length - k) / 2); t >= 0; t--) {
      const rows = [],
        rhs = [];
      for (const x of positions) {
        const px = powers[x], y = received[x], row = new Uint8Array(k + 2 * t);
        row.set(px.subarray(0, k + t));
        for (let j = 0; j < t; j++) row[k + t + j] = (361 - y * px[j]) % Q;
        rows.push(row);
        rhs.push(y * px[t] % Q);
      }
      const answer = solve(rows, rhs, k + 2 * t);
      if (!answer) continue;
      const numerator = Array.from(answer.slice(0, k + t)),
        denominator = [...answer.slice(k + t), 1],
        poly = new Uint8Array(k);
      for (let d = numerator.length - 1; d >= t; d--) {
        const f = numerator[d];
        poly[d - t] = f;
        for (let j = 0; j <= t; j++) numerator[d - t + j] = mod(numerator[d - t + j] - f * denominator[j]);
      }
      if (numerator.some(x => x)) continue;
      const code = Uint8Array.from({
        length: 19
      }, (_, x) => evaluate(poly, x));
      let errors = 0;
      for (const x of positions)
        if (code[x] !== received[x]) errors++;
      if (errors <= t) return {
        data: code.slice(0, k),
        code,
        errors,
        erasures: erasures.length
      };
    }
    return null;
  }

  function candidates(costs, k, soft = true, limit = 5, deadline = Infinity) {
    const read = costs.map(c => {
      let b = 0;
      for (let s = 1; s < 19; s++)
        if (c[s] < c[b]) b = s;
      return b;
    });
    const seen = new Set(),
      out = [];

    function add(r) {
      if (!r) return;
      const key = Array.from(r.data).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      let score = 0;
      for (let i = 0; i < 19; i++) score += costs[i][r.code[i]];
      out.push({
        ...r,
        score
      });
    }
    const hard = decode(read, k);
    add(hard);
    if (!soft || hard && hard.errors === 0) return out;
    const order = costs.map((c, i) => {
      let first = Infinity, second = Infinity, alternative = 0;
      for (let s = 0; s < Q; s++) {
        if (s !== read[i] && c[s] < second) { second = c[s]; alternative = s; }
        if (c[s] < first) first = c[s];
      }
      return { i, margin: second - first, alternative };
    }).sort((a, b) => a.margin - b.margin);
    if (soft) {
      for (let e = 1; e <= 19 - k && performance.now() < deadline; e++)
        add(decode(read, k, order.slice(0, e).map(v => v.i)));
      // Bounded Chase alternatives at the two least reliable observations.
      for (const {
          i, alternative
        }
        of order.slice(0, 2)) {
        if (performance.now() >= deadline) break;
        const changed = read.slice();
        changed[i] = alternative;
        add(decode(changed, k));
      }
    }
    return out.sort((a, b) => a.score - b.score).slice(0, limit);
  }
  return {
    Q,
    mod,
    inv,
    evaluate,
    generator,
    encode,
    decode,
    candidates,
    solve
  };
});

;

/* src/alphabet19.js */
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
/* Camera-oriented symbol selection; a reproducible heuristic, not a proven optimum. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Alphabet19 = factory();
})(globalThis, function() {
  'use strict';
  const inks = [
    ['Black', [12, 16, 24]],
    ['Blue', [20, 48, 225]],
    ['Red', [224, 35, 48]],
    ['Green', [15, 170, 75]],
    ['Cyan', [0, 188, 218]],
    ['Magenta', [202, 20, 169]],
    ['Amber', [238, 154, 10]]
  ];
  const shapes = ['solid', 'horizontal', 'vertical', 'slash', 'backslash'];
  const candidates = inks.flatMap(([name, rgb]) => shapes.map(shape => ({
    name: `${name} ${shape}`,
    ink: name,
    rgb,
    shape
  })));

  function mask(shape, u, v) {
    if (u < .08 || u > .92 || v < .08 || v > .92) return 0;
    switch (shape) {
      case 'horizontal':
        return Math.abs(v - .5) < .23 ? 1 : 0;
      case 'vertical':
        return Math.abs(u - .5) < .23 ? 1 : 0;
      case 'slash':
        return Math.abs(u + v - 1) < .31 ? 1 : 0;
      case 'backslash':
        return Math.abs(u - v) < .31 ? 1 : 0;
      default:
        return 1;
    }
  }

  function pixel(g, u, v) {
    return mask(g.shape, u, v) ? g.rgb : [255, 255, 255];
  }

  function feature(g, blur = 0, loss = 0, mix = 0) {
    const out = [];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        let c = [0, 0, 0],
          w = 0;
        const r = blur ? 2 : 0;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const t = blur ? Math.exp(-(dx * dx + dy * dy) / 2) : 1,
              p = pixel(g, (x + .5) / 4 + dx * blur, (y + .5) / 4 + dy * blur);
            for (let z = 0; z < 3; z++) c[z] += p[z] * t;
            w += t;
          }
        c = c.map(v => v / w);
        const gray = .299 * c[0] + .587 * c[1] + .114 * c[2];
        const other = [.2 * c[0] + .6 * c[1] + .2 * c[2], .3 * c[0] + .4 * c[1] + .3 * c[2], .2 * c[0] +
          .3 * c[1] + .5 * c[2]
        ];
        for (let z = 0; z < 3; z++) out.push(((1 - loss) * c[z] + loss * gray) * (1 - mix) + other[z] *
        mix);
      }
    return out;
  }
  const best = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 20, 21, 23, 24, 27, 30, 32, 33, 34];
  const symbols = best.map((i, id) => Object.freeze({
    ...candidates[i],
    rgb: Object.freeze(candidates[i].rgb.slice()),
    id,
    candidate: i
  }));
  Object.freeze(symbols);
  const report = {
    "version": 1,
    "method": "Multi-start max-min packing; 35 color/pattern candidates, 4 synthetic channel profiles; frozen symbol IDs",
    "minMeanSquaredDistance": 819.0882683132951,
    "meanNearestDistance": 1291.3613862122725,
    "selected": [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 20, 21, 23, 24, 27, 30, 32, 33, 34],
    "optimizerSelection": [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 20, 21, 23, 24, 27, 30, 32, 33, 34],
    "profiles": [
      [0, 0, 0],
      [0.075, 0.2, 0.1],
      [0.12, 0.45, 0.15],
      [0.08, 0.65, 0.25]
    ],
    "limitations": "Synthetic heuristic. No proof of optimality or print-camera advantage; body cells need enough pixels to resolve the pattern."
  };
  const profiles = report.profiles;

  function svgSymbol(g, x, y) {
    const c = `rgb(${g.rgb})`,
      s = g.shape;
    let p;
    if (s === 'solid') p = `<rect x="${x+.08}" y="${y+.08}" width=".84" height=".84"/>`;
    else if (s === 'horizontal') p = `<rect x="${x+.08}" y="${y+.27}" width=".84" height=".46"/>`;
    else if (s === 'vertical') p = `<rect x="${x+.27}" y="${y+.08}" width=".46" height=".84"/>`;
    else {
      const pts = s === 'slash' ? [
        [.08, .61],
        [.61, .08],
        [.92, .08],
        [.92, .39],
        [.39, .92],
        [.08, .92]
      ] : [
        [.08, .08],
        [.39, .08],
        [.92, .61],
        [.92, .92],
        [.61, .92],
        [.08, .39]
      ];
      p = `<polygon points="${pts.map(([u,v])=>`${x+u},${y+v}`).join(' ')}"/>`;
    }
    return `<g fill="${c}">${p}</g>`;
  }
  return {
    symbols,
    candidates,
    profiles,
    report,
    pixel,
    mask,
    feature,
    svgSymbol
  };
});

;

/* src/codec.js */
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
/* Prism 19 / protocol 2. Optical alphabet + GF19 equations + bounded soft decoding. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./crc32.js'), require(
    './gf19.js'), require('./alphabet19.js'));
  else root.Prism19Core = factory(root.PrismCRC, root.GF19, root.Alphabet19);
})(globalThis, function(P, F, A) {
  'use strict';
  const LOG = Math.log2(19),
    HEADER_SYMBOLS = 76,
    PILOTS = 38,
    SAMPLES = 4,
    FEATURES = 48;
  const K = {
      L: 15,
      M: 13,
      Q: 11,
      H: 9
    },
    layouts = new Map(),
    utf8 = new TextEncoder();

  function random(seed) {
    return () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
  }

  function digits(bytes, length = Math.ceil(bytes.length * 8 / LOG)) {
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = Number(n % 19n);
      n /= 19n;
    }
    if (n) throw Error('Radix capacity exceeded');
    return out;
  }

  function bytesFromDigits(ds, length) {
    let n = 0n;
    for (let i = ds.length - 1; i >= 0; i--) {
      if (ds[i] > 18) return null;
      n = n * 19n + BigInt(ds[i]);
    }
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = Number(n & 255n);
      n >>= 8n;
    }
    return n ? null : out;
  }

  function layout(n) {
    if (!Number.isInteger(n) || n < 25 || n > 145 || (n - 25) % 4) throw new RangeError(
      "Grid side must be 25, 29, ..., 145.");
    if (layouts.has(n)) return layouts.get(n);
    const fixed = new Int8Array(n * n).fill(-1);

    function rect(x, y, w, h, v) {
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          if (x + dx >= 0 && y + dy >= 0 && x + dx < n && y + dy < n) fixed[(y + dy) * n + x + dx] = v;
    }

    function finder(x, y) {
      rect(x - 1, y - 1, 9, 9, 0);
      for (let dy = 0; dy < 7; dy++)
        for (let dx = 0; dx < 7; dx++) fixed[(y + dy) * n + x + dx] = dx === 0 || dy === 0 || dx === 6 ||
          dy === 6 || dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4 ? 1 : 0;
    }
    finder(0, 0);
    finder(n - 7, 0);
    finder(0, n - 7);
    for (let i = 8; i < n - 8; i++) {
      fixed[6 * n + i] = i % 2 === 0 ? 1 : 0;
      fixed[i * n + 6] = i % 2 === 0 ? 1 : 0;
    }
    rect(n - 10, n - 10, 7, 7, 0);
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) fixed[(n - 9 + y) * n + n - 9 + x] = x === 0 || y === 0 || x === 4 ||
        y === 4 || x === 2 && y === 2 ? 1 : 0;
    const free = Array.from({
        length: n * n
      }, (_, i) => i).filter(i => fixed[i] < 0),
      rng = random(0x1951a7 ^ n);
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    const out = {
      n,
      fixed,
      pilots: free.slice(0, PILOTS),
      slots: free.slice(PILOTS)
    };
    layouts.set(n, out);
    return out;
  }

  function capacity(k, n = 145) {
    const blocks = Math.floor((layout(n).slots.length - HEADER_SYMBOLS) / 19);
    return Math.floor(blocks * k * LOG / 8);
  }

  function makeHeader(payload, k, flags, version = 2) {
    const h = new Uint8Array(16),
      d = new DataView(h.buffer);
    h.set([80, 78, version, k, flags, 1]);
    d.setUint16(6, payload.length);
    d.setUint32(8, P.crc32(payload));
    d.setUint32(12, P.crc32(h.slice(0, 12)));
    const ds = digits(h, 36),
      blocks = [];
    for (let i = 0; i < 4; i++) blocks.push(F.encode(ds.slice(i * 9, (i + 1) * 9)));
    return {
      bytes: h,
      blocks
    };
  }

  function parseHeader(ds, n) {
    const h = bytesFromDigits(ds, 16);
    if (!h) return null;
    const d = new DataView(h.buffer);
    if (h[0] !== 80 || h[1] !== 78 || ![2, 3].includes(h[2]) || ![9, 11, 13, 15].includes(h[3]) || h[4] > (h[2] === 2 ? 1 : 3) || h[5] !==
      1 || P.crc32(h.slice(0, 12)) !== d.getUint32(12)) return null;
    const length = d.getUint16(6);
    const encrypted = !!(h[4] & 1), typed = !!(h[4] & 2);
    const minimum = (encrypted ? 44 : 0) + (typed ? 4 : 1);
    const maximum = h[2] === 2 ? (encrypted ? 1244 : 1200) : capacity(h[3], n);
    if (length < minimum || length > maximum) return null;
    const count = Math.ceil(length * 8 / LOG),
      blocks = Math.ceil(count / h[3]);
    if (HEADER_SYMBOLS + blocks * 19 > layout(n).slots.length) return null;
    return {
      n,
      version: h[2],
      k: h[3],
      flags: h[4],
      length,
      crc: d.getUint32(8),
      count,
      blocks,
      key: `${n}:${Array.from(h).join('.')}`
    };
  }
  // Each spare cell stores one deterministic sparse linear equation in GF(19).
  function equation(index, blocks, k) {
    const col = index % k,
      seed = (0x51ed19 ^ Math.imul(index + 1, 0x9e3779b1) ^ blocks) >>> 0,
      rng = random(seed),
      chosen = new Set([Math.floor(index / k) % blocks]);
    while (chosen.size < Math.min(blocks, 7)) chosen.add(Math.floor(rng() * blocks));
    return Array.from(chosen, b => ({
      index: b * k + col,
      coefficient: 1 + Math.floor(rng() * 18)
    }));
  }

  function encode(value, ecc = 'Q', options = {}) {
    const payload = options.payload ? Uint8Array.from(options.payload) : utf8.encode(value),
      k = K[ecc];
    const flags = (options.encrypted ? 1 : 0) | (options.typed ? 2 : 0);
    const legacyLimit = options.encrypted ? 1244 : 1200;
    const version = options.wireVersion ?? (options.typed || payload.length > legacyLimit ? 3 : 2);
    if (!k || ![2, 3].includes(version) || version === 2 && options.typed ||
        payload.length < (options.encrypted ? 44 : 0) + (options.typed ? 4 : 1) ||
        payload.length > (version === 2 ? legacyLimit : capacity(k))) throw Error(
      `Payload exceeds the selected format/correction capacity (${k ? (version === 2 ? legacyLimit : capacity(k)) : 0} bytes).`);
    const ds = digits(payload),
      blocks = Math.ceil(ds.length / k),
      padded = new Uint8Array(blocks * k);
    padded.set(ds);
    let n = 25;
    while (n <= 145 && layout(n).slots.length < HEADER_SYMBOLS + blocks * 19) n += 4;
    if (n > 145) throw Error('Code is too large.');
    const l = layout(n),
      cells = new Int16Array(n * n).fill(-1),
      h = makeHeader(payload, k, flags, version);
    l.pilots.forEach((cell, i) => cells[cell] = i % 19);
    for (let j = 0; j < 19; j++)
      for (let b = 0; b < 4; b++) cells[l.slots[j * 4 + b]] = h.blocks[b][j];
    const cw = Array.from({
      length: blocks
    }, (_, b) => F.encode(padded.slice(b * k, (b + 1) * k)));
    for (let j = 0; j < 19; j++)
      for (let b = 0; b < blocks; b++) cells[l.slots[HEADER_SYMBOLS + j * blocks + b]] = cw[b][j];
    const repairStart = HEADER_SYMBOLS + blocks * 19,
      repairCount = l.slots.length - repairStart;
    for (let i = 0; i < repairCount; i++) {
      let v = 0;
      for (const t of equation(i, blocks, k)) v += padded[t.index] * t.coefficient;
      cells[l.slots[repairStart + i]] = v % 19;
    }
    return {
      mode: 'p19',
      ecc,
      version,
      layers: 1,
      n,
      cells,
      palette: A.symbols.map(g => g.rgb),
      width: n + 8,
      height: n + 8,
      bytes: options.originalBytes ?? utf8.encode(value).length,
      bodyBytes: payload.length,
      headerBytes: 16,
      k,
      blocks,
      repairCount,
      paritySymbols: blocks * (19 - k) + 40,
      digitCount: ds.length,
      encrypted: !!options.encrypted,
      typed: !!options.typed,
      layout: l
    };
  }

  function colorAt(code, x, y) {
    x -= 4;
    y -= 4;
    if (x < 0 || y < 0 || x >= code.n || y >= code.n) return [255, 255, 255];
    const ix = Math.floor(x),
      iy = Math.floor(y),
      i = iy * code.n + ix,
      f = code.layout.fixed[i];
    if (f >= 0) return f ? [0, 0, 0] : [255, 255, 255];
    return A.pixel(A.symbols[code.cells[i]], x - ix, y - iy);
  }

  function svg(code, size = 12) {
    let out =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${code.width*size}" height="${code.height*size}" viewBox="0 0 ${code.width} ${code.height}"><rect width="100%" height="100%" fill="white"/>`;
    const path = [];
    for (let y = 0; y < code.n; y++)
      for (let x = 0; x < code.n; x++) {
        const i = y * code.n + x;
        if (code.layout.fixed[i] === 1) path.push(`M${x+4},${y+4}h1v1h-1z`);
        else if (code.cells[i] >= 0) out += A.svgSymbol(A.symbols[code.cells[i]], x + 4, y + 4);
      }
    return out + `<path d="${path.join('')}" fill="black"/></svg>`;
  }

  const atlases = new Map();
  function raster(code, size = 12) {
    let atlas = atlases.get(size);
    if (!atlas) {
      atlas = Array.from({ length: 20 }, (_, symbol) => Array.from({ length: size }, (_, y) => {
        const row = new Uint8ClampedArray(size * 4);
        for (let x = 0; x < size; x++) {
          const rgb = symbol === 19 ? [0, 0, 0] :
            A.pixel(A.symbols[symbol], (x + .5) / size, (y + .5) / size);
          row[x * 4] = rgb[0]; row[x * 4 + 1] = rgb[1]; row[x * 4 + 2] = rgb[2];
          row[x * 4 + 3] = 255;
        }
        return row;
      }));
      if (atlases.size >= 4) atlases.delete(atlases.keys().next().value);
      atlases.set(size, atlas);
    }
    const width = code.width * size, height = code.height * size;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < code.n; y++) for (let x = 0; x < code.n; x++) {
      const cell = y * code.n + x, fixed = code.layout.fixed[cell];
      if (fixed === 0) continue;
      const tile = atlas[fixed === 1 ? 19 : code.cells[cell]];
      for (let row = 0; row < size; row++)
        data.set(tile[row], (((y + 4) * size + row) * width + (x + 4) * size) * 4);
    }
    return { data, width, height };
  }

  function sample(image, p, out = [0, 0, 0]) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const x = p.x - .5,
      y = p.y - .5,
      ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    if (ix < 0 || iy < 0 || ix + 1 >= image.width || iy + 1 >= image.height) return null;
    out[0] = out[1] = out[2] = 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy),
          i = 4 * ((iy + dy) * image.width + ix + dx);
        for (let c = 0; c < 3; c++) out[c] += w * image.data[i + c];
      }
    return out;
  }

  function photometry(image, map, n) {
    const points = [
        [3.5, 3.5],
        [n - 3.5, 3.5],
        [3.5, n - 3.5]
      ],
      whites = [
        [1.5, 3.5],
        [n - 1.5, 3.5],
        [1.5, n - 3.5]
      ];
    const dark = points.map(([x, y]) => sample(image, map(x, y))),
      white = whites.map(([x, y]) => sample(image, map(x, y)));
    if ([...dark, ...white].some(v => !v)) return null;
    if (white.some((v, i) => v.reduce((s, c, j) => s + c - dark[i][j], 0) < 160)) return null;
    return (rgb, x, y, out, offset) => {
      const u = (x - 3.5) / (n - 7), w = (y - 3.5) / (n - 7);
      for (let c = 0; c < 3; c++) {
        const v = rgb[c], d = dark[0][c] + u * (dark[1][c] - dark[0][c]) + w * (dark[2][c] - dark[0][c]),
        b = white[0][c] + u * (white[1][c] - white[0][c]) + w * (white[2][c] - white[0][c]);
        out[offset + c] = Math.max(-40, Math.min(295, 255 * (v - d) / Math.max(55, b - d)));
      }
    };
  }

  function observations(image, location, shift = [0, 0]) {
    const n = location.dimension,
      l = layout(n),
      norm = photometry(image, location.photometryMap || location.map, n);
    if (!norm) return null;
    const data = new Float32Array(n * n * FEATURES), rgb = [0, 0, 0];
    for (const cell of [...l.pilots, ...l.slots]) {
      const y = Math.floor(cell / n), x = cell % n;
        for (let dy = 0; dy < SAMPLES; dy++)
          for (let dx = 0; dx < SAMPLES; dx++) {
            const u = x + (dx + .5) / SAMPLES + shift[0],
              v = y + (dy + .5) / SAMPLES + shift[1],
              sampled = sample(image, location.map(u, v), rgb);
            if (!sampled) return null;
            const p = (y * n + x) * FEATURES + (dy * SAMPLES + dx) * 3;
            norm(rgb, u, v, data, p);
          }
    }
    const obs = { n, layout: l, data, shift };
    return calibrate(obs);
  }

  function calibrate(obs, robust = false) {
    const { data, layout: l } = obs;
    const refs = Array.from({ length: 19 }, () => new Float32Array(FEATURES));
    const variances = [];
    let residual = 0;
    for (let s = 0; s < 19; s++) {
      const a = l.pilots[s] * FEATURES, b = l.pilots[s + 19] * FEATURES;
      let ea = 0, eb = 0;
      for (let f = 0; f < FEATURES; f++) {
        ea += (255 - data[a + f]) ** 2;
        eb += (255 - data[b + f]) ** 2;
      }
      // A white occlusion/glare patch can erase just one of a symbol's pilots.
      // Keep ordinary averaging as the primary model; reject washed-out pilots
      // only in this bounded fallback, never inventing a new optical symbol.
      const rejectA = robust && ea < eb * .3, rejectB = robust && eb < ea * .3;
      let variance = 0;
      for (let f = 0; f < FEATURES; f++) {
        refs[s][f] = rejectA ? data[b + f] : rejectB ? data[a + f] :
          data[a + f] / 2 + data[b + f] / 2;
        variance += ((data[a + f] - refs[s][f]) ** 2 + (data[b + f] - refs[s][f]) ** 2) / 2;
      }
      variances.push(variance / FEATURES);
      residual += variance / FEATURES;
    }
    residual = robust ? variances.sort((a, b) => a - b)[9] : residual / 19;
    let separation = Infinity;
    for (let i = 0; i < 19; i++) for (let j = 0; j < i; j++) {
      let d = 0;
      for (let f = 0; f < FEATURES; f++) d += (refs[i][f] - refs[j][f]) ** 2;
      separation = Math.min(separation, d / FEATURES);
    }
    return { ...obs, refs, noise: Math.max(100, residual * 1.2), separation, robust };
  }
  const cellBest = (costs, cell) => {
    let best = 0;
    for (let s = 1; s < 19; s++)
      if (costs[cell * 19 + s] < costs[cell * 19 + best]) best = s;
    return best;
  };

  function classify(obs, mixing = 0, prior = null) {
    const { n, layout: l, data, noise } = obs;
    const cells = [...l.pilots, ...l.slots], spatial = mixing && prior;
    let refs = obs.refs;
    // A neighboring cell's symbol is independent of the glyph being scored.
    // Resolve it once, instead of repeating argmin inside every feature comparison.
    const best = spatial ? new Int8Array(n * n) : null;
    if (spatial) {
      for (const cell of l.slots) best[cell] = cellBest(prior, cell);
      l.pilots.forEach((cell, i) => best[cell] = i % 19);
    }
    const spill = new Float64Array(FEATURES), weight = new Float64Array(FEATURES);
    function predicted(cell, f, source) {
      return l.fixed[cell] >= 0 ? (l.fixed[cell] ? 0 : 255) : source[best[cell]][f];
    }
    function neighbors(cell, source) {
      const x = cell % n, y = Math.floor(cell / n);
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        let count = 0;
        if (sx === 0 && x > 0) count++;
        if (sx === 3 && x < n - 1) count++;
        if (sy === 0 && y > 0) count++;
        if (sy === 3 && y < n - 1) count++;
        for (let c = 0; c < 3; c++) {
          const f = (sy * 4 + sx) * 3 + c;
          let sum = 0;
          if (sx === 0 && x > 0) sum += predicted(cell - 1, (sy * 4 + 3) * 3 + c, source);
          if (sx === 3 && x < n - 1) sum += predicted(cell + 1, sy * 12 + c, source);
          if (sy === 0 && y > 0) sum += predicted(cell - n, (12 + sx) * 3 + c, source);
          if (sy === 3 && y < n - 1) sum += predicted(cell + n, sx * 3 + c, source);
          spill[f] = mixing * sum;
          weight[f] = 1 - mixing * count;
        }
      }
    }
    if (spatial) {
      const intrinsic = refs.map(() => new Float32Array(FEATURES));
      l.pilots.forEach((cell, i) => {
        neighbors(cell, refs);
        for (let f = 0; f < FEATURES; f++)
          intrinsic[i % 19][f] += (data[cell * FEATURES + f] - spill[f]) / weight[f] / 2;
      });
      refs = intrinsic;
    }
    const out = new Float32Array(n * n * 19);
    for (const cell of cells) {
      if (spatial) neighbors(cell, refs);
      let min = Infinity;
      for (let s = 0; s < 19; s++) {
        let d = 0;
        const ref = refs[s], offset = cell * FEATURES;
        for (let f = 0; f < FEATURES; f++) {
          const expected = spatial ? ref[f] * weight[f] + spill[f] : ref[f];
          d += (data[offset + f] - expected) ** 2;
        }
        d /= FEATURES;
        out[cell * 19 + s] = d;
        min = Math.min(min, d);
      }
      const reliability = 1 / (1 + min / (noise * 3));
      for (let s = 0; s < 19; s++)
        out[cell * 19 + s] = Math.min(24, (out[cell * 19 + s] - min) / (noise * 2)) * reliability;
    }
    return out;
  }

  function costsAt(scores, cell) {
    return Array.from(scores.subarray(cell * 19, cell * 19 + 19));
  }

  function combinations(lists, limit = 32) {
    let beam = [{
      parts: [],
      score: 0
    }];
    for (const list of lists) {
      const next = [];
      for (const state of beam)
        for (const c of list) next.push({
          parts: [...state.parts, c],
          score: state.score + c.score
        });
      beam = next.sort((a, b) => a.score - b.score).slice(0, limit);
      if (!beam.length) break;
    }
    return beam;
  }

  function headerFromScores(scores, n, soft = true, deadline = Infinity) {
    const l = layout(n),
      lists = [];
    for (let b = 0; b < 4; b++) {
      const costs = Array.from({
        length: 19
      }, (_, j) => costsAt(scores, l.slots[j * 4 + b]));
      const c = F.candidates(costs, 9, soft, 3, deadline);
      if (!c.length) return null;
      lists.push(c);
    }
    for (const candidate of combinations(lists, 32)) {
      const ds = candidate.parts.flatMap(c => Array.from(c.data)),
        h = parseHeader(ds, n);
      if (h) return h;
    }
    return null;
  }

  function checkPacket(ds, h) {
    if (!ds || ds.length < h.count) return null;
    if (ds.slice(h.count).some(v => v !== 0)) return null;
    const bytes = bytesFromDigits(ds.slice(0, h.count), h.length);
    return bytes && P.crc32(bytes) === h.crc ? bytes : null;
  }

  function repairEquations(scores, h, known, deadline = Infinity) {
    const groups = Array.from({ length: h.k }, () => ({ positions: [], rows: [] }));
    const columns = new Map();
    for (let i = 0; i < known.length; i++) if (known[i] < 0) {
      const group = groups[i % h.k];
      columns.set(i, group.positions.length);
      group.positions.push(i);
    }
    const unknown = columns.size;
    if (!unknown || unknown > 96) return null;
    const l = layout(h.n), start = HEADER_SYMBOLS + h.blocks * 19;
    for (let e = 0; e < l.slots.length - start; e++) {
      const group = groups[e % h.k];
      if (!group.positions.length) continue;
      const cell = l.slots[start + e], symbol = cellBest(scores, cell);
      let second = Infinity;
      for (let j = 0; j < 19; j++) if (j !== symbol) second = Math.min(second, scores[cell * 19 + j]);
      const margin = second - scores[cell * 19 + symbol];
      if (margin < .8) continue;
      const row = new Uint8Array(group.positions.length);
      let rhs = symbol;
      for (const t of equation(e, h.blocks, h.k)) {
        if (columns.has(t.index)) row[columns.get(t.index)] = t.coefficient;
        else rhs = F.mod(rhs - t.coefficient * known[t.index]);
      }
      if (row.some(v => v)) group.rows.push({ row, rhs, margin });
    }
    // Each equation connects one data column across blocks. Solve these small
    // systems independently; one bad optical equation must not poison every row.
    function independent(rows, n, skip) {
      const basis = new Array(n);
      let rank = 0;
      for (let i = 0; i < rows.length; i++) {
        if (i === skip) continue;
        const a = new Uint8Array(n + 1);
        a.set(rows[i].row); a[n] = rows[i].rhs;
        for (let c = 0; c < n; c++) {
          if (!a[c]) continue;
          if (basis[c]) {
            const factor = a[c];
            for (let j = c; j <= n; j++) a[j] = (a[j] - factor * basis[c][j] + 361) % 19;
          } else {
            const factor = F.inv[a[c]];
            for (let j = c; j <= n; j++) a[j] = a[j] * factor % 19;
            basis[c] = a; rank++; break;
          }
        }
        if (rank === n) {
          const answer = new Uint8Array(n);
          for (let c = n - 1; c >= 0; c--) {
            let v = basis[c][n];
            for (let j = c + 1; j < n; j++) v -= basis[c][j] * answer[j];
            answer[c] = F.mod(v);
          }
          return answer;
        }
      }
      return null;
    }
    const active = groups.filter(g => g.positions.length), lists = [];
    for (const group of active) {
      if (performance.now() >= deadline) return null;
      const rows = group.rows.sort((a, b) => b.margin - a.margin), n = group.positions.length;
      if (rows.length < n) return null;
      const choices = [], seen = new Set();
      function add(answer, used) {
        if (!answer) return;
        const key = Array.from(answer).join(',');
        if (seen.has(key)) return;
        seen.add(key);
        let score = 0;
        for (const r of rows) {
          let predicted = 0;
          for (let i = 0; i < n; i++) predicted += r.row[i] * answer[i];
          if (predicted % 19 !== r.rhs) score += r.margin;
        }
        choices.push({ data: answer, score, used });
      }
      add(F.solve(rows.map(r => r.row), rows.map(r => r.rhs), n), rows.length);
      if (!choices.length) {
        add(independent(rows, n, -1), n);
        for (let skip = 0; skip < Math.min(8, rows.length) && performance.now() < deadline; skip++)
          add(independent(rows, n, skip), n);
      }
      if (!choices.length) return null;
      lists.push(choices.sort((a, b) => a.score - b.score).slice(0, 3));
    }
    for (const state of combinations(lists, 24)) {
      const ds = known.slice();
      active.forEach((group, c) => group.positions.forEach((p, i) => ds[p] = state.parts[c].data[i]));
      const bytes = checkPacket(ds, h);
      if (bytes) return { bytes, repaired: unknown, equations: state.parts.reduce((n, c) => n + c.used, 0) };
    }
    return null;
  }

  function bodyFromScores(scores, h, options = {}) {
    const l = layout(h.n),
      lists = [],
      trust = [],
      hardLists = [],
      allCosts = [],
      hardKnown = new Int16Array(h.blocks * h.k).fill(-1);
    let corrected = 0,
      hardCorrected = 0;
    for (let b = 0; b < h.blocks; b++) {
      const costs = Array.from({
          length: 19
        }, (_, j) => costsAt(scores, l.slots[HEADER_SYMBOLS + j * h.blocks + b])),
        hard = F.candidates(costs, h.k, false, 1);
      if (hard.length) {
        hardKnown.set(hard[0].data, b * h.k);
        hardCorrected += hard[0].errors;
      }
      allCosts.push(costs);
      hardLists.push(hard);

    }
    if (hardKnown.every(v => v >= 0)) {
      const bytes = checkPacket(Array.from(hardKnown), h);
      if (bytes) return {
        bytes,
        corrected: hardCorrected,
        repaired: 0,
        path: 'hard RS'
      };
    }
    const deadline = options.deadline ?? Infinity;
    for (let b = 0; b < h.blocks; b++) {
      if (performance.now() >= deadline) return null;
      const c = options.soft === false || hardLists[b][0]?.errors === 0 ? hardLists[b] :
        F.candidates(allCosts[b], h.k, true, 4, deadline);
      lists.push(c);
      if (c.length) corrected += c[0].errors + c[0].erasures;
    }
    if (lists.every(c => c.length)) {
      const ds = lists.flatMap(c => Array.from(c[0].data)),
        bytes = checkPacket(ds, h);
      if (bytes) return {
        bytes,
        corrected,
        repaired: 0,
        path: options.soft === false ? 'hard RS' : 'soft RS'
      };
    }
    if (options.equations !== false) {
      const known = Array.from(hardKnown),
        r = repairEquations(scores, h, known, deadline);
      if (r) return {
        ...r,
        corrected,
        path: 'repair equations'
      };
      const softKnown = known.slice();
      lists.forEach((list, b) => {
        if (list.length) for (let i = 0; i < h.k; i++) softKnown[b * h.k + i] = list[0].data[i];
      });
      if (softKnown.some((v, i) => v !== known[i])) {
        const result = repairEquations(scores, h, softKnown, deadline);
        if (result) return { ...result, corrected, path: 'soft RS + repair equations' };
      }
      for (let b = 0; b < h.blocks; b++) {
        let margin = 0;
        for (const costs of allCosts[b]) {
          let first = Infinity, second = Infinity;
          for (const v of costs) {
            if (v < first) { second = first; first = v; }
            else if (v < second) second = v;
          }
          margin += second - first;
        }
        trust.push({ block: b, margin: margin / 19 });
      }
      // A blank block can masquerade as a valid constant RS codeword. Use optical
      // confidence to erase suspect blocks, then let independent equations resolve them.
      trust.sort((a, b) => a.margin - b.margin);
      const worst = trust.slice(0, 3).map(t => t.block);
      const hypotheses = worst.map(b => [b]);
      if (worst.length > 1) hypotheses.push(worst.slice(0, 2));
      if (worst.length > 2) hypotheses.push(worst);
      for (const erased of hypotheses) {
        if (performance.now() >= deadline) return null;
        const tentative = known.slice();
        for (const b of erased)
          for (let i = 0; i < h.k; i++) tentative[b * h.k + i] = -1;
        const result = repairEquations(scores, h, tentative, deadline);
        if (result) return {
          ...result,
          corrected,
          path: 'repair equations'
        };
      }
    }
    if (options.soft !== false && lists.every(c => c.length))
      for (const state of combinations(lists, 24)) {
        const bytes = checkPacket(state.parts.flatMap(c => Array.from(c.data)), h);
        if (bytes) return {
          bytes,
          corrected,
          repaired: 0,
          path: 'soft candidate search'
        };
      }
    return null;
  }

  function makeResult(body, h, start, path, frames = 1) {
    const result = {
      kind: h.flags & 1 ? 'encrypted' : h.flags & 2 ? 'payload' : 'prism19',
      mode: 'p19',
      bytes: body.bytes.length,
      envelope: Array.from(body.bytes),
      encrypted: !!(h.flags & 1),
      typed: !!(h.flags & 2),
      wireVersion: h.version || 2,
      verified: true,
      checksum: h.crc.toString(16).padStart(8, '0'),
      ms: performance.now() - start,
      decoder: path || body.path,
      corrected: body.corrected || 0,
      repaired: body.repaired || 0,
      equations: body.equations || 0,
      frames,
      grid: h.n
    };
    if (!h.flags) {
      try {
        result.text = new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true
        }).decode(body.bytes);
      } catch {
        return {
          kind: 'none',
          mode: 'p19',
          ms: performance.now() - start
        };
      }
    }
    return result;
  }

  const sessions = new WeakMap();
  function createSession() {
    let entry = null;
    const state = { pose: null };
    const session = {
      clear() {
        entry = null;
        state.pose = null;
      },
      add(scores, header, frameId) {
        const now = Date.now();
        if (!entry || entry.key !== header.key || now - entry.time > 6000) entry = {
          key: header.key,
          time: now,
          items: [], ids: []
        };
        entry.time = now;
        if (frameId === undefined || !entry.ids.includes(frameId)) {
          entry.items.push(Float32Array.from(scores));
          entry.ids.push(frameId);
          if (entry.items.length > 8) { entry.items.shift(); entry.ids.shift(); }
        }
        const combined = new Float32Array(scores.length);
        for (const a of entry.items)
          for (let i = 0; i < a.length; i++) combined[i] += a[i];
        return {
          scores: combined,
          count: entry.items.length
        };
      }
    };
    sessions.set(session, state);
    return session;
  }

  function scan(image, options = {}) {
    if (typeof options.locate !== 'function') throw new TypeError(
      'An image locator is required; use the public scan() API or supply options.locate.');
    const start = performance.now(), deadline = start + (options.maxTimeMs ?? 2200);
    const stats = { locateCalls: 0, candidates: 0, observations: 0, tracked: false,
      locateMs: 0, observeMs: 0, classifyMs: 0, decodeMs: 0,
      unusableObservations: 0, bestSeparation: 0, headerMatches: 0, geometryCandidates: 0, cellRefinements: 0 };
    const hard = { soft: false, equations: false }, advanced = options.soft !== false ||
      options.equations !== false || options.spatial !== false || options.refine !== false;
    const config = { ...options, deadline };
    const state = sessions.get(options.session), poses = [];
    const sampledImages = new Map();
    let partial = null, fusedThisFrame = false;
    const expired = () => performance.now() >= deadline;
    function measured(key, fn) {
      const t = performance.now();
      try { return fn(); } finally { stats[key] += performance.now() - t; }
    }
    function finish(result) {
      result = result || partial || { kind: 'none', mode: 'p19' };
      result.ms = performance.now() - start;
      if (expired() && !['prism19', 'encrypted', 'payload'].includes(result.kind)) result.timedOut = true;
      if (options.diagnostics) result.diagnostics = stats;
      return result;
    }
    function remember(location) {
      if (state && options.tracking !== false) state.pose = { location, time: Date.now(),
        width: image.width, height: image.height, locator: options.locatorKey || options.locate };
    }
    function observe(location, shift = [0, 0]) {
      stats.observations++;
      if (location.sampleWidth && location.sampleHeight) {
        const key = `${location.sampleWidth},${location.sampleHeight}`;
        if (!sampledImages.has(key)) sampledImages.set(key, resize(image, location.sampleWidth, location.sampleHeight));
        const sampled = sampledImages.get(key), sx = sampled.width / image.width, sy = sampled.height / image.height;
        const scaled = map => (x, y) => { const p = map(x, y); return { x: p.x * sx, y: p.y * sy }; };
        return measured('observeMs', () => observations(sampled, { ...location, map: scaled(location.map),
          photometryMap: location.photometryMap && scaled(location.photometryMap) }, shift));
      }
      return measured('observeMs', () => observations(image, location, shift));
    }
    function score(obs, mixing = 0, prior = null) {
      return measured('classifyMs', () => classify(obs, mixing, prior));
    }
    function header(scores, n, soft) {
      return measured('decodeMs', () => headerFromScores(scores, n, soft, deadline));
    }
    function body(scores, h, config) {
      return measured('decodeMs', () => bodyFromScores(scores, h, config));
    }
    function recognized(h, location) {
      stats.headerMatches++;
      remember(location);
      partial = { kind: 'partial19', mode: 'p19', grid: h.n, frames: partial?.frames || 1,
        needed: 'more camera evidence' };
    }
    function fast(location, tracked = false) {
      if (!location || typeof location !== 'object') return null;
      const n = location.dimension;
      if (!Number.isInteger(n) || n < 25 || n > 145 || (n - 25) % 4 || typeof location.map !== 'function')
        return null;
      stats.candidates++;
      if (location.cellRefined) stats.cellRefinements++;
      const obs = observe(location);
      if (!obs) { stats.unusableObservations++; return null; }
      stats.bestSeparation = Math.max(stats.bestSeparation, obs.separation);
      const scores = obs.separation >= 70 ? score(obs) : null;
      const h = scores ? header(scores, n, false) : null;
      poses.push({ location, obs, scores, h, tracked });
      if (!h) return null;
      recognized(h, location);
      const decoded = body(scores, h, hard);
      if (decoded) {
        stats.tracked = tracked;
        return makeResult(decoded, h, start);
      }
      return null;
    }
    // A recent pose avoids re-running finder detection when the camera is steady.
    // Every frame still has to reconstruct and verify its own header and payload.
    const previous = options.tracking !== false && state?.pose;
    if (previous && previous.width === image.width && previous.height === image.height &&
        previous.locator === (options.locatorKey || options.locate) && Date.now() - previous.time < 1000) {
      const result = fast(previous.location, true);
      if (result) return finish(result);
      const recovered = recoverPoses(poses);
      if (recovered) return finish(recovered);
    }
    // Try every hard candidate in a channel, then recover its observations before
    // paying for another finder search. Otherwise short camera budgets can keep
    // recognizing the header without ever reaching error correction or fusion.
    for (const channel of ['gray', 0, 2]) {
      if (expired()) return finish();
      const pixels = new Uint8ClampedArray(image.data.length);
      for (let i = 0; i < pixels.length; i += 4) {
        const v = channel === 'gray' ? .299 * image.data[i] + .587 * image.data[i + 1] +
          .114 * image.data[i + 2] : image.data[i + channel];
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v; pixels[i + 3] = 255;
      }
      stats.locateCalls++;
      const locations = measured('locateMs', () => options.locate(pixels, image.width, image.height));
      const firstPose = poses.length;
      for (const location of locations.slice(0, 2)) {
        if (expired()) return finish();
        const result = fast(location);
        if (result) return finish(result);
      }
      const recovered = recoverPoses(poses.slice(firstPose));
      if (recovered) return finish(recovered);
      if (channel === 'gray' && typeof options.searchGeometry === 'function' && !expired()) {
        const iterator = options.searchGeometry(image, deadline, poses.length === 0);
        while (!expired()) {
          const candidate = measured('locateMs', () => iterator.next());
          if (candidate.done) break;
          stats.geometryCandidates++;
          const first = poses.length, result = fast(candidate.value);
          if (result) return finish(result);
          const recovered = recoverPoses(poses.slice(first));
          if (recovered) return finish(recovered);
        }
      }
    }
    function recover(obs, location, base, h, allowFusion, path) {
      if (obs.separation < 70 || expired()) return null;
      base = base || score(obs);
      h = h || header(base, obs.n, options.soft !== false);
      if (!h) return null;
      recognized(h, location);
      // Accumulate once per capture, before expensive single-image refinements.
      if (allowFusion && options.session && !fusedThisFrame) {
        fusedThisFrame = true;
        const fused = options.session.add(base, h, options.frameId);
        partial.frames = fused.count;
        if (fused.count > 1) {
          const decoded = body(fused.scores, h, config);
          if (decoded) return makeResult(decoded, h, start, 'burst likelihood fusion', fused.count);
        }
      }
      const decoded = body(base, h, config);
      if (decoded) return makeResult(decoded, h, start, path);
      if (options.spatial !== false) for (const mixing of [.12, .23]) {
        if (expired()) break;
        let scores = score(obs, mixing, base);
        scores = score(obs, mixing, scores);
        const recovered = body(scores, h, config);
        if (recovered) return makeResult(recovered, h, start, 'joint neighboring-cell model');
      }
      return null;
    }
    function recoverPoses(candidates) {
      if (!advanced && !options.session) return null;
      for (const pose of candidates) {
        if (expired()) return null;
        let result = recover(pose.obs, pose.location, pose.scores, pose.h, true);
        if (result) { stats.tracked = pose.tracked; return result; }
        if (advanced) {
          const robust = calibrate(pose.obs, true);
          result = recover(robust, pose.location, null, null, false, 'robust pilot calibration');
          if (result) { stats.tracked = pose.tracked; return result; }
        }
        if (options.refine !== false) for (const shift of [[.1, 0], [-.1, 0], [0, .1], [0, -.1]]) {
          if (expired()) return null;
          const obs = observe(pose.location, shift);
          if (!obs) continue;
          result = recover(obs, pose.location, null, null, false);
          if (result) { stats.tracked = pose.tracked; return result; }
        }
      }
      return null;
    }
    return finish();
  }
  // Box-average integer pixel areas for bounded scanner scale fallbacks.
  function resize(image, width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * image.width / width), x1 = Math.max(x0 + 1, Math.floor((x + 1) * image.width / width));
      const y0 = Math.floor(y * image.height / height), y1 = Math.max(y0 + 1, Math.floor((y + 1) * image.height / height));
      const out = (y * width + x) * 4, count = (x1 - x0) * (y1 - y0);
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let iy = y0; iy < y1; iy++) for (let ix = x0; ix < x1; ix++) sum += image.data[(iy * image.width + ix) * 4 + c];
        data[out + c] = sum / count;
      }
      data[out + 3] = 255;
    }
    return { width, height, data };
  }
  return {
    resize,
    encode,
    raster,
    svg,
    colorAt,
    scan,
    createSession,
    layout,
    digits,
    bytesFromDigits,
    makeHeader,
    capacity,
    parseHeader,
    equation,
    observations,
    classify,
    headerFromScores,
    bodyFromScores,
    checkPacket,
    repairEquations,
    makeResult,
    alphabet: A,
    constants: {
      HEADER_SYMBOLS,
      PILOTS,
      FEATURES,
      LOG
    }
  };
});

;

/* src/envelope.js */
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
    TYPED_AAD = encoder.encode('Prism19/protocol3/typed1/AES-256-GCM/PBKDF2-SHA256/600000'),
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
  async function seal(plain, password, typed = false) {
    if (!password) throw Error('Enter an encryption passphrase.');
    const salt = crypto.getRandomValues(new Uint8Array(16)),
      iv = crypto.getRandomValues(new Uint8Array(12)),
      k = await key(password, salt),
      cipher = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv,
        additionalData: typed ? TYPED_AAD : AAD,
        tagLength: 128
      }, k, plain)),
      out = new Uint8Array(28 + cipher.length);
    out.set(salt);
    out.set(iv, 16);
    out.set(cipher, 28);
    return out;
  }
  async function open(data, password, typed = false) {
    if (!password) throw Error('Enter the passphrase for this code.');
    const bytes = Uint8Array.from(data);
    if (bytes.length < 44) throw Error('Invalid encrypted envelope.');
    try {
      const k = await key(password, bytes.slice(0, 16)),
        plain = await crypto.subtle.decrypt({
          name: 'AES-GCM',
          iv: bytes.slice(16, 28),
          additionalData: typed ? TYPED_AAD : AAD,
          tagLength: 128
        }, k, bytes.slice(28));
      return new Uint8Array(plain);
    } catch {
      throw Error('Wrong passphrase or altered encrypted data.');
    }
  }
  const encrypt = (text, password) => seal(encoder.encode(text), password);
  async function decrypt(data, password) {
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await open(data, password)); }
    catch { throw Error('Wrong passphrase or altered encrypted data.'); }
  }
  return {
    encrypt,
    decrypt,
    encryptBytes: (data, password) => seal(data, password, true),
    decryptBytes: (data, password) => open(data, password, true),
    ITERATIONS,
    overhead: 44
  };
});

;

/* src/payload.js */
// SPDX-License-Identifier: Apache-2.0
// Format-3 content registry and a bounded arithmetic grammar. No script execution.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrismPayload = factory();
})(globalThis, function() {
  'use strict';
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const definitions = [
    ['binary', 'application/octet-stream'], ['json', 'application/json'],
    ['calculation', 'text/x-prism-calculation'], ['url', 'text/uri-list'],
    ['image', 'image/png'], ['audio', 'audio/wav'], ['contact', 'text/vcard']
  ];
  const types = Object.freeze(definitions.map(([name, mimeType], i) => Object.freeze({ id: i + 1, name, mimeType })));
  const media = {
    image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    audio: ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/aac', 'audio/flac']
  };
  function utf8(text) {
    if (typeof text !== 'string') throw new TypeError('Expected text.');
    const bytes = encoder.encode(text);
    if (decoder.decode(bytes) !== text) throw new TypeError('Text contains an unpaired surrogate.');
    return bytes;
  }
  function byteArray(value) {
    if (!ArrayBuffer.isView(value) || !['[object Uint8Array]', '[object Uint8ClampedArray]'].includes(
      Object.prototype.toString.call(value))) throw new TypeError('Expected unsigned bytes.');
    return value;
  }

  const functions = Object.freeze({
    sqrt: [Math.sqrt, 1, 1], abs: [Math.abs, 1, 1], sin: [Math.sin, 1, 1],
    cos: [Math.cos, 1, 1], tan: [Math.tan, 1, 1], log: [Math.log, 1, 1],
    log10: [Math.log10, 1, 1], exp: [Math.exp, 1, 1], floor: [Math.floor, 1, 1],
    ceil: [Math.ceil, 1, 1], round: [Math.round, 1, 1], min: [Math.min, 1, 8],
    max: [Math.max, 1, 8], pow: [Math.pow, 2, 2]
  });
  function calculation(expression, execute = true) {
    if (typeof expression !== 'string' || !expression.trim() || expression.length > 1024)
      throw new RangeError('Calculation must contain 1–1024 characters.');
    const tokens = [];
    for (let i = 0; i < expression.length;) {
      if (/\s/.test(expression[i])) { i++; continue; }
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z][A-Za-z0-9]*|^[()+\-*/%^,]/.exec(expression.slice(i));
      if (!match || tokens.length >= 256) throw new SyntaxError('Unsupported calculation syntax or too many tokens.');
      tokens.push(match[0]); i += match[0].length;
    }
    let at = 0, depth = 0;
    const finite = n => { if (execute && !Number.isFinite(n)) throw new RangeError('Calculation has no finite real result.'); return execute ? n : 1; };
    const take = t => tokens[at] === t ? (++at, true) : false;
    function nested(fn) {
      if (++depth > 32) throw new RangeError('Calculation nesting exceeds 32.');
      try { return fn(); } finally { depth--; }
    }
    function primary() {
      if (take('(')) { const v = nested(sum); if (!take(')')) throw new SyntaxError('Missing closing parenthesis.'); return v; }
      const token = tokens[at++];
      if (token === undefined) throw new SyntaxError('Missing calculation operand.');
      if (/^(?:\d|\.)/.test(token)) { const n = Number(token); if (!Number.isFinite(n)) throw new RangeError('Number is too large.'); return n; }
      if (token === 'pi') return Math.PI;
      if (token === 'e') return Math.E;
      if (!Object.hasOwn(functions, token) || !take('(')) throw new SyntaxError('Unknown calculation name.');
      const args = [];
      if (!take(')')) {
        do { args.push(nested(sum)); if (args.length > 8) throw new RangeError('Too many function arguments.'); } while (take(','));
        if (!take(')')) throw new SyntaxError('Missing closing parenthesis.');
      }
      const [fn, min, max] = functions[token];
      if (args.length < min || args.length > max) throw new RangeError('Wrong function argument count.');
      return execute ? finite(fn(...args)) : 1;
    }
    function power() { const v = primary(); return take('^') ? finite(v ** nested(unary)) : v; }
    function unary() { if (take('+')) return nested(unary); if (take('-')) return -nested(unary); return power(); }
    function product() {
      let v = unary();
      while (['*', '/', '%'].includes(tokens[at])) {
        const op = tokens[at++], b = unary();
        v = finite(op === '*' ? v * b : op === '/' ? v / b : v % b);
      }
      return v;
    }
    function sum() {
      let v = product();
      while (['+', '-'].includes(tokens[at])) { const op = tokens[at++], b = product(); v = finite(op === '+' ? v + b : v - b); }
      return v;
    }
    const result = sum();
    if (at !== tokens.length) throw new SyntaxError('Unexpected calculation token.');
    return finite(result);
  }

  function validate(type, data, mimeType, name) {
    if (!type) throw new RangeError('Unsupported payload type.');
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType) || mimeType.length > 96)
      throw new RangeError('Use a MIME type without parameters, at most 96 ASCII bytes.');
    if (utf8(name).length > 120 || /[\x00-\x1f\x7f/\\]/.test(name) || name === '.' || name === '..')
      throw new RangeError('Filename must be a simple name of at most 120 UTF-8 bytes.');
    if (media[type.name] && !media[type.name].includes(mimeType)) throw new RangeError('Unsupported media MIME type.');
    if (!['binary', 'image', 'audio'].includes(type.name) && mimeType !== type.mimeType)
      throw new RangeError('MIME type does not match the payload marker.');
    let text;
    if (['json', 'calculation', 'url', 'contact'].includes(type.name)) text = decoder.decode(data);
    if (type.name === 'json') JSON.parse(text);
    if (type.name === 'calculation') calculation(text, false);
    if (type.name === 'url') {
      if (/\s/.test(text) || !/^https?:\/\//i.test(text)) throw new RangeError('URL payloads require one HTTP(S) URL.');
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) throw new RangeError('Unsupported URL scheme.');
    }
    if (type.name === 'contact' && (!/^BEGIN:VCARD\r?\n/.test(text) || !/\r?\nEND:VCARD\r?\n?$/.test(text)))
      throw new RangeError('Contact payload must contain a vCard.');
    return text;
  }
  function pack(typeName, value, options = {}) {
    const type = types.find(t => t.name === typeName);
    if (!type) throw new RangeError('Unsupported payload type.');
    const data = typeof value === 'string' ? utf8(value) : byteArray(value);
    if (data.length > 8550) throw new RangeError('Payload data exceeds one code.');
    const mimeType = options.mimeType ?? type.mimeType, name = options.name ?? '';
    if (typeof mimeType !== 'string' || typeof name !== 'string') throw new TypeError('MIME type and name must be strings.');
    validate(type, data, mimeType, name);
    const mime = mimeType === type.mimeType ? new Uint8Array() : utf8(mimeType), filename = utf8(name), out = new Uint8Array(4 + mime.length + filename.length + data.length);
    if (out.length > 8554) throw new RangeError('Payload metadata and data exceed one code.');
    out.set([1, type.id, mime.length, filename.length]); out.set(mime, 4); out.set(filename, 4 + mime.length);
    out.set(data, 4 + mime.length + filename.length);
    return out;
  }
  function unpack(value) {
    const bytes = byteArray(value);
    if (bytes.length < 4 || bytes.length > 8554 || bytes[0] !== 1 || bytes[2] > 96 || bytes[3] > 120)
      throw new RangeError('Unsupported typed payload header.');
    const end = 4 + bytes[2] + bytes[3];
    if (end > bytes.length) throw new RangeError('Truncated payload metadata.');
    const type = types.find(t => t.id === bytes[1]), mimeType = bytes[2] ? decoder.decode(bytes.subarray(4, 4 + bytes[2])) : type?.mimeType,
      name = decoder.decode(bytes.subarray(4 + bytes[2], end)), data = Uint8Array.from(bytes.subarray(end));
    const text = validate(type, data, mimeType, name);
    return { type: type.name, typeId: type.id, mimeType, name, data, ...(text !== undefined ? { text } : {}) };
  }
  return { types, pack, unpack, evaluate: expression => calculation(expression), utf8 };
});

;

/* src/api.js */
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./codec.js'), require('./envelope.js'), require('./payload.js'), () => require('./geometry.js'));
  } else root.Prism19 = factory(root.Prism19Core, root.PrismEnvelope, root.PrismPayload, () => root.Prism19Geometry || root.Prism19Locator);
})(globalThis, function(core, envelope, payload, getDefaultLocator) {
  'use strict';
  const version = '0.3.4',
    wireVersion = 3,
    supportedWireVersions = Object.freeze([2, 3]),
    maxTextBytes = 8554,
    maxImagePixels = 4194304;
  const encoder = new TextEncoder();

  function optionsObject(options) {
    if (options === undefined) return {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError(
      'Options must be an object.');
    return options;
  }

  function textBytes(text) {
    if (typeof text !== 'string') throw new TypeError('Text must be a string.');
    // Reject lone surrogates instead of silently replacing them during UTF-8 encoding.
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(
          'Text contains an unpaired Unicode surrogate.');
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError(
        'Text contains an unpaired Unicode surrogate.');
    }
    const bytes = encoder.encode(text);
    if (bytes.length < 1 || bytes.length > maxTextBytes) throw new RangeError(
      'Text must contain 1–8554 UTF-8 bytes, subject to the selected correction level.');
    return bytes;
  }

  function level(options) {
    const value = options.ecc === undefined ? 'Q' : options.ecc;
    if (!['L', 'M', 'Q', 'H'].includes(value)) throw new RangeError('ecc must be L, M, Q or H.');
    return value;
  }

  function wire(options) {
    if (options.wireVersion !== undefined && !supportedWireVersions.includes(options.wireVersion))
      throw new RangeError('wireVersion must be 2 or 3.');
    return options.wireVersion;
  }
  function capacity(options) {
    options = optionsObject(options);
    const ecc = level(options), version = wire(options);
    if (options.encrypted !== undefined && typeof options.encrypted !== 'boolean') throw new TypeError('encrypted must be boolean.');
    return version === 2 ? 1200 : core.capacity({ L: 15, M: 13, Q: 11, H: 9 }[ecc]) - (options.encrypted ? 44 : 0);
  }

  function password(value) {
    if (typeof value !== 'string' || !value || encoder.encode(value).length > 4096) throw new RangeError(
      'Passphrase must contain 1–4096 UTF-8 bytes.');
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(
          'Passphrase contains an unpaired Unicode surrogate.');
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError(
        'Passphrase contains an unpaired Unicode surrogate.');
    }
    return value;
  }

  function bytes(value, min, max) {
    if (!ArrayBuffer.isView(value) || value.BYTES_PER_ELEMENT !== 1 || !['[object Uint8Array]',
        '[object Uint8ClampedArray]'
      ].includes(Object.prototype.toString.call(value))) throw new TypeError(
      'Expected an unsigned byte array.');
    if (value.length < min || value.length > max) throw new RangeError(
      'Byte array length is outside the supported range.');
    return value;
  }

  function encode(text, options) {
    options = optionsObject(options);
    textBytes(text);
    return core.encode(text, level(options), { wireVersion: wire(options) });
  }

  function encodeEnvelope(data, options) {
    options = optionsObject(options);
    bytes(data, 45, 8554);
    return core.encode('', level(options), {
      payload: data,
      encrypted: true,
      wireVersion: wire(options),
      originalBytes: data.length - 44
    });
  }
  async function encrypt(text, passphrase) {
    if (textBytes(text).length > 8510) throw new RangeError('Encrypted text exceeds 8510 bytes.');
    password(passphrase);
    return envelope.encrypt(text, passphrase);
  }
  async function decrypt(data, passphrase) {
    bytes(data, 45, 8554);
    password(passphrase);
    return envelope.decrypt(data, passphrase);
  }
  async function encodeEncrypted(text, passphrase, options) {
    options = optionsObject(options);
    if (textBytes(text).length > capacity({ ...options, encrypted: true })) throw new RangeError('Encrypted text exceeds the selected correction capacity.');
    return encodeEnvelope(await encrypt(text, passphrase), options);
  }

  const packPayload = (type, data, options) => payload.pack(type, data, optionsObject(options));
  const unpackPayload = data => payload.unpack(bytes(data, 4, 8554));
  function encodePayload(type, data, options) {
    options = optionsObject(options);
    if (wire(options) === 2) throw new RangeError('Typed payloads require wire version 3.');
    const packet = packPayload(type, data, options);
    return core.encode('', level(options), { payload: packet, typed: true, wireVersion: 3,
      originalBytes: typeof data === 'string' ? payload.utf8(data).length : data.length });
  }
  async function encodePayloadEncrypted(type, data, passphrase, options) {
    options = optionsObject(options);
    if (wire(options) === 2) throw new RangeError('Typed payloads require wire version 3.');
    const packet = packPayload(type, data, options);
    password(passphrase);
    if (packet.length > capacity({ ...options, encrypted: true })) throw new RangeError('Encrypted payload exceeds the selected correction capacity.');
    return core.encode('', level(options), { payload: await envelope.encryptBytes(packet, passphrase),
      encrypted: true, typed: true, wireVersion: 3,
      originalBytes: typeof data === 'string' ? payload.utf8(data).length : data.length });
  }
  async function decryptPayload(data, passphrase) {
    bytes(data, 48, 8554); password(passphrase);
    return unpackPayload(await envelope.decryptBytes(data, passphrase));
  }
  function withPayload(result) {
    if (result.kind !== 'payload') return result;
    try { return { ...result, payload: unpackPayload(Uint8Array.from(result.envelope)) }; }
    catch { return { kind: 'none', mode: 'p19', ms: result.ms,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}) }; }
  }

  function validateCode(code) {
    if (!code || typeof code !== 'object' || code.mode !== 'p19' || !code.cells || code.cells.length !==
      code.n * code.n || !code.layout || code.layout.n !== code.n) throw new TypeError(
      'Expected a code returned by encode().');
    core.layout(code.n);
    return code;
  }

  function scale(code, value, raster = true) {
    validateCode(code);
    if (value === undefined) value = 12;
    if (!Number.isInteger(value) || value < 1 || value > 64) throw new RangeError(
      'Scale must be an integer from 1 to 64.');
    if (raster && (code.n + 8) ** 2 * value ** 2 > maxImagePixels) throw new RangeError(
      'Rendered image exceeds the 4 megapixel limit.');
    return value;
  }
  const toSVG = (code, pixelsPerModule) => core.svg(code, scale(code, pixelsPerModule, false));
  const toRGBA = (code, pixelsPerModule) => core.raster(code, scale(code, pixelsPerModule));

  function toMatrix(code) {
    validateCode(code);
    return Array.from({
      length: code.n
    }, (_, y) => Array.from({
      length: code.n
    }, (_, x) => {
      const i = y * code.n + x,
        fixed = code.layout.fixed[i];
      return fixed === 0 ? -2 : fixed === 1 ? -1 : code.cells[i];
    }));
  }

  function scanOptions(value) {
    const options = optionsObject(value),
      out = {};
    for (const key of ['soft', 'equations', 'spatial', 'refine', 'tracking', 'diagnostics']) {
      if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(
        `${key} must be boolean.`);
      if (options[key] !== undefined) out[key] = options[key];
    }
    if (options.maxTimeMs !== undefined) {
      if (!Number.isFinite(options.maxTimeMs) || options.maxTimeMs < 10 || options.maxTimeMs > 10000)
        throw new RangeError('maxTimeMs must be a number from 10 to 10000.');
      out.maxTimeMs = options.maxTimeMs;
    }
    if (options.frameId !== undefined) {
      if (!Number.isSafeInteger(options.frameId) || options.frameId < 0)
        throw new RangeError('frameId must be a nonnegative safe integer.');
      out.frameId = options.frameId;
    }
    if (options.session !== undefined) {
      if (!options.session || typeof options.session.add !== 'function' || typeof options.session.clear !==
        'function') throw new TypeError('Use a session returned by createSession().');
      out.session = options.session;
    }
    return out;
  }

  function imageData(image) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 ||
      image.height < 1 || image.width > 4096 || image.height > 4096 || image.width * image.height >
      maxImagePixels) throw new RangeError(
      'Image dimensions must be positive integers, at most 4096 per side and 4 megapixels total.');
    bytes(image.data, image.width * image.height * 4, image.width * image.height * 4);
    // Composite transparent PNG/canvas pixels on the format's white background.
    let data = image.data;
    for (let i = 3; i < data.length; i += 4)
      if (data[i] !== 255) {
        data = new Uint8ClampedArray(data);
        for (let p = 0; p < data.length; p += 4) {
          const a = data[p + 3] / 255;
          for (let c = 0; c < 3; c++) data[p + c] = Math.round(data[p + c] * a + 255 * (1 - a));
          data[p + 3] = 255;
        }
        break;
      }
    return {
      data,
      width: image.width,
      height: image.height
    };
  }

  function scan(image, options) {
    const start = performance.now();
    const configured = scanOptions(options),
      input = imageData(image);
    if (input.width < 25 || input.height < 25) {
      const result = { kind: 'none', mode: 'p19', ms: performance.now() - start };
      if (configured.diagnostics) result.diagnostics = { locateCalls: 0, candidates: 0,
        observations: 0, tracked: false, locateMs: 0, observeMs: 0, classifyMs: 0, decodeMs: 0 };
      return result;
    }
    const locate = options && options.locate !== undefined ? options.locate : getDefaultLocator();
    if (typeof locate !== 'function') throw new TypeError(
      'Load the scanner bundle or provide a locate function.');
    configured.locate = (...args) => {
      const found = locate(...args);
      if (!Array.isArray(found)) throw new TypeError('Locator must return an array of grid candidates.');
      return found;
    };
    configured.locatorKey = locate;
    if (options?.locate === undefined && configured.refine !== false && typeof locate.search === 'function')
      configured.searchGeometry = locate.search;
    const result = withPayload(core.scan(input, configured));
    result.ms = performance.now() - start;
    return result;
  }

  function decodeMatrix(matrix, options) {
    const configured = scanOptions(options);
    if (!Array.isArray(matrix)) throw new TypeError('Matrix must be an array of rows.');
    const n = matrix.length,
      layout = core.layout(n),
      scores = new Float32Array(n * n * 19);
    for (let y = 0; y < n; y++) {
      if (!Array.isArray(matrix[y]) || matrix[y].length !== n) throw new RangeError(
        'Matrix must be square.');
      for (let x = 0; x < n; x++) {
        const cell = y * n + x,
          value = matrix[y][x],
          fixed = layout.fixed[cell];
        if (fixed >= 0) {
          if (value !== (fixed ? -1 : -2) && value !== null) throw new RangeError(
            'Invalid fixed-pattern matrix entry.');
        } else {
          if (value !== null && (!Number.isInteger(value) || value < 0 || value > 18)) throw new RangeError(
            'Data cells must be 0–18 or null for an erasure.');
          if (value !== null)
            for (let s = 0; s < 19; s++) scores[cell * 19 + s] = s === value ? 0 : 24;
        }
      }
    }
    const start = performance.now(),
      header = core.headerFromScores(scores, n, configured.soft !== false);
    if (!header) return {
      kind: 'none',
      mode: 'p19',
      ms: performance.now() - start
    };
    const body = core.bodyFromScores(scores, header, configured);
    return body ? withPayload(core.makeResult(body, header, start)) : {
      kind: 'partial19',
      mode: 'p19',
      grid: n,
      frames: 1,
      ms: performance.now() - start
    };
  }
  return Object.freeze({
    version,
    wireVersion,
    supportedWireVersions,
    capacity,
    payloadTypes: payload.types,
    packPayload,
    unpackPayload,
    encodePayload,
    encodePayloadEncrypted,
    decryptPayload,
    evaluateCalculation: payload.evaluate,
    maxTextBytes,
    maxImagePixels,
    alphabet: core.alphabet.symbols,
    encode,
    encodeEnvelope,
    encodeEncrypted,
    encrypt,
    decrypt,
    toSVG,
    toRGBA,
    toMatrix,
    decodeMatrix,
    scan,
    createSession: core.createSession
  });
});

})();
