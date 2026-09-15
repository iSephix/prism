// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
/* Deterministic, deliberately simplified optical-channel simulation. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./codec.js'));
  else root.Optics = factory(root.Prism19Core);
})(globalThis, function(Prism) {
  'use strict';

  function random(seed) {
    return () => {
      seed |= 0;
      seed = seed + 0x6d2b79f5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function solve(a, b) {
    const n = b.length,
      m = a.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let k = c;
      for (let i = c + 1; i < n; i++)
        if (Math.abs(m[i][c]) > Math.abs(m[k][c])) k = i;
      if (Math.abs(m[k][c]) < 1e-12) throw new Error('Degenerate perspective.');
      [m[k], m[c]] = [m[c], m[k]];
      const pivot = m[c][c];
      for (let j = c; j <= n; j++) m[c][j] /= pivot;
      for (let i = 0; i < n; i++)
        if (i !== c) {
          const f = m[i][c];
          for (let j = c; j <= n; j++) m[i][j] -= f * m[c][j];
        }
    }
    return m.map(row => row[n]);
  }

  function homography(from, to) {
    const a = [],
      b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = from[i], [u, v] = to[i];
      a.push([x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(u, v);
    }
    const h = solve(a, b);
    return (x, y) => {
      const d = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
    };
  }

  function gaussian(data, width, height, sigma) {
    if (sigma < 0.1) return data;
    const r = Math.ceil(sigma * 2.5),
      k = Array.from({
        length: 2 * r + 1
      }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma ** 2))),
      sum = k.reduce((a, b) => a + b, 0);
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const temp = new Float32Array(data.length),
      out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let d = -r; d <= r; d++) v += data[4 * (y * width + Math.max(0, Math.min(width - 1, x +
            d))) + c] * k[d + r];
          temp[4 * (y * width + x) + c] = v;
        }
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let d = -r; d <= r; d++) v += temp[4 * (Math.max(0, Math.min(height - 1, y + d)) * width +
            x) + c] * k[d + r];
          out[4 * (y * width + x) + c] = v;
        }
        out[4 * (y * width + x) + 3] = 255;
      }
    return out;
  }

  function simulate(code, settings = {}) {
    const cfg = {
      pixels: 280,
      blur: 0.5,
      noise: 5,
      perspective: 0.1,
      colorLoss: 0.1,
      cover: 0,
      seed: 701,
      ...settings
    };
    const rng = random(cfg.seed),
      side = Math.round(cfg.pixels),
      width = side + 80,
      height = width;
    const scale = side / Math.max(code.width, code.height),
      w = code.width * scale,
      h = code.height * scale,
      cx = width / 2,
      cy = height / 2;
    const angle = (rng() - 0.5) * cfg.perspective * 1.5,
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    const corners = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2]
    ].map(([x, y]) => {
      const jx = (rng() - 0.5) * cfg.perspective * side * 0.45,
        jy = (rng() - 0.5) * cfg.perspective * side * 0.45;
      return [cx + x * cs - y * sn + jx, cy + x * sn + y * cs + jy];
    });
    const map = homography(corners, [
      [0, 0],
      [code.width, 0],
      [code.width, code.height],
      [0, code.height]
    ]);
    let data = new Uint8ClampedArray(width * height * 4);
    const patch = Math.sqrt(cfg.cover / 100),
      px = 0.56 + (rng() - 0.5) * 0.14,
      py = 0.51 + (rng() - 0.5) * 0.14;
    for (let y = 0, p = 0; y < height; y++)
      for (let x = 0; x < width; x++, p += 4) {
        const rgb = [0, 0, 0];
        for (const dy of [0.25, 0.75])
          for (const dx of [0.25, 0.75]) {
            const [u, v] = map(x + dx, y + dy);
            let c = Prism.colorAt(code, u, v);
            if (Math.abs(u / code.width - px) < patch / 2 && Math.abs(v / code.height - py) < patch / 2)
              c = [255, 255, 255];
            for (let j = 0; j < 3; j++) rgb[j] += c[j] / 4;
          }
        const gray = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2],
          light = 1 - cfg.perspective * 0.23 * y / height;
        for (let j = 0; j < 3; j++) data[p + j] = (rgb[j] * (1 - cfg.colorLoss) + gray * cfg.colorLoss) *
          light;
        data[p + 3] = 255;
      }
    data = gaussian(data, width, height, cfg.blur);
    for (let p = 0; p < data.length; p += 4)
      for (let j = 0; j < 3; j++) {
        // Sum of uniforms: reproducible, approximately normal noise with specified SD.
        let z = -3;
        for (let i = 0; i < 6; i++) z += rng();
        data[p + j] += z * Math.SQRT2 * cfg.noise;
      }
    return {
      width,
      height,
      data
    };
  }
  return {
    simulate,
    homography,
    gaussian,
    random
  };
});
