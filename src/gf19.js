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
