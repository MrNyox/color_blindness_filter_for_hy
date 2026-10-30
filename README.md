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

## Limitations

The six color pairs are calibration examples, not a complete model of a specific type of color vision deficiency. Colors far from the supplied reference swatches may receive little or no correction. The result is an approximation, not a medical simulation or diagnosis.

The effect changes rendered webpage content, including text, images, backgrounds, and most HTML/SVG elements. It does not change Chrome's own interface, and Chrome restricts extensions from modifying certain internal pages (such as `chrome://` pages).

## Privacy

The extension does not make network requests, collect browsing history, or send page content anywhere. Its only saved settings are the on/off state and intensity, stored with `chrome.storage.local`.

## Files

- `manifest.json` — extension metadata and permissions
- `content.js` — applies the calibrated color mapping
- `popup.html`, `popup.css`, `popup.js` — toggle and intensity control
