/**
 * Ground-Truth Validation Dataset Fixtures for FieldCheck.
 *
 * Provides calibrated test cases categorized by:
 * - Positive chromogenic responses (under standard, warm, and cool illumination)
 * - Negative baseline responses (under standard, warm, and cool illumination)
 * - Inconclusive cases (ambiguous borderline colors, uncalibrated outliers)
 * - Poor quality cases (blurred, underexposed, low-resolution)
 */

import { REFERENCE_SWATCHES } from "../../src/lib/guard.js";

/** Helper to generate an RGBA pixel buffer representing a frame */
export function createSyntheticPixelBuffer(width, height, {
  reactionRgb = [128, 128, 128],
  swatchRgb = null,
  bgRgb = [140, 145, 150],
  underexposed = false,
  blurred = false
}) {
  const total = width * height;
  const data = new Uint8ClampedArray(total * 4);

  // Reaction zone bounds (central 35% - 65%)
  const rx0 = Math.round(width * 0.35);
  const ry0 = Math.round(height * 0.35);
  const rx1 = Math.round(width * 0.65);
  const ry1 = Math.round(height * 0.65);

  // Swatch zone bounds (left 10% - 30%, bottom 40% - 80%)
  const sx0 = Math.round(width * 0.10);
  const sy0 = Math.round(height * 0.40);
  const sx1 = Math.round(width * 0.30);
  const sy1 = Math.round(height * 0.80);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      let r = bgRgb[0];
      let g = bgRgb[1];
      let b = bgRgb[2];

      if (swatchRgb && x >= sx0 && x <= sx1 && y >= sy0 && y <= sy1) {
        r = swatchRgb[0];
        g = swatchRgb[1];
        b = swatchRgb[2];
      } else if (x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1) {
        r = reactionRgb[0];
        g = reactionRgb[1];
        b = reactionRgb[2];
      }

      if (underexposed) {
        r = Math.round(r * 0.1);
        g = Math.round(g * 0.1);
        b = Math.round(b * 0.1);
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  // Registration markings simulating high-frequency card borders
  if (!underexposed) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if ((y < 8 || y >= height - 8 || x < 8 || x >= width - 8) && (x + y) % 3 === 0) {
          const idx = (y * width + x) * 4;
          data[idx] = 20;
          data[idx + 1] = 20;
          data[idx + 2] = 20;
        }
      }
    }
  }

  // If blur is simulated on the buffer, smooth adjacent pixels
  if (blurred) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = (y * width + x) * 4;
        let sr = 0, sg = 0, sb = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            sr += copy[nIdx];
            sg += copy[nIdx + 1];
            sb += copy[nIdx + 2];
          }
        }
        data[idx] = Math.round(sr / 9);
        data[idx + 1] = Math.round(sg / 9);
        data[idx + 2] = Math.round(sb / 9);
      }
    }
  }

  return data;
}

export const VALIDATION_FIXTURES = [
  // 1. Positive Samples
  {
    id: "pos_standard_cobalt",
    expected: "positive",
    category: "positive",
    lighting: "standard",
    width: 320,
    height: 240,
    reactionRgb: [15, 65, 160], // Cobalt Blue
    swatch: REFERENCE_SWATCHES[5] // Yellow
  },
  {
    id: "pos_warm_cobalt",
    expected: "positive",
    category: "positive",
    lighting: "warm",
    width: 320,
    height: 240,
    reactionRgb: [28, 62, 145], // Cobalt Blue shifted under warm illumination
    swatch: REFERENCE_SWATCHES[0] // Orange
  },
  {
    id: "pos_cool_violet",
    expected: "positive",
    category: "positive",
    lighting: "cool",
    width: 320,
    height: 240,
    reactionRgb: [72, 22, 128], // Deep Violet
    swatch: REFERENCE_SWATCHES[2] // Pink
  },
  {
    id: "pos_crimson",
    expected: "positive",
    category: "positive",
    lighting: "standard",
    width: 320,
    height: 240,
    reactionRgb: [180, 32, 48], // Crimson Red
    swatch: REFERENCE_SWATCHES[4] // Red
  },

  // 2. Negative Samples
  {
    id: "neg_standard_amber",
    expected: "negative",
    category: "negative",
    lighting: "standard",
    width: 320,
    height: 240,
    reactionRgb: [222, 186, 98], // Amber reagent
    swatch: REFERENCE_SWATCHES[2] // Pink
  },
  {
    id: "neg_warm_amber",
    expected: "negative",
    category: "negative",
    lighting: "warm",
    width: 320,
    height: 240,
    reactionRgb: [235, 182, 85], // Warm-shifted amber
    swatch: REFERENCE_SWATCHES[5] // Yellow
  },
  {
    id: "neg_cool_baseline",
    expected: "negative",
    category: "negative",
    lighting: "cool",
    width: 320,
    height: 240,
    reactionRgb: [215, 225, 225], // Cool neutral baseline
    swatch: REFERENCE_SWATCHES[7] // Blue
  },
  {
    id: "neg_straw",
    expected: "negative",
    category: "negative",
    lighting: "standard",
    width: 320,
    height: 240,
    reactionRgb: [236, 222, 158], // Pale straw
    swatch: REFERENCE_SWATCHES[3] // Green
  },

  // 3. Inconclusive Samples
  {
    id: "inconclusive_borderline",
    expected: "inconclusive",
    category: "inconclusive",
    lighting: "standard",
    width: 320,
    height: 240,
    reactionRgb: [130, 118, 112], // Ambiguous muddy neutral
    swatch: REFERENCE_SWATCHES[0] // Orange
  },
  {
    id: "inconclusive_unmatched_spectral",
    expected: "inconclusive",
    category: "inconclusive",
    lighting: "standard",
    width: 320,
    height: 240,
    reactionRgb: [20, 180, 80], // Bright green reaction not in pos/neg reagent profiles
    swatch: REFERENCE_SWATCHES[5] // Yellow
  },

  // 4. Poor Quality Samples
  {
    id: "poor_quality_underexposed",
    expected: "poor_quality",
    category: "poor_quality",
    lighting: "extreme_dark",
    width: 192,
    height: 128,
    reactionRgb: [15, 65, 160],
    swatch: REFERENCE_SWATCHES[5],
    underexposed: true
  },
  {
    id: "poor_quality_low_res",
    expected: "poor_quality",
    category: "poor_quality",
    lighting: "standard",
    width: 160,
    height: 120, // Below minimum 320x240
    reactionRgb: [15, 65, 160],
    swatch: REFERENCE_SWATCHES[5]
  }
];
