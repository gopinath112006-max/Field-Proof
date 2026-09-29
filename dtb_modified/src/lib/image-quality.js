/**
 * Image Quality Gate for FieldCheck.
 *
 * Inspects a frame before calibration or classification:
 * - Resolution (minimum dimensions for colorimetric assessment)
 * - Exposure (detects underexposure/excessive shadow or overexposure/glare)
 * - Sharpness / blur (variance of Laplacian filter on luminance)
 * - Dynamic range / contrast
 *
 * Pure pixel calculations are decoupled from DOM/Canvas to enable unit testing.
 */

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 240;
export const IDEAL_WIDTH = 640;
export const IDEAL_HEIGHT = 480;

export const QUALITY_THRESHOLDS = Object.freeze({
  minResolutionPixels: MIN_WIDTH * MIN_HEIGHT,
  minMeanLuminance: 35,       // below this is underexposed / excessive shadow
  maxMeanLuminance: 225,      // above this is overexposed / washed out
  maxDarkFraction: 0.45,      // max fraction of clipped shadows (Y < 20)
  maxBrightFraction: 0.40,    // max fraction of clipped highlights (Y > 240)
  minLaplacianVariance: 25.0, // below this is blurred / out of focus
  minContrastStdDev: 18.0     // below this is flat / insufficient contrast
});

/**
 * Calculate luminance for an RGB triplet (Rec. 601).
 */
export function rgbToLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Pure image quality analysis over RGBA pixel buffer.
 *
 * @param {Uint8ClampedArray} data RGBA row-major byte array
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @returns {object} Quality assessment details
 */
export function assessPixelQuality(data, width, height, options = {}) {
  const thresholds = { ...QUALITY_THRESHOLDS, ...options };
  const totalPixels = width * height;
  const reasons = [];

  // 1. Resolution Check
  const resolutionOk = width >= MIN_WIDTH && height >= MIN_HEIGHT;
  if (!resolutionOk) {
    reasons.push(`Low resolution (${width}×${height}): minimum is ${MIN_WIDTH}×${MIN_HEIGHT}`);
  }

  // 2. Grayscale & Luminance Stats
  const gray = new Float32Array(totalPixels);
  let sumY = 0;
  let darkCount = 0;
  let brightCount = 0;

  for (let i = 0; i < totalPixels; i += 1) {
    const o = i * 4;
    const y = rgbToLuminance(data[o], data[o + 1], data[o + 2]);
    gray[i] = y;
    sumY += y;
    if (y < 20) darkCount += 1;
    if (y > 240) brightCount += 1;
  }

  const meanY = sumY / (totalPixels || 1);
  const darkFraction = darkCount / (totalPixels || 1);
  const brightFraction = brightCount / (totalPixels || 1);

  // Variance & Standard Deviation of luminance (contrast)
  let sumSqDiff = 0;
  for (let i = 0; i < totalPixels; i += 1) {
    const diff = gray[i] - meanY;
    sumSqDiff += diff * diff;
  }
  const varianceY = sumSqDiff / (totalPixels || 1);
  const stdDevY = Math.sqrt(varianceY);

  // Exposure Judgement
  let exposureStatus = "adequate";
  if (meanY < thresholds.minMeanLuminance || darkFraction > thresholds.maxDarkFraction) {
    exposureStatus = "underexposed";
    reasons.push(`Frame is underexposed or shadowed (mean brightness ${Math.round(meanY)}/255)`);
  } else if (meanY > thresholds.maxMeanLuminance || brightFraction > thresholds.maxBrightFraction) {
    exposureStatus = "overexposed";
    reasons.push(`Frame is overexposed or has excessive glare (mean brightness ${Math.round(meanY)}/255)`);
  }

  if (stdDevY < thresholds.minContrastStdDev) {
    reasons.push(`Low contrast (${Math.round(stdDevY)}): details may be washed out`);
  }

  // 3. Sharpness Estimation via Laplacian Operator
  // Sample a grid or interior region for speed and noise immunity
  let laplacianSum = 0;
  let laplacianSumSq = 0;
  let countLap = 0;

  // Step of 1 or 2 pixels depending on frame size for high performance
  const step = width > 320 ? 2 : 1;
  for (let y = 1; y < height - 1; y += step) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x += step) {
      const idx = rowOffset + x;
      // Discrete Laplacian kernel: [0, 1, 0; 1, -4, 1; 0, 1, 0]
      const lap =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];

      laplacianSum += lap;
      laplacianSumSq += lap * lap;
      countLap += 1;
    }
  }

  const meanLap = countLap ? laplacianSum / countLap : 0;
  const lapVariance = countLap ? (laplacianSumSq / countLap) - (meanLap * meanLap) : 0;

  let sharpnessStatus = "sharp";
  if (lapVariance < thresholds.minLaplacianVariance) {
    sharpnessStatus = "blurred";
    reasons.push(`Motion blur or focus loss detected (sharpness index: ${Math.round(lapVariance)})`);
  } else if (lapVariance < thresholds.minLaplacianVariance * 1.8) {
    sharpnessStatus = "marginal";
  }

  // 4. Quality Score Composite (0 to 100)
  let score = 100;
  if (!resolutionOk) score -= 35;
  if (exposureStatus !== "adequate") score -= 30;
  if (sharpnessStatus === "blurred") score -= 35;
  else if (sharpnessStatus === "marginal") score -= 15;
  if (stdDevY < thresholds.minContrastStdDev) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const acceptable = resolutionOk && exposureStatus === "adequate" && sharpnessStatus !== "blurred";

  return {
    acceptable,
    score,
    resolution: {
      width,
      height,
      megapixels: Number(((width * height) / 1_000_000).toFixed(2)),
      status: resolutionOk ? "adequate" : "low"
    },
    exposure: {
      meanLuminance: Number(meanY.toFixed(1)),
      contrastStdDev: Number(stdDevY.toFixed(1)),
      darkFraction: Number(darkFraction.toFixed(3)),
      brightFraction: Number(brightFraction.toFixed(3)),
      status: exposureStatus
    },
    sharpness: {
      variance: Number(lapVariance.toFixed(1)),
      status: sharpnessStatus
    },
    reasons,
    summary: acceptable
      ? "Image quality acceptable for calibration and classification"
      : `Image quality insufficient — ${reasons.join("; ")}. Retake recommended.`
  };
}

/**
 * Assess quality of a data URL image via offscreen canvas.
 *
 * @param {string} imageDataUrl
 * @returns {Promise<object>}
 */
export async function assessImageQuality(imageDataUrl) {
  if (!imageDataUrl) {
    return {
      acceptable: false,
      score: 0,
      reasons: ["No image data supplied"],
      summary: "Image quality insufficient — no image data supplied."
    };
  }

  if (typeof Image === "undefined" || typeof document === "undefined") {
    // Non-browser fallback
    return {
      acceptable: true,
      score: 80,
      reasons: [],
      summary: "Image quality assessment deferred (non-browser environment)"
    };
  }

  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Unable to decode image"));
      img.src = imageDataUrl;
    });

    const canvas = document.createElement("canvas");
    // Sample at representative dimension if huge, or full if moderate
    const maxDim = 640;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
    } else {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const assessment = assessPixelQuality(imgData.data, canvas.width, canvas.height);
    // Include original dimensions in resolution report
    assessment.resolution.originalWidth = w;
    assessment.resolution.originalHeight = h;
    return assessment;
  } catch (error) {
    return {
      acceptable: false,
      score: 0,
      reasons: [`Quality check failed: ${error.message}`],
      summary: `Image quality check error: ${error.message}`
    };
  }
}
