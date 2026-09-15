# Capacity and typed payloads

QR's often-quoted 7,089 capacity is **decimal digits**, not arbitrary bytes. A maximum-size standard QR in byte mode carries 2,953 bytes at L correction. [DENSO WAVE's table](https://www.qrcode.com/en/about/versionPage/versionPage31_40.html) distinguishes its numeric, alphanumeric and binary modes.

Prism's initial 1,200-byte limit was a deliberate bound in the original software and format-2 profile. Format 3 uses the remaining supported grid capacity:

| Correction | Body / text | Binary file¹ | Encrypted binary file¹ |
|---|---:|---:|---:|
| L | 8554 B | 8550 B | 8506 B |
| M | 7413 B | 7409 B | 7365 B |
| Q (default) | 6273 B | 6269 B | 6225 B |
| H | 5132 B | 5128 B | 5084 B |

¹ No filename and default MIME. The four-byte container header, optional metadata and 44-byte encryption envelope occupy capacity. More parity reduces payload capacity. These maxima use a 145×145 grid plus its quiet zone; the glyphs require enough pixels to resolve their shapes. This is not a controlled physical-density or reliability comparison with QR or JAB.

## Use typed content

```js
const imageCode = P.encodePayload('image', pngBytes, {
  mimeType: 'image/png', name: 'icon.png', ecc: 'Q'
});
const fileCode = await P.encodePayloadEncrypted('binary', fileBytes, passphrase, {
  name: 'sample.bin', ecc: 'L'
});
const mathCode = P.encodePayload('calculation', 'sqrt(81) + 2^8 / 4');
const jsonCode = P.encodePayload('json', JSON.stringify({temperature: 23.5}));

const result = P.scan(cameraPixels);
if (result.kind === 'payload') {
  const {type, mimeType, name, data, text} = result.payload;
  // Dispatch to your application's explicit display/download controls.
}
if (result.kind === 'encrypted' && result.typed) {
  const content = await P.decryptPayload(Uint8Array.from(result.envelope), passphrase);
}
```

`P.capacity({ecc: 'Q'})` returns 6273. `P.packPayload(type, data, options).length` gives the actual container size; add 44 if encrypting. The encoder rejects oversized content rather than truncating it. Empty binary files are supported. Ordinary empty text remains invalid.

The full registry and arithmetic grammar are in [FORMAT3](../spec/FORMAT3.md). Calculations support arithmetic, powers, constants and a small set of numeric functions; they are evaluated only through `evaluateCalculation` or the demo's Calculate button. They are separate from the fixed GF(19) equations used for optical repair.

## Images and audio

Store encoded file bytes directly. Base64 consumes `4 * ceil(N/3)` characters for N bytes, about one-third more space; a Base64 marker would not add capacity. PNG/JPEG/WebP/GIF and the allocated audio MIME types can be previewed when the browser supports the codec. The decoder also provides an exact-byte download.

One code holds kilobytes, not a typical full-resolution photo or song. The demo can resize/re-encode a selected large image locally to fit, reporting the resulting dimensions and byte count. It includes a small test image and a short WAV tone. Audio files must already fit; there is no automatic audio transcoding, streaming, multi-code transfer or remote upload in this release. Image fitting changes the selected image representation; file mode preserves original bytes exactly.

QR can also transport arbitrary bytes and custom typed envelopes. Prism's registry provides common, built-in handling in its reference scanner; it does not make the same application behavior impossible with QR. The larger theoretical capacity comes from the optical alphabet, grid allocation and correction profile—not from the marker itself.

## Command line

```sh
node bin/prism19.cjs encode --input icon.png --type image --mime image/png --out code.png
node bin/prism19.cjs encode --input clip.wav --type audio --mime audio/wav --out audio.svg
node bin/prism19.cjs encode --text "sqrt(81)+2^8/4" --type calculation --out math.png
node bin/prism19.cjs decode --input code.png --out recovered.png
```

Typed decode writes the exact content bytes, with no added newline. `--json` instead emits a result object whose byte arrays are numeric JSON arrays. `--encrypt --passphrase-file key.txt` also works with typed input. Existing overwrite protection remains in force.

## Compatibility

Small ordinary messages still produce the original format-2 matrices. New typed or larger codes need a format-3 reader. Update scanners before distributing them. `code.version` reports the actual format; the library's `wireVersion` constant reports the highest version it supports. Both independent vector sets and optical capacity checks are part of release validation.
