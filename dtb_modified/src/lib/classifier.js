/**
 * Automated Colorimetric Classification Module for FieldCheck.
 *
 * SCOPE & SCIENTIFIC PRINCIPLES:
 * --------------------------------
 * This module performs objective colorimetric feature extraction and classification
 * on presumptive field chemical test reactions.
 *
 * CRITICAL SAFETY RULES:
 * - This is a PRESUMPTIVE field-test classifier.
 * - It analyzes observed color transitions (e.g. chromogenic reagent responses).
 * - It NEVER claims to "identify drugs", "confirm substances", or produce "laboratory results".
 * - All results are labeled "Presumptive positive", "Presumptive negative", or "Inconclusive".
 * - Mandatory confirmatory laboratory analysis is prominently declared.
 *
 * NOTE: The classifier is a deterministic colorimetric heuristic for presumptive field-test
 * interpretation. It is not a chemical identification model.
 */

import { assessPixelQuality } from "./image-quality.js";
import {
  CALIBRATION_VERSION,
  computeCalibrationTransform,
  deltaE76,
  normalizeReactionColor,
  rgbToHex,
  rgbToLab
} from "./calibration.js";
import { REFERENCE_SWATCHES } from "./guard.js";

export const CLASSIFIER_VERSION = "1.0.0";

export const PRESUMPTIVE_DISCLAIMER =
  "Presumptive field-test result only. Laboratory confirmatory testing is required before reliance or legal action.";

/**
 * Configurable thresholds and reference profiles.
 * Designed to be calibrated against empirical field test datasets.
 */
export const CLASSIFIER_CONFIG = Object.freeze({
  version: CLASSIFIER_VERSION,
  minQualityScore: 40,
  maxPositiveDeltaE: 32.0,
  maxNegativeDeltaE: 28.0,
  ambiguityMarginDeltaE: 8.0,
  minConfidenceThreshold: 50, // below this -> inconclusive
  calibrationProvenance: "NOMINAL_PRESET_V1 (requires empirical spectrophotometer field trial dataset)",

  // Reference profiles in CIE L*a*b* space for common presumptive colorimetric reactions:
  // - Positive reactions: Cobalt/Blue (Scott), Deep Purple/Violet (Marquis), Crimson/Red
  // - Negative reactions: Light Amber/Straw, Clear/Neutral, Pale Yellow (unreacted reagent)
  profiles: {
    positive: [
      { name: "Cobalt Blue (Positive Reaction)", lab: [34.0, 12.0, -48.0], rgb: [15, 65, 160] },
      { name: "Deep Violet (Positive Reaction)", lab: [26.0, 36.0, -32.0], rgb: [78, 20, 118] },
      { name: "Crimson Red (Positive Reaction)", lab: [42.0, 54.0, 32.0], rgb: [180, 32, 48] },
      { name: "Dark Purple-Black (Positive Reaction)", lab: [18.0, 12.0, -16.0], rgb: [42, 28, 58] }
    ],
    negative: [
      { name: "Unreacted Reagent (Amber / Negative)", lab: [76.0, 8.0, 54.0], rgb: [222, 186, 98] },
      { name: "Clear / Baseline (Negative)", lab: [88.0, -2.0, 8.0], rgb: [224, 230, 218] },
      { name: "Pale Straw (Negative)", lab: [82.0, 2.0, 36.0], rgb: [236, 222, 158] },
      { name: "Neutral Solvent (Negative)", lab: [85.0, 0.0, 0.0], rgb: [215, 215, 215] }
    ]
  }
});

/**
 * Extract test reaction zone ROI pixels from an RGBA buffer.
 *
 * Predefined central reaction region (centered box: 35%-65% width, 35%-65% height).
 * Excludes extreme specular highlights and dark shadows.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @returns {{meanRgb:[number, number, number], pixelCount:number, roi:{x0:number, y0:number, w:number, h:number}}}
 */
