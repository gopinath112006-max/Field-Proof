/**
 * Color Calibration Module for FieldCheck.
 *
 * Implements:
 * - Color space transformations: sRGB <-> CIE XYZ (D65) <-> CIE L*a*b*
 * - CIE76 Delta E color difference calculations
 * - Reference card detection and observed swatch measurement
 * - Illumination shift estimation (chromatic adaptation / channel gain normalization)
 * - Test-region color normalization based on measured reference card swatches
 *
 * NOTE: Prototype calibration uses a detected reference swatch to normalize image color
 * under assumed approximately uniform illumination. Empirical physical-kit validation
 * is required before operational deployment.
 */

export const CALIBRATION_VERSION = "1.0.0";

// Reference Illuminant D65 (2° standard observer)
const XN = 95.047;
const YN = 100.000;
const ZN = 108.883;

/**
 * Convert 8-bit sRGB channel [0..255] to linear channel [0..1].
 */
export function sRgbChannelToLinear(c) {
  const v = c / 255.0;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Convert linear channel [0..1] to 8-bit sRGB [0..255].
 */
export function linearChannelToSRgb(v) {
  const clamped = Math.max(0, Math.min(1, v));
  const c = clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055;
  return Math.round(c * 255);
}

/**
 * Convert sRGB [r, g, b] (0-255) to CIE XYZ (0-100 scale).
 */
export function rgbToXyz(r, g, b) {
  const lr = sRgbChannelToLinear(r);
  const lg = sRgbChannelToLinear(g);
  const lb = sRgbChannelToLinear(b);

  // sRGB to XYZ (D65) transformation matrix
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) * 100.0;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) * 100.0;
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) * 100.0;

  return [x, y, z];
}

/**
 * Convert CIE XYZ to sRGB [r, g, b] (0-255).
 */
export function xyzToRgb(x, y, z) {
  const nx = x / 100.0;
  const ny = y / 100.0;
  const nz = z / 100.0;

  // XYZ to sRGB inverse matrix
  const lr = nx * 3.2404542 + ny * -1.5371385 + nz * -0.4985314;
  const lg = nx * -0.9692660 + ny * 1.8760108 + nz * 0.0415560;
  const lb = nx * 0.0556434 + ny * -0.2040259 + nz * 1.0572252;

  return [
    linearChannelToSRgb(lr),
    linearChannelToSRgb(lg),
    linearChannelToSRgb(lb)
  ];
}

function labF(t) {
  return t > 0.008856451679 ? Math.cbrt(t) : 7.787037037 * t + 16.0 / 116.0;
}

function labInvF(t) {
  return t > 0.2068965517 ? t * t * t : (t - 16.0 / 116.0) / 7.787037037;
}

/**
 * Convert sRGB [r, g, b] (0-255) to CIE L*a*b*.
 * L* in [0..100], a* in [-128..127], b* in [-128..127].
 */
export function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b);
  const fx = labF(x / XN);
  const fy = labF(y / YN);
  const fz = labF(z / ZN);

  const L = 116.0 * fy - 16.0;
  const a = 500.0 * (fx - fy);
  const bVal = 200.0 * (fy - fz);

  return [
    Number(L.toFixed(2)),
    Number(a.toFixed(2)),
    Number(bVal.toFixed(2))
  ];
}

/**
 * Convert CIE L*a*b* to sRGB [r, g, b] (0-255).
 */
export function labToRgb(L, a, bVal) {
  const fy = (L + 16.0) / 116.0;
  const fx = a / 500.0 + fy;
  const fz = fy - bVal / 200.0;

  const x = XN * labInvF(fx);
  const y = YN * labInvF(fy);
  const z = ZN * labInvF(fz);

  return xyzToRgb(x, y, z);
}

/**
 * Standard CIE76 Delta E color difference.
 * ΔE < 2.0: Imperceptible to human eye
 * ΔE 2.0 - 5.0: Perceptible difference
 * ΔE > 10.0: Substantially distinct colors
 */
