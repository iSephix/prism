// SPDX-License-Identifier: Apache-2.0
// Reproducible extraction of jsQR's four geometry modules; no QR payload decoder.
'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.join(__dirname, '..'),
  source = fs.readFileSync(path.join(root, 'vendor/jsqr-upstream.js'), 'utf8');
const modules = [];
for (const id of [0, 4, 11, 12]) {
  const marker = `/* ${id} */\n/***/ (function(module, exports, __webpack_require__) {`,
    start = source.indexOf(marker);
  if (start < 0) throw Error(`Missing jsQR module ${id}`);
  const end = source.indexOf('/***/ })', start + marker.length),
    body = source.slice(start + marker.length, end);
  if (end < 0 || [...body.matchAll(/__webpack_require__\((\d+)\)/g)].some(m => ![0, 4, 11, 12].includes(
      Number(m[1])))) throw Error('Unexpected upstream module graph.');
  modules.push(`${id}: function(module,exports,__webpack_require__){${body}\n}`);
}
const notice =
  `// SPDX-License-Identifier: Apache-2.0\n// Derived from jsQR by Cosmo Wolfe and contributors. See LICENSE-jsQR.txt.\n// Modified 2026-09-14: extract only BitMatrix, binarizer, extractor and locator;\n// add a UMD locate(data,width,height) adapter. Algorithms are unchanged.\n`;
const out = notice +
  `(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Prism19Locator=factory();})(globalThis,function(){\n'use strict';\nconst modules={${modules.join(',\n')}},cache={};\nfunction load(id){if(!cache[id]){const module={exports:{}};cache[id]=module;modules[id](module,module.exports,load);}return cache[id].exports;}\nreturn function locate(data,width,height){const matrix=load(4).binarize(data,width,height,false).binarized;return (load(12).locate(matrix)||[]).slice(0,2).map(location=>({dimension:location.dimension,map:load(11).extract(matrix,location).mappingFunction}));};\n});\n`;
fs.writeFileSync(path.join(root, 'vendor/jsqr-locator.js'), out);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(path.join(root, 'vendor/provenance.json'), JSON.stringify({
  name: 'jsQR',
  license: 'Apache-2.0',
  upstreamRepository: 'https://github.com/cozmo/jsQR',
  upstreamCommit: '8e6a036beafa7053dd44b1b76ac578d22b1b3311',
  upstreamPath: 'dist/jsQR.js',
  sourceNormalization: 'UTF-8 text with LF line endings and an attribution header',
  sourceSHA256: sha(source),
  derivedSHA256: sha(out),
  retainedModules: [0, 4, 11, 12],
  modification: 'Geometry-only module extraction and UMD adapter. No algorithm changes.'
}, null, 2) + '\n');
console.log(`Locator extracted: ${Buffer.byteLength(out)} bytes.`);