export function extractReactionRoi(data, width, height) {
  const x0 = Math.round(width * 0.35);
  const y0 = Math.round(height * 0.35);
  const w = Math.max(10, Math.round(width * 0.30));
  const h = Math.max(10, Math.round(height * 0.30));

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let y = y0; y < y0 + h && y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = x0; x < x0 + w && x < width; x += 1) {
      const o = (rowOffset + x) * 4;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      const a = data[o + 3];

      if (a < 128) continue;
      // Skip blown specular reflection (white glare)
      if (r > 248 && g > 248 && b > 248) continue;
      // Skip deep edge shadow
      if (r < 15 && g < 15 && b < 15) continue;

      sumR += r;
      sumG += g;
      sumB += b;
      count += 1;
    }
  }

  if (count === 0) {
    return {
      meanRgb: [128, 128, 128],
      pixelCount: 0,
      roi: { x0, y0, w, h }
    };
  }

  const meanR = Math.round(sumR / count);
  const meanG = Math.round(sumG / count);
  const meanB = Math.round(sumB / count);

  return {
    meanRgb: [meanR, meanG, meanB],
    pixelCount: count,
    roi: { x0, y0, w, h }
  };
}

/**
 * Calculate distance from a test Lab color to an array of reference profiles.
 *
 * @param {[number, number, number]} testLab
 * @param {Array<{name:string, lab:[number, number, number]}>} profiles
 * @returns {{closest:object, minDeltaE:number}}
 */
export function findClosestProfile(testLab, profiles) {
  let closest = profiles[0];
  let minDeltaE = Infinity;

  for (const prof of profiles) {
    const dE = deltaE76(testLab, prof.lab);
    if (dE < minDeltaE) {
      minDeltaE = dE;
      closest = prof;
    }
  }

  return {
    closest,
    minDeltaE: Number(minDeltaE.toFixed(2))
  };
}

/**
 * Classify a reaction from extracted color features, calibration, and image quality.
 *
 * @param {object} params
 * @param {[number, number, number]} params.observedRgb
 * @param {object} [params.quality]
 * @param {object} [params.calibration]
 * @param {object} [params.config]
 * @returns {object} Classification result
 */
