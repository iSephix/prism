# API and integration

Import the package from CJS or ESM, or load `dist/prism19.js` for `globalThis.Prism19`. Source-release examples use relative entry points. The public API is declared in `index.d.ts`. Internal `src/codec.js`, GF arithmetic helpers and symbol costs are implementation details and have no independent API stability promise.

## Encode and render

`encode(text, { ecc: 'Q' })` returns a code. Levels L/M/Q/H correspond to k=15/13/11/9. Text must be a well-formed string with 1–8554 UTF-8 bytes, subject to the selected correction level. `capacity({ecc})` gives its current maximum: L 8554, M 7413, Q 6273, H 5132. `capacity({ecc, encrypted: true})` subtracts the 44-byte encryption envelope. These are maximum body/plaintext sizes, before typed metadata. Leading BOM, NUL, newlines and non-ASCII characters are preserved; no Unicode normalization is performed. Unpaired UTF-16 surrogates are rejected.

- `toSVG(code, scale=12)` returns an SVG string with the full quiet zone.
- `toRGBA(code, scale=12)` returns `{ width, height, data }`, where data is a `Uint8ClampedArray` in RGBA order.
- `toMatrix(code)` returns only the n×n symbol matrix: -2 fixed white, -1 fixed black, 0–18 glyphs.
- `decodeMatrix(matrix, { soft, equations })` reads symbol observations without detecting an image. Use `null` for an unknown cell. It validates framing and CRC just as the optical path does.

Scale is an integer 1–64. RGBA/PNG rendering is subject to the 4-megapixel bound; SVG is vector output and does not allocate the equivalent raster. Very small scales may not preserve the pattern; a renderable image is not necessarily scannable. Do not crop the quiet zone or blur the exported code deliberately. A code object is intended to come from the encoder; serialize with `toMatrix`, not by assuming its internal layout is stable.

Ordinary text up to 1200 bytes (or text envelopes up to 1244 bytes) defaults to format 2; larger content defaults to format 3. `encode` and `encodeEnvelope` accept `wireVersion: 2 | 3` to require a profile. An impossible version/size combination throws. `wireVersion` exported by the library is its highest supported version (3), `supportedWireVersions` is `[2,3]`, and `code.version` identifies the actual generated symbol.

## Typed payloads

`encodePayload(type, data, {ecc, mimeType, name})` accepts text or unsigned bytes. Types are `binary`, `json`, `calculation`, `url`, `image`, `audio`, `contact`. It emits format 3 and validates the registry's textual and metadata constraints. `encodePayloadEncrypted(type, data, passphrase, options)` encrypts the complete typed container. It also uses format 3. See [PAYLOADS](PAYLOADS.md) for examples and file limits.

`packPayload`/`unpackPayload` serialize and parse the content container independently of optics. Default MIME types need no transmitted MIME string; a container with no filename uses four overhead bytes. Media files remain raw bytes. `payloadTypes` exposes the frozen registry.

A successful typed scan has `kind: 'payload'` and `result.payload = {type, typeId, mimeType, name, data, text?}`. `data` is the exact recovered `Uint8Array`. `text` is present for the textual types. `result.bytes` still counts transport body bytes, while `result.payload.data.length` counts content bytes. Invalid or unsupported containers do not produce a typed success.

Encrypted results have `typed: true` when the encrypted plaintext is a container. Call `decryptPayload(Uint8Array.from(result.envelope), passphrase)` for those results; use `decrypt` for encrypted ordinary text. The two encryption contexts are deliberately distinct. `decryptPayload` returns the parsed payload after authentication.

`evaluateCalculation(expression)` is an explicit numeric operation using the bounded grammar in [FORMAT3](../spec/FORMAT3.md). Scanning checks syntax but does not calculate, navigate to links or play audio. Media format decoding is left to the browser/application; a valid transport checksum does not prove that a media file is playable.

## Scan camera pixels

```js
const session = Prism19.createSession();

function onFrame(rgba, captureId) {
  const result = Prism19.scan(rgba, {
    session,
    frameId: captureId,
    maxTimeMs: 250,
    soft: true,
    equations: true,
    spatial: true,
    refine: true
  });
  if (result.kind === 'prism19') showText(result.text);
}
```

Omitting `session` performs a single-image attempt. Keep one session for one live camera flow; call `session.clear()` when switching sources or modes. It retains up to eight scored frames sharing the verified header and grid and resets after a six-second gap. Give each distinct capture a unique nonnegative safe-integer `frameId`: duplicate IDs still in the eight-frame window do not add evidence. Without IDs, each submission counts. Repeatedly submitting the same image under new IDs is not independent evidence.

