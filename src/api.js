// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Prism 19 contributors.
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./codec.js'), require('./envelope.js'), require('./payload.js'), () => require(
      '../vendor/jsqr-locator.js'));
  } else root.Prism19 = factory(root.Prism19Core, root.PrismEnvelope, root.PrismPayload, () => root.Prism19Locator);
})(globalThis, function(core, envelope, payload, getDefaultLocator) {
  'use strict';
  const version = '0.3.0',
    wireVersion = 3,
    supportedWireVersions = Object.freeze([2, 3]),
    maxTextBytes = 8554,
    maxImagePixels = 4194304;
  const encoder = new TextEncoder();

  function optionsObject(options) {
    if (options === undefined) return {};
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError(
      'Options must be an object.');
    return options;
  }

  function textBytes(text) {
    if (typeof text !== 'string') throw new TypeError('Text must be a string.');
    // Reject lone surrogates instead of silently replacing them during UTF-8 encoding.
    for (let i = 0; i < text.length; i++) {
      const unit = text.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(
          'Text contains an unpaired Unicode surrogate.');
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError(
        'Text contains an unpaired Unicode surrogate.');
    }
    const bytes = encoder.encode(text);
    if (bytes.length < 1 || bytes.length > maxTextBytes) throw new RangeError(
      'Text must contain 1–8554 UTF-8 bytes, subject to the selected correction level.');
    return bytes;
  }

  function level(options) {
    const value = options.ecc === undefined ? 'Q' : options.ecc;
    if (!['L', 'M', 'Q', 'H'].includes(value)) throw new RangeError('ecc must be L, M, Q or H.');
    return value;
  }

  function wire(options) {
    if (options.wireVersion !== undefined && !supportedWireVersions.includes(options.wireVersion))
      throw new RangeError('wireVersion must be 2 or 3.');
    return options.wireVersion;
  }
  function capacity(options) {
    options = optionsObject(options);
    const ecc = level(options), version = wire(options);
    if (options.encrypted !== undefined && typeof options.encrypted !== 'boolean') throw new TypeError('encrypted must be boolean.');
    return version === 2 ? 1200 : core.capacity({ L: 15, M: 13, Q: 11, H: 9 }[ecc]) - (options.encrypted ? 44 : 0);
  }

  function password(value) {
    if (typeof value !== 'string' || !value || encoder.encode(value).length > 4096) throw new RangeError(
      'Passphrase must contain 1–4096 UTF-8 bytes.');
    for (let i = 0; i < value.length; i++) {
      const unit = value.charCodeAt(i);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError(
          'Passphrase contains an unpaired Unicode surrogate.');
      } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError(
        'Passphrase contains an unpaired Unicode surrogate.');
    }
    return value;
  }

  function bytes(value, min, max) {
    if (!ArrayBuffer.isView(value) || value.BYTES_PER_ELEMENT !== 1 || !['[object Uint8Array]',
        '[object Uint8ClampedArray]'
      ].includes(Object.prototype.toString.call(value))) throw new TypeError(
      'Expected an unsigned byte array.');
    if (value.length < min || value.length > max) throw new RangeError(
      'Byte array length is outside the supported range.');
    return value;
  }

  function encode(text, options) {
    options = optionsObject(options);
    textBytes(text);
    return core.encode(text, level(options), { wireVersion: wire(options) });
  }

  function encodeEnvelope(data, options) {
    options = optionsObject(options);
    bytes(data, 45, 8554);
    return core.encode('', level(options), {
      payload: data,
      encrypted: true,
      wireVersion: wire(options),
      originalBytes: data.length - 44
    });
  }
  async function encrypt(text, passphrase) {
    if (textBytes(text).length > 8510) throw new RangeError('Encrypted text exceeds 8510 bytes.');
    password(passphrase);
    return envelope.encrypt(text, passphrase);
  }
  async function decrypt(data, passphrase) {
    bytes(data, 45, 8554);
    password(passphrase);
    return envelope.decrypt(data, passphrase);
  }
  async function encodeEncrypted(text, passphrase, options) {
    options = optionsObject(options);
    if (textBytes(text).length > capacity({ ...options, encrypted: true })) throw new RangeError('Encrypted text exceeds the selected correction capacity.');
    return encodeEnvelope(await encrypt(text, passphrase), options);
  }

  const packPayload = (type, data, options) => payload.pack(type, data, optionsObject(options));
  const unpackPayload = data => payload.unpack(bytes(data, 4, 8554));
  function encodePayload(type, data, options) {
    options = optionsObject(options);
    if (wire(options) === 2) throw new RangeError('Typed payloads require wire version 3.');
    const packet = packPayload(type, data, options);
    return core.encode('', level(options), { payload: packet, typed: true, wireVersion: 3,
      originalBytes: typeof data === 'string' ? payload.utf8(data).length : data.length });
  }
  async function encodePayloadEncrypted(type, data, passphrase, options) {
    options = optionsObject(options);
    if (wire(options) === 2) throw new RangeError('Typed payloads require wire version 3.');
    const packet = packPayload(type, data, options);
    password(passphrase);
    if (packet.length > capacity({ ...options, encrypted: true })) throw new RangeError('Encrypted payload exceeds the selected correction capacity.');
    return core.encode('', level(options), { payload: await envelope.encryptBytes(packet, passphrase),
      encrypted: true, typed: true, wireVersion: 3,
      originalBytes: typeof data === 'string' ? payload.utf8(data).length : data.length });
  }
  async function decryptPayload(data, passphrase) {
    bytes(data, 48, 8554); password(passphrase);
    return unpackPayload(await envelope.decryptBytes(data, passphrase));
  }
  function withPayload(result) {
    if (result.kind !== 'payload') return result;
    try { return { ...result, payload: unpackPayload(Uint8Array.from(result.envelope)) }; }
    catch { return { kind: 'none', mode: 'p19', ms: result.ms,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}) }; }
  }

  function validateCode(code) {
    if (!code || typeof code !== 'object' || code.mode !== 'p19' || !code.cells || code.cells.length !==
      code.n * code.n || !code.layout || code.layout.n !== code.n) throw new TypeError(
      'Expected a code returned by encode().');
    core.layout(code.n);
    return code;
  }

  function scale(code, value, raster = true) {
    validateCode(code);
    if (value === undefined) value = 12;
    if (!Number.isInteger(value) || value < 1 || value > 64) throw new RangeError(
      'Scale must be an integer from 1 to 64.');
    if (raster && (code.n + 8) ** 2 * value ** 2 > maxImagePixels) throw new RangeError(
      'Rendered image exceeds the 4 megapixel limit.');
    return value;
  }
  const toSVG = (code, pixelsPerModule) => core.svg(code, scale(code, pixelsPerModule, false));
  const toRGBA = (code, pixelsPerModule) => core.raster(code, scale(code, pixelsPerModule));

  function toMatrix(code) {
    validateCode(code);
    return Array.from({
      length: code.n
    }, (_, y) => Array.from({
      length: code.n
    }, (_, x) => {
      const i = y * code.n + x,
        fixed = code.layout.fixed[i];
      return fixed === 0 ? -2 : fixed === 1 ? -1 : code.cells[i];
    }));
  }

  function scanOptions(value) {
    const options = optionsObject(value),
      out = {};
    for (const key of ['soft', 'equations', 'spatial', 'refine', 'tracking', 'diagnostics']) {
      if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError(
        `${key} must be boolean.`);
      if (options[key] !== undefined) out[key] = options[key];
    }
    if (options.maxTimeMs !== undefined) {
      if (!Number.isFinite(options.maxTimeMs) || options.maxTimeMs < 10 || options.maxTimeMs > 10000)
        throw new RangeError('maxTimeMs must be a number from 10 to 10000.');
      out.maxTimeMs = options.maxTimeMs;
    }
    if (options.frameId !== undefined) {
      if (!Number.isSafeInteger(options.frameId) || options.frameId < 0)
        throw new RangeError('frameId must be a nonnegative safe integer.');
      out.frameId = options.frameId;
    }
    if (options.session !== undefined) {
      if (!options.session || typeof options.session.add !== 'function' || typeof options.session.clear !==
        'function') throw new TypeError('Use a session returned by createSession().');
      out.session = options.session;
    }
    return out;
  }

  function imageData(image) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 ||
      image.height < 1 || image.width > 4096 || image.height > 4096 || image.width * image.height >
      maxImagePixels) throw new RangeError(
      'Image dimensions must be positive integers, at most 4096 per side and 4 megapixels total.');
    bytes(image.data, image.width * image.height * 4, image.width * image.height * 4);
    // Composite transparent PNG/canvas pixels on the format's white background.
    let data = image.data;
    for (let i = 3; i < data.length; i += 4)
      if (data[i] !== 255) {
        data = new Uint8ClampedArray(data);
        for (let p = 0; p < data.length; p += 4) {
          const a = data[p + 3] / 255;
          for (let c = 0; c < 3; c++) data[p + c] = Math.round(data[p + c] * a + 255 * (1 - a));
          data[p + 3] = 255;
        }
        break;
      }
    return {
      data,
      width: image.width,
      height: image.height
    };
  }

  function scan(image, options) {
    const start = performance.now();
    const configured = scanOptions(options),
      input = imageData(image);
    if (input.width < 25 || input.height < 25) {
      const result = { kind: 'none', mode: 'p19', ms: performance.now() - start };
      if (configured.diagnostics) result.diagnostics = { locateCalls: 0, candidates: 0,
        observations: 0, tracked: false, locateMs: 0, observeMs: 0, classifyMs: 0, decodeMs: 0 };
      return result;
    }
    const locate = options && options.locate !== undefined ? options.locate : getDefaultLocator();
    if (typeof locate !== 'function') throw new TypeError(
      'Load the scanner bundle or provide a locate function.');
    configured.locate = (...args) => {
      const found = locate(...args);
      if (!Array.isArray(found)) throw new TypeError('Locator must return an array of grid candidates.');
      return found;
    };
    configured.locatorKey = locate;
    const result = withPayload(core.scan(input, configured));
    result.ms = performance.now() - start;
    return result;
  }

  function decodeMatrix(matrix, options) {
    const configured = scanOptions(options);
    if (!Array.isArray(matrix)) throw new TypeError('Matrix must be an array of rows.');
    const n = matrix.length,
      layout = core.layout(n),
      scores = new Float32Array(n * n * 19);
    for (let y = 0; y < n; y++) {
      if (!Array.isArray(matrix[y]) || matrix[y].length !== n) throw new RangeError(
        'Matrix must be square.');
      for (let x = 0; x < n; x++) {
        const cell = y * n + x,
          value = matrix[y][x],
          fixed = layout.fixed[cell];
        if (fixed >= 0) {
          if (value !== (fixed ? -1 : -2) && value !== null) throw new RangeError(
            'Invalid fixed-pattern matrix entry.');
        } else {
          if (value !== null && (!Number.isInteger(value) || value < 0 || value > 18)) throw new RangeError(
            'Data cells must be 0–18 or null for an erasure.');
          if (value !== null)
            for (let s = 0; s < 19; s++) scores[cell * 19 + s] = s === value ? 0 : 24;
        }
      }
    }
    const start = performance.now(),
      header = core.headerFromScores(scores, n, configured.soft !== false);
    if (!header) return {
      kind: 'none',
      mode: 'p19',
      ms: performance.now() - start
    };
    const body = core.bodyFromScores(scores, header, configured);
    return body ? withPayload(core.makeResult(body, header, start)) : {
      kind: 'partial19',
      mode: 'p19',
      grid: n,
      frames: 1,
      ms: performance.now() - start
    };
  }
  return Object.freeze({
    version,
    wireVersion,
    supportedWireVersions,
    capacity,
    payloadTypes: payload.types,
    packPayload,
    unpackPayload,
    encodePayload,
    encodePayloadEncrypted,
    decryptPayload,
    evaluateCalculation: payload.evaluate,
    maxTextBytes,
    maxImagePixels,
    alphabet: core.alphabet.symbols,
    encode,
    encodeEnvelope,
    encodeEncrypted,
    encrypt,
    decrypt,
    toSVG,
    toRGBA,
    toMatrix,
    decodeMatrix,
    scan,
    createSession: core.createSession
  });
});
