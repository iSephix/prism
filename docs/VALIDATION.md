# Validation and remaining evidence

This release has several distinct evidence sources. Keep them separate when reporting results.

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