export function classifyReactionFeatures({
  observedRgb,
  quality = null,
  calibration = null,
  config = CLASSIFIER_CONFIG
}) {
  // 1. Image Quality Gate
  if (quality && (!quality.acceptable || quality.score < config.minQualityScore)) {
    return {
      classification: "inconclusive",
      label: "Inconclusive",
      confidence: 0,
      confidenceLevel: "Low",
      reason: `Image quality insufficient (${quality.reasons.join(", ") || "low quality score"}) — retake recommended.`,
      qualityGatePassed: false,
      calibrationStatus: calibration?.status || "uncalibrated",
      observedRgb,
      normalizedRgb: observedRgb,
      observedHex: rgbToHex(...observedRgb),
      normalizedHex: rgbToHex(...observedRgb),
      disclaimer: PRESUMPTIVE_DISCLAIMER,
      classifierVersion: config.version,
      calibrationVersion: CALIBRATION_VERSION
    };
  }

  // 2. Color Normalization
  const normResult = normalizeReactionColor(observedRgb, calibration);
  const normalizedRgb = normResult.normalizedRgb;
  const normalizedLab = normResult.normalizedLab;
  const normalizedHex = normResult.hex;

  // 3. Profile Matching in CIE Lab
  const posMatch = findClosestProfile(normalizedLab, config.profiles.positive);
  const negMatch = findClosestProfile(normalizedLab, config.profiles.negative);

  const deltaEPos = posMatch.minDeltaE;
  const deltaENeg = negMatch.minDeltaE;
  const margin = Math.abs(deltaEPos - deltaENeg);

  // 4. Decision Logic
  let classification = "inconclusive";
  let label = "Inconclusive";
  let reason = "";
  let rawConfidence = 50;

  const withinPosLimit = deltaEPos <= config.maxPositiveDeltaE;
  const withinNegLimit = deltaENeg <= config.maxNegativeDeltaE;

  if (!withinPosLimit && !withinNegLimit) {
    classification = "inconclusive";
    label = "Inconclusive";
    reason = `Observed reaction color (${normalizedHex}) does not sufficiently match positive (ΔE ${deltaEPos}) or negative (ΔE ${deltaENeg}) reference profiles.`;
    rawConfidence = Math.max(20, 50 - Math.min(deltaEPos, deltaENeg));
  } else if (margin < config.ambiguityMarginDeltaE) {
    classification = "inconclusive";
    label = "Inconclusive";
    reason = `Ambiguous color transition: color is near decision boundary between positive (ΔE ${deltaEPos}) and negative (ΔE ${deltaENeg}).`;
    rawConfidence = 50 - Math.round((config.ambiguityMarginDeltaE - margin) * 3);
  } else if (deltaEPos < deltaENeg && withinPosLimit) {
    classification = "positive";
    label = "Presumptive positive";
    reason = `Observed color matches positive chromogenic response (${posMatch.closest.name}, ΔE ${deltaEPos}).`;
    // Confidence increases with distance to negative and closeness to positive
    const distFactor = Math.min(1.0, margin / 30.0);
    const fitFactor = Math.max(0.0, 1.0 - (deltaEPos / config.maxPositiveDeltaE));
    rawConfidence = 60 + Math.round((distFactor * 0.6 + fitFactor * 0.4) * 35);
  } else if (deltaENeg < deltaEPos && withinNegLimit) {
    classification = "negative";
    label = "Presumptive negative";
    reason = `Observed color matches negative/unreacted baseline profile (${negMatch.closest.name}, ΔE ${deltaENeg}).`;
    const distFactor = Math.min(1.0, margin / 30.0);
    const fitFactor = Math.max(0.0, 1.0 - (deltaENeg / config.maxNegativeDeltaE));
    rawConfidence = 60 + Math.round((distFactor * 0.6 + fitFactor * 0.4) * 35);
  } else {
    classification = "inconclusive";
    label = "Inconclusive";
    reason = "Borderline spectral characteristics — could not be resolved reliably.";
    rawConfidence = 45;
  }

  // Adjust confidence for calibration and quality
  if (!calibration || !calibration.calibrated) {
    rawConfidence = Math.round(rawConfidence * 0.85); // 15% confidence penalty if uncalibrated
  }
  if (quality && quality.score < 70) {
    rawConfidence = Math.round(rawConfidence * (quality.score / 100));
  }

  // Clamp confidence strictly to [15%..95%] - never 100% because presumptive field tests have intrinsic uncertainty
  const confidence = Math.max(15, Math.min(95, Math.round(rawConfidence)));

  let confidenceLevel = "Low";
  if (confidence >= 80) confidenceLevel = "High";
  else if (confidence >= 60) confidenceLevel = "Medium";

  // Re-verify against threshold
  if (confidence < config.minConfidenceThreshold && classification !== "inconclusive") {
    classification = "inconclusive";
    label = "Inconclusive";
    reason = `Classification confidence (${confidence}%) is below minimum operational threshold (${config.minConfidenceThreshold}%). Retake or manual reading recommended.`;
  }

  return {
    classification,
    label,
    confidence,
    confidenceLevel,
    reason,
    qualityGatePassed: true,
    calibrationStatus: calibration?.status || "uncalibrated",
    calibrationNote: calibration?.illuminationNote || "none",
    observedRgb,
    observedHex: rgbToHex(...observedRgb),
    normalizedRgb,
    normalizedHex,
    normalizedLab,
    deltaEPositive: deltaEPos,
    deltaENegative: deltaENeg,
    closestPositiveProfile: posMatch.closest.name,
    closestNegativeProfile: negMatch.closest.name,
    disclaimer: PRESUMPTIVE_DISCLAIMER,
    classifierVersion: config.version,
    calibrationVersion: CALIBRATION_VERSION
  };
}

/**
 * End-to-end pipeline: analyzes raw RGBA pixel buffer.
 *
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {object} [guard] Guard result from analysePixels
 * @param {object} [options]
 * @returns {object} Full classification outcome with quality and calibration details
 */
