import { describe, expect, it } from "vitest";
import {
  CLASSIFIER_CONFIG,
  CLASSIFIER_VERSION,
  PRESUMPTIVE_DISCLAIMER,
  classifyImagePixels,
  classifyReactionFeatures,
  extractReactionRoi,
  findClosestProfile
} from "../src/lib/classifier.js";
import { createSyntheticPixelBuffer } from "./fixtures/dataset.js";

describe("Classifier Module", () => {
  describe("Configuration & Safety Disclaimers", () => {
    it("exports classifier version and frozen configuration", () => {
      expect(CLASSIFIER_VERSION).toBe("1.0.0");
      expect(CLASSIFIER_CONFIG.version).toBe("1.0.0");
      expect(Object.isFrozen(CLASSIFIER_CONFIG)).toBe(true);
      expect(CLASSIFIER_CONFIG.minQualityScore).toBeGreaterThan(0);
      expect(CLASSIFIER_CONFIG.maxPositiveDeltaE).toBeGreaterThan(0);
      expect(CLASSIFIER_CONFIG.maxNegativeDeltaE).toBeGreaterThan(0);
    });

    it("enforces presumptive disclaimer with laboratory confirmation mandate", () => {
      expect(PRESUMPTIVE_DISCLAIMER).toMatch(/presumptive/i);
      expect(PRESUMPTIVE_DISCLAIMER).toMatch(/laboratory confirmatory testing/i);
    });
  });

  describe("extractReactionRoi", () => {
    it("extracts central 30% ROI and computes average RGB", () => {
      const width = 100;
      const height = 100;
      const data = new Uint8ClampedArray(width * height * 4);

      // Fill everything with 200, 100, 50
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 200;
        data[i + 1] = 100;
        data[i + 2] = 50;
        data[i + 3] = 255;
      }

      const res = extractReactionRoi(data, width, height);
      expect(res.meanRgb).toEqual([200, 100, 50]);
      expect(res.pixelCount).toBeGreaterThan(0);
      expect(res.roi.w).toBe(30);
      expect(res.roi.h).toBe(30);
    });

    it("filters out specular highlights (>248) and dark shadows (<15)", () => {
      const width = 100;
      const height = 100;
      const data = new Uint8ClampedArray(width * height * 4);

      // In central ROI (35..65), put half specular white (255, 255, 255) and half color (100, 50, 150)
      for (let y = 35; y < 65; y += 1) {
        for (let x = 35; x < 65; x += 1) {
          const idx = (y * width + x) * 4;
          if (x < 50) {
            // Specular glare: should be ignored
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          } else {
            // Target color
            data[idx] = 100;
            data[idx + 1] = 50;
            data[idx + 2] = 150;
            data[idx + 3] = 255;
          }
        }
      }

      const res = extractReactionRoi(data, width, height);
      expect(res.meanRgb).toEqual([100, 50, 150]);
      expect(res.pixelCount).toBe(15 * 30); // only the non-glare half was counted
    });

    it("handles degenerate case where all pixels are clipped", () => {
      const width = 50;
      const height = 50;
      const data = new Uint8ClampedArray(width * height * 4); // all 0 (shadows)
      const res = extractReactionRoi(data, width, height);
      expect(res.pixelCount).toBe(0);
      expect(res.meanRgb).toEqual([128, 128, 128]);
    });
  });

  describe("findClosestProfile", () => {
    it("correctly identifies closest CIE Lab profile", () => {
      const profiles = CLASSIFIER_CONFIG.profiles.positive;
      // Cobalt blue reference lab is [34, 12, -48]
      const queryLab = [35.0, 11.0, -47.0];
      const match = findClosestProfile(queryLab, profiles);
      expect(match.closest.name).toContain("Cobalt Blue");
      expect(match.minDeltaE).toBeLessThan(3.0);
    });
  });

  describe("classifyReactionFeatures", () => {
    const perfectQuality = { acceptable: true, score: 90, reasons: [] };
    const perfectCalibration = {
      calibrated: true,
      status: "calibrated",
      gainR: 1.0,
      gainG: 1.0,
      gainB: 1.0,
      gains: [1.0, 1.0, 1.0],
      deltaEError: 2.1,
      illuminationNote: "nominal"
    };

    it("classifies positive chromogenic reaction as Presumptive positive", () => {
      // Cobalt blue reaction [15, 65, 160]
      const result = classifyReactionFeatures({
        observedRgb: [15, 65, 160],
        quality: perfectQuality,
        calibration: perfectCalibration
      });

      expect(result.classification).toBe("positive");
      expect(result.label).toBe("Presumptive positive");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.confidence).toBeLessThanOrEqual(95);
      expect(result.confidenceLevel).toMatch(/Medium|High/);
      expect(result.qualityGatePassed).toBe(true);
      expect(result.disclaimer).toBe(PRESUMPTIVE_DISCLAIMER);
    });

    it("classifies unreacted baseline as Presumptive negative", () => {
      // Amber/straw unreacted reagent [222, 186, 98]
      const result = classifyReactionFeatures({
        observedRgb: [222, 186, 98],
        quality: perfectQuality,
        calibration: perfectCalibration
      });

      expect(result.classification).toBe("negative");
      expect(result.label).toBe("Presumptive negative");
      expect(result.confidence).toBeGreaterThanOrEqual(60);
      expect(result.confidence).toBeLessThanOrEqual(95);
      expect(result.qualityGatePassed).toBe(true);
    });

    it("rejects image and returns inconclusive when image quality fails quality gate", () => {
      const poorQuality = { acceptable: false, score: 25, reasons: ["severe blur", "underexposed"] };
      const result = classifyReactionFeatures({
        observedRgb: [15, 65, 160],
        quality: poorQuality,
        calibration: perfectCalibration
      });

      expect(result.classification).toBe("inconclusive");
      expect(result.label).toBe("Inconclusive");
      expect(result.confidence).toBe(0);
      expect(result.qualityGatePassed).toBe(false);
      expect(result.reason).toContain("Image quality insufficient");
      expect(result.reason).toContain("retake recommended");
    });

    it("returns inconclusive when color matches neither positive nor negative profiles", () => {
      // Bright neon green [0, 255, 0] is neither positive nor negative field reagent color
      const result = classifyReactionFeatures({
        observedRgb: [0, 255, 0],
        quality: perfectQuality,
        calibration: perfectCalibration
      });

      expect(result.classification).toBe("inconclusive");
      expect(result.label).toBe("Inconclusive");
      expect(result.qualityGatePassed).toBe(true);
      expect(result.reason).toContain("does not sufficiently match");
    });

    it("returns inconclusive when color is ambiguous (near decision boundary)", () => {
      // Middle grayish-brown
      const result = classifyReactionFeatures({
        observedRgb: [115, 105, 105],
        quality: perfectQuality,
        calibration: perfectCalibration
      });

      expect(result.classification).toBe("inconclusive");
      expect(result.label).toBe("Inconclusive");
    });

    it("never claims scientific certainty: confidence clamped between 15% and 95%", () => {
      // Even for an exact match to reference
      const result = classifyReactionFeatures({
        observedRgb: [15, 65, 160],
        quality: perfectQuality,
        calibration: perfectCalibration
      });

      expect(result.confidence).toBeLessThanOrEqual(95);
      expect(result.confidence).toBeGreaterThanOrEqual(15);
      expect(result.confidence).not.toBe(100);
    });

    it("applies confidence penalty when uncalibrated", () => {
      const calibratedRes = classifyReactionFeatures({
        observedRgb: [15, 65, 160],
        quality: perfectQuality,
        calibration: perfectCalibration
      });

      const uncalibratedRes = classifyReactionFeatures({
        observedRgb: [15, 65, 160],
        quality: perfectQuality,
        calibration: { calibrated: false, status: "uncalibrated" }
      });

      expect(uncalibratedRes.confidence).toBeLessThan(calibratedRes.confidence);
      expect(uncalibratedRes.calibrationStatus).toBe("uncalibrated");
    });
  });

  describe("classifyImagePixels", () => {
    it("processes a synthetic positive frame end-to-end", () => {
      const data = createSyntheticPixelBuffer(320, 240, {
        reactionRgb: [15, 65, 160],
        swatchRgb: [220, 40, 40]
      });

      const guard = {
        accepted: true,
        colorName: "red"
      };

      const result = classifyImagePixels(data, 320, 240, guard);
      expect(result.qualityGatePassed).toBe(true);
      expect(result.classification).toBe("positive");
      expect(result.label).toBe("Presumptive positive");
      expect(result.roi).toBeDefined();
      expect(result.calibrationStatus).toBe("calibrated");
    });

    it("detects underexposed frame and rejects at quality gate", () => {
      const data = createSyntheticPixelBuffer(320, 240, {
        reactionRgb: [15, 65, 160],
        underexposed: true
      });

      const result = classifyImagePixels(data, 320, 240, null);
      expect(result.classification).toBe("inconclusive");
      expect(result.qualityGatePassed).toBe(false);
      expect(result.reason).toContain("Image quality insufficient");
    });

    it("rejects frame when reference card is mistakenly placed inside central reaction zone", () => {
      // Simulate user placing red reference card directly in center reaction zone
      const data = createSyntheticPixelBuffer(320, 240, {
        reactionRgb: [146, 31, 36], // Same as red swatch
        swatchRgb: [146, 31, 36]
      });

      const guard = {
        accepted: true,
        colorName: "Red",
        observedRgb: [146, 31, 36]
      };

      const result = classifyImagePixels(data, 320, 240, guard);
      expect(result.classification).toBe("inconclusive");
      expect(result.qualityGatePassed).toBe(false);
      expect(result.reason).toContain("Reference card appears positioned inside central reaction zone");
    });
  });
});
