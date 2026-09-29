/**
 * Safe Deterministic Demo Module for FieldCheck.
 *
 * Provides synthetic demonstration fixtures and utilities for hackathon judging:
 * 1. Presumptive Positive synthetic frame (shows reference card + positive chromogenic reaction)
 * 2. Presumptive Negative synthetic frame (shows reference card + unreacted reagent)
 * 3. Inconclusive synthetic frame (shows ambiguous borderline reaction)
 * 4. Poor Quality synthetic frame (underexposed/blurred, rejected by quality gate)
 * 5. Tamper detection simulator (demonstrates cryptographic non-repudiation failure when data is altered)
 *
 * SAFETY NOTICE:
 * All synthetic samples are explicitly labeled:
 * "SYNTHETIC DEMO SAMPLE — NOT REAL FORENSIC EVIDENCE"
 */

import { REFERENCE_SWATCHES } from "./guard.js";
import { signRecord, verifyRecordSignature } from "./crypto.js";
import { normalizeRecord } from "./records.js";

/**
 * Helper to generate a procedural SVG test card and return it as a data URL.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {[number, number, number]} options.reactionRgb
 * @param {[number, number, number]} options.swatchRgb
 * @param {string} options.swatchName
 * @param {boolean} [options.blurred]
 * @param {boolean} [options.underexposed]
 * @returns {string} Data URL of the generated SVG image
 */
export function generateSyntheticFrame({
  title,
  reactionRgb,
  swatchRgb,
  swatchName,
  blurred = false,
  underexposed = false
}) {
  const w = 640;
  const h = 480;

  const bgFill = underexposed ? "#0a0a0e" : "#1a222d";
  const kitFill = underexposed ? "#1c1c20" : "#d8dee9";
  const [rr, rg, rb] = reactionRgb;
  const [sr, sg, sb] = swatchRgb;

  const reactionHex = `rgb(${rr},${rg},${rb})`;
  const swatchHex = `rgb(${sr},${sg},${sb})`;

  const blurFilter = blurred
    ? `<filter id="blur"><feGaussianBlur stdDeviation="9" /></filter>`
    : "";

  const filterAttr = blurred ? 'filter="url(#blur)"' : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>${blurFilter}</defs>
    <!-- Background surface -->
    <rect width="${w}" height="${h}" fill="${bgFill}" />

    <!-- Group with optional blur -->
    <g ${filterAttr}>
      <!-- Test Kit cassette -->
      <rect x="200" y="80" width="240" height="320" rx="16" fill="${kitFill}" stroke="#4c566a" stroke-width="3" />
      <rect x="230" y="110" width="180" height="260" rx="8" fill="#eceff4" opacity="0.9" />

      <!-- Reaction Window / Pad (Central ROI: 35%-65% of frame) -->
      <rect x="260" y="170" width="120" height="140" rx="12" fill="#2e3440" />
      <circle cx="320" cy="240" r="50" fill="${reactionHex}" stroke="#434c5e" stroke-width="2" />

      <!-- Reference Color Card (Bottom Left quadrant) -->
      <rect x="30" y="240" width="130" height="190" rx="8" fill="#e5e9f0" stroke="#3b4252" stroke-width="2" />
      <!-- Solid contiguous swatch (matching calibrated reference guard) -->
      <rect x="45" y="260" width="100" height="110" rx="4" fill="${swatchHex}" />
      <text x="95" y="390" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2e3440" text-anchor="middle">REF: ${swatchName}</text>
    </g>

    <!-- Synthetic Demo Watermark / Header -->
    <rect x="0" y="0" width="${w}" height="42" fill="rgba(0,0,0,0.85)" />
    <text x="20" y="26" font-family="monospace" font-size="14" font-weight="bold" fill="#ff7675">SYNTHETIC SAMPLE: ${title.toUpperCase()}</text>
    <text x="${w - 20}" y="26" font-family="monospace" font-size="11" fill="#74b9ff" text-anchor="end">DEMO ONLY — NOT REAL EVIDENCE</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Predefined Synthetic Demo Cases for Judges.
 */
export const DEMO_CASES = Object.freeze({
  positive: {
    id: "demo-positive",
    title: "Presumptive Positive (Scott Reagent Chromogenic Response)",
    description: "Features Yellow reference card swatch and intense Cobalt Blue reaction pad.",
    getFrame: () =>
      generateSyntheticFrame({
        title: "Presumptive Positive (Scott Reagent)",
        reactionRgb: [15, 65, 160], // Cobalt Blue
        swatchRgb: REFERENCE_SWATCHES[5].rgb, // Yellow [253, 241, 4]
        swatchName: REFERENCE_SWATCHES[5].name
      })
  },
  negative: {
    id: "demo-negative",
    title: "Presumptive Negative (Unreacted Amber Reagent)",
    description: "Features Pink reference card swatch and baseline unreacted amber reaction pad.",
    getFrame: () =>
      generateSyntheticFrame({
        title: "Presumptive Negative (Unreacted Baseline)",
        reactionRgb: [222, 186, 98], // Amber
        swatchRgb: REFERENCE_SWATCHES[2].rgb, // Pink [212, 38, 155]
        swatchName: REFERENCE_SWATCHES[2].name
      })
  },
  inconclusive: {
    id: "demo-inconclusive",
    title: "Inconclusive (Ambiguous Borderline Color Transition)",
    description: "Features Orange reference card swatch and ambiguous muddy gray/brown reaction.",
    getFrame: () =>
      generateSyntheticFrame({
        title: "Inconclusive (Ambiguous Color)",
        reactionRgb: [130, 118, 112], // Muddy neutral
        swatchRgb: REFERENCE_SWATCHES[0].rgb, // Orange [255, 98, 4]
        swatchName: REFERENCE_SWATCHES[0].name
      })
  },
  poorQuality: {
    id: "demo-poor-quality",
    title: "Poor Quality (Heavy Blur & Underexposed)",
    description: "Demonstrates image quality gate rejection before calibration or classification.",
    getFrame: () =>
      generateSyntheticFrame({
        title: "Poor Quality (Blur/Dark)",
        reactionRgb: [50, 40, 60],
        swatchRgb: [30, 30, 30],
        swatchName: "Underexposed",
        blurred: true,
        underexposed: true
      })
  }
});

/**
 * Demonstrate tamper detection on a signed record.
 * Takes a valid signed record, modifies a field (e.g. observation or coordinates),
 * and verifies that verifyRecordSignature returns "SIGNATURE INVALID".
 *
 * @param {object} validRecord
 * @param {string} fieldToAlter Field name to tamper with (e.g. "observation", "lat", "hash")
 * @param {any} alteredValue New fraudulent value
 * @returns {Promise<{tamperedRecord: object, verificationBefore: object, verificationAfter: object}>}
 */
export async function demonstrateTamperDetection(
  validRecord,
  fieldToAlter = "observation",
  alteredValue = "positive"
) {
  // 1. Verify before tampering
  const verificationBefore = await verifyRecordSignature(validRecord);

  // 2. Create tampered copy
  const tamperedRecord = {
    ...validRecord,
    [fieldToAlter]: alteredValue
  };

  // 3. Verify after tampering
  const verificationAfter = await verifyRecordSignature(tamperedRecord);

  return {
    originalValue: validRecord[fieldToAlter],
    alteredField: fieldToAlter,
    tamperedValue: alteredValue,
    tamperedRecord,
    verificationBefore,
    verificationAfter
  };
}
