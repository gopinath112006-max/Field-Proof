/** Single-record detail page, including the real integrity re-check. */

import { escapeHtml } from "../lib/dom.js";
import {
  coveragePct,
  formatGps,
  formatRecordDate,
  observationLabel,
  observationPill,
  syncPill
} from "../lib/format.js";
import { OBSERVATION_SOURCE_LEGACY } from "../lib/records.js";

/**
 * @param {object} record
 * @param {{checked:boolean, valid:boolean, reason:string}} integrity
 */
export function recordDetail(record, integrity) {
  const legacy = record.observationSource === OBSERVATION_SOURCE_LEGACY;
  const guard = record.guard || {};
  const imageUrl = record.imageUrl;

  const meta = [
    ["Test ID", record.id],
    ["Operator observation", observationLabel(record.observation)],
    ["Observation source", legacy ? "unclassified (schema v1)" : "field operator"],
    ["Observed at", record.observedAt ? formatRecordDate(record.observedAt) : "not recorded"],
    ["Observed by", record.observedBy || record.operator],
    ["Recorded at", formatRecordDate(record.date)],
    ["GPS", formatGps(record.lat, record.lng, record.accuracy)],
    ["Sample type", record.sampleType || "not recorded"],
    ["Frame quality", record.quality],
    ["Validation service", record.apiStatus],
    ["Cloud storage", record.sync === "synced" ? "uploaded to Firebase" : "on this device only"]
  ];

  const guardRows = [
    ["Reference swatch match", guard.accepted ? guard.colorName : "no match"],
    ["Coverage of frame", guard.accepted ? `${coveragePct(guard.coverage)}%` : "—"],
    ["Region aspect ratio", guard.accepted ? `${guard.aspect}:1` : "—"],
    ["Guard verdict", guard.reason || "not evaluated"]
  ];

  return `
  <div class="page-head">
    <div><div class="eyebrow">AUDIT RECORD</div><h3>${escapeHtml(record.id)}</h3><p>What was captured, and what the operator read from it.</p></div>
    ${observationPill(record.observation)}
  </div>

  ${legacy ? `<div class="disclaimer" style="margin-bottom:14px"><b>Migrated record.</b> This record was created before operator observations were stored, and its classification was never a verified reading. Treat the outcome as unknown.</div>` : ""}
  ${record.labReferralRequired ? `<div class="disclaimer warn" style="margin-bottom:14px"><b>Laboratory referral required.</b> A positive observation is presumptive. This record must be confirmed by laboratory analysis before it is relied upon.</div>` : ""}

  <div class="grid record">
    <div class="card">
      <div class="section-title"><h4>Record</h4><span>${escapeHtml(record.id)}</span></div>
      ${meta
        .map(
          ([label, value]) =>
            `<div class="meta-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(value ?? "—"))}</span></div>`
        )
        .join("")}
      ${
        record.note
          ? `<div style="margin-top:16px"><small class="meta-label">OPERATOR NOTE</small><p class="note-body">${escapeHtml(record.note)}</p></div>`
          : ""
      }
    </div>

    <div class="card">
      <div class="section-title"><h4>Frame integrity</h4><span>SHA-256</span></div>
      <div class="secure-box">
        <strong>${integrity?.checked ? (integrity.valid ? "✓ Digest re-verified" : "⚠ Digest mismatch") : "— Digest not re-verified"}</strong>
        <p>${escapeHtml(integrity?.reason || "no check performed")}</p>
        <div class="hash">${escapeHtml(record.hash || "no digest recorded")}</div>
        <small class="muted">Computed over the image bytes. This is a change-detection aid for the stored frame; it is not a digital signature and proves nothing about who captured it.</small>
      </div>
      <div class="setting"><strong>Algorithm</strong><span>${escapeHtml(record.hashAlgorithm)}</span></div>
      <div class="setting"><strong>Cloud storage</strong>${syncPill(record.sync)}</div>
      <div class="setting"><strong>Laboratory referral</strong><span>${record.labReferralRequired ? (record.labReferralRequested ? "requested" : "required, not yet requested") : "not required"}</span></div>
    </div>

    <div class="card">
      <div class="section-title"><h4>Reference swatch check</h4><span>MEASURED</span></div>
      ${guardRows
        .map(
          ([label, value]) =>
            `<div class="meta-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(String(value))}</span></div>`
        )
        .join("")}
      <p class="muted">This check confirms a reference colour is present in the frame. It does not identify a substance and it did not influence the observation.</p>
    </div>
  </div>

  ${
    imageUrl
      ? `<div class="card" style="margin-top:14px">
          <div class="section-title"><h4>Captured frame</h4><span>${escapeHtml(record.id)}</span></div>
          <img class="record-image" src="${escapeHtml(imageUrl)}" alt="Captured frame for record ${escapeHtml(record.id)}" loading="lazy">
        </div>`
      : `<div class="card" style="margin-top:14px"><div class="section-title"><h4>Captured frame</h4><span>NOT STORED</span></div>
          <p class="muted">The frame is held in memory for this browser session only. It is not written to local storage, and it is only durable once the record has been uploaded — at which point <code>imageUrl</code> points at Firebase Storage.</p>
        </div>`
  }

  <div class="row-actions" style="margin-top:14px">
    <button class="btn btn-outline fc-3d" data-action="navigate" data-page="history">← Back</button>
    <button class="btn btn-blue fc-3d" data-action="export-record-pdf" data-id="${escapeHtml(record.id)}">Export PDF</button>
    <button class="btn btn-outline fc-3d" data-action="copy-verification" data-id="${escapeHtml(record.id)}">Copy verification details</button>
  </div>

  <div class="disclaimer" style="margin-top:14px"><b>Status of this record:</b> an operator observation with capture metadata. It is presumptive, it is unsigned, and it is not laboratory confirmation.</div>`;
}
