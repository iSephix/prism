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
      norm = photometry(image, location.map, n);
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
      locateMs: 0, observeMs: 0, classifyMs: 0, decodeMs: 0 };
    const hard = { soft: false, equations: false }, advanced = options.soft !== false ||
      options.equations !== false || options.spatial !== false || options.refine !== false;
    const state = sessions.get(options.session), poses = [];
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
      const obs = observe(location);
      if (!obs) return null;
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
    }
    // Keep the complete ordinary hard path before advanced hypotheses. Retain the
    // observations instead of recursively detecting and sampling every pose twice.
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
      for (const location of locations.slice(0, 2)) {
        if (expired()) return finish();
        const result = fast(location);
        if (result) return finish(result);
      }
    }
    if (!advanced && !options.session) return finish();
    const config = { ...options, deadline };
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
    for (const pose of poses) {
      if (expired()) return finish();
      let result = recover(pose.obs, pose.location, pose.scores, pose.h, true);
      if (result) { stats.tracked = pose.tracked; return finish(result); }
      if (advanced) {
        const robust = calibrate(pose.obs, true);
        result = recover(robust, pose.location, null, null, false, 'robust pilot calibration');
        if (result) { stats.tracked = pose.tracked; return finish(result); }
      }
      if (options.refine !== false) for (const shift of [[.1, 0], [-.1, 0], [0, .1], [0, -.1]]) {
        if (expired()) return finish();
        const obs = observe(pose.location, shift);
        if (!obs) continue;
        result = recover(obs, pose.location, null, null, false);
        if (result) { stats.tracked = pose.tracked; return finish(result); }
      }
    }
    return finish();
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
