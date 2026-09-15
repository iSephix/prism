# Prism 19 Optical Format 2

**Community Draft 1 · 2026-09-14 · Apache-2.0**

This document defines the interoperable printed/screen symbol, not a particular camera algorithm. “MUST”, “MUST NOT”, “SHOULD” and “MAY” state requirements of this community draft. There is no claim of ISO/IEC adoption or external certification. Package release numbers are separate from the wire version.

## 1. Scope and profiles

A symbol stores a nonempty UTF-8 message of at most 1200 bytes, or the encrypted representation of such a message. It uses 19 glyphs, GF(19) arithmetic, a protected header, short systematic Reed–Solomon blocks and deterministic sparse repair equations. This draft does not allocate binary-file payloads, compressed payloads, executable equations, multi-symbol chaining, animations, sender signatures or private extension flags.

Encoders MUST emit wire version 2, alphabet version 1 and one of the two defined flag values. Decoders MUST reject unsupported values. A decoder MAY support only a stated subset of correction levels or encrypted messages, but MUST disclose that limitation and MUST NOT interpret unsupported values as plaintext.

## 2. Integer and coordinate conventions

- Field elements are integers 0–18. Arithmetic is modulo 19 with nonnegative residues. Every element 1–18 has a multiplicative inverse.
- Unless explicitly stated, indexing starts at zero. A cell at `(x,y)` has row-major index `y*n+x`; x increases rightward and y downward in the canonical orientation.
- Multibyte header integers are unsigned, big-endian. Conversion of a byte sequence to radix19 uses a little-endian integer and least-significant digit first; these are intentionally different conventions.
- RNG states are unsigned 32-bit integers. Shift and multiplication rules are defined in section 5, without reliance on signed-language overflow behavior.

## 3. Optical glyphs

Each data cell is a unit square, with a white `(255,255,255)` background. RGB values below are nominal 8-bit sRGB. Physical output will vary; decoders can calibrate against the embedded references.

Every glyph, **including solid**, has an inset bounding box `0.08 <= u <= 0.92`, `0.08 <= v <= 0.92`. Outside it, the cell is white. Inside it, ink is applied where the following mask is true:

| Pattern | Ink mask inside the inset box |
|---|---|
| Solid | Always true |
| Horizontal | `abs(v - 0.5) < 0.23` |
| Vertical | `abs(u - 0.5) < 0.23` |
| Slash | `abs(u + v - 1) < 0.31` |
| Backslash | `abs(u - v) < 0.31` |

Ink is a uniform color. Ordinary boundary antialiasing is permitted when rasterizing ideal vector geometry; it MUST NOT deliberately add another information-bearing dimension. Finders and other fixed black cells use `(0,0,0)` across their whole cell, with no inset.

| Symbol | Ink RGB | Pattern |
|---:|---|---|
| 0 | 12, 16, 24 | Solid |
| 1 | 12, 16, 24 | Horizontal |
| 2 | 12, 16, 24 | Vertical |
| 3 | 12, 16, 24 | Slash |
| 4 | 12, 16, 24 | Backslash |
| 5 | 20, 48, 225 | Solid |
| 6 | 20, 48, 225 | Slash |
| 7 | 20, 48, 225 | Backslash |
| 8 | 224, 35, 48 | Solid |
| 9 | 224, 35, 48 | Horizontal |
| 10 | 0, 188, 218 | Solid |
| 11 | 0, 188, 218 | Horizontal |
| 12 | 0, 188, 218 | Slash |
| 13 | 0, 188, 218 | Backslash |
| 14 | 202, 20, 169 | Vertical |
| 15 | 238, 154, 10 | Solid |
| 16 | 238, 154, 10 | Vertical |
| 17 | 238, 154, 10 | Slash |
| 18 | 238, 154, 10 | Backslash |

These assignments are fixed. Implementations MUST NOT rerun the prototype's alphabet optimization to assign IDs. The search report in `alphabet.json` is informative, not an encoder step.

## 4. Grid, finders and references

The data grid side `n` is in `{25,29,33,...,145}`. A white quiet zone of at least four cells surrounds all sides. The nominal minimum rendered footprint is `(n+8) × (n+8)` cells. No external color strip is required. Three finders establish the canonical orientation.

Initialize every grid cell as free. Apply the following operations in order; later operations overwrite earlier ones:

1. Place finder origins at `(0,0)`, `(n-7,0)`, `(0,n-7)`. For each origin `(a,b)`, set the clipped 9×9 rectangle from `(a-1,b-1)` through `(a+7,b+7)` white. In the 7×7 rectangle beginning at `(a,b)`, set black when local x or y is 0 or 6, or when both local coordinates are in 2–4; set all its other cells white. Rectangles are clipped to the grid.
2. For every integer `i` from 8 through `n-9` inclusive, set `(i,6)` and `(6,i)` black if i is even, white if odd.
3. Set the 7×7 rectangle beginning at `(n-10,n-10)` white. In the 5×5 rectangle beginning at `(n-9,n-9)`, set black if local x or y is 0 or 4, or both local coordinates are 2; otherwise white. Its center is `(n-6.5,n-6.5)` in cell-coordinate units.

