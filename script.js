(function () {
  "use strict";

  var MIN_FPS = 1;
  var MAX_FPS = 60;
  var MAX_DIMENSION = 360;
  var MAX_FRAMES = 160;
  var DEFAULT_FILENAME = "waterfall-animation.gif";
  var DEBUG_PRECOMPRESSION_OUTPUT = false;

  var dropZone = document.getElementById("image-drop-zone");
  var uploadInput = document.getElementById("image-upload");
  var selectedFileName = document.getElementById("selected-file-name");
  var frameRateInput = document.getElementById("frame-rate");
  var outputSection = document.getElementById("output-section");
  var statusMessage = document.getElementById("status-message");
  var errorMessage = document.getElementById("error-message");
  var outputImage = document.getElementById("output-image");
  var downloadButton = document.getElementById("download-button");

  var selectedFile = null;
  var generatedUrl = "";
  var generationId = 0;
  var debounceTimer = 0;
  var debugCanvas = null;
  var debugPlaybackTimer = 0;
  var debugFrameIndex = -1;
  var dragDepth = 0;

  uploadInput.addEventListener("change", function () {
    selectImageFile(uploadInput.files && uploadInput.files[0] ? uploadInput.files[0] : null);
  });

  dropZone.addEventListener("dragenter", function (event) {
    if (!hasDraggedFiles(event)) return;

    event.preventDefault();
    dragDepth += 1;
    dropZone.classList.add("is-dragging");
  });

  dropZone.addEventListener("dragover", function (event) {
    if (!hasDraggedFiles(event)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });

  dropZone.addEventListener("dragleave", function (event) {
    if (!hasDraggedFiles(event)) return;

    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      dropZone.classList.remove("is-dragging");
    }
  });

  dropZone.addEventListener("drop", function (event) {
    if (!hasDraggedFiles(event)) return;

    event.preventDefault();
    resetDragState();

    var files = event.dataTransfer.files;
    if (!files || files.length === 0) return;

    if (files.length > 1) {
      rejectDroppedFiles("Please drop one image at a time.");
      return;
    }

    uploadInput.value = "";
    try {
      uploadInput.files = files;
    } catch (error) {
      // The selected-file text below remains the fallback for older browsers.
    }

    selectImageFile(files[0]);
  });

  document.addEventListener("dragover", preventFileNavigation);
  document.addEventListener("drop", preventFileNavigation);

  frameRateInput.addEventListener("input", function () {
    clearGeneratedOutput();
    scheduleGeneration();
  });

  downloadButton.addEventListener("click", function () {
    if (debugCanvas && debugFrameIndex >= 0) {
      downloadDebugFrame();
      return;
    }

    if (!generatedUrl) {
      showError("There is no generated GIF to download yet.");
      return;
    }

    var link = document.createElement("a");
    link.href = generatedUrl;
    link.download = DEFAULT_FILENAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
  });

  function hasDraggedFiles(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    return Boolean(types && Array.prototype.indexOf.call(types, "Files") !== -1);
  }

  function preventFileNavigation(event) {
    if (hasDraggedFiles(event)) {
      event.preventDefault();
      if (event.type === "drop") {
        resetDragState();
      }
    }
  }

  function resetDragState() {
    dragDepth = 0;
    dropZone.classList.remove("is-dragging");
  }

  function selectImageFile(file) {
    generationId += 1;
    window.clearTimeout(debounceTimer);
    selectedFile = file;

    selectedFileName.textContent = selectedFile
      ? "Selected: " + selectedFile.name
      : "No image selected.";

    clearError();
    clearGeneratedOutput();
    setProcessing(false);
    scheduleGeneration();
  }

  function rejectDroppedFiles(message) {
    generationId += 1;
    window.clearTimeout(debounceTimer);
    selectedFile = null;
    uploadInput.value = "";
    selectedFileName.textContent = "No image selected.";
    showError(message);
  }

  function scheduleGeneration() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(generateGifFromInputs, 350);
  }

  async function generateGifFromInputs() {
    var currentGeneration = ++generationId;
    clearError();

    var fps = validateFrameRate(frameRateInput.value);
    if (!fps.valid) {
      showError(fps.message);
      return;
    }

    if (!selectedFile) {
      setStatus("Choose or drop an image to generate a waterfall GIF.");
      return;
    }

    if (!selectedFile.type || !selectedFile.type.startsWith("image/")) {
      showError("Please upload a valid image file.");
      return;
    }

    setProcessing(true);
    setStatus(DEBUG_PRECOMPRESSION_OUTPUT
      ? "Preparing pre-compression debug preview..."
      : "Processing GIF...");

    try {
      var image = await loadImageFromFile(selectedFile);
      if (currentGeneration !== generationId) return;

      var normalized = drawNormalizedImage(image);
      if (DEBUG_PRECOMPRESSION_OUTPUT) {
        startPrecompressionDebugPreview(normalized.canvas, fps.value, currentGeneration);
        return;
      }

      var gifBytes = await encodeWaterfallGif(normalized.canvas, fps.value, currentGeneration);
      if (currentGeneration !== generationId) return;

      var blob = new Blob([gifBytes], { type: "image/gif" });
      generatedUrl = URL.createObjectURL(blob);
      outputImage.src = generatedUrl;
      outputImage.alt = "Generated waterfall-style animated GIF";
      outputImage.hidden = false;
      downloadButton.disabled = false;
      setStatus("");
    } catch (error) {
      console.error(error);
      showError(DEBUG_PRECOMPRESSION_OUTPUT
        ? error.message
        : "Unable to generate GIF. Please try a smaller image.");
    } finally {
      if (currentGeneration === generationId) {
        setProcessing(false);
      }
    }
  }

  function validateFrameRate(value) {
    if (value === "") {
      return { valid: false, message: "Frame rate must be a number between 1 and 60." };
    }

    var fps = Number(value);
    if (!Number.isFinite(fps) || fps < MIN_FPS || fps > MAX_FPS) {
      return { valid: false, message: "Frame rate must be a number between 1 and 60." };
    }

    return { valid: true, value: fps };
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();

      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Invalid image file."));
      };

      image.src = url;
    });
  }

  function drawNormalizedImage(image) {
    var scale = Math.min(1, MAX_DIMENSION / image.naturalWidth, MAX_DIMENSION / image.naturalHeight);
    var width = Math.max(1, Math.round(image.naturalWidth * scale));
    var height = Math.max(1, Math.round(image.naturalHeight * scale));
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    return { canvas: canvas, width: width, height: height };
  }

  async function encodeWaterfallGif(sourceCanvas, fps, currentGeneration) {
    var width = sourceCanvas.width;
    var height = sourceCanvas.height;
    var frameCanvas = document.createElement("canvas");
    var frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
    var encoder = new GifEncoder(width, height);
    var framePlan = createFramePlan(height, fps);

    frameCanvas.width = width;
    frameCanvas.height = height;
    encoder.writeHeader();

    for (var frame = 0; frame < framePlan.frameCount; frame += 1) {
      if (currentGeneration !== generationId) return null;

      var offset = frame * framePlan.step;
      if (offset >= height) break;

      drawRolledFrame(frameContext, sourceCanvas, width, height, offset);
      var imageData = frameContext.getImageData(0, 0, width, height);
      encoder.addFrame(imageData.data, framePlan.delay);

      if (frame % 8 === 0) {
        setStatus("Processing GIF... frame " + (frame + 1) + " of " + framePlan.frameCount);
        await yieldToBrowser();
      }
    }

    encoder.finish();
    return encoder.bytes();
  }

  function createFramePlan(height, fps) {
    var step = Math.max(1, Math.ceil(height / MAX_FRAMES));

    return {
      delay: Math.round(1000 / fps),
      step: step,
      frameCount: Math.ceil(height / step)
    };
  }

  function startPrecompressionDebugPreview(sourceCanvas, fps, currentGeneration) {
    stopDebugPlayback();

    var width = sourceCanvas.width;
    var height = sourceCanvas.height;
    var framePlan = createFramePlan(height, fps);
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error(
        "Debug preview failed: unable to create a canvas context for " +
        width + "x" + height + "."
      );
    }

    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Pre-compression waterfall animation debug preview");
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";

    if (canvas.width !== width || canvas.height !== height) {
      throw new Error(
        "Debug preview dimensions are incorrect: expected " +
        width + "x" + height + ", received " +
        canvas.width + "x" + canvas.height + "."
      );
    }

    outputImage.hidden = true;
    outputSection.appendChild(canvas);
    debugCanvas = canvas;
    debugFrameIndex = -1;
    downloadButton.textContent = "Download Debug Frame";

    function renderFrame(frameIndex) {
      if (currentGeneration !== generationId || debugCanvas !== canvas) {
        return;
      }

      try {
        var offset = frameIndex * framePlan.step;
        drawRolledFrame(context, sourceCanvas, width, height, offset);

        var imageData = context.getImageData(0, 0, width, height);
        var expectedPixelCount = width * height;
        var expectedByteCount = expectedPixelCount * 4;
        var actualByteCount = imageData.data.length;
        var actualPixelCount = actualByteCount / 4;

        if (actualByteCount !== expectedByteCount) {
          throw new Error(
            "Debug preview failed at frame " + (frameIndex + 1) +
            " (" + width + "x" + height + "): expected " +
            expectedByteCount + " RGBA bytes, received " +
            actualByteCount + "."
          );
        }

        debugFrameIndex = frameIndex;
        console.log("Pre-compression frame", {
          mode: "pre-compression",
          sourceWidth: width,
          sourceHeight: height,
          frameCount: framePlan.frameCount,
          currentFrameIndex: frameIndex,
          currentVerticalOffset: offset,
          expectedPixelCount: expectedPixelCount,
          actualPixelCount: actualPixelCount,
          expectedRgbaByteCount: expectedByteCount,
          actualRgbaByteCount: actualByteCount
        });
        setStatus(
          "Debug preview: frame " + (frameIndex + 1) +
          " of " + framePlan.frameCount +
          ", offset " + offset + " px"
        );
        setProcessing(false);

        var nextFrame = (frameIndex + 1) % framePlan.frameCount;
        debugPlaybackTimer = window.setTimeout(function () {
          renderFrame(nextFrame);
        }, framePlan.delay);
      } catch (error) {
        console.error(error);
        showError(error.message);
      }
    }

    renderFrame(0);
  }

  function downloadDebugFrame() {
    var canvas = debugCanvas;
    var frameNumber = debugFrameIndex + 1;

    if (!canvas || frameNumber < 1) {
      showError("There is no debug frame to download yet.");
      return;
    }

    canvas.toBlob(function (blob) {
      if (canvas !== debugCanvas) {
        return;
      }

      if (!blob) {
        showError("Unable to export the current debug frame.");
        return;
      }

      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "waterfall-debug-frame-" + frameNumber + ".png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 0);
    }, "image/png");
  }

  function stopDebugPlayback() {
    window.clearTimeout(debugPlaybackTimer);
    debugPlaybackTimer = 0;

    if (debugCanvas) {
      debugCanvas.remove();
    }

    debugCanvas = null;
    debugFrameIndex = -1;
  }

  function drawRolledFrame(context, sourceCanvas, width, height, offset) {
    context.clearRect(0, 0, width, height);

    if (offset === 0) {
      context.drawImage(sourceCanvas, 0, 0);
      return;
    }

    var lowerSliceHeight = height - offset;
    context.drawImage(
      sourceCanvas,
      0,
      lowerSliceHeight,
      width,
      offset,
      0,
      0,
      width,
      offset
    );
    context.drawImage(
      sourceCanvas,
      0,
      0,
      width,
      lowerSliceHeight,
      0,
      offset,
      width,
      lowerSliceHeight
    );
  }

  function yieldToBrowser() {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, 0);
    });
  }

  function setProcessing(isProcessing) {
    outputSection.setAttribute("aria-busy", String(isProcessing));
    uploadInput.disabled = isProcessing;
    frameRateInput.disabled = isProcessing;
    downloadButton.disabled = isProcessing ||
      (!generatedUrl && (!debugCanvas || debugFrameIndex < 0));
  }

  function setStatus(message) {
    statusMessage.textContent = message;
    statusMessage.hidden = message === "";
    //console.log("Status:", message || "(empty)");
  }

  function showError(message) {
    clearGeneratedOutput();
    setStatus("");
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    setProcessing(false);
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.hidden = true;
  }

  function clearGeneratedOutput() {
    stopDebugPlayback();

    if (generatedUrl) {
      URL.revokeObjectURL(generatedUrl);
    }

    generatedUrl = "";
    outputImage.removeAttribute("src");
    outputImage.alt = "";
    outputImage.hidden = true;
    downloadButton.textContent = "Download GIF";
    downloadButton.disabled = true;
  }

  function GifEncoder(width, height) {
    this.width = width;
    this.height = height;
    this.stream = [];
    this.started = false;
  }

  GifEncoder.prototype.writeHeader = function () {
    writeString(this.stream, "GIF89a");
    writeUnsignedShort(this.stream, this.width);
    writeUnsignedShort(this.stream, this.height);
    this.stream.push(0xf7);
    this.stream.push(0);
    this.stream.push(0);
    writeRgb332Palette(this.stream);
    writeNetscapeLoopExtension(this.stream);
    this.started = true;
  };

  GifEncoder.prototype.addFrame = function (rgbaData, delayMs) {
    if (!this.started) {
      throw new Error("GIF header must be written before frames.");
    }

    var indexedPixels = rgbaToRgb332Indexes(rgbaData);
    writeGraphicControlExtension(this.stream, delayMs);
    this.stream.push(0x2c);
    writeUnsignedShort(this.stream, 0);
    writeUnsignedShort(this.stream, 0);
    writeUnsignedShort(this.stream, this.width);
    writeUnsignedShort(this.stream, this.height);
    this.stream.push(0);
    writeImageData(this.stream, indexedPixels, 8);
  };

  GifEncoder.prototype.finish = function () {
    this.stream.push(0x3b);
  };

  GifEncoder.prototype.bytes = function () {
    return new Uint8Array(this.stream);
  };

  function rgbaToRgb332Indexes(rgbaData) {
    var indexes = new Uint8Array(rgbaData.length / 4);

    for (var source = 0, target = 0; source < rgbaData.length; source += 4, target += 1) {
      var alpha = rgbaData[source + 3];
      var r = alpha === 0 ? 255 : rgbaData[source];
      var g = alpha === 0 ? 255 : rgbaData[source + 1];
      var b = alpha === 0 ? 255 : rgbaData[source + 2];

      indexes[target] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
    }

    return indexes;
  }

  function writeRgb332Palette(stream) {
    for (var r = 0; r < 8; r += 1) {
      for (var g = 0; g < 8; g += 1) {
        for (var b = 0; b < 4; b += 1) {
          stream.push(Math.round((r * 255) / 7));
          stream.push(Math.round((g * 255) / 7));
          stream.push(Math.round((b * 255) / 3));
        }
      }
    }
  }

  function writeNetscapeLoopExtension(stream) {
    stream.push(0x21, 0xff, 0x0b);
    writeString(stream, "NETSCAPE2.0");
    stream.push(0x03, 0x01);
    writeUnsignedShort(stream, 0);
    stream.push(0x00);
  }

  function writeGraphicControlExtension(stream, delayMs) {
    var delayCs = Math.max(1, Math.round(delayMs / 10));

    stream.push(0x21, 0xf9, 0x04);
    stream.push(0x00);
    writeUnsignedShort(stream, delayCs);
    stream.push(0x00);
    stream.push(0x00);
  }

  function writeImageData(stream, indexedPixels, colorDepth) {
    var minCodeSize = Math.max(2, colorDepth);
    var compressed = lzwEncode(indexedPixels, minCodeSize);

    stream.push(minCodeSize);

    for (var index = 0; index < compressed.length; index += 255) {
      var block = compressed.subarray(index, index + 255);
      stream.push(block.length);
      for (var i = 0; i < block.length; i += 1) {
        stream.push(block[i]);
      }
    }

    stream.push(0x00);
  }

  function lzwEncode(indexes, minCodeSize) {
    var clearCode = 1 << minCodeSize;
    var endCode = clearCode + 1;
    var nextCode = endCode + 1;
    var codeSize = minCodeSize + 1;
    var dictionary = createInitialDictionary(clearCode);
    var writer = new BitWriter();
    var prefix = "";

    function writeDataCode(code) {
      writer.write(code, codeSize);

      // The decoder creates each dictionary entry after reading the next
      // data code, so that code must still use the previous bit width.
      // Grow only after emitting it, ready for the following code.
      if (nextCode === (1 << codeSize) && codeSize < 12) {
        codeSize += 1;
      }
    }

    writer.write(clearCode, codeSize);

    for (var i = 0; i < indexes.length; i += 1) {
      var value = indexes[i];

      if (prefix === "") {
        prefix = String(value);
        continue;
      }

      var combined = prefix + "," + value;
      if (Object.prototype.hasOwnProperty.call(dictionary, combined)) {
        prefix = combined;
      } else {
        writeDataCode(dictionary[prefix]);

        if (nextCode < 4096) {
          dictionary[combined] = nextCode;
          nextCode += 1;
        } else {
          writer.write(clearCode, codeSize);
          dictionary = createInitialDictionary(clearCode);
          nextCode = endCode + 1;
          codeSize = minCodeSize + 1;
        }

        prefix = String(value);
      }
    }

    if (prefix !== "") {
      writeDataCode(dictionary[prefix]);
    }

    writer.write(endCode, codeSize);
    return writer.bytes();
  }

  function createInitialDictionary(clearCode) {
    var dictionary = Object.create(null);

    for (var i = 0; i < clearCode; i += 1) {
      dictionary[String(i)] = i;
    }

    return dictionary;
  }

  function BitWriter() {
    this.bytesList = [];
    this.current = 0;
    this.bitCount = 0;
  }

  BitWriter.prototype.write = function (code, size) {
    this.current |= code << this.bitCount;
    this.bitCount += size;

    while (this.bitCount >= 8) {
      this.bytesList.push(this.current & 0xff);
      this.current >>= 8;
      this.bitCount -= 8;
    }
  };

  BitWriter.prototype.bytes = function () {
    if (this.bitCount > 0) {
      this.bytesList.push(this.current & 0xff);
      this.current = 0;
      this.bitCount = 0;
    }

    return new Uint8Array(this.bytesList);
  };

  function writeString(stream, value) {
    for (var i = 0; i < value.length; i += 1) {
      stream.push(value.charCodeAt(i));
    }
  }

  function writeUnsignedShort(stream, value) {
    stream.push(value & 0xff);
    stream.push((value >> 8) & 0xff);
  }
})();
