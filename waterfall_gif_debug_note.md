# Debug Note: GIF Output Shows Only First Few Pixel Lines

## Observed Issue

The generated GIF preview/download appears to contain only the first few lines of pixels instead of the full rolled image frame.

This likely means the browser is able to read the GIF header and start decoding image data, but the encoded image data for one or more frames becomes invalid before a full frame is reconstructed.

## Most Likely Cause

The custom GIF encoder in `script.js` is the highest-risk area.

The canvas drawing code uses full-frame `getImageData(0, 0, width, height)`, so if the canvas frame is correct before encoding, the bug is probably inside one of these functions:

- `writeImageData`
- `lzwEncode`
- `BitWriter.prototype.write`

GIF image data uses LZW compression with strict code-size transitions. A small mismatch in when the encoder increases `codeSize`, emits clear codes, or writes bit-packed codes can make decoders stop after only a small strip of pixels.

## Specific Suspects

1. **LZW code-size growth may be out of sync with GIF decoder expectations.**
   The current encoder increases `codeSize` immediately after adding a dictionary entry when `nextCode === (1 << codeSize)`. GIF decoders are sensitive to this timing. If the encoder writes a code using a different bit width than the decoder expects, the remaining pixel stream becomes corrupt.

2. **The bit writer may be unsafe for longer streams.**
   `BitWriter.prototype.write` uses JavaScript bitwise operators:

   ```js
   this.current |= code << this.bitCount;
   ```

   JavaScript bitwise operations use signed 32-bit integers. The current buffer is usually small, but malformed carry behavior could still corrupt packed LZW data if the internal state grows unexpectedly.

3. **Frame data may be correct before encoding but corrupt after compression.**
   Since `frameContext.getImageData(0, 0, width, height)` requests the full canvas, a cropped-looking GIF does not automatically mean the canvas only contains a few rows. It may mean the GIF decoder only receives enough valid pixels for the first rows.

4. **Using a hand-written encoder is riskier than using a tested browser GIF library.**
   The requirements allow `gif.js`, `gifenc`, or another equivalent encoder. Replacing the custom encoder with a known-good encoder would be the fastest way to confirm whether the issue is encoding-specific.

## Things To Check Next

1. Before calling `encoder.addFrame`, temporarily draw or export `frameCanvas` as a PNG preview.
   If the PNG is full-height and correct, the canvas rolling logic is fine.

2. Test a very small image, such as `16x16`.
   If small images work but larger images fail, the LZW dictionary/code-size transition is likely the problem.

3. Test a solid-color image.
   If a solid-color image works but detailed images fail, the compressor dictionary path is likely failing when many color changes appear.

4. Add console logs for:

   ```js
   width
   height
   frameCount
   indexedPixels.length
   compressed.length
   ```

   `indexedPixels.length` should always equal `width * height`.

5. Replace the custom GIF encoder temporarily with a proven encoder.
   If that fixes the cropped output, keep the library and remove the custom encoder.

## Current Best Guess

The vertical roll frame drawing is probably not the main bug. The strongest suspicion is an invalid LZW-compressed image data stream produced by the custom GIF encoder, causing GIF decoders to render only the first few pixel rows before failing to decode the rest of the frame.
