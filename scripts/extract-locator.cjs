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
  const end = source.indexOf('/***/ })', start + marker.length);
  let body = source.slice(start + marker.length, end);
  if (end < 0 || [...body.matchAll(/__webpack_require__\((\d+)\)/g)].some(m => ![0, 4, 11, 12].includes(
      Number(m[1])))) throw Error('Unexpected upstream module graph.');
  if (id === 11) {
    const marker = '    for (var y = 0; y < location.dimension; y++) {';
    if (!body.includes(marker)) throw Error('Mapping extraction point changed.');
    body = body.replace('function extract(image, location) {', 'function extract(image, location, mappingOnly) {')
      .replace(marker, '    if (mappingOnly) return {mappingFunction};\n' + marker);
  }
  if (id === 12) {
    const marker = '        // Now take the top finder pattern options and try to find 2 other options with a similar size.\n        .map(function (point, i, finderPatterns) {';
    if (!body.includes(marker)) throw Error('Finder extraction point changed.');
    body = body.replace('function locate(matrix) {', 'function locate(matrix, options) {')
      .replace('var finderPatternGroups = finderPatternQuads', 'var finderPatterns = finderPatternQuads')
      .replace(marker, '        ;\n    if (options && options.patternsOnly) return {finderPatterns,alignmentPatternQuads,matrix};\n    var finderPatternGroups = finderPatterns\n        .map(function (point, i, finderPatterns) {')
      .replace('exports.locate = locate;', 'exports.locate = locate;\nexports.group = (matrix,quads,a,b,c)=>{const p=reorderFinderPatterns(a,b,c);const r=findAlignmentPattern(matrix,quads,p.topRight,p.topLeft,p.bottomLeft);return r&&{...p,...r};};');
  }
  modules.push(`${id}: function(module,exports,__webpack_require__){${body}\n}`);
}
const notice =
  `// SPDX-License-Identifier: Apache-2.0\n// Derived from jsQR by Cosmo Wolfe and contributors. See LICENSE-jsQR.txt.\n// Modified 2026-09-15: extract geometry modules; expose finder candidates,\n// regrouping and mapping for Prism's multi-code and curved-print recovery.\n`;
const out = notice +
  `(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Prism19Locator=factory();})(globalThis,function(){\n'use strict';\nconst modules={${modules.join(',\n')}},cache={};\nfunction load(id){if(!cache[id]){const module={exports:{}};cache[id]=module;modules[id](module,module.exports,load);}return cache[id].exports;}\nfunction locate(data,width,height){const matrix=load(4).binarize(data,width,height,false).binarized;return (load(12).locate(matrix)||[]).slice(0,2).map(location=>({dimension:location.dimension,map:load(11).extract(matrix,location).mappingFunction}));};\nlocate.patterns=(data,w,h)=>load(12).locate(load(4).binarize(data,w,h,false).binarized,{patternsOnly:true});\nlocate.group=(a,p,q,r)=>load(12).group(a.matrix,a.alignmentPatternQuads,p,q,r);\nlocate.mapping=location=>load(11).extract(null,location,true).mappingFunction;\nreturn locate;\n});\n`;
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
  modification: 'Geometry-only extraction and UMD adapter, with optional finder-candidate and mapping-only returns and exports for regrouping and mapping. Default upstream finder selection remains unchanged. Prism-specific grouping and curved-grid fitting are in src/geometry.js.'
}, null, 2) + '\n');
console.log(`Locator extracted: ${Buffer.byteLength(out)} bytes.`);
