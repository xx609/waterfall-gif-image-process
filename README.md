# Waterfall GIF Generator

A browser-only waterfall animation generator with a custom GIF89a and LZW
encoder. Open `index.html`, choose an image, and download the generated GIF.

## Encoder regression test

With Node.js installed, run:

```text
node tests/custom-gif-regression.cjs
```

The test generates a 64-frame GIF, independently decodes every LZW image-data
stream, checks representative frames pixel-for-pixel, exercises all GIF LZW
code widths, and forces a full dictionary clear/reset.
