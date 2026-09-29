import { describe, it, expect } from "vitest";
import {
  assessPixelQuality,
  assessImageQuality,
  rgbToLuminance,
  MIN_WIDTH,
  MIN_HEIGHT,
  QUALITY_THRESHOLDS
} from "../src/lib/image-quality.js";

function makeBuffer(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a = 255] = fillFn(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return data;
}

describe("rgbToLuminance", () => {
  it("calculates standard Rec. 601 grayscale coefficients", () => {
    expect(rgbToLuminance(0, 0, 0)).toBe(0);
    expect(rgbToLuminance(255, 255, 255)).toBeCloseTo(255, 1);
    expect(rgbToLuminance(255, 0, 0)).toBeCloseTo(76.245, 1);
    expect(rgbToLuminance(0, 255, 0)).toBeCloseTo(149.685, 1);
    expect(rgbToLuminance(0, 0, 255)).toBeCloseTo(29.07, 1);
  });
});

describe("assessPixelQuality", () => {
  const w = 400;
  const h = 300;

  it("accepts a well-exposed, sharp, high-contrast frame", () => {
    // Sharp checkerboard pattern with moderate luminance
    const data = makeBuffer(w, h, (x, y) => {
      const check = ((x >> 3) + (y >> 3)) % 2 === 0;
      return check ? [180, 180, 180] : [60, 60, 60];
    });

    const res = assessPixelQuality(data, w, h);
    expect(res.acceptable).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(70);
    expect(res.exposure.status).toBe("adequate");
    expect(res.sharpness.status).toBe("sharp");
    expect(res.reasons).toHaveLength(0);
  });

  it("rejects a frame below minimum resolution", () => {
    const lowW = 200;
    const lowH = 150;
    const data = makeBuffer(lowW, lowH, () => [120, 120, 120]);
    const res = assessPixelQuality(data, lowW, lowH);
    expect(res.acceptable).toBe(false);
    expect(res.resolution.status).toBe("low");
    expect(res.reasons.some((r) => r.includes("Low resolution"))).toBe(true);
  });

  it("flags underexposed frames with excessive shadow", () => {
    const data = makeBuffer(w, h, () => [15, 12, 18]); // very dark
    const res = assessPixelQuality(data, w, h);
    expect(res.acceptable).toBe(false);
    expect(res.exposure.status).toBe("underexposed");
    expect(res.reasons.some((r) => r.includes("underexposed"))).toBe(true);
  });

  it("flags overexposed frames with blown highlights", () => {
    const data = makeBuffer(w, h, () => [245, 245, 248]); // washed out
    const res = assessPixelQuality(data, w, h);
    expect(res.acceptable).toBe(false);
    expect(res.exposure.status).toBe("overexposed");
    expect(res.reasons.some((r) => r.includes("overexposed"))).toBe(true);
  });

  it("flags blurred frames with low Laplacian variance", () => {
    // Perfectly flat solid color has zero Laplacian variance (no edges/sharpness)
    const data = makeBuffer(w, h, () => [120, 120, 120]);
    const res = assessPixelQuality(data, w, h);
    expect(res.sharpness.status).toBe("blurred");
    expect(res.reasons.some((r) => r.includes("blur"))).toBe(true);
  });
});

describe("assessImageQuality fallback", () => {
  it("handles null or missing image gracefully", async () => {
    const res = await assessImageQuality(null);
    expect(res.acceptable).toBe(false);
    expect(res.score).toBe(0);
    expect(res.reasons.length).toBeGreaterThan(0);
  });
});
