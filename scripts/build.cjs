// SPDX-License-Identifier: Apache-2.0
'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = ['src/crc32.js', 'src/gf19.js', 'src/alphabet19.js', 'src/codec.js', 'src/envelope.js'];
fs.mkdirSync(path.join(root, 'dist'), {
  recursive: true
});
for (const [name, files] of [
    ['prism19-core.js', [...source, 'src/api.js']],
    ['prism19.js', [...source, 'vendor/jsqr-locator.js', 'src/api.js']]
  ]) {
  const text =
    `/*! Prism 19 ${pkg.version} | Apache-2.0 | See LICENSE and NOTICE. */\n(function(){\nconst module=undefined,exports=undefined,define=undefined;\n` +
    files.map(f => `\n/* ${f} */\n` + fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n') +
    '\n})();\n';
  fs.writeFileSync(path.join(root, 'dist', name), text);
  console.log(`${name}: ${Buffer.byteLength(text)} bytes`);
}
