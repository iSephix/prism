# Higher-base experiment — PX-1

The validated Prism 19 implementation (0.3.4) remains pinned to
[`d6f17d2`](https://github.com/iSephix/prism/tree/stable/validated-0.3.4).
The user confirmed strong camera performance and one successful black-and-white
edge case on 2026-09-19. That observation does not establish general monochrome
support. `stable-baseline.json` fixes the exact core, camera and vector hashes.

Open the Experimental tab in the reference demo, or run `npm run demo` and open
`/experiments/higher-base/`. This experiment has its own packet format, field
implementation, alphabets, camera worker, reports and registration fork. The
stable scanner does not import its code. Existing Prism 19 codes are unchanged.
PX codes must be scanned in the experiment with the matching base selected.

## Objective and rationale

The objective is verified payload bytes per square millimeter at an acceptable
scan time and success rate. Raw alphabet size alone does not answer this question.
The useful density is payload bytes divided by the full printed area, including
the quiet zone. Payload excludes headers, calibration and error correction.

An alphabet of q symbols has a nominal ceiling of log2(q) bits per cell, assuming
all symbols remain distinguishable. The logarithmic measure follows
[Shannon's information model](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf).
The three experiment sizes give exact bit packing and finite fields for RS codes:

| Alphabet | Raw bits/cell | Raw gain over 19 | Cell-width increase erasing that gain* |
|---|---:|---:|---:|
| 19, stable | 4.248 | — | — |
| 32 | 5 | 17.7% | 8.5% |
| 64 | 6 | 41.2% | 18.8% |
| 128 | 7 | 64.8% | 28.4% |

\* sqrt(log2(q)/log2(19)) − 1; ignores differences in overhead and correction.
No optimum, maximum physical density or advantage over QR/JAB is claimed.

The original implementation selected 19 glyphs heuristically from 35 color/shape
candidates; it did not demonstrate that base 19 is optimal. PX searches 128
candidates (8 inks × 16 masks) using deterministic multi-start max-min selection
under three fixed synthetic channel profiles. `search-alphabet.cjs` reproduces
`profiles.js`. IDs are frozen for PX-1. Base 128 uses the complete pool and is a
stress test, not an assertion that all 128 symbols will remain useful on paper.

## Initial results

The first 64 simulated trials recovered no incorrect payloads. At 420 pixels
across the whole code, all four bases passed all eight moderate-channel trials.
All reached the largest tested 2,048-byte size; this does not establish a density
winner. The smaller 300-pixel cases exposed substantial differences:

| 300 px, Q correction | Stable 19 | PX 32 | PX 64 | PX 128 |
|---|---:|---:|---:|---:|
| Moderate channel, 512 bytes | 2/2 | 2/2 | 2/2 | 2/2 |
| Moderate channel, 2,048 bytes | 2/2 | 0/2 | 0/2 | 0/2 |
| Grayscale, 512 bytes | 2/2 | 2/2 | 2/2 | 0/2 |
| Grayscale, 2,048 bytes | 0/2 | 0/2 | 0/2 | 0/2 |

The optimized stable decoder currently wins the dense, small-image case. This
compares complete implementations, not just their alphabets. Higher-base
physical superiority is still an open research question. Two trials per setting
are a small development check, not an estimate of deployment reliability.

Raw results: [moderate channel](results-print.json),
[smaller and grayscale captures](results-stress.json). Stress-run timings were
not isolated from other local tests and should not be used for speed claims.
All three exported SVGs also recovered exact bytes after independent rendering
with Inkscape at 900 pixels. [Validation record](validation.json) includes source
hashes. No private photographs, reports or decoded user messages are published.

Reproduce the simulations from the repository root (output names are examples):

```
node experiments/higher-base/run-benchmark.cjs print /tmp/px-print.json
node experiments/higher-base/run-benchmark.cjs stress /tmp/px-stress.json
npm test
```

## Reproducible density comparison

The browser comparison uses four payload sizes (128/512/1024/2048 bytes), two
fixed seeds, and all four alphabets. Every case uses the same message, full print
width, projected pixel footprint, channel settings and 3000 ms decoding budget.
The original 0.3.4 simulator is isolated and adapted only to render either codec.
Decoders receive RGBA pixels; they never receive expected text, matrices, corners
or simulator transforms. A success requires an exact byte-for-byte match.

The table's "largest passing size" requires both seeds to pass at that size.
It is the largest *tested* passing size, not a measured capacity maximum. The
physical width is a declared simulation parameter, not a calibrated printer or
camera measurement. Pixels/mm means the projected footprint in this simulator.
The simulator omits real printer gamut, ink bleed, JPEG, focus hunting, motion,
rolling shutter and spectral response. Grayscale conversion is not a model of
every black-and-white printer's dithering or thresholding.

Correction labels have similar but different rates. At Q, stable uses k/n=11/19
and PX uses 18/31. All PX bases share the same 31-symbol block length and rate.
Stable retains its existing equations and frame fusion; PX currently uses only
per-image soft RS recovery. Alphabet separation scores are synthetic distances,
not measured channel capacities. Physical tests are the next validation step.

For a phone test, select the matching base, print at a measured width and 100%
scale, scan, then save the report. Repeat across payload, size, light and tilt;
keep failed trials too. Optional frames can reveal printed content. Reports have
no network upload and omit recovered payloads from metadata. Replay with:

```
node experiments/higher-base/replay-report.cjs /path/to/report.json
```

## PX-1 packet format

All multibyte header integers are big-endian. Symbols use MSB-first bit packing,
with trailing zero padding checked on decode. Supported bases are 32/64/128
(bits 5/6/7); field polynomials are 0x25/0x43/0x89 respectively. Addition is XOR;
multiplication is carryless reduction. No integer-modulo shortcut is used for
these nonprime alphabet sizes.

Short systematic Reed–Solomon evaluation codes have n=31 distinct evaluation
points 0…30. The first k values carry data. Body k is 24/21/18/15 for L/M/Q/H.
Two header blocks each use k=15. Soft decoding considers confidence-ranked
erasures, with bounded body alternatives and a mandatory final payload CRC32.

The 16-byte header contains: `50 58` (PX), experiment version 1, bits/symbol,
grid side, body k, 16-bit byte length, payload CRC32 and header CRC32. After bit
packing and zero padding to 30 symbols, its two RS codewords are interleaved into
62 cells. Its version/magic cannot be accepted as a Prism 19 header.

Grid sizes are 25,29,…,145. Finder, timing and alignment cells use the frozen
Prism layout. Its deterministic free-cell ordering is retained; the first 2q
free cells are two copies of each pilot, followed by the 62 header symbols and
interleaved body blocks. Remaining cells are deterministic filler, not claimed
as additional capacity or correction. Minimum grids depend on actual overhead.

Headers, physical geometry, correction and payload CRC must all validate before
acceptance. CRC detects corruption; it is not authentication. This experiment
carries text or raw bytes and does not inherit the stable app's typed payload or
encryption suites. It never executes decoded content.