export function classifyImagePixels(data, width, height, guard = null, options = {}) {
  // 1. Image Quality Assessment
  const quality = assessPixelQuality(data, width, height);

  // 2. Calibration from Guard / Swatch Detection
  let calibration = null;
  if (guard && guard.accepted) {
    if (guard.calibration && guard.calibration.calibrated) {
      calibration = guard.calibration;
    } else if (guard.colorName) {
      const nominal = REFERENCE_SWATCHES.find(
        (s) => s.name.toLowerCase() === String(guard.colorName).toLowerCase()
      );
      if (nominal) {
        calibration = computeCalibrationTransform([
          {
            name: guard.colorName,
            observedRgb: guard.observedRgb || [...nominal.rgb],
            nominalRgb: [...nominal.rgb]
          }
        ]);
      }
    }
  }

  if (!calibration) {
    calibration = {
      calibrated: false,
      status: "uncalibrated",
      illuminationNote: "no reference card calibrated"
    };
  }

  // 3. Extract Reaction ROI
  const roi = extractReactionRoi(data, width, height);

  // Check for reference card intrusion into central reaction zone
  if (guard && guard.accepted && guard.observedRgb) {
    const dr = roi.meanRgb[0] - guard.observedRgb[0];
    const dg = roi.meanRgb[1] - guard.observedRgb[1];
    const db = roi.meanRgb[2] - guard.observedRgb[2];
    const swatchDist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (swatchDist < 18) {
      return {
        classification: "inconclusive",
        label: "Inconclusive",
        confidence: 0,
        confidenceLevel: "None",
        reason: "Reference card appears positioned inside central reaction zone. Center the test kit pouch within the reticle and place card along the perimeter.",
        qualityGatePassed: false,
        calibrationStatus: calibration?.status || "uncalibrated",
        observedRgb: roi.meanRgb,
        normalizedRgb: roi.meanRgb,
        observedHex: rgbToHex(...roi.meanRgb),
        normalizedHex: rgbToHex(...roi.meanRgb),
        disclaimer: PRESUMPTIVE_DISCLAIMER,
        classifierVersion: options.config?.version || CLASSIFIER_CONFIG.version,
        calibrationVersion: CALIBRATION_VERSION,
        quality,
        calibration,
        roi: roi.roi
      };
    }
  }

  // 4. Classify Features
  const result = classifyReactionFeatures({
    observedRgb: roi.meanRgb,
    quality,
    calibration,
    config: options.config || CLASSIFIER_CONFIG
  });

  return {
    ...result,
    quality,
    calibration,
    roi: roi.roi
  };
}

/**
 * End-to-end classification from a Data URL (in browser environment).
 *
 * @param {string} imageDataUrl
 * @param {object} [guard]
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function classifyImageDataUrl(imageDataUrl, guard = null, options = {}) {
  if (!imageDataUrl) {
    return {
      classification: "inconclusive",
      label: "Inconclusive",
      confidence: 0,
      confidenceLevel: "None",
      reason: "No image provided",
      qualityGatePassed: false,
      disclaimer: PRESUMPTIVE_DISCLAIMER,
      classifierVersion: CLASSIFIER_VERSION,
      calibrationVersion: CALIBRATION_VERSION
    };
  }

  if (typeof Image === "undefined" || typeof document === "undefined") {
    // Non-browser fallback for testing
    return classifyReactionFeatures({
      observedRgb: [120, 120, 120],
      quality: { acceptable: true, score: 75, reasons: [] },
      calibration: null,
      config: options.config || CLASSIFIER_CONFIG
    });
  }

  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Unable to decode frame for classification"));
      img.src = imageDataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return classifyImagePixels(data, canvas.width, canvas.height, guard, options);
  } catch (error) {
    return {
      classification: "inconclusive",
      label: "Inconclusive",
      confidence: 0,
      confidenceLevel: "None",
      reason: `Frame analysis error: ${error.message}`,
      qualityGatePassed: false,
      disclaimer: PRESUMPTIVE_DISCLAIMER,
      classifierVersion: CLASSIFIER_VERSION,
      calibrationVersion: CALIBRATION_VERSION
    };
  }
}
