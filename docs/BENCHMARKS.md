# Paired decoder benchmarks

These results compare the published 0.1.0 implementation with 0.2.0 on identical RGBA images. They measure a small synthetic regression suite, not phone or printer population performance. Both versions use optical format 2 and alphabet 1.

Recorded 2026-09-15T13:27:33.229Z on v24.19.0, linux/x64, INTEL(R) XEON(R) PLATINUM 8573C. Baseline commit: `e4f51d5f0f9f857bb6c0c167184b728b79df9829`. [Full paired report](benchmarks/paired-0.2.0.json) includes source SHA-256 hashes and every attempt.

## Recovery and elapsed time

42 code images and six negative images, two attempts per image and version, alternating version order. A code case passes only when both attempts recover the exact text. Negative cases pass when neither attempt accepts a message. The decoder receives only pixels; expected text is used after scanning for assertions.

| Image group | Cases | 0.1 exact / rejected negatives | 0.2 exact / rejected negatives | 0.1 median ms | 0.2 median ms |
|---|---:|---:|---:|---:|---:|
| clean | 6 | 6 | 6 | 45.2 | 67.6 |
| moderate | 6 | 6 | 6 | 98.3 | 61.9 |
| small-blurred | 6 | 6 | 6 | 51.0 | 30.7 |
| patch-damage | 6 | 2 | 6 | 2125.8 | 403.9 |
| uneven-light | 6 | 6 | 6 | 46.6 | 34.8 |
| pilot-damage | 6 | 4 | 6 | 63.2 | 47.5 |
| unreliable-equations | 6 | 1 | 6 | 1958.2 | 110.6 |
| negative | 6 | 6 | 6 | 352.0 | 188.4 |

**Exact recovery improved from 31/42 to 42/42 code images.** Both versions rejected all six negatives; no incorrect accepted payload was observed. No previously successful image was lost. Group timing medians include failed attempts, which can consume the search budget; they are not speedups conditioned on successful decoding.

The suite includes six clean payloads (Unicode/BOM/NUL, long text and high correction), four camera profiles with seeds 911–916, six cases erasing 1/3/5/8/12/19 pilot copies, and six cases erasing a complete body block while corrupting 1–6 repair glyphs. The camera profiles cover blur/noise/perspective, a small footprint, 3% white patch damage and an added illumination gradient. Negative images are white, black and four seeded noise fields. See the script for exact profiles.

## Repeated poses and raster generation

A separate microbenchmark submits the same clean image eight times to one session. This isolates pose reuse; identical images are not independent camera evidence. The first frame performs finder detection. In 0.2 all seven subsequent frames decoded their payload again with zero locator calls. Excluding the first frame, median scan time was 54.3 ms in 0.1 and 5.4 ms in 0.2.

RGBA generation uses four measured attempts after one warmup at 12 pixels per module, with alternating version order. This measures rendering, excluding byte encoding, PNG compression and disk writes.

| Payload bytes | Raster width | 0.1 median ms | 0.2 median ms |
|---|---:|---:|---:|
| 12 | 396 px | 9.09 | 0.27 |
| 165 | 492 px | 12.46 | 0.40 |
| 1200 | 924 px | 69.81 | 12.81 |

## Clean-image timing follow-up

The paired run showed a slower aggregate clean-image median. An additional check used the same six clean images, one warmup and eight measured alternating-order attempts per version. It found mixed results on small clean images and faster scans on the two large ones. This update does not guarantee lower latency for every image. Both the original result above and [all follow-up samples](benchmarks/clean-timing-0.2.0.json) are retained.

| Clean case | Width | 0.1 median ms | 0.2 median ms |
|---|---:|---:|---:|
| clean-0 | 396 px | 33.9 | 30.5 |
| clean-1 | 396 px | 25.4 | 23.9 |
| clean-2 | 396 px | 19.7 | 21.2 |
| clean-3 | 492 px | 46.4 | 38.1 |
| clean-4 | 924 px | 211.4 | 184.1 |
| clean-5 | 924 px | 199.7 | 183.6 |

## Reproduce the main comparison

From a clone containing the published history, create a separate baseline worktree and run the paired script on an otherwise idle machine:

```sh
git worktree add --detach ../prism-baseline e4f51d5f0f9f857bb6c0c167184b728b79df9829
npm run benchmark -- --baseline ../prism-baseline --baseline-commit e4f51d5f0f9f857bb6c0c167184b728b79df9829
```

The output goes to `release/benchmark-results.json`. The optional commit argument records the caller-supplied baseline identity; source hashes record the files actually loaded. A lost baseline success or wrong accepted payload fails the command. For the clean timing follow-up, use the same first six image definitions with eight measured alternating-order attempts after one warmup per image/version.

The [ordinary optical gate report](benchmarks/optical-0.2.0.json) also records 20 clean scans across all correction levels, whole-block equation recovery, complementary-frame fusion and 24 seeded hard/enhanced comparisons.

## Limits

Timing varies with CPU load, runtime, JIT compilation and garbage collection. Two attempts per main-suite case do not estimate latency tails. The finite seeded set is not an unbiased reliability sample, and zero wrong outputs here does not establish a false-positive rate. Calibration and equation-subset recovery remain bounded heuristics; all candidates still require packet validation.

These measurements do not include new physical captures, energy consumption or a JAB/QR baseline. The user reported successful printed-code scanning before this update. Existing matrices are unchanged, but camera behavior and new controls still need evaluation on diverse phones and prints. See [VALIDATION](VALIDATION.md) for the physical trial procedure.
