# Publishing a release

The public source repository is [iSephix/prism](https://github.com/iSephix/prism). The npm package name `prism19` is proposed; availability and ownership must be checked when publishing. Uploading this source does not publish an npm package.

## Verify the release candidate

Use Node 22+ and Python 3.10+. No dependency install is needed to build or test the JavaScript implementation.

```sh
npm run build
npm test
npm run test:reference
npm run test:optical
npm run test:extensions
npm run check
npm pack
```

The resulting `prism19-0.3.4.tgz` is installable directly without a registry publication. For example, install that file into another project with `npm install /absolute/path/to/prism19-0.3.4.tgz`, then import `prism19`. Do not regenerate `spec/vectors.json` during an ordinary release.

For decoder changes, also run the [paired benchmark](BENCHMARKS.md) against the published baseline. Keep the per-case report and source hashes with the release's validation evidence. If TypeScript is available separately, run `tsc --project test/tsconfig.json`; the runtime package does not depend on the compiler.

## Tag the verified release

After the release checks pass on the commit to publish, create and push its tag from a clone of the repository:

```sh
git tag -a v0.3.4 -m "Prism 19 reference implementation 0.3.4"
git push origin v0.3.4
```

Repository description: “Open 19-symbol optical format, GF(19) error recovery, camera scanner, and independent conformance vectors.” Suggested topics: `barcode`, `optical-code`, `reed-solomon`, `computer-vision`, `open-standard`.

Enable private vulnerability reporting, then use the repository's release interface to publish the tag with the source archive, npm tarball and SHA-256 checksums. Use CHANGELOG.md for the release body. Describe it as a community draft/reference implementation; do not describe it as ISO approved or benchmarked superior to JAB.

## Publish the optional npm package

Confirm that the publishing account controls `prism19`; otherwise choose an available scoped name and update package metadata and examples before packing again. Then, from the verified source:

```sh
npm publish --access public
```

This command publishes permanently to the selected npm account/registry. Authenticate directly with npm or configure its trusted publishing flow. No registry credentials belong in source files. The repository intentionally includes test CI without automatic registry publishing.

## Future versions

Follow spec/VERSIONING.md. A release must reproduce both sets of frozen format-2/3 vectors and preserve decoding of existing format-2 codes. Record any known failure, compatibility change or new limitation in CHANGELOG.md. Include fresh optical results when changing the decoder and independent vectors when proposing a new format.
