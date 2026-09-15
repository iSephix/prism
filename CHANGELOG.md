# Changelog

## 0.3.2 — photographed prints and multiple codes

- Group finder markers locally so a sheet of stickers does not create a fictitious code from unrelated corners.
- Rank candidate grids using the known pilot shapes. Estimate cell positions from connected ink components, join their relative grid coordinates by confidence, and fit a smooth surface for curved paper.
- Infer the grid dimension from observed cell extents when finder widths misestimate it. Keep header checks, Reed–Solomon recovery and final payload CRC as the acceptance gates.
- Try both fitted and original finder photometry; this preserves recovery after camera downsampling.
- Give the first and periodic live frames up to 6000 ms for difficult recovery, with occasional higher-resolution capture. Still-image searches allow 8000 ms.
- Verified the three supplied physical photographs and their 1120-pixel camera equivalents against exact recovered body hashes. Add public synthetic sheet/curved-print regressions and an optional private PNG corpus runner.
- Encoding, symbol IDs and wire formats are unchanged.

## 0.3.1 — restore camera recovery

- Give every live frame the full 2200 ms recovery allowance; clean codes still return immediately. Keep 1120-pixel captures and occasional 1800-pixel attempts.
- Recover and fuse detected poses before searching additional RGB planes, preventing repeated finder work from starving error correction.
- Keep camera capture running if a browser suspends video presentation callbacks. Preserve fresh-frame deduplication, cancellation and the worker watchdog.
- Let the hosted scanner reuse its original QR / Prism 4 / Prism 8 decoder; handle partial legacy layers without reporting success.
- Add regression checks for budget starvation, stalled presentation callbacks and incomplete legacy results. Wire formats and encoded matrices are unchanged.

## 0.3.0 — larger capacity and typed content

- Add optical format 3 while preserving format-2 encoding and decoding for existing messages and prints.
- Unlock 8554/7413/6273/5132 body bytes at L/M/Q/H, with exact capacity checks and rejection before oversized allocation.
- Add a compact four-byte typed-container header, optional MIME/filename metadata and markers for binary, JSON, calculations, HTTP(S) links, images, audio and contacts.
- Encrypt typed content and metadata with a distinct AES-GCM context. Preserve the existing ordinary-text suite and independent fixture.
- Add a bounded arithmetic parser, with explicit evaluation after scanning; transport never executes arbitrary programs.
- Add demo type selection, local image fitting, image/audio samples and previews, exact-byte downloads, and larger periodic camera captures. Audio starts only through its playback control.
- Add CLI typed input/output, actual wire versions in matrix documents, independent format-3 vectors, capacity/marker/encryption tests and a maximum-size optical gate.
- Keep zero installed package dependencies. SVG exports are no longer constrained by the raster allocation limit; RGBA/PNG retains the 4-megapixel bound.


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
