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
  const profiles = [
    [0, 0, 0],
    [.075, .2, .1],
    [.12, .45, .15],
    [.08, .65, .25]
  ];
  const features = candidates.map(g => profiles.map(p => feature(g, ...p)));
  const dist = candidates.map((_, i) => candidates.map((_, j) => Math.min(...profiles.map((_, p) =>
    features[i][p].reduce((s, v, k) => s + (v - features[j][p][k]) ** 2, 0) / 48))));

  function objective(ids) {
    const near = ids.map(i => Math.min(...ids.filter(j => j !== i).map(j => dist[i][j])));
    return [Math.min(...near), near.reduce((a, b) => a + b, 0) / near.length];
  }
  // Multi-start farthest-point packing in the simulated observation space.
  let best = null,
    bestScore = [-1, -1];
  for (let start = 0; start < candidates.length; start++) {
    const ids = [start];
    while (ids.length < 19) {
      let choice = -1,
        d = -1;
      for (let i = 0; i < candidates.length; i++)
        if (!ids.includes(i)) {
          const m = Math.min(...ids.map(j => dist[i][j]));
          if (m > d) {
            d = m;
            choice = i;
          }
        } ids.push(choice);
    }
    const score = objective(ids);
    if (score[0] > bestScore[0] + 1e-6 || Math.abs(score[0] - bestScore[0]) < 1e-6 && score[1] > bestScore[
        1]) {
      best = ids;
      bestScore = score;
    }
  }
  // Freeze the protocol alphabet so different JS engines cannot reorder a near tie.
  const optimized = best.slice().sort((a, b) => a - b);
  best = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 20, 21, 23, 24, 27, 30, 32, 33, 34];
  bestScore = objective(best);
  const symbols = best.map((i, id) => ({
    ...candidates[i],
    id,
    candidate: i
  }));
  const report = {
    version: 1,
    method: 'Multi-start max-min packing; 35 color/pattern candidates, 4 synthetic channel profiles; frozen symbol IDs',
    minMeanSquaredDistance: bestScore[0],
    meanNearestDistance: bestScore[1],
    selected: best,
    optimizerSelection: optimized,
    profiles,
    limitations: 'Synthetic heuristic. No proof of optimality or print-camera advantage; body cells need enough pixels to resolve the pattern.'
  };

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
