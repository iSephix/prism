# Changelog

## 0.2.0 — faster scanning and damaged-code recovery

- Keep optical format 2 and alphabet 1 unchanged; all frozen matrices and existing prints remain compatible.
- Cache sampled observations, streamline spatial classification and GF(19) elimination, and avoid soft searches on clean codewords.
- Recover from washed-out pilot copies and inconsistent recovery equations using bounded, confidence-ranked candidates checked against the complete packet CRC.
- Add session pose tracking, duplicate capture IDs, cooperative `maxTimeMs` budgets, optional stage diagnostics and `timedOut` on unfinished searches.
- Schedule fresh camera frames after completed work, interleave fast and deeper attempts, and cancel outstanding work when the camera stops. Expose light, zoom and continuous focus when supported.
- Add a physical print-width control and cache raster glyph tiles for faster PNG/RGBA generation.
- Add paired baseline benchmarks and regression tests for recovery, tracking, budgets and the camera lifecycle. See [benchmark evidence](docs/BENCHMARKS.md).

No new package dependencies; the existing attributed jsQR geometry subset and platform Web Crypto remain.

## 0.1.0 — first standalone release

- Extract Prism 19 from the original web experiment; retain optical wire version 2 and alphabet version 1.
- Provide Node CJS/ESM, browser bundles, TypeScript declarations, a CLI and a standalone camera demo.
- Remove coupling to the legacy QR encoder. Extract only jsQR geometry behind a replaceable locator.
- Freeze the actual 19-symbol geometry and provide a complete normative specification, conformance matrices and an independent Python implementation.
- Retain GF(19) Reed–Solomon correction, interleaving, spare-cell equations, confidence-guided recovery, sampling refinement, neighboring-cell hypotheses and up-to-eight-frame fusion.
- Preserve the complete hard-decision path before expensive recovery attempts.
- Preserve a leading UTF-8 BOM as message content. Reject unpaired UTF-16 surrogates at the public API instead of silently replacing them.
- Validate image, symbol-matrix, code-envelope and option inputs; bound PNG parsing and decompression.
- Preserve compatible optional AES-256-GCM envelopes and add an independently generated encryption vector.
- Add Apache-2.0 licensing, attribution, dependency provenance, contribution guidance and reproducible release checks.