With a session, `tracking` defaults to true. A recent grid position can be reused for up to one second, provided image dimensions and locator identity match. The scanner reconstructs and verifies the current frame's header and payload; it does not return a cached message. Failed tracking falls back to finder detection within the budget. `tracking: false` disables this shortcut. Clearing the session clears both pose and accumulated evidence.

Input must have positive integer width/height, at most 4096 per side and 4,194,304 pixels total, with an unsigned byte array of exactly `width*height*4` entries. Alpha is composited over white on a copy when necessary. Downsample large camera frames before calling. The included demo uses a worker and normally captures at most 1120 pixels on the longer dimension with a 2200 ms budget; every sixth new frame uses up to 1800 pixels with the same budget. Clean frames return as soon as decoded. Still images use 2200 ms. The demo submits fresh video frames after each completed attempt and skips duplicate video timestamps. A timer keeps capture active if video presentation callbacks stop arriving.

`scan()` is synchronous. Run it in a worker to keep the UI responsive and send the next frame after the previous one finishes. `maxTimeMs` sets a cooperative search budget from 10 to 10000 milliseconds, default 2200, starting after public input validation and alpha normalization. Checks occur between stages and candidate searches; a locator or individual operation already executing can overrun the budget. This is not a hard wall-clock guarantee. An incomplete result receives `timedOut: true` when the search budget is exhausted. The scanner tries ordinary hard decisions across the poses in each channel, then attempts recovery before spending time locating the same code in another channel, within the budget. A larger budget may improve difficult still-image recovery.

The method returns one of:

| kind | Meaning | Use |
|---|---|---|
| `prism19` | CRC-verified, valid UTF-8 plaintext | `result.text` |
| `payload` | Validated typed content | `result.payload.data`, plus type/MIME/name and optional text |
| `encrypted` | Reconstructed and CRC-verified encrypted envelope | Convert `result.envelope` to `Uint8Array`, then call `decrypt` |
| `partial19` | Valid header found, full payload not recovered | Keep scanning; `frames` counts evidence frames |
| `none` | No accepted complete message/header result | Try a clearer frame |

Success diagnostics include `grid`, `frames`, `ms`, `decoder`, `corrected`, `repaired`, `equations` and `checksum`. `ms` covers this API call, not capture time or previous frames. `frames` counts frames contributing to the successful reconstruction, not every attempted frame. `corrected` is a path-dependent correction diagnostic, not a measured number of physical defects. `repaired` counts data field symbols solved from equations; `equations` counts rows used in the accepted per-column systems, including redundant rows for consistent systems or the independent basis for candidate systems. All recovered payloads must satisfy the packet CRC and padding checks.

Set `diagnostics: true` to add `result.diagnostics` on any optical scan result. It contains `locateCalls`, `candidates`, `observations`, `tracked` (whether the accepted result used the recent pose), and stage totals `locateMs`, `observeMs`, `classifyMs`, `decodeMs`. Stage times exclude other work such as input normalization and grayscale conversion, so they need not sum to `ms`. Treat diagnostics as measurements, not protocol signaling or evidence of a physical defect count.

## Supply your own locator

Use `scan(image, { locate })`. The callback receives RGBA bytes, width and height (the scanner may supply different grayscale/color planes) and returns an array of `{ dimension, map(x,y) }` candidates. `map` maps canonical grid coordinates, excluding the quiet zone, into source pixel-edge coordinates. Pixel centers are at half-integers. Finders have centers `(3.5,3.5)`, `(n-3.5,3.5)` and `(3.5,n-3.5)`. Return candidates in preferred order; at most two per invocation are examined.

The core browser bundle requires a supplied locator for optical scanning. It can encode/render and decode already sampled matrices without jsQR. The full bundle includes only the jsQR geometry subset. Node defers loading that subset until it needs the default locator. A failed custom locator is an integration error and may throw; arbitrary callbacks are trusted application code.

## Encryption

`encrypt(text, passphrase)` returns an ordinary-text envelope (at most 8510 plaintext bytes, with a potentially lower per-code correction bound); `encodeEnvelope(bytes, options)` encodes it. `encodeEncrypted(text, passphrase, options)` combines both. `decrypt(envelopeBytes, passphrase)` verifies the tag and returns exact UTF-8 text. The passphrase must have 1–4096 UTF-8 bytes and no lone surrogate. Errors use a generic wrong-passphrase/altered-data message.

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
