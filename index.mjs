// SPDX-License-Identifier: Apache-2.0
import api from './index.cjs';
export const {version, wireVersion, maxTextBytes, maxImagePixels, alphabet, encode, encodeEnvelope, encodeEncrypted, encrypt, decrypt, toSVG, toRGBA, toMatrix, decodeMatrix, scan, createSession} = api;
export default api;
