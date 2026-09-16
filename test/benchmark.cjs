// SPDX-License-Identifier: Apache-2.0
// Paired, blind image benchmark: both decoders receive identical RGBA pixels.
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), os = require('node:os');
const P = require('..'), O = require('../src/simulation.js');
const arg = process.argv.indexOf('--baseline');
if (arg < 0 || !process.argv[arg + 1]) throw Error('Use --baseline /path/to/0.1.0/source');
const baseline = path.resolve(process.argv[arg + 1]);
const B = require(baseline), cases = [];
const commitArg = process.argv.indexOf('--baseline-commit');
const baselineCommit = commitArg < 0 ? null : process.argv[commitArg + 1];
if (baselineCommit !== null && !/^[0-9a-f]{40}$/.test(baselineCommit || ''))
  throw Error('--baseline-commit requires a full Git commit SHA');
function sourceHashes(directory) {
  return Object.fromEntries(['package.json', 'src/codec.js', 'src/gf19.js', 'src/api.js',
    'src/alphabet19.js', 'src/geometry.js', 'vendor/jsqr-locator.js'].filter(file =>
      fs.existsSync(path.join(directory, file))).map(file => [file,
      crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')]));
}
const text = 'Compare the same payload at the same camera footprint. '.repeat(3);
function erase(image, code, cells, scale) {
  for (const cell of cells) for (let y = 0; y < scale; y++) {
    const start = 4 * (((Math.floor(cell / code.n) + 4) * scale + y) * image.width +
      (cell % code.n + 4) * scale);
    image.data.fill(255, start, start + scale * 4);
  }
  return image;
}
function record(name, group, image, expected, seed) { cases.push({ name, group, image, expected, seed }); }
const messages = ['x', 'Printed Prism 19.', '\ufeffGrüße 🛰️ 日本語\0', text,
  '0123456789'.repeat(120), 'Long H payload. '.repeat(65)];
messages.forEach((message, i) => record(`clean-${i}`, 'clean', B.toRGBA(B.encode(message,
  { ecc: i === 5 ? 'H' : 'Q' }), 12), message));
const profiles = [
  { name: 'moderate', pixels: 400, blur: .4, noise: 5, perspective: .15, colorLoss: .1, cover: 0 },
  { name: 'small-blurred', pixels: 220, blur: .8, noise: 8, perspective: .2, colorLoss: .2, cover: 0 },
  { name: 'patch-damage', pixels: 320, blur: .3, noise: 4, perspective: .15, colorLoss: .1, cover: 3 },
  { name: 'uneven-light', pixels: 340, blur: .5, noise: 7, perspective: .25, colorLoss: .3, cover: 0 }
];
for (const profile of profiles) for (const seed of [911, 912, 913, 914, 915, 916]) {
  const image = O.simulate(B.encode(text), { ...profile, seed });
  if (profile.name === 'uneven-light') for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) for (let c = 0; c < 3; c++) {
      const i = 4 * (y * image.width + x) + c;
      const light = .55 + .4 * x / image.width;
      image.data[i] = image.data[i] * light + 12;
    }
  record(`${profile.name}-${seed}`, profile.name, image, text, seed);
}
const pilotCode = B.encode(text);
for (const count of [1, 3, 5, 8, 12, 19]) record(`pilots-${count}`, 'pilot-damage',
  erase(B.toRGBA(pilotCode, 12), pilotCode, pilotCode.layout.pilots.slice(0, count), 12), text);
const equationText = 'Equation rescue: entire block is gone.';
for (const count of [1, 2, 3, 4, 5, 6]) {
  const code = B.encode(equationText), start = 76 + code.blocks * 19;
  for (let i = 0; i < count; i++) {
    const cell = code.layout.slots[start + i]; code.cells[cell] = (code.cells[cell] + 7) % 19;
  }
  const image = erase(B.toRGBA(code, 16), code,
    Array.from({ length: 19 }, (_, j) => code.layout.slots[76 + j * code.blocks]), 16);
  record(`equations-${count}`, 'unreliable-equations', image, equationText);
}
for (let i = 0; i < 6; i++) {
  const image = { width: 240, height: 240, data: new Uint8ClampedArray(240 * 240 * 4) };
  const random = O.random(1501 + i);
  for (let p = 0; p < image.data.length; p += 4) {
    for (let c = 0; c < 3; c++) image.data[p + c] = i === 0 ? 255 : i === 1 ? 0 : random() * 255;
    image.data[p + 3] = 255;
  }
  record(`negative-${i}`, 'negative', image, null);
}
const report = { baselineVersion: B.version, candidateVersion: P.version,
  baselineCommit, baselineSourceSHA256: sourceHashes(baseline),
  candidateSourceSHA256: sourceHashes(path.join(__dirname, '..')), runtime: process.version,
  platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
  measuredAt: new Date().toISOString(),
  physicalTrial: false, jabComparison: false, repeats: 2, cases: [], tracking: [] };
const warmup = B.toRGBA(B.encode('Warmup'));
for (let i = 0; i < 3; i++) { B.scan(warmup); P.scan(warmup); }
for (const [index, item] of cases.entries()) {
  const row = { name: item.name, group: item.group, seed: item.seed,
    width: item.image.width, height: item.image.height, expectedBytes: item.expected === null ? 0 :
      Buffer.byteLength(item.expected), baseline: [], candidate: [] };
  for (let trial = 0; trial < 2; trial++) {
    const pair = [[B, 'baseline'], [P, 'candidate']];
    if ((index + trial) % 2) pair.reverse();
    for (const [api, key] of pair) {
      const result = api.scan(item.image);
      assert.ok(!result.verified || result.text === item.expected, `Wrong accepted payload: ${item.name}`);
      row[key].push({ exact: item.expected === null ? !result.verified : result.text === item.expected,
        decoded: !!result.verified, ms: result.ms, decoder: result.decoder || null });
    }
  }
  report.cases.push(row);
  console.log(`${row.name}: ${row.baseline[0].exact ? 'pass' : 'miss'} -> ${row.candidate[0].exact ? 'pass' : 'miss'}`);
}
for (const [api, name] of [[B, 'baseline'], [P, 'candidate']]) {
  const session = api.createSession(), image = B.toRGBA(B.encode(text), 12), rows = [];
  for (let i = 0; i < 8; i++) {
    const r = api.scan(image, { session, frameId: i, diagnostics: true });
    assert.equal(r.text, text);
    rows.push({ ms: r.ms, locateCalls: r.diagnostics?.locateCalls });
  }
  report.tracking.push({ name, staticPoseMicrobenchmark: true, frames: rows });
}
report.rendering = [];
for (const text of ['Raster speed', messages[3], messages[4]]) {
  const row = { bytes: Buffer.byteLength(text), pixelsPerModule: 12, baseline: [], candidate: [] };
  const pair = [[B, 'baseline', B.encode(text)], [P, 'candidate', P.encode(text)]];
  for (const [api, , code] of pair) api.toRGBA(code, 12);
  for (let trial = 0; trial < 4; trial++) {
    for (const [api, name, code] of trial % 2 ? pair.slice().reverse() : pair) {
      const start = performance.now(), image = api.toRGBA(code, 12);
      row[name].push(performance.now() - start);
      row.width = image.width;
    }
  }
  report.rendering.push(row);
}
const median = a => { const x = a.slice().sort((a, b) => a - b); return (x[Math.floor((x.length - 1) / 2)] + x[Math.floor(x.length / 2)]) / 2; };
report.summary = [...new Set(report.cases.map(c => c.group))].map(group => {
  const rows = report.cases.filter(c => c.group === group);
  return { group, cases: rows.length, baselineExact: rows.filter(r => r.baseline.every(x => x.exact)).length,
    candidateExact: rows.filter(r => r.candidate.every(x => x.exact)).length,
    baselineMedianMs: median(rows.flatMap(r => r.baseline.map(x => x.ms))),
    candidateMedianMs: median(rows.flatMap(r => r.candidate.map(x => x.ms))) };
});
report.regressions = report.cases.filter(r => r.baseline.some(x => x.exact) && r.candidate.some(x => !x.exact)).map(r => r.name);
const out = path.join(__dirname, '../release'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'benchmark-results.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, regressions: report.regressions }, null, 2));
if (report.regressions.length) process.exitCode = 1;
