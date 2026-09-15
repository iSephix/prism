// SPDX-License-Identifier: Apache-2.0
import P = require('prism19');
const code: P.Code = P.encode('CommonJS types', {ecc: 'H'});
const result: P.ScanResult = P.decodeMatrix(P.toMatrix(code));
if (result.kind === 'prism19') result.text.toUpperCase();
// @ts-expect-error scale must be numeric
P.toSVG(code, '12');
