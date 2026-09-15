// SPDX-License-Identifier: Apache-2.0
import P, {encode, scan, type Code, type ScanResult} from 'prism19';
import {encode as browserEncode} from 'prism19/browser';
const code: Code = encode('typed message', {ecc: 'Q'});
const result: ScanResult = scan(P.toRGBA(code), {session: P.createSession()});
if (result.kind === 'prism19') result.text.toUpperCase();
if (result.kind === 'encrypted') await P.decrypt(Uint8Array.from(result.envelope), 'passphrase');
browserEncode('browser types');
// @ts-expect-error unsupported correction level
encode('x', {ecc: 'Z'});
// @ts-expect-error payload must be text
encode(123);
// @ts-expect-error RGBA pixels must be a byte array
scan({width: 1, height: 1, data: [0, 0, 0, 255]});
