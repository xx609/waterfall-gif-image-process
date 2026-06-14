# Requirement Specification: Pre-Compression Debug Output

## 1. Purpose

Add a debug feature that can switch the output preview from the encoded GIF to the generated frames before GIF palette conversion and LZW compression.

This feature is intended to diagnose an issue where:

- Large or tall images produce a broken output image.
- Large solid-color images also fail.
- The console reports that every frame was processed successfully.

The debug output must make it possible to determine whether frame drawing is correct before data enters the custom GIF encoder.

---

## 2. Debug Mode Variable

Do not add or change any HTML controls or page layout.

Add one clearly named debug variable near the top of `script.js`:

```js
var DEBUG_PRECOMPRESSION_OUTPUT = false;
```

The variable controls the output path:

- `false`: use the existing default GIF generation, preview, and download behavior.
- `true`: output the generated frames before GIF palette conversion and LZW compression.

The default value must be `false`.

Changing this variable is a developer-only operation. No user-facing checkbox, switch, or other debug control is required.

---

## 3. Pre-Compression Boundary

The debug output must use the frame after:

1. `drawRolledFrame` has drawn the complete frame.
2. `frameContext.getImageData(0, 0, width, height)` has read the complete frame.

The debug path must run before:

- `GifEncoder.addFrame`
- RGBA-to-RGB332 palette indexing
- `writeImageData`
- `lzwEncode`
- GIF byte-block writing

When `DEBUG_PRECOMPRESSION_OUTPUT` is enabled, the application must not pass frame data into the GIF encoder.

---

## 4. Debug Preview Behavior

The existing output section must display the generated frames directly in a canvas.

`script.js` may create and insert the debug canvas at runtime. `index.html` must not be edited, and the permanent HTML layout must remain unchanged.

The debug preview must:

- Use the same normalized source image as normal GIF generation.
- Use the same width, height, frame count, vertical step, and frame offsets.
- Draw every frame at the frame rate entered by the user.
- Loop from the final unique frame back to the first frame.
- Show the full canvas width and height without dropping or cropping rows.
- Avoid CSS stretching that could hide whether the pixel dimensions are correct.

The application may redraw each frame during playback instead of storing every full RGBA frame in memory. This is preferred for large images.

The existing GIF `<img>` preview must be hidden while the debug canvas is active.

---

## 5. Debug Information

While `DEBUG_PRECOMPRESSION_OUTPUT` is enabled, show or log the following information:

```text
mode
source width
source height
frame count
current frame index
current vertical offset
expected pixel count
actual pixel count
expected RGBA byte count
actual RGBA byte count
```

The expected values are:

```text
expected pixel count = width * height
expected RGBA byte count = width * height * 4
```

For every frame, `imageData.data.length` must equal the expected RGBA byte count.

If the value does not match, processing must stop and display an error identifying the frame index, expected byte count, and actual byte count.

The status message must clearly identify the active mode, for example:

```text
Debug preview: frame 12 of 80, offset 44 px
```

---

## 6. Output and Download Behavior

When `DEBUG_PRECOMPRESSION_OUTPUT` is `false`:

- The output remains the encoded animated GIF.
- The download button downloads `waterfall-animation.gif`.

When `DEBUG_PRECOMPRESSION_OUTPUT` is `true`:

- The output is the direct canvas preview.
- No GIF blob or GIF object URL should be created.
- The download button must not claim to download a GIF.
- The download button should download the currently displayed debug frame as:

```text
waterfall-debug-frame-N.png
```

Alternatively, the download button may be disabled with a clear message that GIF download is unavailable in pre-compression debug mode.

---

## 7. State Management

The application must stop the active debug playback loop when:

- A new image is selected.
- The frame rate changes.
- A new generation starts.
- An error occurs.

Only one preview animation loop may run at a time.

Any previously created object URL must be revoked when replacing output.

Changing `DEBUG_PRECOMPRESSION_OUTPUT` requires reloading the page or starting a new generation before the new output path takes effect.

---

## 8. Error Handling

The pre-compression output path must report a clear error when:

- A complete canvas frame cannot be read.
- The returned RGBA byte count is incorrect.
- The canvas dimensions differ from the normalized image dimensions.
- The browser cannot create or use the debug canvas context.

Debug errors must include the frame index and dimensions when available.

An error in the pre-compression output path must not silently fall back to GIF generation.

---

## 9. Performance Requirements

The pre-compression output path is intended to support the same image size limits as normal processing.

To prevent additional memory pressure:

- Do not retain all full-size `ImageData` objects unless explicitly needed for a test.
- Reuse one debug canvas and drawing context.
- Use `requestAnimationFrame` or timed playback without creating overlapping timers.
- Yield to the browser during initial validation of a large frame sequence.

The pre-compression output path may validate one frame at a time during playback.

---

## 10. Acceptance Criteria

The feature is complete when all of the following are true:

1. `script.js` contains a `DEBUG_PRECOMPRESSION_OUTPUT` variable that selects the output path.
2. Normal mode preserves the existing generation, preview, and download behavior.
3. When the variable is `true`, the palette conversion and LZW compression path is never called.
4. When the variable is `true`, the complete rolled frame sequence is displayed directly on canvas.
5. The displayed debug dimensions match the normalized source dimensions.
6. Every frame reports an RGBA byte count of `width * height * 4`.
7. A tall image that produces a broken GIF can be viewed fully in debug mode.
8. A large solid-color image can be viewed fully in debug mode.
9. `index.html` and the permanent page layout are unchanged.
10. The status or console output identifies the frame and offset currently being displayed.
11. Setting the variable back to `false` restores the default encoded GIF output.

---

## 11. Diagnostic Interpretation

Use the results as follows:

- If the pre-compression preview is also broken, investigate frame drawing, canvas dimensions, normalization, or frame offset calculation.
- If the pre-compression preview is correct but the GIF is broken, investigate palette indexing, LZW code-size transitions, bit packing, image-data blocks, or GIF stream construction.
- If only large images fail before compression, investigate canvas limits, memory pressure, and image normalization limits.
- If all pre-compression frames and byte counts are correct, a successful frame-processing console message does not prove that the final GIF byte stream is valid.

---

## 12. Non-Requirements

This debug feature does not need to:

- Add or modify HTML elements in `index.html`.
- Add a user-facing debug switch.
- Replace the custom GIF encoder.
- Fix the compression defect by itself.
- Export an uncompressed animated image format.
- Store every frame in memory.
- Be enabled by default.
- Change the waterfall animation algorithm.
