import { describe, it, expect } from "vitest";
import {
  sRgbChannelToLinear,
  linearChannelToSRgb,
  rgbToXyz,
  xyzToRgb,
  rgbToLab,
  labToRgb,
  deltaE76,
  rgbToHex,
  computeCalibrationTransform,
  normalizeReactionColor,
  NOMINAL_REFERENCE_SWATCHES,
  REFERENCE_SWATCHES_LAB
} from "../src/lib/calibration.js";

describe("Color Space Conversions", () => {
  it("linearizes and delinearizes sRGB correctly", () => {
    expect(sRgbChannelToLinear(0)).toBe(0);
    expect(sRgbChannelToLinear(255)).toBeCloseTo(1.0, 4);
    expect(linearChannelToSRgb(0)).toBe(0);
    expect(linearChannelToSRgb(1.0)).toBe(255);
    expect(linearChannelToSRgb(sRgbChannelToLinear(128))).toBe(128);
  });

  it("converts sRGB to CIE XYZ and round-trips back", () => {
    const original = [150, 80, 200];
    const [x, y, z] = rgbToXyz(...original);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);

    const [r, g, b] = xyzToRgb(x, y, z);
    expect(r).toBeCloseTo(original[0], 0);
    expect(g).toBeCloseTo(original[1], 0);
    expect(b).toBeCloseTo(original[2], 0);
  });

  it("converts sRGB to CIE L*a*b* and round-trips back", () => {
    // Pure White
    const [lw, aw, bw] = rgbToLab(255, 255, 255);
    expect(lw).toBeCloseTo(100.0, 0);
    expect(aw).toBeCloseTo(0.0, 1);
    expect(bw).toBeCloseTo(0.0, 1);

    // Pure Black
    const [lb, ab, bb] = rgbToLab(0, 0, 0);
    expect(lb).toBeCloseTo(0.0, 0);

    // Round-trip arbitrary test color
    const testColor = [180, 45, 90];
    const [l, a, b] = rgbToLab(...testColor);
    const roundTripped = labToRgb(l, a, b);
    expect(roundTripped[0]).toBeCloseTo(testColor[0], 0);
    expect(roundTripped[1]).toBeCloseTo(testColor[1], 0);
    expect(roundTripped[2]).toBeCloseTo(testColor[2], 0);
  });

  it("converts RGB to hex format correctly", () => {
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
    expect(rgbToHex(0, 255, 0)).toBe("#00ff00");
    expect(rgbToHex(0, 0, 255)).toBe("#0000ff");
    expect(rgbToHex(15, 65, 160)).toBe("#0f41a0");
  });
});

describe("deltaE76 Color Difference", () => {
  it("computes 0 for identical colors", () => {
    const lab = [50.0, 20.0, -30.0];
    expect(deltaE76(lab, lab)).toBe(0);
  });

  it("computes ~100 between pure black and pure white", () => {
    const white = rgbToLab(255, 255, 255);
    const black = rgbToLab(0, 0, 0);
    expect(deltaE76(white, black)).toBeCloseTo(100, 0);
  });

  it("reflects perceptual distance accurately", () => {
    const red = rgbToLab(220, 20, 20);
    const pink = rgbToLab(220, 50, 50);
    const blue = rgbToLab(20, 20, 220);

    // Distance between red and pink should be significantly smaller than red and blue
    expect(deltaE76(red, pink)).toBeLessThan(deltaE76(red, blue));
  });
});

describe("Reference Swatches Lab coordinates", () => {
  it("provides 8 reference swatches with valid Lab coordinates", () => {
    expect(REFERENCE_SWATCHES_LAB).toHaveLength(8);
    for (const swatch of REFERENCE_SWATCHES_LAB) {
      expect(swatch.name).toBeTruthy();
      expect(swatch.lab[0]).toBeGreaterThanOrEqual(0);
      expect(swatch.lab[0]).toBeLessThanOrEqual(100);
    }
  });
});

describe("computeCalibrationTransform & Normalization", () => {
  it("computes identity gains for perfect match", () => {
    const yellow = NOMINAL_REFERENCE_SWATCHES[5];
    const transform = computeCalibrationTransform([
      { name: yellow.name, observedRgb: [...yellow.rgb], nominalRgb: [...yellow.rgb] }
    ]);

    expect(transform.calibrated).toBe(true);
    expect(transform.gainR).toBeCloseTo(1.0, 1);
    expect(transform.gainG).toBeCloseTo(1.0, 1);
    expect(transform.gainB).toBeCloseTo(1.0, 1);
    expect(transform.deltaEAvg).toBeCloseTo(0, 1);
  });

  it("corrects warm tungsten lighting shift (compensates blue deficiency)", () => {
    const swatch = NOMINAL_REFERENCE_SWATCHES[0]; // Orange [255, 98, 4]
    // Under warm light, red is boosted, blue is attenuated
    const warmObserved = [255, 110, 2];
    const transform = computeCalibrationTransform([
      { name: swatch.name, observedRgb: warmObserved, nominalRgb: swatch.rgb }
    ]);

    expect(transform.calibrated).toBe(true);
    // Blue gain should be greater than red gain to counteract yellow cast
    expect(transform.gainB).toBeGreaterThan(transform.gainR);
  });

  it("normalizes an observed reaction color according to transform", () => {
    const transform = {
      calibrated: true,
      gainR: 1.1,
      gainG: 1.0,
      gainB: 0.9,
      status: "calibrated"
    };

    const reaction = [100, 100, 100];
    const normalized = normalizeReactionColor(reaction, transform);
    expect(normalized.calibrated).toBe(true);
    expect(normalized.normalizedRgb[0]).toBeGreaterThan(normalized.normalizedRgb[2]);
    expect(normalized.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("handles uncalibrated state safely", () => {
    const transform = computeCalibrationTransform([]);
    expect(transform.calibrated).toBe(false);
    expect(transform.status).toBe("uncalibrated");

    const normalized = normalizeReactionColor([120, 80, 40], transform);
    expect(normalized.calibrated).toBe(false);
    expect(normalized.normalizedRgb).toEqual([120, 80, 40]);
  });
});
