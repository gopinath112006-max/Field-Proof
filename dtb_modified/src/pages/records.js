/** History, reports, locations, offline and sync pages. */

import { escapeHtml } from "../lib/dom.js";
import {
  formatGps,
  formatRecordDate,
  observationLabel,
  observationPill,
  syncPill
} from "../lib/format.js";
import { summarizeRecords } from "../lib/records.js";
import { evaluateSyncReadiness, syncReadinessMessage, SYNC_OUTCOMES } from "../lib/sync.js";
import { isOnline, isSignedIn, state } from "../state.js";

export function recordsTable(records) {
  if (!records.length) {
    return `<div class="fc-empty">Nothing to show. Complete a field test to create a record.<br><small>Nothing is pre-populated.</small></div>`;
  }
  return `<table class="table">
    <thead><tr><th>Test ID</th><th>Observation</th><th>Recorded</th><th>Location</th><th>Storage</th></tr></thead>
    <tbody>
      ${records
        .map(
          (r) => `<tr data-action="view-record" data-id="${escapeHtml(r.id)}" style="cursor:pointer">
            <td class="id">${escapeHtml(r.id)}</td>
            <td>${observationPill(r.observation)}</td>
            <td>${escapeHtml(formatRecordDate(r.date))}</td>
            <td>${escapeHtml(formatGps(r.lat, r.lng, r.accuracy))}</td>
            <td>${syncPill(r.sync)}</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

export function history(records) {
  return `
  <div class="page-head">
    <div><div class="eyebrow">AUDIT LOG</div><h3>Test History</h3><p>Searchable local record of field tests.</p></div>
    <button class="btn btn-red fc-3d" data-action="open-camera">+ New Test</button>
  </div>
  <div class="card">
    <div class="search-row">
      <input id="historySearch" type="search" placeholder="Search by Test ID, date, location or operator..." aria-label="Search records">
      <select id="historyFilter" class="filter" aria-label="Filter by observation">
        <option value="all">All observations</option>
        <option value="positive">Positive</option>
        <option value="negative">Negative</option>
        <option value="unreadable">Not read</option>
        <option value="onDevice">On device only</option>
        <option value="noGps">Missing GPS</option>
      </select>
    </div>
    <div id="historyTable">${recordsTable(records)}</div>
  </div>`;
}

export function filterRecords(records, { query, filter }) {
  const q = (query || "").trim().toLowerCase();
  return records.filter((r) => {
    if (filter === "positive" || filter === "negative" || filter === "unreadable") {
      if (r.observation !== filter) return false;
    } else if (filter === "onDevice") {
      if (r.sync === "synced") return false;
    } else if (filter === "noGps") {
      if (r.lat !== null && r.lng !== null) return false;
    }
    if (!q) return true;
    return [
      r.id,
      r.date,
      r.observedBy,
      r.operator,
      r.note,
      r.observation,
      formatGps(r.lat, r.lng, r.accuracy)
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });
}

export function reports(records) {
  return `
  <div class="page-head">
    <div><div class="eyebrow">REPORT CENTRE</div><h3>Test Reports</h3><p>Export a record or a full index as PDF.</p></div>
    <button class="btn btn-blue fc-3d" data-action="export-all-pdf" ${records.length ? "" : "disabled"}>Export all PDF</button>
  </div>
  <div class="card">
    <div class="section-title"><h4>Available reports</h4><span>${records.length} RECORD(S)</span></div>
    ${
      records.length
        ? records
            .map(
              (r) => `<div class="setting">
                <div>
                  <strong>${escapeHtml(r.id)}</strong>
                  <small>${escapeHtml(formatRecordDate(r.date))} · ${escapeHtml(observationLabel(r.observation))} · ${escapeHtml(formatGps(r.lat, r.lng, r.accuracy))}</small>
                </div>
                <div class="row-actions">
                  <button class="btn btn-outline" data-action="view-record" data-id="${escapeHtml(r.id)}">Open</button>
                  <button class="btn btn-blue" data-action="export-record-pdf" data-id="${escapeHtml(r.id)}">PDF</button>
                </div>
              </div>`
            )
            .join("")
        : `<div class="verify"><div>
            <div class="shield">▤</div>
            <h3>No reports yet</h3>
            <p class="muted">Complete a field test to create a report. Nothing is pre-populated.</p>
            <button class="btn btn-red fc-3d" data-action="open-camera">Start field test</button>
          </div></div>`
    }
  </div>`;
}

/**
 * Location list from real coordinates.
 *
 * v1 drew a stylised map with four pins at fixed CSS percentages, a
 * "PUDUCHERRY" label and a hardcoded "4 RECORDS" count, none of which
 * corresponded to any stored record. No tile provider is configured, so this
 * page lists coordinates instead of implying a map it cannot draw.
 */
export function locations(records) {
  const withGps = records.filter((r) => r.lat !== null && r.lng !== null);
  const withoutGps = records.filter((r) => r.lat === null || r.lng === null);

  return `
  <div class="page-head">
    <div><div class="eyebrow">GPS RECORDS</div><h3>Test Locations</h3><p>Coordinates captured with each record.</p></div>
    <span class="status-pill ${withGps.length ? "synced" : "offline"}">${withGps.length} WITH GPS</span>
  </div>

  <div class="grid two">
    <div class="card">
      <div class="section-title"><h4>Captured coordinates</h4><span>${withGps.length} OF ${records.length}</span></div>
      ${
        withGps.length
          ? `<table class="table">
              <thead><tr><th>Test ID</th><th>Latitude</th><th>Longitude</th><th>Accuracy</th></tr></thead>
              <tbody>${withGps
                .map(
                  (r) => `<tr style="cursor:pointer" data-action="view-record" data-id="${escapeHtml(r.id)}">
                    <td class="id">${escapeHtml(r.id)}</td>
                    <td>${r.lat.toFixed(6)}</td>
                    <td>${r.lng.toFixed(6)}</td>
                    <td>${r.accuracy ? `±${Math.round(r.accuracy)} m` : "—"}</td>
                  </tr>`
                )
                .join("")}</tbody>
            </table>`
          : `<div class="fc-empty">No record has GPS coordinates yet.<br><small>Grant location permission when capturing, or accept that records are stored without position.</small></div>`
      }
      <p class="muted map-note">No offline map tiles are bundled with this build, so coordinates are listed rather than plotted. Add a tile provider before presenting this as a map.</p>
    </div>

    <div class="card">
      <div class="section-title"><h4>Records without GPS</h4><span>${withoutGps.length}</span></div>
      ${
        withoutGps.length
          ? withoutGps
              .map(
                (r) => `<div class="quick-item">
                  <div><strong>${escapeHtml(r.id)}</strong><small>${escapeHtml(formatRecordDate(r.date))}</small></div>
                  ${observationPill(r.observation)}
                </div>`
              )
              .join("")
          : `<div class="fc-empty">Every record has coordinates.</div>`
      }
    </div>
  </div>`;
}

export function offline(records) {
  const pending = records.filter((r) => r.sync !== "synced");
  return `
  <div class="page-head">
    <div><div class="eyebrow">LOCAL-FIRST STORAGE</div><h3>Offline Records</h3><p>Keep working without a connection.</p></div>
  </div>
  <div class="offline-banner">
    <div>
      <strong>● ${isOnline() ? "ONLINE — LOCAL STORAGE STILL IN USE" : "OFFLINE MODE ACTIVE"}</strong>
      <p>Frames, digests, timestamps, observations and GPS stay on this device until you sign in and upload them.</p>
    </div>
    <button class="btn ${isOnline() ? "btn-blue" : "btn-outline"} fc-3d" data-action="sync-now">Sync now</button>
  </div>
  <div class="card" style="margin-top:14px">
    <div class="section-title"><h4>Waiting for upload</h4><span>${pending.length} RECORD(S)</span></div>
    ${pending.length ? recordsTable(pending) : `<div class="verify"><div><div class="shield">✓</div><h3>Nothing pending</h3><p class="muted">Every record has been uploaded.</p></div></div>`}
  </div>`;
}

export function sync(records) {
  const stats = summarizeRecords(records);
  const readiness = evaluateSyncReadiness({
    online: isOnline(),
    signedIn: isSignedIn(),
    databaseReady: true,
    pendingCount: stats.pendingSync
  });
  const uploaded = stats.total - stats.pendingSync;
  const pct = stats.total ? Math.round((uploaded / stats.total) * 100) : 0;
  const canSync = readiness.outcome === SYNC_OUTCOMES.READY;

  return `
  <div class="page-head">
    <div><div class="eyebrow">DATA INTEGRITY</div><h3>Synchronisation</h3><p>Upload on-device records to Firebase.</p></div>
    <button class="btn btn-blue fc-3d" data-action="sync-now" ${canSync ? "" : "disabled"}>↻ Sync now</button>
  </div>
  <div class="card">
    <div class="section-title"><h4>Upload status</h4><span>${pct}% UPLOADED</span></div>
    <div class="sync-figure">${uploaded} <span>of ${stats.total} record(s) uploaded</span></div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <p class="sync-readiness ${canSync ? "ok" : "warn"}">${escapeHtml(syncReadinessMessage(readiness.outcome))}</p>
    ${
      records.length
        ? records
            .map(
              (r) => `<div class="setting">
                <div><strong>${escapeHtml(r.id)}</strong><small>${escapeHtml(formatRecordDate(r.date))}</small></div>
                ${syncPill(r.sync)}
              </div>`
            )
            .join("")
        : `<div class="fc-empty">No records yet.</div>`
    }
  </div>
  ${
    isSignedIn()
      ? ""
      : `<div class="disclaimer" style="margin-top:14px"><b>Not signed in.</b> Nothing can be uploaded. Use Sign In on the login screen, or continue on-device and upload later.</div>`
  }`;
}
