# Third-party inventory

The package has **no installed npm dependencies**. Its default optical locator contains attributed third-party code. Encoding, finite-field correction, symbol classification, repair equations and matrix decoding are implemented in this project. Optional encryption uses the platform's Web Crypto implementation; PNG I/O uses Node's zlib.

| Component | License | Role | Distribution |
|---|---|---|---|
| jsQR, Cosmo Wolfe and contributors | Apache-2.0 | Finder detection, binarization and perspective mapping | `vendor/jsqr-locator.js`; included in the full browser bundle |
| jsQR source snapshot | Apache-2.0 | Reproduce and inspect the extraction | `vendor/jsqr-upstream.js` in the source release; omitted from the npm tarball |

The pinned upstream revision is [`8e6a036beafa7053dd44b1b76ac578d22b1b3311`](https://github.com/cozmo/jsQR/commit/8e6a036beafa7053dd44b1b76ac578d22b1b3311), file `dist/jsQR.js`. The captured source uses LF line endings. Exact SHA-256 values for the captured source and generated locator are in [vendor/provenance.json](vendor/provenance.json).

`node scripts/extract-locator.cjs` retains only modules 0, 4, 11 and 12 and wraps them as `locate(rgba, width, height)`. It removes the QR payload decoder, QR Reed–Solomon implementation and character tables from the runtime locator. It does not rewrite the retained algorithms. Generated files carry modification notices. The [upstream license](vendor/LICENSE-jsQR.txt) is included alongside the project's [LICENSE](LICENSE) and [NOTICE](NOTICE).

The prior web experiment also contained the MIT-licensed `qrcode-generator` for QR/Prism 4/Prism 8 comparisons. That component and those legacy formats are not part of this standalone release. There is no JAB or HiQ code in this distribution.

Apache-2.0 permits redistribution under its conditions, including retaining the license and applicable notices and marking modifications. See the [license text](https://www.apache.org/licenses/LICENSE-2.0), especially sections 3 and 4. Projects can provide their own optical locator through `scan(image, { locate })`; the format does not depend on jsQR.
