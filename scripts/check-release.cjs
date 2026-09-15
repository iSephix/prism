// SPDX-License-Identifier: Apache-2.0
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  vm = require('node:vm'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..'),
  read = file => fs.readFileSync(path.join(root, file), 'utf8'),
  sha = data => crypto.createHash('sha256').update(data).digest('hex');
const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.version, '0.1.0');
assert.equal(pkg.license, 'Apache-2.0');
assert.ok(!pkg.dependencies && !pkg.devDependencies, 'Unexpected installed dependencies');
for (const file of ['LICENSE', 'NOTICE', 'THIRD_PARTY.md', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
    'SECURITY.md', 'spec/FORMAT.md', 'spec/VERSIONING.md', 'spec/reference.py', 'spec/vectors.json',
    'index.d.ts', 'docs/API.md', 'docs/VALIDATION.md', 'docs/RELEASING.md'
  ]) assert.ok(read(file).length > 20, `Missing release file: ${file}`);
assert.ok(read('LICENSE').includes('Grant of Patent License.'));
assert.ok(read('NOTICE').includes('jsQR'));
const provenance = JSON.parse(read('vendor/provenance.json'));
assert.equal(sha(read('vendor/jsqr-locator.js')), provenance.derivedSHA256);
assert.equal(sha(read('vendor/jsqr-upstream.js')), provenance.sourceSHA256);
const sources = ['src/crc32.js', 'src/gf19.js', 'src/alphabet19.js', 'src/codec.js', 'src/envelope.js'];
for (const [name, files] of [
    ['prism19-core.js', [...sources, 'src/api.js']],
    ['prism19.js', [...sources, 'vendor/jsqr-locator.js', 'src/api.js']]
  ]) {
  const expected =
    '/*! Prism 19 0.1.0 | Apache-2.0 | See LICENSE and NOTICE. */\n(function(){\nconst module=undefined,exports=undefined,define=undefined;\n' +
    files.map(f => `\n/* ${f} */\n` + read(f)).join('\n;\n') + '\n})();\n';
  assert.equal(read('dist/' + name), expected, `${name} is stale; run npm run build`);
  new vm.Script(expected, {
    filename: name
  });
}

function walk(directory) {
  return fs.readdirSync(directory, {
    withFileTypes: true
  }).flatMap(entry => entry.name === 'release' || entry.name === 'node_modules' || entry.name === '.git' ||
    entry.name === '__pycache__' ? [] : entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path
      .join(directory, entry.name)
    ]);
}
const files = walk(root);
for (const file of files) {
  const relative = path.relative(root, file);
  assert.ok(!relative.split(path.sep).some(p => ['.openai', '.sites-runtime', '.env'].includes(p)),
    `Private configuration in source: ${relative}`);
  if (/\.(?:js|cjs)$/.test(file) && !relative.startsWith('vendor' + path.sep)) new vm.Script(fs.readFileSync(
    file, 'utf8'), {
    filename: relative
  });
  if (/\.(?:js|cjs|mjs|json|md|html|ya?ml)$/.test(file)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of [/appgprj_[a-z0-9]{20,}/i, /["']\/(?:workspace|root)\/(?:sites|scratch)\//,
        /https?:\/\/[^\s"/]+:[^\s"@]+@/
      ]) assert.ok(!pattern.test(text), `Private workspace metadata in ${relative}`);
    assert.ok(!/github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,}/.test(text),
      `Possible credential in ${relative}`);
  }
  if (file.endsWith('.md'))
    for (const match of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (target && !/^(?:https?:|mailto:)/.test(target)) assert.ok(fs.existsSync(path.resolve(path.dirname(
        file), target)), `Broken documentation link in ${relative}: ${target}`);
    }
}
const html = read('examples/index.html'),
  ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate DOM IDs');
for (const [, id] of read('examples/demo.js').matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(id),
  `Missing demo element ${id}`);
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g))
  if (!/^(https?:|#)/.test(url)) assert.ok(fs.existsSync(path.resolve(root, 'examples', url)),
    `Missing demo asset ${url}`);
const P = require('../index.cjs');
for (const v of JSON.parse(read('spec/vectors.json')).vectors) {
  const c = v.encrypted ? P.encodeEnvelope(Buffer.from(v.envelopeHex, 'hex'), {
    ecc: v.ecc
  }) : P.encode(v.text, {
    ecc: v.ecc
  });
  assert.deepEqual(P.toMatrix(c), v.matrix, v.name);
}
console.log(
  `PASS: release metadata, license/provenance, ${files.length} source files, frozen vectors, browser bundles and local links.`
  );
