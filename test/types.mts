// SPDX-License-Identifier: Apache-2.0
import P, {encode, scan, type Code, type ScanResult} from 'prism19';
import {encode as browserEncode} from 'prism19/browser';
const code: Code = encode('typed message', {ecc: 'Q'});
const result: ScanResult = scan(P.toRGBA(code), {session: P.createSession(), maxTimeMs: 250, tracking: true, frameId: 0, diagnostics: true});
if (result.kind === 'prism19') result.text.toUpperCase();
if (result.kind === 'encrypted') await P.decrypt(Uint8Array.from(result.envelope), 'passphrase');
browserEncode('browser types');
// @ts-expect-error unsupported correction level
encode('x', {ecc: 'Z'});
// @ts-expect-error payload must be text
encode(123);
// @ts-expect-error RGBA pixels must be a byte array
scan({width: 1, height: 1, data: [0, 0, 0, 255]});

result.diagnostics?.locateCalls.toFixed();
if (result.kind === 'none' || result.kind === 'partial19') result.timedOut;
// @ts-expect-error time budget must be numeric
scan(P.toRGBA(code), {maxTimeMs: '250'});

const contentCode = P.encodePayload('image', new Uint8Array([1, 2]), {name: 'test.png'});
const contentResult = P.scan(P.toRGBA(contentCode));
if (contentResult.kind === 'payload') contentResult.payload.data.byteLength;
P.capacity({ecc: 'L', encrypted: true});
P.evaluateCalculation('sqrt(81)');
// @ts-expect-error content markers are allocated explicitly
P.encodePayload('script', 'alert(1)');
