# Contributing

Use the same Apache-2.0 license for contributions. By intentionally submitting a contribution for inclusion, you license it under the project's license. No separate contributor agreement is required.

1. Describe the problem or proposed change, including the behavior you expect.
2. Keep optical-format changes separate from decoder improvements. A different decoder may read the same format; changing symbol IDs, placement, checksums or arithmetic changes the format.
3. Add a focused reproducer for a bug. Do not include private messages or passphrases in captures. Include failures when reporting optical performance.
4. Run `npm test`, `npm run test:reference` and `npm run check`. Run `npm run test:optical` after scanner/format changes. Rebuild browser bundles with `npm run build` after source changes.
5. Submit a small, reviewable pull request with test results and compatibility implications.

The public wire version 2 and alphabet version 1 are frozen. Never regenerate vectors to conceal a breaking change. Follow [the versioning policy](spec/VERSIONING.md). New wire features need a proposal and a new version or an explicitly allocated compatible field. Unknown version/flag values must continue to fail closed.

Benchmarks should compare identical payloads at identical image/physical footprints and state the correction rates, frame budget and latency limit. Use separate data to choose settings and to score them. Published failure images and per-trial results are more useful than an isolated percentage.

The repository's maintainer reviews changes. This is a community draft with no independent certification body. Acceptance of a pull request does not certify an implementation or establish a new industry standard.