List the remaining free cells by ascending row-major index. Shuffle this list using the algorithm below. The first 38 entries are pilots. Pilot entry `i` MUST contain glyph `i mod 19`; there are two examples of every glyph. The rest form the ordered `slots` list used for the header, body and repair equations. Fixed geometry, pilots and slots do not overlap.

## 5. Deterministic RNG and shuffling

Define `next32(state)` as the new state after:

```text
state = state XOR ((state << 13) AND 0xffffffff)
state = state XOR (state >> 17)
state = state XOR ((state << 5) AND 0xffffffff)
state = state AND 0xffffffff
```

All right shifts are logical. Every call updates the stored state and returns it. To draw an integer in `[0,m)`, consume one state and return `floor(state*m / 2^32)` using exact integer arithmetic. Rejected duplicate draws still consume a state.

For the free-cell shuffle, initialize state to `0x1951a7 XOR n`. For i decreasing from `free.length-1` to 1, draw j in `[0,i+1)` and swap entries i and j. Pilots and slots are taken only after all swaps.

## 6. Bytes, radix and CRC

Plaintext is UTF-8 without Unicode normalization. A leading U+FEFF is message content and MUST be preserved. NUL bytes are valid message content. Encoders accepting UTF-16 strings MUST reject unpaired surrogates rather than silently replacing them. The length bound applies to encoded bytes, not characters.

For N bytes `b[0..N-1]`, define `V = sum(b[i] * 256^i)`. For a payload, choose the smallest d with `19^d >= 256^N`. Emit d digits `s[j]` with `V = sum(s[j]*19^j)`, zero-padding high digits. The protected byte length preserves high zero bytes. Inverse conversion MUST reject values at least `256^N` and return exactly N bytes.

All CRCs are CRC-32/ISO-HDLC: polynomial `0x04c11db7`, reflected implementation polynomial `0xedb88320`, initial value `0xffffffff`, reflected input/output, final XOR `0xffffffff`. The check value for ASCII `123456789` is `0xcbf43926`. CRC values are stored big-endian in the header.

## 7. Header

The header is exactly 16 bytes:

| Offset | Bytes | Value |
|---:|---:|---|
| 0 | 2 | ASCII `PN`, hexadecimal `50 4e` |
| 2 | 1 | Wire version, 2 |
| 3 | 1 | Body RS parameter k: 15, 13, 11 or 9 |
| 4 | 1 | 0 = UTF-8 plaintext; 1 = encrypted envelope |
| 5 | 1 | Alphabet version, 1 |
| 6 | 2 | Payload/envelope byte length N, unsigned big-endian |
| 8 | 4 | CRC32 of all N payload/envelope bytes |
| 12 | 4 | CRC32 of header bytes 0–11 |

Plaintext N MUST be 1–1200. Encrypted N MUST be 45–1244. No other flag value or k value is allocated.

Convert all 16 header bytes into **exactly 36** radix19 digits, including high zero padding. Split into four consecutive 9-digit groups. Encode each as RS(19,9). For codeword index j in 0–18 and block b in 0–3, store that field symbol in `slots[j*4+b]`. Thus the first 76 slots are the protected header.

After inverse conversion, decoders MUST check magic, version, k, flags, alphabet, N, header CRC and that the body fits the grid before using header values to size body structures. Unsupported or overflowing header values MUST fail.

## 8. Reed–Solomon and body

The correction labels select:

| Label | Code | Parity symbols per block | Minimum distance |
|---|---|---:|---:|
| L | RS(19,15) | 4 | 5 |
| M | RS(19,13) | 6 | 7 |
| Q | RS(19,11) | 8 | 9 |
| H | RS(19,9) | 10 | 11 |

These labels do not inherit QR's correction percentages. The RS code evaluates a polynomial of degree less than k at every x in GF(19), in the order 0,1,...,18. Data digits `a[0..k-1]` are the first k evaluations, not polynomial coefficients. There is a unique polynomial f with `f(i)=a[i]` for i in 0–k-1. The complete codeword is `f(0),...,f(18)`.

One explicit encoding formula is:

`f(x) = sum_j a[j] * product_(m != j) ((x-m) * inverse(j-m)) mod 19`,

where j and m range over 0–k-1. This is an extended length-19 RS evaluation code. In an ideal symbol channel, unique errors/erasures correction is possible when `2*errors + erasures <= 19-k`. Optical decoding additionally depends on detection, sampling, pilots and color/shape distinguishability.

Convert the payload to d radix19 digits. Let `B = ceil(d/k)`. Append zero digits to length `B*k`, and split into B consecutive k-digit blocks. Encode every block with RS(19,k). For j in 0–18 and b in 0–B-1, store codeword position j of block b in `slots[76+j*B+b]`.

The grid MUST provide at least `76+19*B` slots. The reference/canonical encoder chooses the smallest fitting n. A larger supported n MAY be used to supply additional repair equations; decoders MUST NOT reject a symbol solely because its grid is larger than the canonical minimum.

