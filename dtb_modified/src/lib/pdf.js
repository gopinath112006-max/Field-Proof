/**
 * PDF export.
 *
 * jsPDF is the primary path. `buildMinimalPdf` is a dependency-free fallback
 * that emits a genuinely valid single-page PDF, used when the jsPDF chunk has
 * not loaded (offline / CDN-less / slow device). The v1 fallback was correct in
 * principle but its object offsets were computed with `String.length` on a
 * string containing multi-byte characters, which silently corrupts the xref
 * table; `buildMinimalPdf` measures bytes.
 *
 * All report wording reflects that the classification is an operator
 * observation. No report claims a signature, a tamper-evidence guarantee, or a
 * laboratory confirmation.
 */

import { jsPDF } from "jspdf";
import { downloadBlob } from "./dom.js";
import { formatGps, formatRecordDate, observationLabel, classificationLabel } from "./format.js";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 56;
const LEADING = 16;
const FONT_SIZE = 11;
const FIRST_BASELINE = 790;

export const DISCLAIMER =
  "This report records an observation made by a field operator by visually reading a " +
  "physical colorimetric test kit. FieldCheck does not identify controlled substances, " +
  "does not interpret the kit, and is not a validated forensic instrument. Any " +
  "observation of a positive response is presumptive and requires confirmatory " +
  "laboratory analysis before it is relied upon.";

/**
 * Fold a string to WinAnsi-representable characters.
 *
 * PDF literal strings are byte strings, and this builder writes exactly one
 * byte per character. Anything outside Latin-1 has to be replaced or the byte
 * count and the written length disagree, which invalidates the xref table.
 * The typographic characters that actually appear in a report are mapped to
 * their WinAnsi code points; anything else becomes '?' rather than being
 * silently dropped, so a reader sees that something was not representable.
 */
export function foldToLatin1(str) {
  const winAnsi = {
    "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94",
    "–": "\x96", "—": "\x97", "•": "\x95", "…": "\x85"
  };
  // String(null) is "null", which would print the word into a report instead
  // of rendering an empty value.
  const source = str === null || str === undefined ? "" : String(str);
  let out = "";
  for (const char of source) {
    if (winAnsi[char]) {
      out += winAnsi[char];
      continue;
    }
    out += char.codePointAt(0) <= 0xff ? char : "?";
  }
  return out;
}

