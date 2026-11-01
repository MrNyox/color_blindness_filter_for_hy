# Color Vision Mapper

A Chrome Manifest V3 extension that applies a one-way color mapping calibrated from the six pairs in the supplied image.

## Install in Google Chrome

1. Download and extract `color-vision-mapper.zip`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Select **Load unpacked**.
5. Choose the extracted `color-vision-mapper` folder (the folder containing `manifest.json`).
6. Pin **Color Vision Mapper** from Chrome's Extensions menu.
7. Open the extension popup to toggle the effect and adjust its intensity.

The transform is enabled at 100% by default. Set intensity to 0% or switch it off to return to the original page colors.

## How the mapping works

The mapping is intentionally one-way:

- Colors near a left-hand reference swatch are shifted toward its paired right-hand color.
- The six right-hand reference colors are fixed points and are not shifted toward the left-hand colors.
- Nearby shades transition smoothly, rather than only changing the exact sampled RGB value.
- At 100% intensity, the six sampled left-hand colors map to their paired right-hand colors.

This avoids the previous version's global RGB matrix, which also changed colors that your friend already sees as the right-hand reference colors.

The extension uses localized SVG filter masks and per-pair channel translations. All processing happens locally in the browser.

The output is pixel-identical to version 1.1.0. The filter graph was re-packed so that the six 3-D masks are computed three-at-a-time in shared RGB channels: 50 filter primitives instead of 72. The filter region is also clamped to the element box (`-1% … 102%` instead of `-5% … 110%`), which shrinks the rasterised surface on every pass.

## Performance notes

SVG reference filters (`filter: url(#…)`) are rasterised on the CPU, so each filter primitive costs a full-screen pass. Even after packing, the exact six-pair mapping needs about 50 passes over the visible area, which is far more expensive than an unfiltered page. On very long, image-heavy pages (image search grids, galleries) scrolling will therefore stay heavier than on a normal page. Turn the transformation off from the popup when you do not need it.

## Changes in 1.1.1

- The filter element is injected into `<head>`/`<body>` instead of directly under `<html>`, which previously created invalid markup on every page and could interfere with page scripts while the document was still parsing.
- The filter is re-created automatically if the page removes it (including pages that replace `<head>` wholesale), and the reference is re-resolved so the page cannot silently lose the mapping.
- The filter region no longer over-allocates a 110%–120% surface, which is what made very tall pages slow and could leave imagery unrendered on long image-heavy pages.
- Unchanged settings no longer rewrite the filter tables or re-set the root style, so opening the popup or re-sending the same settings no longer triggers a full-page re-render.
- Defaults are applied immediately at `document_start`, removing the flash of unmapped colors before the stored settings load.
- The popup now distinguishes "no content script in this tab" from harmless message errors, and coalesces slider updates to one message per frame instead of one per slider tick.

## Limitations

The six color pairs are calibration examples, not a complete model of a specific type of color vision deficiency. Colors far from the supplied reference swatches may receive little or no correction. The result is an approximation, not a medical simulation or diagnosis.

The effect changes rendered webpage content, including text, images, backgrounds, and most HTML/SVG elements. It does not change Chrome's own interface, and Chrome restricts extensions from modifying certain internal pages (such as `chrome://` pages).

## Privacy

The extension does not make network requests, collect browsing history, or send page content anywhere. Its only saved settings are the on/off state and intensity, stored with `chrome.storage.local`.

## Files

- `manifest.json` — extension metadata and permissions
- `content.js` — applies the calibrated color mapping
- `popup.html`, `popup.css`, `popup.js` — toggle and intensity control
