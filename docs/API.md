# API and integration

Import the package from CJS or ESM, or load `dist/prism19.js` for `globalThis.Prism19`. Source-release examples use relative entry points. The public API is declared in `index.d.ts`. Internal `src/codec.js`, GF arithmetic helpers and symbol costs are implementation details and have no independent API stability promise.

## Encode and render

`encode(text, { ecc: 'Q' })` returns a code. Levels L/M/Q/H correspond to k=15/13/11/9. Text must be a well-formed string with 1–1200 UTF-8 bytes. Leading BOM, NUL, newlines and non-ASCII characters are preserved; no Unicode normalization is performed. Unpaired UTF-16 surrogates are rejected.

- `toSVG(code, scale=12)` returns an SVG string with the full quiet zone.
- `toRGBA(code, scale=12)` returns `{ width, height, data }`, where data is a `Uint8ClampedArray` in RGBA order.
- `toMatrix(code)` returns only the n×n symbol matrix: -2 fixed white, -1 fixed black, 0–18 glyphs.
- `decodeMatrix(matrix, { soft, equations })` reads symbol observations without detecting an image. Use `null` for an unknown cell. It validates framing and CRC just as the optical path does.

Scale is an integer 1–64, subject to the rendered 4-megapixel bound. Very small scales may not preserve the pattern; a renderable image is not necessarily scannable. Do not crop the quiet zone or blur the exported code deliberately. A code object is intended to come from the encoder; serialize with `toMatrix`, not by assuming its internal layout is stable.

## Scan camera pixels

```js
const session = Prism19.createSession();

function onFrame(rgba) {
  const result = Prism19.scan(rgba, {
    session,
    soft: true,
    equations: true,
    spatial: true,
    refine: true
  });
  if (result.kind === 'prism19') showText(result.text);
}
```

Omitting `session` performs a single-image attempt. Keep one session for one live camera flow; call `session.clear()` when switching sources or modes. It retains up to eight scored frames sharing the verified header and grid and resets after a six-second gap. Repeatedly submitting the exact same image is not independent evidence; the caller should submit distinct camera frames.

Input must have positive integer width/height, at most 4096 per side and 4,194,304 pixels total, with an unsigned byte array of exactly `width*height*4` entries. Alpha is composited over white on a copy when necessary. Downsample large camera frames before calling. The included demo uses a worker and at most 1120 pixels on the longer camera dimension.

`scan()` is synchronous. Run it in a worker to keep the UI responsive and send the next frame after the previous one finishes. The decoder has cooperative search budgets; it cannot forcibly interrupt an external locator or a long-running operation. It first tries the complete hard-decision path, then advanced hypotheses on failures.

The method returns one of:

| kind | Meaning | Use |
|---|---|---|
| `prism19` | CRC-verified, valid UTF-8 plaintext | `result.text` |
| `encrypted` | Reconstructed and CRC-verified encrypted envelope | Convert `result.envelope` to `Uint8Array`, then call `decrypt` |
| `partial19` | Valid header found, full payload not recovered | Keep scanning; `frames` counts evidence frames |
| `none` | No accepted complete message/header result | Try a clearer frame |

Success diagnostics include `grid`, `frames`, `ms`, `decoder`, `corrected`, `repaired`, `equations` and `checksum`. `ms` covers this API call, not capture time or previous frames. `frames` counts frames contributing to the successful reconstruction, not every attempted frame. `corrected` is a path-dependent correction diagnostic, not a measured number of physical defects. `repaired` counts data field symbols solved from equations; `equations` counts rows used in the accepted system, including redundant rows. Treat all diagnostics as implementation details for measurement, not protocol signaling.

## Supply your own locator

Use `scan(image, { locate })`. The callback receives RGBA bytes, width and height (the scanner may supply different grayscale/color planes) and returns an array of `{ dimension, map(x,y) }` candidates. `map` maps canonical grid coordinates, excluding the quiet zone, into source pixel-edge coordinates. Pixel centers are at half-integers. Finders have centers `(3.5,3.5)`, `(n-3.5,3.5)` and `(3.5,n-3.5)`. Return candidates in preferred order; at most two per invocation are examined.

The core browser bundle requires a supplied locator for optical scanning. It can encode/render and decode already sampled matrices without jsQR. The full bundle includes only the jsQR geometry subset. Node defers loading that subset until it needs the default locator. A failed custom locator is an integration error and may throw; arbitrary callbacks are trusted application code.

## Encryption

`encrypt(text, passphrase)` returns an envelope; `encodeEnvelope(bytes, options)` encodes it. `encodeEncrypted(text, passphrase, options)` combines both. `decrypt(envelopeBytes, passphrase)` verifies the tag and returns exact UTF-8 text. The passphrase must have 1–4096 UTF-8 bytes and no lone surrogate. Errors use a generic wrong-passphrase/altered-data message.

```js
const result = Prism19.scan(image);
if (result.kind === 'encrypted') {
  const text = await Prism19.decrypt(Uint8Array.from(result.envelope), passphrase);
  outputElement.textContent = text;
}
```

Use platform Web Crypto in a secure browser context or Node 22+. `encodeEnvelope` does not authenticate ciphertext—it transports already encrypted bytes. The `verified` property on scan results refers to transport validation, not sender authenticity. GCM verification occurs only in `decrypt`.

## Errors and privacy

Invalid API arguments throw `TypeError` or `RangeError`; malformed/unsupported optical messages normally return `none` or `partial19`. Image-decoder and cryptographic failures throw errors. The module performs no fetches, analytics, persistence, credential lookup or remote execution. Host applications control camera access, storage and how recovered text is used.
