// SPDX-License-Identifier: Apache-2.0
// Format-3 content registry and a bounded arithmetic grammar. No script execution.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrismPayload = factory();
})(globalThis, function() {
  'use strict';
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const definitions = [
    ['binary', 'application/octet-stream'], ['json', 'application/json'],
    ['calculation', 'text/x-prism-calculation'], ['url', 'text/uri-list'],
    ['image', 'image/png'], ['audio', 'audio/wav'], ['contact', 'text/vcard']
  ];
  const types = Object.freeze(definitions.map(([name, mimeType], i) => Object.freeze({ id: i + 1, name, mimeType })));
  const media = {
    image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    audio: ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/aac', 'audio/flac']
  };
  function utf8(text) {
    if (typeof text !== 'string') throw new TypeError('Expected text.');
    const bytes = encoder.encode(text);
    if (decoder.decode(bytes) !== text) throw new TypeError('Text contains an unpaired surrogate.');
    return bytes;
  }
  function byteArray(value) {
    if (!ArrayBuffer.isView(value) || !['[object Uint8Array]', '[object Uint8ClampedArray]'].includes(
      Object.prototype.toString.call(value))) throw new TypeError('Expected unsigned bytes.');
    return value;
  }

  const functions = Object.freeze({
    sqrt: [Math.sqrt, 1, 1], abs: [Math.abs, 1, 1], sin: [Math.sin, 1, 1],
    cos: [Math.cos, 1, 1], tan: [Math.tan, 1, 1], log: [Math.log, 1, 1],
    log10: [Math.log10, 1, 1], exp: [Math.exp, 1, 1], floor: [Math.floor, 1, 1],
    ceil: [Math.ceil, 1, 1], round: [Math.round, 1, 1], min: [Math.min, 1, 8],
    max: [Math.max, 1, 8], pow: [Math.pow, 2, 2]
  });
  function calculation(expression, execute = true) {
    if (typeof expression !== 'string' || !expression.trim() || expression.length > 1024)
      throw new RangeError('Calculation must contain 1–1024 characters.');
    const tokens = [];
    for (let i = 0; i < expression.length;) {
      if (/\s/.test(expression[i])) { i++; continue; }
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|^[A-Za-z][A-Za-z0-9]*|^[()+\-*/%^,]/.exec(expression.slice(i));
      if (!match || tokens.length >= 256) throw new SyntaxError('Unsupported calculation syntax or too many tokens.');
      tokens.push(match[0]); i += match[0].length;
    }
    let at = 0, depth = 0;
    const finite = n => { if (execute && !Number.isFinite(n)) throw new RangeError('Calculation has no finite real result.'); return execute ? n : 1; };
    const take = t => tokens[at] === t ? (++at, true) : false;
    function nested(fn) {
      if (++depth > 32) throw new RangeError('Calculation nesting exceeds 32.');
      try { return fn(); } finally { depth--; }
    }
    function primary() {
      if (take('(')) { const v = nested(sum); if (!take(')')) throw new SyntaxError('Missing closing parenthesis.'); return v; }
      const token = tokens[at++];
      if (token === undefined) throw new SyntaxError('Missing calculation operand.');
      if (/^(?:\d|\.)/.test(token)) { const n = Number(token); if (!Number.isFinite(n)) throw new RangeError('Number is too large.'); return n; }
      if (token === 'pi') return Math.PI;
      if (token === 'e') return Math.E;
      if (!Object.hasOwn(functions, token) || !take('(')) throw new SyntaxError('Unknown calculation name.');
      const args = [];
      if (!take(')')) {
        do { args.push(nested(sum)); if (args.length > 8) throw new RangeError('Too many function arguments.'); } while (take(','));
        if (!take(')')) throw new SyntaxError('Missing closing parenthesis.');
      }
      const [fn, min, max] = functions[token];
      if (args.length < min || args.length > max) throw new RangeError('Wrong function argument count.');
      return execute ? finite(fn(...args)) : 1;
    }
    function power() { const v = primary(); return take('^') ? finite(v ** nested(unary)) : v; }
    function unary() { if (take('+')) return nested(unary); if (take('-')) return -nested(unary); return power(); }
    function product() {
      let v = unary();
      while (['*', '/', '%'].includes(tokens[at])) {
        const op = tokens[at++], b = unary();
        v = finite(op === '*' ? v * b : op === '/' ? v / b : v % b);
      }
      return v;
    }
    function sum() {
      let v = product();
      while (['+', '-'].includes(tokens[at])) { const op = tokens[at++], b = product(); v = finite(op === '+' ? v + b : v - b); }
      return v;
    }
    const result = sum();
    if (at !== tokens.length) throw new SyntaxError('Unexpected calculation token.');
    return finite(result);
  }

  function validate(type, data, mimeType, name) {
    if (!type) throw new RangeError('Unsupported payload type.');
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(mimeType) || mimeType.length > 96)
      throw new RangeError('Use a MIME type without parameters, at most 96 ASCII bytes.');
    if (utf8(name).length > 120 || /[\x00-\x1f\x7f/\\]/.test(name) || name === '.' || name === '..')
      throw new RangeError('Filename must be a simple name of at most 120 UTF-8 bytes.');
    if (media[type.name] && !media[type.name].includes(mimeType)) throw new RangeError('Unsupported media MIME type.');
    if (!['binary', 'image', 'audio'].includes(type.name) && mimeType !== type.mimeType)
      throw new RangeError('MIME type does not match the payload marker.');
    let text;
    if (['json', 'calculation', 'url', 'contact'].includes(type.name)) text = decoder.decode(data);
    if (type.name === 'json') JSON.parse(text);
    if (type.name === 'calculation') calculation(text, false);
    if (type.name === 'url') {
      if (/\s/.test(text) || !/^https?:\/\//i.test(text)) throw new RangeError('URL payloads require one HTTP(S) URL.');
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) throw new RangeError('Unsupported URL scheme.');
    }
    if (type.name === 'contact' && (!/^BEGIN:VCARD\r?\n/.test(text) || !/\r?\nEND:VCARD\r?\n?$/.test(text)))
      throw new RangeError('Contact payload must contain a vCard.');
    return text;
  }
  function pack(typeName, value, options = {}) {
    const type = types.find(t => t.name === typeName);
    if (!type) throw new RangeError('Unsupported payload type.');
    const data = typeof value === 'string' ? utf8(value) : byteArray(value);
    if (data.length > 8550) throw new RangeError('Payload data exceeds one code.');
    const mimeType = options.mimeType ?? type.mimeType, name = options.name ?? '';
    if (typeof mimeType !== 'string' || typeof name !== 'string') throw new TypeError('MIME type and name must be strings.');
    validate(type, data, mimeType, name);
    const mime = mimeType === type.mimeType ? new Uint8Array() : utf8(mimeType), filename = utf8(name), out = new Uint8Array(4 + mime.length + filename.length + data.length);
    if (out.length > 8554) throw new RangeError('Payload metadata and data exceed one code.');
    out.set([1, type.id, mime.length, filename.length]); out.set(mime, 4); out.set(filename, 4 + mime.length);
    out.set(data, 4 + mime.length + filename.length);
    return out;
  }
  function unpack(value) {
    const bytes = byteArray(value);
    if (bytes.length < 4 || bytes.length > 8554 || bytes[0] !== 1 || bytes[2] > 96 || bytes[3] > 120)
      throw new RangeError('Unsupported typed payload header.');
    const end = 4 + bytes[2] + bytes[3];
    if (end > bytes.length) throw new RangeError('Truncated payload metadata.');
    const type = types.find(t => t.id === bytes[1]), mimeType = bytes[2] ? decoder.decode(bytes.subarray(4, 4 + bytes[2])) : type?.mimeType,
      name = decoder.decode(bytes.subarray(4 + bytes[2], end)), data = Uint8Array.from(bytes.subarray(end));
    const text = validate(type, data, mimeType, name);
    return { type: type.name, typeId: type.id, mimeType, name, data, ...(text !== undefined ? { text } : {}) };
  }
  return { types, pack, unpack, evaluate: expression => calculation(expression), utf8 };
});
