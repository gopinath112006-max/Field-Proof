/**
 * Capture guard: reference-swatch matching.
 *
 * WHAT THIS IS
 *   A check that a sufficiently large, contiguous, solid region of the frame
 *   matches one of the configured reference swatch colours. It exists to steer
 *   the operator away from saving a frame that contains no reference colour at
 *   all (a face, a wall, a shoe) and to record *which* swatch was matched and
 *   how strongly, as capture metadata for the record.
 *
 * WHAT THIS IS NOT
 *   It is not substance detection, not a test-kit detector, and it cannot
 *   produce a positive or negative outcome. It never sets `observation`.
 *   A frame that fails here is still saveable -- it is recorded with
 *   `guard.accepted = false` and the operator's reading stands on its own.
 *
 * The pure geometry lives in `analysePixels` so it can be unit tested without
 * a canvas; `matchReferenceSwatch` only handles the browser plumbing.
 */

import { computeCalibrationTransform } from "./calibration.js";

export const SAMPLE_WIDTH = 192;
export const SAMPLE_HEIGHT = 128;

/** Tunables, named so the UI and the tests can reference them. */
export const TOLERANCE = 62;
export const MIN_COVERAGE = 0.06;
export const MIN_FILL = 0.35;
/** At or above this aspect ratio a region is treated as strip-shaped. */
export const ELONGATED_ASPECT = 2.6;
/** Below this confidence the capture is accepted but flagged for retake. */
export const WEAK_CONFIDENCE = 0.4;

/**
 * Reference swatches.
 *
 * Black is deliberately absent. At a tolerance of 62 in RGB distance, near
 * black matches shadows, dark backgrounds and unlit frame edges, which is
 * exactly the false-accept this guard exists to prevent. A black reference pad
 * therefore cannot be auto-matched and the operator is told so.
 */
export const REFERENCE_SWATCHES = Object.freeze([
  { name: "Orange", rgb: [255, 98, 4] },
  { name: "Deep Purple", rgb: [120, 0, 123] },
  { name: "Pink", rgb: [212, 38, 155] },
  { name: "Green", rgb: [7, 135, 1] },
  { name: "Red", rgb: [146, 31, 36] },
  { name: "Yellow", rgb: [253, 241, 4] },
  { name: "Violet", rgb: [100, 27, 134] },
  { name: "Blue", rgb: [7, 3, 123] }
]);

export const UNMATCHABLE_NOTE =
  "A black reference pad cannot be auto-matched (near-black is indistinguishable from shadow). The frame is still recorded; the guard simply reports no match.";

function distance3(a, b) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Nearest swatch index for one pixel, or -1 when nothing is within tolerance. */
export function classifyPixel(r, g, b, swatches = REFERENCE_SWATCHES, tolerance = TOLERANCE) {
  let best = -1;
  let bestDistance = Infinity;
  for (let k = 0; k < swatches.length; k += 1) {
    const d = distance3([r, g, b], swatches[k].rgb);
    if (d < bestDistance) {
      bestDistance = d;
      best = k;
    }
  }
  return bestDistance <= tolerance ? best : -1;
}

/**
 * Find the largest 4-connected run of matching pixels for each swatch.
 *
 * Pixels are grouped by swatch identity rather than by a pre-assigned label.
 * A per-pixel label would make every pixel its own component (and seeds whose
 * index did not equal their label would be skipped outright), while a single
 * bounding box drawn around all matches would let two distant patches combine
 * into a mostly-empty rectangle that fails the fill test. Grouping by runs
 * keeps each patch's own geometry intact.
 */
function largestComponentPerSwatch(nearest, width, height) {
  const best = new Map();
  const visited = new Uint8Array(nearest.length);
  const stack = [];
  for (let start = 0; start < nearest.length; start += 1) {
    const swatchIndex = nearest[start];
    if (swatchIndex < 0 || visited[start]) continue;
    stack.length = 0;
    stack.push(start);
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    while (stack.length) {
      const px = stack.pop();
      const x = px % width;
      const y = (px - x) / width;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !visited[px - 1] && nearest[px - 1] === swatchIndex) { visited[px - 1] = 1; stack.push(px - 1); }
      if (x < width - 1 && !visited[px + 1] && nearest[px + 1] === swatchIndex) { visited[px + 1] = 1; stack.push(px + 1); }
      if (y > 0 && !visited[px - width] && nearest[px - width] === swatchIndex) { visited[px - width] = 1; stack.push(px - width); }
      if (y < height - 1 && !visited[px + width] && nearest[px + width] === swatchIndex) { visited[px + width] = 1; stack.push(px + width); }
    }
    const current = best.get(swatchIndex);
    if (!current || area > current.area) {
      best.set(swatchIndex, { area, minX, maxX, minY, maxY });
    }
  }
  return best;
}

