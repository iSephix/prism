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

  function makeHeader(payload, k, flags) {
    const h = new Uint8Array(16),
      d = new DataView(h.buffer);
    h.set([80, 78, 2, k, flags, 1]);
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
    if (h[0] !== 80 || h[1] !== 78 || h[2] !== 2 || ![9, 11, 13, 15].includes(h[3]) || h[4] > 1 || h[5] !==
      1 || P.crc32(h.slice(0, 12)) !== d.getUint32(12)) return null;
    const length = d.getUint16(6);
    if (!length || length > (h[4] ? 1244 : 1200) || (h[4] && length < 45)) return null;
    const count = Math.ceil(length * 8 / LOG),
      blocks = Math.ceil(count / h[3]);
    if (HEADER_SYMBOLS + blocks * 19 > layout(n).slots.length) return null;
    return {
      n,
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
    if (!k || !payload.length || payload.length > (options.encrypted ? 1244 : 1200)) throw Error(
      'Prism 19 supports up to 1200 text bytes plus encryption overhead.');
    const ds = digits(payload),
      blocks = Math.ceil(ds.length / k),
      padded = new Uint8Array(blocks * k);
    padded.set(ds);
    let n = 25;
    while (layout(n).slots.length < HEADER_SYMBOLS + blocks * 19) n += 4;
    if (n > 145) throw Error('Code is too large.');
    const l = layout(n),
      cells = new Int16Array(n * n).fill(-1),
      h = makeHeader(payload, k, options.encrypted ? 1 : 0);
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
      version: 2,
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

  function raster(code, size = 12) {
    const width = Math.round(code.width * size),
      height = Math.round(code.height * size),
      data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0, p = 0; y < height; y++)
      for (let x = 0; x < width; x++, p += 4) {
        const c = colorAt(code, (x + .5) / size, (y + .5) / size);
        data[p] = c[0];
        data[p + 1] = c[1];
        data[p + 2] = c[2];
        data[p + 3] = 255;
      }
    return {
      data,
      width,
      height
    };
  }

  function sample(image, p) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    const x = p.x - .5,
      y = p.y - .5,
      ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    if (ix < 0 || iy < 0 || ix + 1 >= image.width || iy + 1 >= image.height) return null;
    const out = [0, 0, 0];
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
    return (rgb, x, y) => rgb.map((v, c) => {
      const u = (x - 3.5) / (n - 7),
        w = (y - 3.5) / (n - 7),
        d = dark[0][c] + u * (dark[1][c] - dark[0][c]) + w * (dark[2][c] - dark[0][c]),
        b = white[0][c] + u * (white[1][c] - white[0][c]) + w * (white[2][c] - white[0][c]);
      return Math.max(-40, Math.min(295, 255 * (v - d) / Math.max(55, b - d)));
    });
  }

  function observations(image, location, shift = [0, 0]) {
    const n = location.dimension,
      l = layout(n),
      norm = photometry(image, location.map, n);
    if (!norm) return null;
    const data = new Float32Array(n * n * FEATURES);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        for (let dy = 0; dy < SAMPLES; dy++)
          for (let dx = 0; dx < SAMPLES; dx++) {
            const u = x + (dx + .5) / SAMPLES + shift[0],
              v = y + (dy + .5) / SAMPLES + shift[1],
              rgb = sample(image, location.map(u, v));
            if (!rgb) return null;
            const p = (y * n + x) * FEATURES + (dy * SAMPLES + dx) * 3;
            data.set(norm(rgb, u, v), p);
          }
    const refs = Array.from({
      length: 19
    }, () => new Float32Array(FEATURES));
    let residual = 0;
    l.pilots.forEach((cell, i) => {
      for (let f = 0; f < FEATURES; f++) refs[i % 19][f] += data[cell * FEATURES + f] / 2;
    });
    l.pilots.forEach((cell, i) => {
      for (let f = 0; f < FEATURES; f++) residual += (data[cell * FEATURES + f] - refs[i % 19][f]) ** 2;
    });
    residual /= PILOTS * FEATURES;
    // The calibrated glyphs must retain both dark strokes and separable structure.
    let separation = Infinity;
    for (let i = 0; i < 19; i++)
      for (let j = 0; j < i; j++) {
        let d = 0;
        for (let f = 0; f < FEATURES; f++) d += (refs[i][f] - refs[j][f]) ** 2;
        separation = Math.min(separation, d / FEATURES);
      }
    if (separation < 70) return null;
    return {
      n,
      layout: l,
      data,
      refs,
      noise: Math.max(100, residual * 1.2),
      separation,
      shift
    };
  }
  const cellBest = (costs, cell) => {
    let best = 0;
    for (let s = 1; s < 19; s++)
      if (costs[cell * 19 + s] < costs[cell * 19 + best]) best = s;
    return best;
  };

  function classify(obs, mixing = 0, prior = null) {
    const {
      n,
      layout: l,
      data,
      noise
    } = obs;
    let refs = obs.refs;
    // Approximate joint spatial model: edge observations contain neighboring-cell ink.
    function neighbors(cell, f) {
      const x = cell % n,
        y = Math.floor(cell / n),
        pixel = Math.floor(f / 3),
        sx = pixel % 4,
        sy = Math.floor(pixel / 4),
        c = f % 3,
        out = [];
      if (sx === 0 && x > 0) out.push([cell - 1, (sy * 4 + 3) * 3 + c]);
      if (sx === 3 && x < n - 1) out.push([cell + 1, sy * 12 + c]);
      if (sy === 0 && y > 0) out.push([cell - n, (12 + sx) * 3 + c]);
      if (sy === 3 && y < n - 1) out.push([cell + n, sx * 3 + c]);
      return out;
    }

    function predicted(cell, f, source) {
      if (l.fixed[cell] >= 0) return l.fixed[cell] ? 0 : 255;
      const pilot = l.pilots.indexOf(cell);
      const s = pilot >= 0 ? pilot % 19 : cellBest(prior, cell);
      return source[s][f];
    }
    if (mixing && prior) {
      const intrinsic = refs.map(() => new Float32Array(FEATURES));
      l.pilots.forEach((cell, i) => {
        for (let f = 0; f < FEATURES; f++) {
          const near = neighbors(cell, f);
          let sum = 0;
          for (const [c, j] of near) sum += predicted(c, j, refs);
          intrinsic[i % 19][f] += (data[cell * FEATURES + f] - mixing * sum) / (1 - mixing * near
            .length) / 2;
        }
      });
      refs = intrinsic;
    }
    const out = new Float32Array(n * n * 19);
    for (const cell of [...l.pilots, ...l.slots]) {
      let min = Infinity;
      for (let s = 0; s < 19; s++) {
        let d = 0;
        for (let f = 0; f < FEATURES; f++) {
          let expected = refs[s][f];
          if (mixing && prior) {
            const near = neighbors(cell, f);
            let sum = 0;
            for (const [c, j] of near) sum += predicted(c, j, refs);
            expected = expected * (1 - mixing * near.length) + mixing * sum;
          }
          d += (data[cell * FEATURES + f] - expected) ** 2;
        }
        d /= FEATURES;
        out[cell * 19 + s] = d;
        min = Math.min(min, d);
      }
      const reliability = 1 / (1 + min / (noise * 3));
      for (let s = 0; s < 19; s++) out[cell * 19 + s] = Math.min(24, (out[cell * 19 + s] - min) / (noise *
        2)) * reliability;
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

  function headerFromScores(scores, n, soft = true) {
    const l = layout(n),
      lists = [];
    for (let b = 0; b < 4; b++) {
      const costs = Array.from({
        length: 19
      }, (_, j) => costsAt(scores, l.slots[j * 4 + b]));
      const c = F.candidates(costs, 9, soft, 3);
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

  function repairEquations(scores, h, known) {
    const unknown = [];
    for (let i = 0; i < known.length; i++)
      if (known[i] < 0) unknown.push(i);
    if (!unknown.length || unknown.length > 96) return null;
    const columns = new Map(unknown.map((v, i) => [v, i])),
      l = layout(h.n),
      start = HEADER_SYMBOLS + h.blocks * 19,
      rows = [];
    for (let e = 0; e < l.slots.length - start; e++) {
      const cell = l.slots[start + e],
        c = costsAt(scores, cell),
        s = cellBest(scores, cell),
        sorted = c.slice().sort((a, b) => a - b),
        margin = sorted[1] - sorted[0];
      if (margin < .8) continue;
      const row = new Uint8Array(unknown.length);
      let rhs = s;
      for (const t of equation(e, h.blocks, h.k)) {
        if (columns.has(t.index)) row[columns.get(t.index)] = F.mod(row[columns.get(t.index)] + t
          .coefficient);
        else rhs = F.mod(rhs - t.coefficient * known[t.index]);
      }
      if (row.some(v => v)) rows.push({
        row,
        rhs,
        margin
      });
    }
    rows.sort((a, b) => b.margin - a.margin);
    // Prefer reliable equations; bounded alternatives exclude a few suspect rows.
    for (let skip = 0; skip < Math.min(8, Math.max(1, rows.length - unknown.length + 1)); skip++) {
      const used = rows.filter((_, i) => skip === 0 || i !== rows.length - skip),
        answer = F.solve(used.map(r => r.row), used.map(r => r.rhs), unknown.length);
      if (!answer) continue;
      const ds = known.slice();
      unknown.forEach((pos, i) => ds[pos] = answer[i]);
      const bytes = checkPacket(ds, h);
      if (bytes) return {
        bytes,
        repaired: unknown.length,
        equations: used.length
      };
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
      trust.push({
        block: b,
        margin: costs.reduce((sum, c) => {
          const s = c.slice().sort((a, b) => a - b);
          return sum + s[1] - s[0];
        }, 0) / 19
      });
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
    for (let b = 0; b < h.blocks; b++) {
      const c = options.soft === false ? hardLists[b] : F.candidates(allCosts[b], h.k, true, 4);
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
        r = repairEquations(scores, h, known);
      if (r) return {
        ...r,
        corrected,
        path: 'repair equations'
      };
      // A blank block can masquerade as a valid constant RS codeword. Use optical
      // confidence to erase suspect blocks, then let independent equations resolve them.
      trust.sort((a, b) => a.margin - b.margin);
      const worst = trust.slice(0, 3).map(t => t.block);
      const hypotheses = worst.map(b => [b]);
      if (worst.length > 1) hypotheses.push(worst.slice(0, 2));
      if (worst.length > 2) hypotheses.push(worst);
      for (const erased of hypotheses) {
        const tentative = known.slice();
        for (const b of erased)
          for (let i = 0; i < h.k; i++) tentative[b * h.k + i] = -1;
        const result = repairEquations(scores, h, tentative);
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
      kind: h.flags ? 'encrypted' : 'prism19',
      mode: 'p19',
      bytes: body.bytes.length,
      envelope: Array.from(body.bytes),
      encrypted: !!h.flags,
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

  function createSession() {
    let entry = null;
    return {
      clear() {
        entry = null;
      },
      add(scores, header) {
        const now = Date.now();
        if (!entry || entry.key !== header.key || now - entry.time > 6000) entry = {
          key: header.key,
          time: now,
          items: []
        };
        entry.time = now;
        entry.items.push(Float32Array.from(scores));
        if (entry.items.length > 8) entry.items.shift();
        const combined = new Float32Array(scores.length);
        for (const a of entry.items)
          for (let i = 0; i < a.length; i++) combined[i] += a[i];
        return {
          scores: combined,
          count: entry.items.length
        };
      }
    };
  }

  function scan(image, options = {}) {
    if (typeof options.locate !== "function") throw new TypeError(
      "An image locator is required; use the public scan() API or supply options.locate.");
    const start = performance.now();
    let partial = null,
      fusedThisFrame = false;
    // Preserve the complete fast decoder across ALL detected poses before allowing
    // costly soft hypotheses to consume the enhanced-search budget.
    if (options.soft !== false || options.equations !== false || options.spatial !== false || options
      .refine !== false) {
      const fast = scan(image, {
        ...options,
        soft: false,
        equations: false,
        spatial: false,
        refine: false,
        session: null
      });
      if (fast.kind === 'prism19' || fast.kind === 'encrypted') {
        fast.ms = performance.now() - start;
        return fast;
      }
    }
    const searchStart = performance.now();
    for (const channel of ['gray', 0, 2]) {
      const pixels = new Uint8ClampedArray(image.data.length);
      for (let i = 0; i < pixels.length; i += 4) {
        const v = channel === 'gray' ? .299 * image.data[i] + .587 * image.data[i + 1] + .114 * image.data[
          i + 2] : image.data[i + channel];
        pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
        pixels[i + 3] = 255;
      }
      const locations = options.locate(pixels, image.width, image.height);
      for (const location of locations.slice(0, 2)) {
        const n = location.dimension;
        if (!Number.isInteger(n) || n < 25 || n > 145 || (n - 17) % 4 || typeof location.map !== "function")
          continue;
        const shifts = options.refine === false ? [
          [0, 0]
        ] : [
          [0, 0],
          [.1, 0],
          [-.1, 0],
          [0, .1],
          [0, -.1]
        ];
        for (const shift of shifts) {
          if (performance.now() - searchStart > 2200) return partial || {
            kind: 'none',
            mode: 'p19',
            ms: performance.now() - start
          };
          const obs = observations(image, location, shift);
          if (!obs) continue;
          const base = classify(obs),
            h = headerFromScores(base, n, options.soft !== false);
          if (!h) continue;
          let body = bodyFromScores(base, h, options);
          if (body) return makeResult(body, h, start);
          partial = {
            kind: 'partial19',
            mode: 'p19',
            frames: partial?.frames || 1,
            grid: n,
            ms: performance.now() - start,
            needed: 'more camera evidence'
          };
          if (options.session && !fusedThisFrame && shift[0] === 0 && shift[1] === 0) {
            fusedThisFrame = true;
            const fused = options.session.add(base, h);
            partial.frames = fused.count;
            if (fused.count > 1) {
              body = bodyFromScores(fused.scores, h, options);
              if (body) return makeResult(body, h, start, 'burst likelihood fusion', fused.count);
            }
          }
          if (options.spatial !== false)
            for (const mixing of [.12, .23]) {
              let scores = classify(obs, mixing, base);
              scores = classify(obs, mixing, scores);
              body = bodyFromScores(scores, h, options);
              if (body) return makeResult(body, h, start, 'joint neighboring-cell model');
            }
          // A recognized code need not be detected again in the other RGB planes.
          if (performance.now() - searchStart > 1800) return partial;
        }
      }
      if (partial) return partial;
    }
    return {
      kind: 'none',
      mode: 'p19',
      ms: performance.now() - start
    };
  }
  return {
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
