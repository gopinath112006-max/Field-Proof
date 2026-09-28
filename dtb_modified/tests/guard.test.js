import { describe, it, expect } from "vitest";
import {
  REFERENCE_SWATCHES,
  SAMPLE_WIDTH,
  SAMPLE_HEIGHT,
  UNMATCHABLE_NOTE,
  classifyPixel,
  analysePixels
} from "../src/lib/guard.js";

/** Build an RGBA buffer from a per-pixel colour function. */
function buffer(width, height, colourAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = colourAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = a;
    }
  }
  return data;
}

/** A solid axis-aligned rectangle on a background far from every swatch. */
function withRect(width, height, x0, y0, w, h, swatch) {
  return buffer(width, height, (x, y) => {
    const inside = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
    return inside ? [...swatch.rgb] : [4, 6, 10];
  });
}

const first = REFERENCE_SWATCHES[0];

describe("classifyPixel", () => {
  it("matches a swatch exactly and rejects a distant colour", () => {
    expect(classifyPixel(...first.rgb)).toBe(0);
    expect(classifyPixel(0, 0, 0)).toBe(-1);
    expect(classifyPixel(255, 255, 255)).toBe(-1);
  });

  it("does not match a swatch that is just outside the tolerance", () => {
    const [r, g, b] = first.rgb;
    const justOutside = first.rgb.map((v) => Math.min(255, v + 200));
    expect(classifyPixel(...justOutside)).toBe(-1);
    // Sanity check that the fixture itself is not degenerate.
    expect(classifyPixel(r, g, b)).toBe(0);
  });
});

describe("copy honesty", () => {
  it("explains the limit of a no-match instead of implying a clean result", () => {
    expect(UNMATCHABLE_NOTE).toMatch(/cannot be auto-matched/i);
    expect(UNMATCHABLE_NOTE).toMatch(/still recorded/i);
    // It must not read as a verdict about the sample.
    expect(UNMATCHABLE_NOTE).not.toMatch(/\bnegative\b|\bclean\b|\bno drugs?\b/i);
  });

  it("ships a non-empty swatch table", () => {
    expect(REFERENCE_SWATCHES.length).toBeGreaterThan(0);
    for (const swatch of REFERENCE_SWATCHES) {
      expect(swatch.name).toBeTruthy();
      expect(swatch.rgb).toHaveLength(3);
      for (const channel of swatch.rgb) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe("analysePixels", () => {
  it("accepts one solid contiguous swatch block and reports its colour", () => {
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const data = withRect(w, h, 20, 20, 70, 60, first);
    const result = analysePixels(data, w, h);

    expect(result.accepted).toBe(true);
    expect(result.colorName).toBe(first.name);
    // 70*60 = 4200 of 192*128 = 24576 pixels.
    expect(result.coverage).toBeCloseTo(4200 / (w * h), 3);
    // A solid rectangle fills its own bounding box.
    expect(result.fill).toBeCloseTo(1, 2);
    expect(result.aspect).toBeCloseTo(70 / 60, 1);
  });

  it("rejects a frame with no swatch anywhere in it", () => {
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const result = analysePixels(buffer(w, h, () => [7, 9, 14]), w, h);
    expect(result.accepted).toBe(false);
    expect(result.colorName).toBe("");
    expect(result.coverage).toBe(0);
    // A rejection must still explain itself rather than returning an empty reason.
    expect(result.reason).toMatch(/no contiguous reference-swatch region/i);
  });

  it("rejects a swatch too small to be a reference surface", () => {
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    // 8x8 = 64 px, 0.26% coverage, far below the 6% floor.
    const result = analysePixels(withRect(w, h, 40, 40, 8, 8, first), w, h);
    expect(result.accepted).toBe(false);
  });

  it("treats matching pixels as one region instead of one per pixel", () => {
    // This is the regression test for the original labelling bug, which gave
    // every matching pixel its own label. The flood fill then found no
    // neighbours, so every component had area 1 and no region could ever reach
    // the coverage floor.
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const data = withRect(w, h, 10, 10, 90, 80, first);
    const result = analysePixels(data, w, h);
    expect(result.accepted).toBe(true);
    expect(result.coverage).toBeGreaterThan(0.06);
  });

  it("keeps two distant patches from combining into one full rectangle", () => {
    // Both patches alone are below the coverage floor, but together they exceed
    // it. Merging them into a single bounding box would produce a region that
    // is mostly background; per-region grouping keeps them below the floor.
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const data = withRect(w, h, 4, 4, 20, 20, first);
    const second = buffer(w, h, (x, y) => {
      const inside = x >= 160 && x < 180 && y >= 100 && y < 120;
      return inside ? [...first.rgb] : [4, 6, 10];
    });
    for (let i = 0; i < data.length; i += 1) data[i] = second[i];
    const result = analysePixels(data, w, h);
    expect(result.accepted).toBe(false);
  });

  it("ignores fully transparent pixels as a possible reference surface", () => {
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const data = withRect(w, h, 20, 20, 80, 70, first);
    // Punch the whole rectangle out to alpha 0.
    for (let y = 20; y < 90; y += 1) {
      for (let x = 20; x < 100; x += 1) data[(y * w + x) * 4 + 3] = 0;
    }
    expect(analysePixels(data, w, h).accepted).toBe(false);
  });

  it("reports the weakest confidence as weak rather than certain", () => {
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    // Just over the coverage floor, so the frame is usable but not confident.
    const result = analysePixels(withRect(w, h, 20, 20, 45, 40, first), w, h);
    expect(result.accepted).toBe(true);
    expect(result.weak).toBe(true);
    expect(result.confidence).toBeLessThan(0.4);
  });

  it("is deterministic", () => {
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const data = withRect(w, h, 20, 20, 70, 60, first);
    expect(analysePixels(data, w, h)).toEqual(analysePixels(data, w, h));
  });

  it("does not classify anything beyond the swatch colour it found", () => {
    // Whatever the geometry says, the only classification available is a colour
    // name. There is no field here that could carry a substance verdict.
    const w = SAMPLE_WIDTH;
    const h = SAMPLE_HEIGHT;
    const result = analysePixels(withRect(w, h, 20, 20, 70, 60, first), w, h);
    const keys = Object.keys(result);
    expect(keys).toContain("colorName");
    expect(keys).not.toContain("substance");
    expect(keys).not.toContain("result");
    expect(keys).not.toContain("positive");
  });
});
