/** Presentation helpers: observation labels, dates and integrity wording. */

import { escapeHtml } from "./dom.js";
import { OBSERVATIONS } from "./records.js";

/**
 * Wording matters here. These are the operator's readings of a physical kit,
 * not machine verdicts, so nothing in the UI says "Positive" on its own.
 */
export const OBSERVATION_LABELS = Object.freeze({
  positive: "Observed positive",
  negative: "Observed negative",
  unreadable: "Not read"
});

export const OBSERVATION_SHORT = Object.freeze({
  positive: "Positive",
  negative: "Negative",
  unreadable: "Not read"
});

export function observationLabel(value) {
  return OBSERVATION_LABELS[value] || OBSERVATION_LABELS.unreadable;
}

export function observationPill(value) {
  const key = OBSERVATIONS.includes(value) ? value : "unreadable";
  return `<span class="status-pill ${key}">${escapeHtml(observationLabel(key))}</span>`;
}

export function syncPill(value) {
  const synced = value === "synced";
  return `<span class="status-pill ${synced ? "synced" : "offline"}">${synced ? "SYNCED" : "ON DEVICE"}</span>`;
}

export function formatRecordDate(date) {
  const parsed = date ? new Date(date) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function formatGps(lat, lng, accuracy) {
  if (typeof lat !== "number" || typeof lng !== "number") return "Not captured";
  if (Number.isNaN(lat) || Number.isNaN(lng)) return "Not captured";
  const base = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return accuracy ? `${base} (±${Math.round(accuracy)} m)` : base;
}

export function percent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** Coverage as a whole-number percentage for display. */
export function coveragePct(coverage) {
  return Number.isFinite(coverage) ? Math.round(coverage * 100) : 0;
}
