# Prism 19 Optical Format 3

**Community Draft 1 · 2026-09-15 · Apache-2.0**

Format 3 extends [format 2](FORMAT.md) with larger payloads and a content registry. It keeps alphabet 1, the 25/29/…/145 grids, four-cell quiet zone, finders, pilots, shuffle, radix conversion, CRCs, RS codes, interleaving and spare equations exactly as specified there. This document changes only the transport header interpretation, payload limits and content handling. It is a community specification, not an adopted ISO standard.

## 1. Compatibility and version selection

The 16-byte protected header has the same layout and 36-digit/four-RS-block encoding. Header byte 2 MUST be 3 for format-3 symbols. Decoders MUST inspect the wire version before interpreting flags or length. Alphabet byte 5 remains 1. All format-2 symbols retain their original semantics and bounds; this extension does not redefine them.

The reference encoder emits format 2 for ordinary UTF-8 text of at most 1200 bytes and its ordinary encrypted envelopes of at most 1244 bytes. It emits format 3 for larger messages and all typed content. An explicit encoder option can require version 2 or 3; unsupported combinations MUST fail. Format-2-only readers reject format 3 rather than misinterpreting it. New readers support both.

## 2. Header flags and byte limits

Header byte 4 is allocated as follows. Values 4–255 are reserved and MUST be rejected.

| Value | Content | Minimum body bytes |
|---:|---|---:|
| 0 | UTF-8 text | 1 |
| 1 | AES-GCM-encrypted UTF-8 text | 45 |
| 2 | Typed container, version 1 | 4 |
| 3 | AES-GCM-encrypted typed container, version 1 | 48 |

Bit 0 denotes encryption; bit 1 denotes a typed container. A typed container can carry an empty binary file. The entire plaintext container, including its content type and metadata, is encrypted for flag 3.

For grid n and RS data parameter k, let `Bmax = floor((slots(n).length - 76) / 19)`. The body capacity is the greatest integer N satisfying `256^N <= 19^(Bmax*k)`. Header N counts all body bytes, including container metadata and encryption overhead. A decoder MUST validate this bound and the body-fit test before allocating body structures. The 16-bit length field does not authorize a 65535-byte body.

At the maximum 145×145 grid there are 20,488 slots after the pilots and 1,074 possible body blocks:

| Correction | k | Body / plain text bytes | Raw binary bytes¹ | Encrypted text bytes | Encrypted raw binary bytes¹ |
|---|---:|---:|---:|---:|---:|
| L | 15 | 8554 | 8550 | 8510 | 8506 |
| M | 13 | 7413 | 7409 | 7369 | 7365 |
| Q | 11 | 6273 | 6269 | 6229 | 6225 |
| H | 9 | 5132 | 5128 | 5088 | 5084 |

¹ Binary marker, default MIME type, empty filename; the container occupies four bytes. Explicit MIME and filename bytes reduce available content capacity. Encryption always adds 44 bytes. These are storage limits, not guarantees of physical readability. Filling a grid also leaves fewer spare equations; RS parity remains unchanged.

## 3. Typed container version 1

The body for flag 2, or decrypted plaintext for flag 3, has this layout:

| Offset | Bytes | Meaning |
|---:|---:|---|
| 0 | 1 | Container version: 1 |
| 1 | 1 | Content type ID from the registry below |
| 2 | 1 | M: explicit MIME byte length, 0–96 |
| 3 | 1 | F: filename UTF-8 byte length, 0–120 |
| 4 | M | Optional ASCII MIME type |
| 4+M | F | Optional UTF-8 filename |
| 4+M+F | remaining | Exact content bytes, with no Base64 encoding |

A zero MIME length selects the type's default MIME. Canonical encoders MUST omit a MIME equal to the default. Readers MAY accept an explicit spelling of that same default. A zero filename length means no supplied filename. No extra terminator or content-length field is present; the transport length determines the container boundary.

Readers MUST reject unknown container/type versions, out-of-range metadata lengths, truncated metadata, malformed UTF-8 metadata and non-ASCII MIME strings. MIME strings contain no parameters and match `^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$`. Filename bytes decode to a simple name: no U+0000–U+001F, U+007F, slash or backslash, and neither `.` nor `..`. A filename is metadata, never a path to follow automatically.

## 4. Content registry

| ID | API type | Default MIME | Content interpretation |
|---:|---|---|---|
| 1 | `binary` | `application/octet-stream` | Exact opaque bytes; empty files allowed |
| 2 | `json` | `application/json` | Strict UTF-8 JSON text |
| 3 | `calculation` | `text/x-prism-calculation` | Arithmetic expression defined below |
| 4 | `url` | `text/uri-list` | One absolute HTTP(S) URL, no whitespace |
| 5 | `image` | `image/png` | Encoded image file bytes |
| 6 | `audio` | `audio/wav` | Encoded audio file bytes |
| 7 | `contact` | `text/vcard` | UTF-8 vCard text |