## 9. Spare-cell equations

Let D be the complete `B*k` padded body-data vector. Let `start = 76+19*B`. There is one equation for each remaining slot. Number these equations e from 0 through `slots.length-start-1`.

For equation e:

1. Set `column = e mod k`.
2. Initialize a fresh RNG state to `0x51ed19 XOR (((e+1)*0x9e3779b1) mod 2^32) XOR B`.
3. Initialize an ordered block list with `floor(e/k) mod B`.
4. Draw integers in `[0,B)` and append previously unselected values until the list contains `min(B,7)` blocks. Preserve insertion order. Consume every RNG draw, including duplicates.
5. In that same list order, consume one new draw in `[0,18)` per block, and add 1 to obtain its coefficient.
6. Compute `r[e] = sum(coeff[b] * D[b*k+column]) mod 19` over the selected blocks.
7. Place glyph `r[e]` in `slots[start+e]`.

All spare slots MUST contain their defined equation value, even if a decoder does not use repair equations. Coefficients are derived from e, B and k and are not transmitted. Equations are not guaranteed to be mutually independent. Decoders MAY solve a selected reliable subset; a valid equation count does not itself establish enough rank to recover missing data.

## 10. Acceptance and decoder freedom

A plaintext decoder MUST reconstruct all payload bytes, reject nonzero padding above d, reject radix overflow, verify the payload CRC and validate UTF-8 before reporting success. It MUST preserve all valid text code points, including a leading BOM and NUL. A partial symbol MUST NOT be reported as a complete message.

An encrypted transport decoder MUST validate the protected header, length, radix/padding and envelope CRC before reporting reconstructed ciphertext. It MUST NOT report decrypted plaintext until AES-GCM authentication succeeds. Failure to know the passphrase is distinct from inability to reconstruct the envelope.

Decoders are free to choose their locator, calibration, sampling, soft metrics, parity algorithm, candidate search, erasure thresholds and frame-fusion method. The provided heuristic thresholds and time budgets are not part of the wire specification. A decoder can accept a payload whose unused repair observations are damaged, provided all acceptance checks above pass; correction exists specifically to tolerate damaged observations.

Frame fusion MUST NOT combine unrelated payloads. The reference decoder keys observations by grid side and the entire verified header, including payload CRC. This is an accidental-collision guard, not cryptographic sender/session authentication. Within each scan call, it adds observations at most once across geometric hypotheses, retains at most eight recent frames and resets after a six-second gap. Applications SHOULD submit actual new captures; repeatedly submitting one image is not independent evidence. Other conforming decoders MAY use different bounded fusion policies.

CRC has a nonzero undetected-error probability and provides no defense against a malicious author. “Conformant” does not mean “authenticated”, “safe to execute”, or a guarantee of a particular real-world scan success rate.

## 11. Encrypted envelope

For flag 1, the plaintext is UTF-8 as above. The suite is fixed:

- Key derivation: PBKDF2-HMAC-SHA256, 600,000 iterations, 32-byte output, UTF-8 passphrase without normalization, fresh random 16-byte salt.
- Encryption: AES-256-GCM, fresh random 12-byte IV, 16-byte authentication tag.
- Authenticated additional data: the exact ASCII bytes `Prism19/protocol2/AES-256-GCM/PBKDF2-SHA256/600000`.
- Envelope: `salt[16] || IV[12] || ciphertext[plaintextLength] || tag[16]`.

Salt and IV MUST be drawn from a cryptographically secure random source for each production encryption. Fixed test-vector values MUST NOT be reused for real messages. The envelope adds 44 bytes. Error correction protects the entire envelope after encryption. The reference API limits passphrases to 4096 UTF-8 bytes as a resource bound; this API limit is not an extra wire field.

Implementations MUST reject authentication failure and invalid decrypted UTF-8. They MUST NOT substitute guessed text or treat a failed encrypted envelope as plaintext. The format has no sender signatures, identities, password recovery or registry of keys.

## 12. Conformance artifacts

`vectors.json` is a versioned set of complete canonical matrices and header/payload bytes. Matrix documents contain `format: "prism19-matrix"`, `wireVersion: 2` and an n×n matrix. Matrix entries mean fixed white (-2), fixed black (-1) or glyph 0–18. The matrix excludes the quiet zone. `null` is a decoder API convention for an erased observation and is not an encoded glyph.

An independent encoder should reproduce every supported canonical vector exactly. A decoder should recover those messages and reject the malformed header/payload cases in the test suite. `reference.py` provides an independent encoder and pristine-matrix reader, using Vandermonde interpolation and Python integer arithmetic. It is not an optical scanner or a full correcting decoder.

The encrypted fixture was generated independently using Python's cryptography implementation and is verified by Web Crypto in the JS suite. Its deterministic salt, IV and passphrase exist only for interoperability testing.

The format is defined by this document, with frozen vectors as corroborating examples. Report any contradiction as a specification issue; do not silently change implementations or regenerate vectors. Follow VERSIONING.md for corrections.