/**
 * Pure analysis over a downsampled RGBA buffer.
 *
 * @param {Uint8ClampedArray} data RGBA pixels, row-major
 * @param {number} width
 * @param {number} height
 * @returns {{accepted:boolean, colorName:string, coverage:number, aspect:number,
 *            fill:number, confidence:number, weak:boolean, reason:string}}
 */
export function analysePixels(data, width, height, options = {}) {
  const swatches = options.swatches || REFERENCE_SWATCHES;
  const tolerance = options.tolerance ?? TOLERANCE;
  const minCoverage = options.minCoverage ?? MIN_COVERAGE;
  const minFill = options.minFill ?? MIN_FILL;
  const total = width * height;

  const nearest = new Int8Array(total);
  nearest.fill(-1);
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    // Fully transparent pixels cannot be a reference surface.
    if (data[o + 3] < 128) continue;
    const match = classifyPixel(data[o], data[o + 1], data[o + 2], swatches, tolerance);
    if (match >= 0) nearest[i] = match;
  }

  const components = largestComponentPerSwatch(nearest, width, height);

  let winner = null;
  for (const [swatchIndex, comp] of components) {
    const bw = comp.maxX - comp.minX + 1;
    const bh = comp.maxY - comp.minY + 1;
    const bboxArea = bw * bh;
    const fill = bboxArea ? comp.area / bboxArea : 0;
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    const coverage = comp.area / total;
    if (coverage < minCoverage) continue;
    if (fill < minFill) continue;
    const score = coverage * fill * (aspect >= ELONGATED_ASPECT ? 1.5 : 0.7);
    if (!winner || score > winner.score) {
      winner = { swatchIndex, score, coverage, fill, aspect, area: comp.area, comp };
    }
  }

  if (!winner) {
    return {
      accepted: false,
      colorName: "",
      coverage: 0,
      aspect: 0,
      fill: 0,
      confidence: 0,
      weak: false,
      observedRgb: null,
      calibration: { calibrated: false, status: "uncalibrated" },
      reason: "no contiguous reference-swatch region found in the frame"
    };
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let y = winner.comp.minY; y <= winner.comp.maxY; y += 1) {
    const rowOffset = y * width;
    for (let x = winner.comp.minX; x <= winner.comp.maxX; x += 1) {
      const idx = rowOffset + x;
      if (nearest[idx] === winner.swatchIndex) {
        const o = idx * 4;
        sumR += data[o];
        sumG += data[o + 1];
        sumB += data[o + 2];
        count += 1;
      }
    }
  }
  const observedRgb = count
    ? [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)]
    : [...swatches[winner.swatchIndex].rgb];

  const calibration = computeCalibrationTransform([
    {
      name: swatches[winner.swatchIndex].name,
      observedRgb,
      nominalRgb: swatches[winner.swatchIndex].rgb
    }
  ]);

  const confidence = Math.min(1, (winner.coverage / 0.25) * winner.fill);
  const weak = confidence < WEAK_CONFIDENCE;
  return {
    accepted: true,
    colorName: swatches[winner.swatchIndex].name,
    coverage: Number(winner.coverage.toFixed(4)),
    aspect: Number(winner.aspect.toFixed(2)),
    fill: Number(winner.fill.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    weak,
    observedRgb,
    calibration,
    reason: weak
      ? `weak ${swatches[winner.swatchIndex].name} match (${Math.round(winner.coverage * 100)}% of frame) -- consider a retake with the swatch filling more of the frame`
      : `${swatches[winner.swatchIndex].name} region covers ${Math.round(winner.coverage * 100)}% of the frame`
  };
}

/** Draw a data URL into an offscreen canvas and run the pure analysis. */
export async function matchReferenceSwatch(imageData) {
  if (!imageData) {
    return {
      accepted: false,
      colorName: "",
      coverage: 0,
      aspect: 0,
      fill: 0,
      confidence: 0,
      weak: false,
      reason: "no image supplied"
    };
  }
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("image could not be decoded"));
      image.src = imageData;
    });
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return analysePixels(data, canvas.width, canvas.height);
  } catch (error) {
    return {
      accepted: false,
      colorName: "",
      coverage: 0,
      aspect: 0,
      fill: 0,
      confidence: 0,
      weak: false,
      reason: `frame could not be inspected (${error.message})`
    };
  }
}
