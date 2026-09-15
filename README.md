# Prism 19

**An open color-and-pattern format for carrying a message through a camera.**

Prism 19 uses 19 optical symbols, Reed–Solomon correction over GF(19), and spare-cell equations that connect data blocks. The reference scanner combines calibrated symbol costs, errors/erasures recovery, bounded spatial hypotheses and evidence from up to eight frames. Messages can be encrypted locally with a passphrase.

It requires a Prism 19-compatible scanner. Existing QR-only camera readers cannot decode this format.

This is the **0.1.0 reference implementation** of **Optical Format 2, Community Draft 1**. Format 2 preserves codes produced by the original Prism 19 experiment. It is a proposed community specification; it has not been adopted by a standards organization. Its nominal alphabet capacity is 4.248 bits per cell before overhead. Useful density depends on camera resolution, lighting and correction settings.

## Try it

Requires Node.js 22 or newer. No package installation or build step is needed from the source release.

```sh
git clone https://github.com/iSephix/prism.git
cd prism
npm run demo
```

Open **http://localhost:8080/examples/**. Generate a code, export PNG/SVG, upload a photo or use the camera. Phone cameras need an HTTPS host. To host the demo statically, serve the release directory and open `examples/`; it needs no backend, database, account or remote API.

## Use the library

From the extracted release directory:

```js
const Prism19 = require('./index.cjs');
const fs = require('node:fs');

const code = Prism19.encode('Hello, physical world.', { ecc: 'Q' });
fs.writeFileSync('message.svg', Prism19.toSVG(code));

// Supply RGBA camera/image pixels to scan a photograph.
const result = Prism19.scan(Prism19.toRGBA(code));
if (result.kind === 'prism19') console.log(result.text);
```

ES modules use `index.mjs`. A browser can use `browser.mjs` or the ready-made `dist/prism19.js` global bundle. `browser-core.mjs` / `dist/prism19-core.js` omit the third-party locator. Node loads the default locator only when `scan()` needs it. TypeScript declarations ship in `index.d.ts`.

```js
const code = await Prism19.encodeEncrypted('Private message', passphrase);
const result = Prism19.scan(cameraRGBA);
if (result.kind === 'encrypted') {
  const text = await Prism19.decrypt(Uint8Array.from(result.envelope), passphrase);
}
```

The format carries 1–1200 UTF-8 bytes. Encryption adds 44 bytes before error correction. It uses AES-256-GCM and PBKDF2-SHA256 with 600,000 iterations, random salt and IV. Encryption is optional; passphrases are not part of the code. CRC checks accidental corruption; the GCM tag checks encrypted-message integrity. Neither establishes a sender's identity.

## Command line

```sh
node bin/prism19.cjs encode --text "Hello" --out hello.png
node bin/prism19.cjs decode --input hello.png
node bin/prism19.cjs encode --input message.txt --out matrix.json
node bin/prism19.cjs --help
```

The CLI encodes SVG, PNG or symbol matrices and reads PNG or matrix JSON. It accepts a passphrase file for encryption/decryption and avoids overwriting files unless `--force` is supplied. Browser image scanning supports the image formats your browser can open; the CLI PNG reader supports bounded, non-interlaced 8-bit images.

## Implement the format independently

- [Normative format specification](spec/FORMAT.md): exact glyphs, geometry, byte order, checksums, parity, placement, PRNG and equations.
- [Frozen conformance vectors](spec/vectors.json): full symbol matrices, Unicode/BOM/NUL cases and an encrypted test vector.
- [Independent Python implementation](spec/reference.py): encoder and pristine-matrix verifier, using only the Python standard library.
- [API and integration guide](docs/API.md): scanner results, custom locators, frame sessions and limits.
- [Compatibility and versioning](spec/VERSIONING.md): software, wire and alphabet versions have separate meanings.

## Verify and contribute

```sh
npm test
npm run test:reference
npm run test:optical
npm run check
```

`npm test` runs deterministic unit, protocol, parser, CLI and browser-bundle/worker checks. `test:reference` requires Python 3.10+ and cross-checks the specification vectors. `test:optical` records seeded synthetic camera tests, whole-block repair and multi-frame recovery. It never gives the optical decoder the expected text or grid map.

See [VALIDATION](docs/VALIDATION.md), [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md), [CHANGELOG](CHANGELOG.md) and [RELEASING](docs/RELEASING.md).

## License and status

Apache-2.0 covers the implementation, documentation and specification. Retained jsQR geometry is Apache-2.0 with its notices preserved. The package has no installed npm dependencies. See [THIRD_PARTY](THIRD_PARTY.md).

The prototype received a positive report of phone scanning from its user. The release includes reproducible software tests; there is no published controlled phone/print study or JAB comparison. Claims of a universally optimal alphabet, production reliability or superiority over other formats are not established. Current limitations and the physical benchmark procedure are documented in [VALIDATION](docs/VALIDATION.md).
