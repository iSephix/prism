// SPDX-License-Identifier: Apache-2.0
// Finder grouping and registration of printed glyph grids. No payload knowledge.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    require('../vendor/jsqr-locator.js'), require('./codec.js'), require('./alphabet19.js'));
  else root.Prism19Geometry = factory(root.Prism19Locator, root.Prism19Core, root.Alphabet19);
})(globalThis, function(locator, C, A) {
  'use strict';
  // Keep hot numeric operations local, including in isolated browser workers.
  const Math = globalThis.Math;
  const expired = deadline => performance.now() >= deadline;
  const validSize = n => Number.isInteger(n) && n >= 25 && n <= 145 && (n - 25) % 4 === 0;
  function solve(a, b) {
    const n = b.length, rows = a.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
      let pivot = i;
      for (let j = i + 1; j < n; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
      if (Math.abs(rows[pivot][i]) < 1e-10) return null;
      [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
      const scale = rows[i][i];
      for (let k = i; k <= n; k++) rows[i][k] /= scale;
      for (let j = 0; j < n; j++) if (j !== i) {
        const factor = rows[j][i];
        for (let k = i; k <= n; k++) rows[j][k] -= factor * rows[i][k];
      }
    }
    return rows.map(r => r[n]);
  }
  function inverseMap(location) {
    const n = location.dimension, a = [], b = [];
    for (const [u, v] of [[0, 0], [n, 0], [n, n], [0, n]]) {
      const { x, y } = location.map(u, v);
      a.push([x, y, 1, 0, 0, 0, -x * u, -y * u], [0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(u, v);
    }
    const h = solve(a, b);
    return h && ((x, y) => { const d = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d]; });
  }
  // Separable sliding-window maximum, linear in the number of pixels.
  function maximum(data, width, height, radius) {
    const temp = new Uint8Array(data.length), out = new Uint8Array(data.length);
    const queue = new Int32Array(Math.max(width, height));
    for (let y = 0; y < height; y++) {
      let head = 0, tail = 0, next = 0;
      for (let x = 0; x < width; x++) {
        for (; next <= Math.min(width - 1, x + radius); next++) {
          while (tail > head && data[y * width + queue[tail - 1]] <= data[y * width + next]) tail--;
          queue[tail++] = next;
        }
        while (queue[head] < x - radius) head++;
        temp[y * width + x] = data[y * width + queue[head]];
      }
    }
    for (let x = 0; x < width; x++) {
      let head = 0, tail = 0, next = 0;
      for (let y = 0; y < height; y++) {
        for (; next <= Math.min(height - 1, y + radius); next++) {
          while (tail > head && temp[queue[tail - 1] * width + x] <= temp[next * width + x]) tail--;
          queue[tail++] = next;
        }
        while (queue[head] < y - radius) head++;
        out[y * width + x] = temp[queue[head] * width + x];
      }
    }
    return out;
  }
  const basis = (u, v) => [1, u, v, u * v, u * u, v * v, u ** 3, v ** 3, u * u * v, u * v * v];
  const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
  function fitComponents(image, location, deadline) {
    const originalN = location.dimension, inv = inverseMap(location);
    if (!inv || expired(deadline)) return null;
    const corners = [[0, 0], [originalN, 0], [originalN, originalN], [0, originalN]].map(([x, y]) => location.map(x, y));
    const pitch = (Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y) +
      Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)) / (originalN * 2);
    if (!Number.isFinite(pitch) || pitch < 4 || pitch > 80) return null;
    const left = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x)) - pitch));
    const top = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y)) - pitch));
    const width = Math.min(image.width, Math.ceil(Math.max(...corners.map(p => p.x)) + pitch)) - left;
    const height = Math.min(image.height, Math.ceil(Math.max(...corners.map(p => p.y)) + pitch)) - top;
    if (width < 20 || height < 20 || width * height > 4194304) return null;
    const gray = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = ((y + top) * image.width + x + left) * 4;
      gray[y * width + x] = Math.min(image.data[i], image.data[i + 1], image.data[i + 2]);
    }
    const localWhite = maximum(gray, width, height, Math.max(2, Math.round(pitch)));
    for (let i = 0; i < gray.length; i++) gray[i] = localWhite[i] - gray[i];
    const localInk = maximum(gray, width, height, Math.max(1, Math.round(pitch / 3)));
    for (let i = 0; i < gray.length; i++) gray[i] = gray[i] > Math.max(48, localInk[i] * .6) ? 1 : 0;
    if (expired(deadline)) return null;
    const queue = new Int32Array(gray.length), points = [], scale = (pitch / 12) ** 2;
    const maxSide = Math.ceil(pitch * 2.2);
    for (let start = 0; start < gray.length; start++) {
      if ((start & 16383) === 0 && expired(deadline)) return null;
      if (!gray[start]) continue;
      let head = 0, tail = 1, sx = 0, sy = 0, minX = width, minY = height, maxX = 0, maxY = 0;
      queue[0] = start; gray[start] = 0;
      while (head < tail) {
        const i = queue[head++], y = Math.floor(i / width), x = i - y * width;
        sx += x; sy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        if (x && gray[i - 1]) { gray[i - 1] = 0; queue[tail++] = i - 1; }
        if (x + 1 < width && gray[i + 1]) { gray[i + 1] = 0; queue[tail++] = i + 1; }
        if (y && gray[i - width]) { gray[i - width] = 0; queue[tail++] = i - width; }
        if (y + 1 < height && gray[i + width]) { gray[i + width] = 0; queue[tail++] = i + width; }
      }
      if (tail <= Math.max(4, 10 * scale) || tail >= 200 * scale || maxX - minX + 1 > maxSide || maxY - minY + 1 > maxSide) continue;
      const x = left + sx / tail + .5, y = top + sy / tail + .5, [u, v] = inv(x, y);
      if (!Number.isFinite(u + v) || Math.min(u, v) < 0 || Math.max(u, v) > originalN) continue;
      points.push({ u, v, x, y });
      if (points.length > Math.min(40000, originalN * originalN * 2)) return null;
    }
    if (points.length < 100 || expired(deadline)) return null;
    // Close neighbors determine relative integer cells. Sort by confidence before
    // joining components, so a single poor edge cannot offset an entire row.
    const bins = new Map(), edges = [];
    points.forEach((p, i) => { const key = `${Math.floor(p.u / 2)},${Math.floor(p.v / 2)}`;
      if (!bins.has(key)) bins.set(key, []); bins.get(key).push(i); });
    for (let i = 0; i < points.length; i++) {
      if ((i & 255) === 0 && expired(deadline)) return null;
      const p = points[i], bx = Math.floor(p.u / 2), by = Math.floor(p.v / 2);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of bins.get(`${bx + dx},${by + dy}`) || []) {
        if (j <= i) continue;
        const u = points[j].u - p.u, v = points[j].v - p.v, a = Math.round(u), b = Math.round(v);
        const error = (u - a) ** 2 + (v - b) ** 2;
        if (u * u + v * v <= 2.56 && error < .26 ** 2 && Math.max(Math.abs(a), Math.abs(b)) === 1) edges.push([error, i, j, a, b]);
      }
    }
    edges.sort((a, b) => a[0] - b[0]);
    const parent = Int32Array.from(points, (_, i) => i), sizes = new Int32Array(points.length).fill(1);
    const ox = new Int32Array(points.length), oy = new Int32Array(points.length);
    function find(i) { if (parent[i] !== i) { const old = parent[i]; parent[i] = find(old); ox[i] += ox[old]; oy[i] += oy[old]; } return parent[i]; }
    for (const [, i, j, u, v] of edges) {
      const a = find(i), b = find(j); if (a === b) continue;
      const x = ox[i] + u - ox[j], y = oy[i] + v - oy[j];
      if (sizes[a] < sizes[b]) { parent[a] = b; ox[a] = -x; oy[a] = -y; sizes[b] += sizes[a]; }
      else { parent[b] = a; ox[b] = x; oy[b] = y; sizes[a] += sizes[b]; }
    }
    let seed = -1, nearest = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (sizes[find(i)] < Math.max(100, points.length * .3)) continue;
      const d = (points[i].u - 8.5) ** 2 + (points[i].v - .5) ** 2;
      if (d < nearest) { seed = i; nearest = d; }
    }
    if (seed < 0 || nearest > 36 || expired(deadline)) return null;
    const root = find(seed), originX = Math.round(points[seed].u - .5) - ox[seed], originY = Math.round(points[seed].v - .5) - oy[seed];
    const cells = [], xs = [], ys = [];
    for (let i = 0; i < points.length; i++) if (find(i) === root) {
      const x = ox[i] + originX, y = oy[i] + originY;
      cells.push({ ...points[i], cx: x + .5, cy: y + .5 }); xs.push(x); ys.push(y);
    }
    const xMax = Math.max(...xs), yMax = Math.max(...ys);
    const n = Math.round((Math.max(xMax, yMax) + 1 - 25) / 4) * 4 + 25;
    if (!validSize(n) || Math.abs(n - originalN) > 12 || Math.min(...xs) < -1 || Math.min(...ys) < -1 ||
        xMax < n - 4 || yMax < n - 4 || cells.length < n * n * .3) return null;
    const rows = cells.map(p => basis(p.cx / n, p.cy / n));
    let keep = cells.map(() => true), cx, cy;
    for (let round = 0; round < 6; round++) {
      if (expired(deadline)) return null;
      const a = Array.from({ length: 10 }, () => Array(10).fill(0)), bx = Array(10).fill(0), by = Array(10).fill(0);
      for (let i = 0; i < cells.length; i++) if (keep[i]) {
        const row = rows[i], p = cells[i];
        for (let j = 0; j < 10; j++) { bx[j] += row[j] * p.x; by[j] += row[j] * p.y;
          for (let k = 0; k < 10; k++) a[j][k] += row[j] * row[k]; }
      }
      cx = solve(a, bx); cy = solve(a, by); if (!cx || !cy) return null;
      const residual = rows.map((r, i) => Math.hypot(dot(r, cx) - cells[i].x, dot(r, cy) - cells[i].y));
      const cutoff = Math.max(pitch / 10, residual.slice().sort((a, b) => a - b)[Math.floor(residual.length * .65)] * 2);
      keep = residual.map(r => r < cutoff);
    }
    const photometryMap = locator.mapping({ ...location.raw, dimension: n });
    const map = (x, y) => { const b = basis(x / n, y / n); return { x: dot(b, cx), y: dot(b, cy) }; };
    // The smooth fit can reject real bends as outliers. Retain the independently
    // joined cell centers as a bounded residual field, including those bends.
    // Only geometry is retained: tracked poses must always sample fresh pixels.
    const dx = new Float32Array(n * n), dy = new Float32Array(n * n), counts = new Uint16Array(n * n);
    for (const p of cells) {
      const x = p.cx - .5, y = p.cy - .5;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const base = map(p.cx, p.cy), a = p.x - base.x, b = p.y - base.y;
      if (Math.hypot(a, b) > pitch * 1.5) continue;
      const cell = y * n + x; dx[cell] += a; dy[cell] += b; counts[cell]++;
    }
    for (let i = 0; i < counts.length; i++) if (counts[i]) { dx[i] /= counts[i]; dy[i] /= counts[i]; }
    const localMap = (x, y) => {
      const base = map(x, y), u = Math.max(0, Math.min(n - 1, x - .5)), v = Math.max(0, Math.min(n - 1, y - .5));
      const ix = Math.min(n - 2, Math.floor(u)), iy = Math.min(n - 2, Math.floor(v)), fx = u - ix, fy = v - iy;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const cell = (iy + j) * n + ix + i, w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
        base.x += dx[cell] * w; base.y += dy[cell] * w;
      }
      return base;
    };
    return { dimension: n, photometryMap, map, localMap, raw: { ...location.raw, dimension: n } };
  }
  const templates = A.symbols.map(s => {
    const a = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      const u = (x + .5) / 7, v = (y + .5) / 7; let m = 0;
      for (const dx of [-.035, 0, .035]) for (const dy of [-.035, 0, .035]) m += A.mask(s.shape, u + dx, v + dy) / 9;
      a.push({ u, v, m });
    }
    return a;
  });
  function darkness(image, p) {
    const x = p.x - .5, y = p.y - .5, ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
    if (ix < 0 || iy < 0 || ix + 1 >= image.width || iy + 1 >= image.height) return 0;
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const w = (dx ? u : 1 - u) * (dy ? v : 1 - v), i = ((iy + dy) * image.width + ix + dx) * 4;
      r += w * image.data[i]; g += w * image.data[i + 1]; b += w * image.data[i + 2];
    }
    return 255 - Math.min(r, g, b);
  }
  function pilotCost(image, location, cell, symbol, dx = 0, dy = 0) {
    let sm = 0, sv = 0, smm = 0, svv = 0, smv = 0;
    for (const f of templates[symbol]) {
      const v = darkness(image, location.map(cell % location.dimension + f.u + dx,
        Math.floor(cell / location.dimension) + f.v + dy));
      sm += f.m; sv += v; smm += f.m * f.m; svv += v * v; smv += f.m * v;
    }
    const variance = smm - sm * sm / 49, cov = smv - sm * sv / 49;
    return 1 - Math.max(0, cov) ** 2 / Math.max(1, variance * (svv - sv * sv / 49));
  }
  function quality(image, location) {
    return C.layout(location.dimension).pilots.reduce((sum, cell, i) =>
      sum + pilotCost(image, location, cell, i % 19), 0) / 38;
  }
  function alignPilots(image, location, deadline) {
    const n = location.dimension, shifts = new Map();
    const pilots = C.layout(n).pilots;
    for (let i = 0; i < pilots.length; i++) {
      if (expired(deadline)) return null;
      const cell = pilots[i]; let best = pilotCost(image, location, cell, i % 19), shift = [0, 0];
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        const cost = pilotCost(image, location, cell, i % 19, x / 10, y / 10);
        if (cost < best) { best = cost; shift = [x / 10, y / 10]; }
      }
      shifts.set(cell, shift);
    }
    const map = location.map;
    return { ...location, map: (x, y) => {
      const shift = shifts.get(Math.floor(y) * n + Math.floor(x));
      return map(x + (shift?.[0] || 0), y + (shift?.[1] || 0));
    } };
  }
  function* fittedPoses(image, fitted, deadline) {
    const { localMap, ...base } = fitted;
    const local = alignPilots(image, { ...base, map: localMap, cellRefined: true, photometryMap: undefined }, deadline);
    if (local && quality(image, local) < quality(image, base) * .85) yield local;
    yield { ...base, photometryMap: undefined };
    yield base;
  }
  function* searchOne(image, deadline, found = locator.patterns(image.data, image.width, image.height)) {
    if (!found || expired(deadline)) return;
    const points = found.finderPatterns.filter(p => p.size >= 6 && p.score / p.size ** 2 < .2).slice(0, 40);
    const groups = [], seen = new Set();
    for (let i = 0; i < points.length; i++) for (let j = 0; j < points.length; j++) for (let k = j + 1; k < points.length; k++) {
      if (i === j || i === k) continue;
      const p = points[i], q = points[j], r = points[k], dx = q.x - p.x, dy = q.y - p.y, ex = r.x - p.x, ey = r.y - p.y;
      const x = Math.hypot(dx, dy), y = Math.hypot(ex, ey), cosine = (dx * ex + dy * ey) / x / y, size = Math.min(p.size, q.size, r.size);
      if (Math.max(p.size, q.size, r.size) > size * 2.5 || x < Math.max(p.size, q.size) * 5 || y < Math.max(p.size, r.size) * 5 ||
          x / y < .35 || x / y > 2.8 || Math.abs(cosine) > .65) continue;
      const key = [i, j, k].sort((a, b) => a - b).join('.'); if (seen.has(key)) continue; seen.add(key);
      groups.push({ p, q, r, score: cosine ** 2 + Math.log(x / y) ** 2 * .2 + (p.score + q.score + r.score) / size ** 2 * .25 + Math.max(x, y) / size * .005 });
    }
    groups.sort((a, b) => a.score - b.score);
    const candidates = [], originals = [];
    for (const group of groups.slice(0, 16)) {
      if (expired(deadline)) return;
      const raw = locator.group(found, group.p, group.q, group.r); if (!raw) continue;
      const near = Math.round((raw.dimension - 25) / 4) * 4 + 25;
      for (const n of [near, near - 4, near + 4, near - 8, near + 8]) {
        if (!validSize(n)) continue;
        const pose = { dimension: n, raw: { ...raw, dimension: n } }; pose.map = locator.mapping(pose.raw);
        pose.quality = quality(image, pose); candidates.push(pose);
        if (n === near) originals.push(pose);
      }
    }
    candidates.sort((a, b) => a.quality - b.quality);
    for (const pose of candidates.filter(p => p.quality < .8).slice(0, 4)) {
      if (expired(deadline)) return;
      yield pose;
      const fitted = fitComponents(image, pose, deadline);
      if (fitted && quality(image, fitted) < Math.min(.7, pose.quality)) {
        yield* fittedPoses(image, fitted, deadline);
      }
    }
    // Finder widths can misestimate a dense print's dimension. The connected cell
    // grid determines its integer extent, independently of payload/header bytes.
    for (const pose of originals.slice(0, 3)) {
      if (expired(deadline)) return;
      if (candidates.some(p => p.raw.topLeft === pose.raw.topLeft && p.quality < .45)) continue;
      const fitted = fitComponents(image, pose, deadline);
      if (fitted && quality(image, fitted) < .7) {
        yield* fittedPoses(image, fitted, deadline);
      }
    }
  }
  // Large solid finder centers can exceed the thresholding window. Retry at
  // another scale. Store only sampling dimensions and geometry in tracked poses;
  // the core always samples the current frame, never a previous frame's pixels.
  function smaller(image, side) {
    const scale = Math.min(1, side / Math.max(image.width, image.height));
    return C.resize(image, Math.round(image.width * scale), Math.round(image.height * scale));
  }
  function* search(image, deadline, preferSmall = false) {
    // If the ordinary finder geometry cannot sample even one complete grid,
    // try the alternate threshold scale before an expensive full-image search.
    const found = locator.patterns(image.data, image.width, image.height);
    preferSmall = preferSmall && found?.finderPatterns.some(p => p.size >= 40 && p.score / p.size ** 2 < .2);
    for (const side of preferSmall ? [960, 0, 640] : [0, 960, 640]) {
      if (!side) { yield* searchOne(image, deadline, found); continue; }
      if (expired(deadline) || Math.max(image.width, image.height) <= side * 1.15) continue;
      const reduced = smaller(image, side), sx = image.width / reduced.width, sy = image.height / reduced.height;
      const lift = map => (x, y) => { const p = map(x, y); return { x: p.x * sx, y: p.y * sy }; };
      function translated(pose) { return { ...pose, map: lift(pose.map),
        photometryMap: pose.photometryMap && lift(pose.photometryMap),
        sampleWidth: reduced.width, sampleHeight: reduced.height }; }
      for (const pose of locator(reduced.data, reduced.width, reduced.height)) {
        if (expired(deadline)) return;
        yield translated(pose);
      }
      for (const pose of searchOne(reduced, deadline)) yield translated(pose);
    }
  }
  function locate(...args) { return locator(...args); }
  locate.search = search;
  return locate;
});
