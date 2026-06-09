(function () {
  "use strict";

  var MIN_FPS = 1;
  var MAX_FPS = 60;
  var MAX_DIMENSION = 360;
  var MAX_FRAMES = 160;
  var DEFAULT_FILENAME = "waterfall-animation.gif";

  var uploadInput = document.getElementById("image-upload");
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

  uploadInput.addEventListener("change", function () {
    selectedFile = uploadInput.files && uploadInput.files[0] ? uploadInput.files[0] : null;
    clearGeneratedGif();
    scheduleGeneration();
  });

  frameRateInput.addEventListener("input", function () {
    clearGeneratedGif();
    scheduleGeneration();
  });

  downloadButton.addEventListener("click", function () {
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
      setStatus("Upload an image to generate a waterfall GIF.");
      return;
    }

    if (!selectedFile.type || !selectedFile.type.startsWith("image/")) {
      showError("Please upload a valid image file.");
      return;
    }

    setProcessing(true);
    setStatus("Processing GIF...");

    try {
      var image = await loadImageFromFile(selectedFile);
      if (currentGeneration !== generationId) return;

      var normalized = drawNormalizedImage(image);
      var gifBytes = await encodeWaterfallGif(normalized.canvas, fps.value);
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
      showError("Unable to generate GIF. Please try a smaller image.");
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

  async function encodeWaterfallGif(sourceCanvas, fps) {
    var width = sourceCanvas.width;
    var height = sourceCanvas.height;
    var frameCanvas = document.createElement("canvas");
    var frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
    var encoder = new GifEncoder(width, height);
    var delay = Math.round(1000 / fps);
    var step = Math.max(1, Math.ceil(height / MAX_FRAMES));
    var frameCount = Math.ceil(height / step);

    frameCanvas.width = width;
    frameCanvas.height = height;
    encoder.writeHeader();

    for (var frame = 0; frame < frameCount; frame += 1) {
      var offset = frame * step;
      if (offset >= height) break;

      drawRolledFrame(frameContext, sourceCanvas, width, height, offset);
      var imageData = frameContext.getImageData(0, 0, width, height);
      encoder.addFrame(imageData.data, delay);

      if (frame % 8 === 0) {
        setStatus("Processing GIF... frame " + (frame + 1) + " of " + frameCount);
        await yieldToBrowser();
      }
    }

    encoder.finish();
    return encoder.bytes();
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
    downloadButton.disabled = isProcessing || !generatedUrl;
  }

  function setStatus(message) {
    statusMessage.textContent = message;
    statusMessage.hidden = message === "";
    //console.log("Status:", message || "(empty)");
  }

  function showError(message) {
    clearGeneratedGif();
    setStatus("");
    errorMessage.textContent = message;
    errorMessage.hidden = false;
    setProcessing(false);
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.hidden = true;
  }

  function clearGeneratedGif() {
    if (generatedUrl) {
      URL.revokeObjectURL(generatedUrl);
    }

    generatedUrl = "";
    outputImage.removeAttribute("src");
    outputImage.alt = "";
    outputImage.hidden = true;
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
        writer.write(dictionary[prefix], codeSize);

        if (nextCode < 4096) {
          dictionary[combined] = nextCode;
          nextCode += 1;

          if (nextCode === (1 << codeSize) && codeSize < 12) {
            codeSize += 1;
          }
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
      writer.write(dictionary[prefix], codeSize);
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