/** Escape a string for a PDF literal-string object, folded to Latin-1. */
export function pdfEscape(text) {
  return foldToLatin1(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

/**
 * Byte length of an already-folded PDF fragment.
 *
 * Every character reaching here has been folded to Latin-1, so one character
 * is one byte. Measuring this with TextEncoder().length instead is the v1 bug:
 * it counts the em dash and degree sign in "Resume — 37°" as three and two
 * bytes while the writer emits one, and every xref offset after them is off.
 */
function byteLength(str) {
  return str.length;
}

/**
 * Build a minimal but valid single-page PDF from plain text lines.
 * @param {string[]} lines
 * @param {number} [maxLines] drop overflow and note the truncation
 * @returns {Uint8Array}
 */
export function buildMinimalPdf(lines, maxLines = 42) {
  const all = (Array.isArray(lines) ? lines : []).map((line) => String(line ?? ""));
  const capacity = Math.max(0, maxLines - 1);
  const shown = all.slice(0, capacity);
  const truncated = all.length > capacity;

  let stream = "BT\n/F1 11 Tf\n1 0 0 1 56 790 Tm\n";
  shown.forEach((line, i) => {
    if (i) stream += `0 -${LEADING} Td\n`;
    stream += `(${pdfEscape(line)}) Tj\n`;
  });
  if (truncated) {
    if (shown.length) stream += `0 -${LEADING} Td\n`;
    stream += `(${pdfEscape(`... ${all.length - capacity} further line(s) omitted`)}) Tj\n`;
  }
  stream += "ET";

  const streamBytes = byteLength(stream);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream`
  ];

  // The comment lines after the header carry high bytes to mark the file as
  // binary for transfer agents.
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  // Fold once more as a guarantee: the offsets above were computed on the
  // pre-fold string, so a stray character introduced by a caller must not be
  // allowed to make the written length disagree with them.
  const finalPdf = foldToLatin1(pdf);
  if (finalPdf.length !== byteLength(pdf)) {
    throw new Error("PDF fragments must be folded to Latin-1 before assembly");
  }

  const bytes = new Uint8Array(finalPdf.length);
  for (let i = 0; i < finalPdf.length; i += 1) bytes[i] = finalPdf.charCodeAt(i) & 0xff;
  return bytes;
}

function reportLines(record) {
  const isDemo = Boolean(
    record.id?.includes("DEMO") ||
    record.note?.includes("DEMO") ||
    record.sampleType?.includes("demo") ||
    record.isDemo
  );
  const lines = [
    "FIELDCHECK - DIGITAL FIELD TEST RECORD",
    ...(isDemo ? ["*** SYNTHETIC DEMO SAMPLE - NOT REAL FORENSIC EVIDENCE ***", ""] : [""]),
    `Test ID:                    ${record.id}`,
    `Operator observation:       ${observationLabel(record.observation)}`,
    `Observed at:                ${formatRecordDate(record.observedAt || record.date)}`,
    `Observed by:                ${record.observedBy || record.operator}`,
    `Recorded at:                ${formatRecordDate(record.date)}`,
    "",
    "AUTOMATED CLASSIFICATION (PRESUMPTIVE)",
    `Presumptive classification: ${classificationLabel(record.classification)}`,
    `Algorithm confidence:       ${record.classificationConfidence ? `${record.classificationConfidence}%` : "not assessed"}`,
    `Calibration status:         ${record.calibrationStatus || "uncalibrated"} (v${record.calibrationVersion || "1.0.0"})`,
    `Classifier version:         v${record.classifierVersion || "1.0.0"}`,
    "",
    "CRYPTOGRAPHIC INTEGRITY",
    `Image digest (SHA-256):     ${record.hash || "not recorded"} (${record.hashAlgorithm || "none"})`,
    `Digital signature:          ${record.signature ? `${record.signatureAlgorithm || "ECDSA-P256-SHA256"} (${record.signatureKeyId || "key recorded"})` : "unsigned"}`,
    "",
    "CAPTURE",
    `Reference swatch match:     ${record.guard.accepted ? record.guard.colorName : "no match"}`,
    `  coverage / shape:         ${record.guard.accepted ? `${Math.round(record.guard.coverage * 100)}% coverage, ${record.guard.aspect}:1 bounding box` : record.guard.reason || "n/a"}`,
    `Frame quality:              ${record.quality}`,
    "",
    "LOCATION AND IDENTITY",
    `GPS:                        ${formatGps(record.lat, record.lng, record.accuracy)}`,
    `Operator:                   ${record.operator}`,
    "",
    "FOLLOW-UP",
    `Laboratory referral:        ${record.labReferralRequired ? "required by policy for a positive observation" : "not required"}`,
    `  requested:                ${record.labReferralRequested ? "yes" : "no"}`,
    `Cloud sync:                 ${record.sync === "synced" ? "uploaded" : "on this device only"}`,
    ""
  ];
  if (record.note) {
    lines.push("OPERATOR NOTE", record.note, "");
  }
  lines.push("IMPORTANT", ...wrapText(DISCLAIMER, 84), "");
  return lines;
}

function wrapText(text, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function drawHeader(doc, title, subtitle) {
  doc.setFont("helvetica", "bold").setFontSize(17);
  doc.text("FIELDCHECK", MARGIN, 20);
  doc.setFontSize(10).setFont("helvetica", "normal");
  doc.text("Capture, verify and record field-test evidence", MARGIN, 26);
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(title, MARGIN, 36);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(subtitle, MARGIN, 42);
  doc.setDrawColor(170);
  doc.line(MARGIN, 47, PAGE_W - MARGIN, 47);
  return 56;
}

function drawFooter(doc) {
  doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(120);
  doc.text(
    "Operator observation, not a laboratory result. Laboratory confirmation required before reliance.",
    MARGIN,
    PAGE_H - 14
  );
  doc.text(`Generated ${new Date().toLocaleString()}`, MARGIN, PAGE_H - 9);
  doc.setTextColor(0);
}

function drawKeyValues(doc, rows, startY) {
  let y = startY;
  for (const [label, value] of rows) {
    if (y > PAGE_H - 40) {
      doc.addPage();
      y = 24;
    }
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text(label, MARGIN, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(String(value ?? "—"), 300);
    doc.text(lines, MARGIN + 150, y);
    y += Math.max(12, lines.length * 5 + 4);
  }
  return y;
}

/** Export one record. Falls back to the dependency-free builder. */
export async function exportRecordPdf(record, imageDataUrl) {
  const filename = `${record.id}-record.pdf`;

  if (typeof jsPDF !== "function") {
    const bytes = buildMinimalPdf(reportLines(record));
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
    return { ok: true, engine: "fallback" };
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = drawHeader(
    doc,
    "Digital field test record",
    `${record.id} · generated ${new Date().toLocaleString()}`
  );

  const isDemo = Boolean(
    record.id?.includes("DEMO") ||
    record.note?.includes("DEMO") ||
    record.sampleType?.includes("demo") ||
    record.isDemo
  );
  if (isDemo) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(200, 30, 30);
    doc.text("SYNTHETIC DEMO SAMPLE — NOT REAL FORENSIC EVIDENCE", MARGIN, y);
    doc.setTextColor(0);
    y += 6;
  }

  y = drawKeyValues(
    doc,
    [
      ["Operator observation", observationLabel(record.observation)],
      ["Observed at", formatRecordDate(record.observedAt || record.date)],
      ["Observed by", record.observedBy || record.operator],
      ["Operator note", record.note || "—"],
      ["Presumptive classification", classificationLabel(record.classification)],
      ["Algorithm confidence", record.classificationConfidence ? `${record.classificationConfidence}%` : "not assessed"],
      ["Calibration status", `${record.calibrationStatus || "uncalibrated"} (v${record.calibrationVersion || "1.0.0"})`],
      ["Classifier version", `v${record.classifierVersion || "1.0.0"}`],
      ["Image digest (SHA-256)", record.hash || "not recorded"],
      ["Digital signature", record.signature ? `${record.signatureAlgorithm || "ECDSA-P256"} (${record.signatureKeyId || "key"})` : "unsigned"],
      [
        "Reference swatch match",
        record.guard.accepted
          ? `${record.guard.colorName} — ${Math.round(record.guard.coverage * 100)}% of frame`
          : `no match (${record.guard.reason || "unspecified"})`
      ],
      ["Frame quality", record.quality],
      ["GPS", formatGps(record.lat, record.lng, record.accuracy)],
      ["Operator", record.operator],
      ["Laboratory referral", record.labReferralRequired ? "required (positive observation)" : "not required"],
      ["Cloud sync", record.sync === "synced" ? "uploaded" : "on this device only"]
    ],
    y
  );

  if (imageDataUrl) {
    if (y > 200) {
      doc.addPage();
      y = 24;
    }
    y += 4;
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text("Captured frame", MARGIN, y);
    y += 5;
    try {
      const props = doc.getImageProperties(imageDataUrl);
      const maxW = 170;
      const maxH = 90;
      const scale = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      if (y + h > PAGE_H - 30) {
        doc.addPage();
        y = 24;
      }
      doc.addImage(imageDataUrl, "JPEG", MARGIN, y, w, h);
      y += h + 6;
    } catch (error) {
      doc.setFont("helvetica", "normal").setFontSize(9);
      doc.text("(image could not be embedded)", MARGIN, y);
      y += 6;
    }
  }

  if (y > PAGE_H - 70) {
    doc.addPage();
    y = 24;
  }
  y += 4;
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("Important", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text(doc.splitTextToSize(DISCLAIMER, 483), MARGIN, y);

  drawFooter(doc);
  doc.save(filename);
  return { ok: true, engine: "jspdf" };
}

/** Export an index of every record. */
export async function exportAllRecordsPdf(records) {
  const filename = `fieldcheck-records-${stamp()}.pdf`;

  if (typeof jsPDF !== "function") {
    const lines = [
      "FIELDCHECK — RECORD INDEX",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      ...records.map(
        (r, i) =>
          `${i + 1}. ${r.id} | ${observationLabel(r.observation)} | ${formatRecordDate(r.date)} | ${formatGps(r.lat, r.lng)}`
      ),
      "",
      ...wrapText(DISCLAIMER, 84)
    ];
    downloadBlob(new Blob([buildMinimalPdf(lines)], { type: "application/pdf" }), filename);
    return { ok: true, engine: "fallback" };
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = drawHeader(doc, "Record index", `${records.length} record(s)`);
  doc.setFontSize(9);

  records.forEach((record, i) => {
    if (y > PAGE_H - 30) {
      doc.addPage();
      y = 24;
    }
    doc.setFont("helvetica", "bold").setFontSize(9);
    doc.text(`${i + 1}. ${record.id}`, MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal").setFontSize(8.5);
    const detail = `${observationLabel(record.observation)} · ${formatRecordDate(record.date)} · ${formatGps(record.lat, record.lng, record.accuracy)}`;
    doc.text(doc.splitTextToSize(detail, 460), MARGIN + 6, y);
    y += doc.splitTextToSize(detail, 460).length * 4.5 + 3;
    doc.setTextColor(120);
    doc.text(`SHA-256 ${record.hash || "not recorded"}`, MARGIN + 6, y);
    doc.setTextColor(0);
    y += 9;
  });

  drawFooter(doc);
  doc.save(filename);
  return { ok: true, engine: "jspdf" };
}

/** Plain-text privacy summary, downloaded as a .txt file. */
export function exportPrivacySummary({ recordCount, preferences }) {
  const body = [
    "FieldCheck privacy summary",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    `Records stored in this browser: ${recordCount}`,
    `Analytics preference:       ${preferences.analytics ? "ON" : "OFF"}`,
    `Camera permission:          ${preferences.camera ? "ALLOWED" : "BLOCKED"}`,
    `Theme:                      ${preferences.theme}`,
    `Reduced motion:             ${preferences.reducedMotion ? "ON" : "OFF"}`,
    "",
    "What is stored locally",
    "  - captured frame images (as data URLs, in this browser profile only)",
    "  - SHA-256 digest of each frame's bytes",
    "  - the operator's observation of the physical kit, and any note",
    "  - GPS coordinates, accuracy, timestamp and operator identity",
    "",
    "What is not collected",
    "  - no usage analytics are transmitted",
    "  - no records leave this device unless you sign in and press Sync",
    "",
    "Clearing local records from Settings > Privacy Center permanently removes",
    "everything listed above from this browser profile."
  ].join("\n");
  downloadBlob(new Blob([body], { type: "text/plain" }), "fieldcheck-privacy-summary.txt");
}
