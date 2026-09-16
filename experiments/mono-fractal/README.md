# PRISM Mono-Fractal Capacity Lab

Experimental, monochrome-only measurement tool for estimating how many spatial states survive a real printer → paper → camera channel.

This does **not** change the Prism 19 wire format. It is deliberately isolated under `experiments/`.

## Run

```sh
npm run demo
```

Open:

```text
http://localhost:8080/experiments/mono-fractal/
```

The browser does all target generation and analysis locally. No image is uploaded.

## First experiment

1. Select a macrocell pitch. Start at **2.0 mm**.
2. Download the SVG.
3. Print it **twice** on the same printer/paper at **100% / actual size**. Disable “fit to page”, scaling, smoothing and photo enhancement where possible.
4. Mark the physical pages A and B without covering the target.
5. Photograph A with all four square fiducials visible. Prefer the phone's full-resolution still-photo mode rather than a screenshot.
6. Load A and build templates.
7. Photograph the independently printed page B under the same conditions.
8. Load B and run the blind test.
9. Export the result JSON.
10. Repeat at 1.0, 1.5, 2.0, 2.5 and 3.0 mm.

Then repeat promising pitches under harder conditions: normal indoor light, ~20° angle, ~35° angle, and increased distance.

## Target

- 256 candidate symbols.
- Each symbol is an **8×8 black/white microtexture**.
- Every symbol contains exactly 32 black and 32 white microcells.
- Row/column occupancy and transition-count constraints reject trivial low-frequency patterns.
- A deterministic greedy max-min Hamming search chooses the 256 candidates.
- A 32×32 sheet contains every symbol four times in a deterministic shuffled layout.
- Four large black fiducials define the projective measurement square.

The target is vector SVG so printer resolution, rather than a pre-rasterized bitmap, sets the physical dot structure.

## Decoder

The browser:

1. estimates the four fiducials (manual correction is available),
2. computes a projective mapping from target coordinates into the photograph,
3. samples each macrocell at 12×12 points from an analysis image up to 8192 pixels on its longest side,
4. locally normalizes every patch for mean and contrast,
5. learns one mean template per symbol from print A only,
6. classifies every print-B observation by squared template distance,
7. produces the full 256×256 confusion matrix,
8. constructs nested 16/32/64/128/256-state codebooks using only distances between print-A templates,
9. evaluates those codebooks on print B.

No neural network is used in this first experiment; the aim is to characterize the physical channel before optimizing a learned decoder.

## Metrics

The primary raw measurement is held-out symbol accuracy on print B.

The UI also reports two information estimates:

- **Fano lower bound:** a conservative lower bound derived from the held-out classification error and alphabet size. Use this as the headline capacity proxy.
- **Plug-in I(X;Ŷ):** mutual information of the observed confusion matrix. It is useful descriptively, but with only four held-out observations per state it can be positively biased and must not be presented as a proven channel capacity.

Both are divided by macrocell area to obtain bits/mm².

The experiment does **not** yet include an ECC simulation, payload framing overhead, finder overhead, neighboring-cell joint decoding, multi-frame super-resolution, hierarchical coarse+fine symbols, or continuous-texture modulation. Therefore the result is not yet a deployable user-byte capacity.

## Validity rules

A run is invalid if:

- A and B are the same physical print;
- the SVG was scaled differently between A and B;
- a fiducial overlay is visibly misplaced;
- the page is cropped so a fiducial is missing;
- print B influenced symbol/codebook selection;
- a result from one pitch is compared to another using different print scaling.

For a strong result, repeat the complete A/B process with a newly printed pair and a different seed.

## What success means

At a 2 mm pitch, current Prism 19's 4.248 nominal bits/cell correspond to about 1.062 nominal bits/mm² before its protocol overhead and optical losses.

If monochrome microtextures produce a robust held-out lower bound materially above that density, the next step is a hierarchical symbol in which a low-frequency coarse PRISM state remains readable at distance while the microtexture carries an additional high-resolution payload.

If 256 states are nearly perfect, expand the candidate pool/alphabet. If 256 performs poorly but a 32/64/128 subset is clean, use the best empirical subset instead of forcing a power-of-two target.
