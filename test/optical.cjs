// SPDX-License-Identifier: Apache-2.0
// End-to-end optical tests. Only camera pixels and decoder options reach scan().
'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  P = require('..'),
  O = require('../src/simulation.js');
const report = {
  packageVersion: P.version,
  wireVersion: 2,
  measuredAt: new Date().toISOString(),
  runtime: process.version,
  platform: process.platform,
  physicalTrial: false,
  jabComparison: false,
  clean: [],
  mechanisms: [],
  synthetic: []
};
const hard = {
  soft: false,
  equations: false,
  spatial: false,
  refine: false
};

function erase(image, code, cells, scale) {
  for (const cell of cells) {
    const x = cell % code.n,
      y = Math.floor(cell / code.n);
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) {
        const p = 4 * (((y + 4) * scale + dy) * image.width + (x + 4) * scale + dx);
        image.data[p] = image.data[p + 1] = image.data[p + 2] = 255;
      }
  }
  return image;
}
const messages = ['x', 'Hello, independent optical reader.', '\ufeffGrüße 🛰️ 日本語 العربية\n\0end',
  'Optical payload. '.repeat(15), '0123456789'.repeat(120)
];
for (const ecc of ['L', 'M', 'Q', 'H'])
  for (const text of messages) {
    const code = P.encode(text, {
        ecc
      }),
      r = P.scan(P.toRGBA(code, 12));
    assert.equal(r.text, text, `${ecc}/${Buffer.byteLength(text)}`);
    report.clean.push({
      ecc,
      bytes: Buffer.byteLength(text),
      grid: code.n,
      exact: true,
      ms: r.ms
    });
  }
console.log('PASS: 20 clean blind optical round trips across all correction levels.');
const repairText = 'Equation rescue: entire block is gone.',
  repair = P.encode(repairText),
  image = erase(P.toRGBA(repair, 16), repair, Array.from({
    length: 19
  }, (_, j) => repair.layout.slots[76 + j * repair.blocks]), 16);
const without = P.scan(image, hard),
  withRepair = P.scan(image, {
    ...hard,
    equations: true
  });
assert.equal(without.kind, 'partial19');
assert.equal(withRepair.text, repairText);
assert.equal(withRepair.repaired, 11);
report.mechanisms.push({
  name: 'Complete RS body block erased',
  erasedCells: 19,
  withoutEquations: without.kind,
  withEquations: withRepair.kind,
  repairedSymbols: withRepair.repaired,
  equations: withRepair.equations
});
const burstText = 'Burst fusion reconstructs observations that cannot decode individually. '.repeat(2),
  burst = P.encode(burstText),
  session = P.createSession(),
  steps = [];
for (let frame = 0; frame < 2; frame++) {
  const cells = [];
  for (let b = 0; b < burst.blocks; b++)
    for (let j = 0; j < 19; j++)
      if (frame === 0 ? j < 10 : j >= 9) cells.push(burst.layout.slots[76 + j * burst.blocks + b]);
  const input = erase(P.toRGBA(burst, 12), burst, cells, 12),
    options = {
      equations: false,
      spatial: false,
      refine: false
    },
    alone = P.scan(input, options),
    combined = P.scan(input, {
      ...options,
      session
    });
  assert.equal(alone.kind, 'partial19');
  assert.equal(combined.frames, frame + 1);
  if (frame === 1) assert.equal(combined.text, burstText);
  else assert.equal(combined.kind, 'partial19');
  steps.push({
    frame: frame + 1,
    alone: alone.kind,
    combined: combined.kind,
    evidenceFrames: combined.frames
  });
}
report.mechanisms.push({
  name: 'Complementary damaged frames; equations disabled',
  steps
});
console.log('PASS: whole-block equation recovery and two-frame likelihood fusion.');
const text = 'Compare the same payload at the same camera footprint. '.repeat(3),
  code = P.encode(text);
for (const profile of [{
    name: 'Moderate camera',
    pixels: 400,
    blur: .4,
    noise: 5,
    perspective: .15,
    colorLoss: .1,
    cover: 0
  }, {
    name: 'Small blurred camera',
    pixels: 220,
    blur: .8,
    noise: 8,
    perspective: .2,
    colorLoss: .2,
    cover: 0
  }, {
    name: 'Patch damage',
    pixels: 320,
    blur: .3,
    noise: 4,
    perspective: .15,
    colorLoss: .1,
    cover: 3
  }]) {
  const row = {
    profile,
    grid: code.n,
    trials: 4,
    frameBudget: 1,
    hard: [],
    enhanced: []
  };
  for (let i = 0; i < 4; i++) {
    const input = O.simulate(code, {
        ...profile,
        seed: 701 + i
      }),
      a = P.scan(input, hard),
      b = P.scan(input);
    for (const result of [a, b])
      if (result.text !== undefined) assert.equal(result.text, text, 'Wrong payload returned');
    assert.ok(a.text !== text || b.text === text, 'Enhanced decoder lost a hard-path success');
    row.hard.push({
      seed: 701 + i,
      exact: a.text === text,
      ms: a.ms
    });
    row.enhanced.push({
      seed: 701 + i,
      exact: b.text === text,
      ms: b.ms,
      decoder: b.decoder || null
    });
  }
  report.synthetic.push(row);
  console.log(
    `${profile.name}: hard ${row.hard.filter(r=>r.exact).length}/4; enhanced ${row.enhanced.filter(r=>r.exact).length}/4; no wrong output.`
    );
}
const out = path.join(__dirname, '../release');
fs.mkdirSync(out, {
  recursive: true
});
fs.writeFileSync(path.join(out, 'optical-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: 24 seeded comparison attempts; report in release/optical-results.json.');