Types 2, 3, 4 and 7 MUST use their default MIME. Binary permits any syntactically valid MIME. Image permits `image/png`, `image/jpeg`, `image/webp`, `image/gif`. Audio permits `audio/wav`, `audio/mpeg`, `audio/ogg`, `audio/mp4`, `audio/webm`, `audio/aac`, `audio/flac`. Other media types are not allocated for automatic preview in this draft; they may be transported as binary files.

Textual content is strict UTF-8 without normalization. JSON MUST be valid JSON text; the reference preserves the original bytes, rather than reparsing and reserializing them. URL validation does not authorize fetching or navigation. A contact MUST begin with `BEGIN:VCARD` followed by LF or CRLF, and end with a new line followed by `END:VCARD`, optionally followed by one LF or CRLF. This framing check is not validation of every vCard property.

Image and audio payloads carry the actual file, not a URL or Base64 text. The marker and MIME identify intended handling; transport validation does not establish that the media file is well formed or supported by a device. A reader can offer an ordinary file download when its media decoder cannot preview it. Audio MUST NOT start playing solely because scanning completed. Typed payloads provide defined application behavior; QR can also carry application-defined binary envelopes, so typing alone is not a uniquely Prism capability.

## 5. Calculations

Calculation bytes contain a UTF-8 expression of 1–1024 characters, at most 256 lexical tokens and at most 32 nested parser descents. Numeric tokens are decimal forms such as `12`, `12.5`, `.5`, `12.`, optionally with an exponent such as `1e-3`. Values outside the finite IEEE-754 binary64 range are rejected. Whitespace is ignored. Identifiers are case-sensitive.

The grammar, with ordinary parentheses and comma-separated function arguments, is:

```text
sum     := product (("+" | "-") product)*
product := unary (("*" | "/" | "%") unary)*
unary   := ("+" | "-") unary | power
power   := primary ("^" unary)?
primary := number | "pi" | "e" | "(" sum ")" | function "(" arguments ")"
```

Exponentiation is right-associative: `2^3^2` is 512 and `-2^2` is -4. `%` is remainder with the dividend's sign. `pi` and `e` denote the usual binary64 constants. Supported functions are `sqrt`, `abs`, `sin`, `cos`, `tan`, `log` (natural logarithm), `log10`, `exp`, `floor`, `ceil`, `round`, `min`, `max`, `pow`. Unary functions take one argument; `pow` takes two; `min` and `max` take 1–8. `round` rounds halfway toward positive infinity, matching ECMAScript Math.round. Angles are in radians. Non-finite intermediate or final results are errors; results are approximate floating-point numbers, not symbolic or exact mathematics. Implementations may differ in the last bits of transcendental results.

The scanner validates grammar but MUST NOT execute a calculation as a side effect of decoding. Evaluation is a separate application action. The reference has a handwritten bounded arithmetic parser; it never evaluates JavaScript. Assignments, variables other than the two constants, property access, scripts, URLs, imports, loops and host API calls are outside the grammar.

These user calculations are distinct from the fixed GF(19) reconstruction equations in optical spare cells. Neither mechanism transports an arbitrary program.

## 6. Encryption

Flag 1 uses the format-2 text encryption suite and its unchanged additional authenticated data, with the larger format-3 size bound. Existing `encrypt`/`decrypt` semantics therefore extend to longer text. Do not reinterpret its plaintext as a typed container.

Flag 3 uses the same PBKDF2-HMAC-SHA256 / 600,000 iterations / 16-byte random salt / AES-256-GCM / 12-byte random IV / 16-byte tag construction, with this distinct ASCII additional authenticated data:

`Prism19/protocol3/typed1/AES-256-GCM/PBKDF2-SHA256/600000`

Its envelope is `salt[16] || IV[12] || ciphertext[containerLength] || tag[16]`. Encrypt the complete version-1 container. Implementations MUST authenticate before exposing or interpreting its contents, and MUST NOT retry a different encryption context after failure. Fresh cryptographic salt and IV are required for every production encryption. There is no sender authentication or password recovery.

## 7. Acceptance and evidence

All format-2 transport acceptance requirements still apply: header/body CRC, supported fields, body fit, exact byte length, no radix overflow, zero RS padding, and strict UTF-8 for ordinary text. For flag 2, the container and type-specific textual rules MUST also validate before reporting typed content. For flag 3, an optical scanner reports verified ciphertext only; content validation follows successful decryption.

The software publishes format-3 conformance vectors in [vectors-v3.json](vectors-v3.json), generated independently with the Python encoder. The encrypted typed fixture uses fixed test-only key material and is checked with platform Web Crypto. The Python matrix reader verifies optical transport and returns typed-container bytes; it does not implement media decoding or the complete content registry validator. The JavaScript API validates the registry.

The older [vectors.json](vectors.json) remains unchanged. Software tests include maximum-size matrices, clean maximum-size optical scans, binary/structured content, encryption context separation, malformed headers/containers and bounded calculations. These do not substitute for a controlled physical study at the new sizes.