export function deltaE76(lab1, lab2) {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

export const NOMINAL_REFERENCE_SWATCHES = Object.freeze([
  { name: "Orange", rgb: [255, 98, 4] },
  { name: "Deep Purple", rgb: [120, 0, 123] },
  { name: "Pink", rgb: [212, 38, 155] },
  { name: "Green", rgb: [7, 135, 1] },
  { name: "Red", rgb: [146, 31, 36] },
  { name: "Yellow", rgb: [253, 241, 4] },
  { name: "Violet", rgb: [100, 27, 134] },
  { name: "Blue", rgb: [7, 3, 123] }
]);

/**
 * Reference Swatches augmented with nominal CIE Lab values.
 */
export const REFERENCE_SWATCHES_LAB = Object.freeze(
  NOMINAL_REFERENCE_SWATCHES.map((s) => ({
    name: s.name,
    rgb: [...s.rgb],
    lab: rgbToLab(s.rgb[0], s.rgb[1], s.rgb[2])
  }))
);

/**
 * Convert RGB to Hex string.
 */
export function rgbToHex(r, g, b) {
  const toH = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0");
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

/**
 * Estimate illumination shift and compute normalization transform.
 *
 * Uses measured swatches against nominal values.
 * Models chromatic shift using Von Kries channel gain adaptation in linear RGB.
 *
 * @param {Array<{name:string, observedRgb:number[], nominalRgb:number[]}>} observedMatches
 * @returns {object} Calibration transform
 */
export function computeCalibrationTransform(observedMatches) {
  if (!Array.isArray(observedMatches) || observedMatches.length === 0) {
    return {
      calibrated: false,
      gainR: 1.0,
      gainG: 1.0,
      gainB: 1.0,
      shiftLab: [0, 0, 0],
      deltaEAvg: 0,
      status: "uncalibrated",
      reason: "No reference swatches detected for calibration"
    };
  }

  // Calculate average linear RGB gain across all matched swatches
  let sumGainR = 0;
  let sumGainG = 0;
  let sumGainB = 0;
  let sumDeltaL = 0;
  let sumDeltaA = 0;
  let sumDeltaB = 0;
  let totalDeltaE = 0;

  for (const match of observedMatches) {
    const obsLinR = Math.max(0.001, sRgbChannelToLinear(match.observedRgb[0]));
    const obsLinG = Math.max(0.001, sRgbChannelToLinear(match.observedRgb[1]));
    const obsLinB = Math.max(0.001, sRgbChannelToLinear(match.observedRgb[2]));

    const nomLinR = sRgbChannelToLinear(match.nominalRgb[0]);
    const nomLinG = sRgbChannelToLinear(match.nominalRgb[1]);
    const nomLinB = sRgbChannelToLinear(match.nominalRgb[2]);

    sumGainR += nomLinR / obsLinR;
    sumGainG += nomLinG / obsLinG;
    sumGainB += nomLinB / obsLinB;

    const obsLab = rgbToLab(...match.observedRgb);
    const nomLab = rgbToLab(...match.nominalRgb);

    sumDeltaL += nomLab[0] - obsLab[0];
    sumDeltaA += nomLab[1] - obsLab[1];
    sumDeltaB += nomLab[2] - obsLab[2];
    totalDeltaE += deltaE76(obsLab, nomLab);
  }

  const count = observedMatches.length;
  // Bounded gains (0.5 to 2.5) to prevent extreme distortion from noise
  const gainR = Math.max(0.5, Math.min(2.5, sumGainR / count));
  const gainG = Math.max(0.5, Math.min(2.5, sumGainG / count));
  const gainB = Math.max(0.5, Math.min(2.5, sumGainB / count));

  const avgDeltaE = Number((totalDeltaE / count).toFixed(2));
  const shiftLab = [
    Number((sumDeltaL / count).toFixed(2)),
    Number((sumDeltaA / count).toFixed(2)),
    Number((sumDeltaB / count).toFixed(2))
  ];

  // Characterize illumination shift
  let illuminationNote = "neutral";
  if (gainR < gainB * 0.85) illuminationNote = "warm/tungsten lighting corrected";
  else if (gainB < gainR * 0.85) illuminationNote = "cool/daylight cast corrected";
  else if (avgDeltaE > 15) illuminationNote = "ambient color shift compensated";

  return {
    calibrated: true,
    gainR: Number(gainR.toFixed(3)),
    gainG: Number(gainG.toFixed(3)),
    gainB: Number(gainB.toFixed(3)),
    shiftLab,
    deltaEAvg: avgDeltaE,
    status: "calibrated",
    swatchesCount: count,
    illuminationNote,
    version: CALIBRATION_VERSION
  };
}

/**
 * Apply calibration transform to normalize an observed RGB triplet.
 *
 * @param {[number, number, number]} rgb Raw observed sRGB [0..255]
 * @param {object} transform Transform from computeCalibrationTransform
 * @returns {{normalizedRgb:[number, number, number], normalizedLab:[number, number, number], hex:string}}
 */
export function normalizeReactionColor(rgb, transform) {
  if (!transform || !transform.calibrated) {
    const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
    return {
      normalizedRgb: [rgb[0], rgb[1], rgb[2]],
      normalizedLab: lab,
      hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
      calibrated: false
    };
  }

  // Linearize, scale with channel gains, reconvert to sRGB
  const gainR = transform.gainR ?? transform.gains?.[0] ?? 1.0;
  const gainG = transform.gainG ?? transform.gains?.[1] ?? 1.0;
  const gainB = transform.gainB ?? transform.gains?.[2] ?? 1.0;

  const linR = sRgbChannelToLinear(rgb[0]) * gainR;
  const linG = sRgbChannelToLinear(rgb[1]) * gainG;
  const linB = sRgbChannelToLinear(rgb[2]) * gainB;

  const normR = linearChannelToSRgb(linR);
  const normG = linearChannelToSRgb(linG);
  const normB = linearChannelToSRgb(linB);

  const normLab = rgbToLab(normR, normG, normB);

  return {
    normalizedRgb: [normR, normG, normB],
    normalizedLab: normLab,
    hex: rgbToHex(normR, normG, normB),
    calibrated: true
  };
}
