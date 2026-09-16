# Validation and remaining evidence

This release has several distinct evidence sources. Keep them separate when reporting results.

## Format 3 capacity and content

Version 0.3 adds six independently generated format-3 vectors while retaining the seven original vectors. Tests exercise every correction level at its exact maximum byte capacity, both sides of the byte-limit boundary, all content markers, exact binary output, malformed containers, encryption context separation and bounded calculation grammar. The demo's calculation and typed-decryption paths are exercised through its actual worker message contract.

`npm run test:extensions` performs four maximum-capacity and three typed-content optical scans using only pixels. The recorded [format-3 optical report](benchmarks/extensions-0.3.0.json) identifies its runtime and sizes. These are clean synthetic renders; physical print success reported for earlier codes does not validate the new maximum sizes. The earlier [0.2 paired benchmark](BENCHMARKS.md) remains historical evidence and has not been relabeled as a 0.3 comparison.

| Evidence | What it supports | What it does not establish |
|---|---|---|
| Frozen matrices reproduced by JS and independent Python | Byte/field/placement interoperability | Camera performance |
| Independent AES-GCM fixture read by Web Crypto | Encrypted-envelope interoperability | Password strength or an audit of the full application |
| Seeded RS errors/erasures, parser and boundary tests | Correctness for the exercised cases | Formal proof of every implementation path |
| Blind raster and synthetic camera trials | End-to-end recovery in the specified simulator | Real-world population success rates |
| User reports of another-phone-screen scanning and successful printed-code scans (2026-09-15) | Encouraging physical feasibility evidence | A controlled phone/print benchmark, validation of every 0.2 change, or JAB advantage |

`prototype-measurements.json` is an unchanged historical report from the earlier application. Its date, runtime and decoder differ from this standalone release. `npm run test:optical` writes fresh results into the ignored `release/` directory. Test timing depends on the machine. No decoder receives the expected message, matrix coordinates or simulator transform in the optical tests.

The [0.1-to-0.2 paired benchmark](BENCHMARKS.md) records both decoders on identical images, with a frozen baseline source and alternating execution order. It includes damaged pilots, inconsistent spare-cell equations and negative images. The small seeded suite is a regression and mechanism check, not a population reliability estimate.

## Decisive mechanism tests

- Remove every optical body cell of one complete RS block: plain block decoding fails, then spare-cell equations reconstruct the original data with a matching whole-packet CRC.
- Construct two complementary damaged images, each undecodable independently: a shared frame session reconstructs the exact message with equations disabled.
- Corrupt more low-confidence symbols than the hard-decision radius: confidence-guided erasure/candidate decoding includes the correct codeword.
- Test the enhanced path against the hard-only decoder on identical seeded images; enhanced decoding must preserve observed hard-path successes.
- Erase one set of calibration pilots and corrupt repair glyphs while a whole body block is missing: fallback calibration and confidence-ranked equation subsets recover exact bytes.
- Change the message at a tracked position and replace the image with a blank: the scanner must return the current verified message or no result, never a cached payload.
- Drive the actual camera demo with controlled video callbacks and worker replies: duplicate timestamps are skipped, only one decode is outstanding, hardware controls retain capture constraints, and cancellation releases the camera and worker.

These are controlled demonstrations of specific mechanisms. They do not imply that every distortion benefits from every decoder option. Neighboring-cell and sampling refinements remain heuristic. The extra equations may be dependent or unreadable. Header detection remains a prerequisite for the recovery paths.

## Physical benchmark procedure

1. Fix a payload set, physical/screen footprint, camera resolution, correction parameters, frame limit and wall-clock time limit.
2. Compare Prism 19 with QR and JAB using working reference encoders/decoders. Correction labels are format-specific; report actual rates and total overhead. JAB is not included in this repository.
3. Use several phones, displays and printers. Vary distance, tilt, light, glare, focus, motion and damage. Include small and large payloads.
4. Keep calibration/tuning captures separate from the final test set. Preserve failures, exact byte comparisons and time to first correct decode.
5. Publish per-trial records and aggregate confidence intervals. Do not infer broad reliability from a handful of successful scans or simulator seeds.

The current simulator covers limited perspective, blur, noise, desaturation and a white patch. It omits physical spectral response, ink bleed, JPEG, glare, rolling shutter and lens distortion. The format's high nominal base does not establish higher useful density if the glyphs require larger modules.

## Running the checks

`npm test` is the deterministic default gate. `npm run test:reference` verifies the vectors in Python. `npm run test:optical` runs the longer optical gate. `npm run check` checks package contents, attribution, source syntax, bundle consistency and the frozen vectors. CI configures these checks on current Node 22/24 runners; local release reports identify the environment actually exercised. A configured workflow is not a claim that GitHub has run it.

The 0.3.1 camera regression checks cover a recognized code with an erased Reed–Solomon block under a slow-locator clock, stalled video presentation callbacks, and incomplete legacy layer results. These reproduce software failure modes; they do not substitute for testing the user’s particular camera and printed sample.

The 0.3.2 physical regression corpus contains three private photographs: a six-sticker sheet, a dense single code, and an angled sticker sheet. All three original 1080×1440 images and all three 840×1120 camera equivalents recover matching body SHA-256 values. The sticker photographs recover the same 124-byte encrypted envelope; the dense print recovers 1194 bytes of plaintext in a 69×69 grid. No passphrase was supplied, so encrypted plaintext authentication was not tested. The prior 0.3.1 reader returned no result on all three full photographs even with a 10-second budget. These six cases are a regression corpus, not a general physical success rate.

Public automated regressions generate a six-code sheet and a curved dense code with independent test payloads. To run an additional private corpus, use `npm run test:physical -- /path/to/manifest.json`. Each manifest entry supplies a PNG path, expected result kind and expected body SHA-256; see `test/physical.cjs`. Camera captures, expected content and hashes are not bundled in the release.


The 0.3.3 development checks add a fourth private full photograph, its camera-sized
copy, and a crop of that same print. The 0.3.2 reader misses the new full image and
camera-sized copy on this host. The smaller crop already decodes on this host,
even though the user reports failure when choosing that image on their phone.
This difference is unresolved without evidence captured by that phone.

All nine retained image cases recover matching optical body bytes through the
reference worker with a 6000 ms search allowance in an isolated JavaScript host.
Encrypted bytes are recovered without a passphrase; plaintext authentication is
not claimed. These are tuning/regression images, not held-out physical trials.

The reference demo now records the real camera capture dimensions, decoder/worker
versions, stage measurements and errors. Its optional lossless frames can be
replayed with `npm run test:report`. Camera tests exercise worker progress,
continuation after a timeout, lens selection, freezing during an active decode,
and report export without decoded content or passphrases. No current live phone
success rate is established by these software tests.


The [0.1-to-0.3.3 paired synthetic report](benchmarks/results-0.3.3.json) records
48 cases, two alternating trials per decoder and source hashes for the retained
0.1.0 baseline and candidate. It reports no accepted wrong payloads and no lost
baseline successes in this suite. It is a synthetic regression comparison, not a
measurement of the user's v0.1 phone session or evidence of general camera superiority.
