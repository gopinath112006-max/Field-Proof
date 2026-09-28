/** Dashboard and New Field Test pages. */

import { escapeHtml } from "../lib/dom.js";
import { coveragePct, observationPill, observationLabel, formatGps } from "../lib/format.js";
import { bucketRecordsByDay, summarizeRecords } from "../lib/records.js";
import { UNMATCHABLE_NOTE } from "../lib/guard.js";
import { isOnline, currentOperator } from "../state.js";
import { state } from "../state.js";

/**
 * A real 7-day stacked bar chart computed from record timestamps.
 *
 * The previous build shipped a hardcoded SVG path with a fixed y-axis and fixed
 * "SEP 6 - SEP 12" labels regardless of what was in storage. If there is no
 * activity it now says so rather than drawing a curve.
 */
function activityChart(records) {
  const buckets = bucketRecordsByDay(records, 7);
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const hasActivity = buckets.some((b) => b.total > 0);

  if (!hasActivity) {
    return `<div class="fc-chart-empty">
      <span>No records in the last 7 days.</span>
      <small>Complete a field test to populate this chart.</small>
    </div>`;
  }

  const bars = buckets
    .map((bucket) => {
      const height = (bucket.total / max) * 100;
      const parts = [
        bucket.unreadable ? `<i class="fc-bar-unreadable" style="flex:${bucket.unreadable}"></i>` : "",
        bucket.negative ? `<i class="fc-bar-negative" style="flex:${bucket.negative}"></i>` : "",
        bucket.positive ? `<i class="fc-bar-positive" style="flex:${bucket.positive}"></i>` : ""
      ].join("");
      const title = `${bucket.label}: ${bucket.positive} positive, ${bucket.negative} negative, ${bucket.unreadable} not read`;
      return `<div class="fc-bar-col" title="${escapeHtml(title)}">
        <div class="fc-bar" style="height:${Math.max(height, 4)}%">${parts}</div>
        <span>${escapeHtml(bucket.label)}</span>
      </div>`;
    })
    .join("");

  return `<div class="fc-chart fc-chart-bars">
    <div class="fc-y"><span>${max}</span><span>${Math.round(max / 2)}</span><span>0</span></div>
    <div class="fc-chart-area"><div class="fc-gridlines"></div><div class="fc-bars">${bars}</div></div>
  </div>`;
}

function observationDonut(stats) {
  const total = stats.total || 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return `<div class="fc-donut-wrap">
    <div class="fc-donut" style="--pct:${pct(stats.negative)}%;--unreadable:${pct(stats.unreadable)}%">
      <div><strong>${total}</strong><small>RECORDS</small></div>
    </div>
    <div class="fc-legend">
      <span><i class="dotr"></i> Positive <b>${stats.positive}</b></span>
      <span><i class="dotg"></i> Negative <b>${stats.negative}</b></span>
      <span><i class="dota"></i> Not read <b>${stats.unreadable}</b></span>
    </div>
  </div>`;
}

export function dashboard(records) {
  const stats = summarizeRecords(records);
  const recent = records.slice(0, 4);
  const online = isOnline();
  const lastGuard = records.find((r) => r.guard?.accepted) || records[0] || null;

  const readiness = [
    { label: "Records on this device", value: stats.total, ok: true },
    { label: "Awaiting cloud upload", value: stats.pendingSync, ok: stats.pendingSync === 0 },
    { label: "Without GPS", value: stats.missingGps, ok: stats.missingGps === 0 },
    { label: "Without image digest", value: stats.missingHash, ok: stats.missingHash === 0 }
  ];

  return `
  <section class="fc-command-hero">
    <div>
      <div class="eyebrow">FIELD OPERATIONS / COMMAND CENTER</div>
      <h3>Hello, ${escapeHtml(currentOperator())}</h3>
      <p>Capture a test kit, check the frame, and record what you read off it.</p>
    </div>
    <div class="fc-hero-actions">
      <button class="btn btn-blue fc-3d" data-action="open-camera">◎ START NEW TEST</button>
      <button class="btn btn-outline fc-3d" data-action="navigate" data-page="reports">▤ VIEW REPORTS</button>
    </div>
  </section>

  <section class="fc-stat-grid">
    <div class="card fc-stat fc-blue tilt-card"><div class="fc-stat-icon">▣</div><div><small>TOTAL RECORDS</small><strong>${stats.total}</strong><span>on this device</span></div></div>
    <div class="card fc-stat fc-red tilt-card"><div class="fc-stat-icon">!</div><div><small>OBSERVED POSITIVE</small><strong>${stats.positive}</strong><span>laboratory referral required</span></div></div>
    <div class="card fc-stat fc-green tilt-card"><div class="fc-stat-icon">✓</div><div><small>OBSERVED NEGATIVE</small><strong>${stats.negative}</strong><span>operator reading</span></div></div>
    <div class="card fc-stat fc-amber tilt-card"><div class="fc-stat-icon">⇩</div><div><small>ON DEVICE ONLY</small><strong>${stats.pendingSync}</strong><span>${online ? "● online" : "● offline"}</span></div></div>
  </section>

  <section class="fc-main-grid">
    <div class="card fc-panel fc-chart-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">▥</span><div><h4>RECORD ACTIVITY</h4><small>Last 7 days, by observation</small></div></div><span class="fc-select-static">7 DAYS</span></div>
      ${activityChart(records)}
    </div>

    <div class="card fc-panel fc-donut-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">◔</span><div><h4>OBSERVATION MIX</h4><small>What operators recorded</small></div></div></div>
      ${observationDonut(stats)}
    </div>

    <div class="card fc-panel fc-quick-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">ϟ</span><div><h4>QUICK ACTIONS</h4><small>Operational controls</small></div></div></div>
      <div class="fc-action-grid">
        <button class="fc-action blue" data-action="open-camera"><b>◎</b><span>Start New Test<small>Capture &amp; record</small></span><em>›</em></button>
        <button class="fc-action blue" data-action="navigate" data-page="history"><b>▤</b><span>Test History<small>Past records</small></span><em>›</em></button>
        <button class="fc-action green" data-action="navigate" data-page="reports"><b>◷</b><span>Reports<small>Export PDF</small></span><em>›</em></button>
        <button class="fc-action amber" data-action="navigate" data-page="settings"><b>⚙</b><span>Settings<small>Preferences</small></span><em>›</em></button>
      </div>
    </div>

    <div class="card fc-panel fc-camera-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">◉</span><div><h4>CAMERA</h4><small>Ready when you are</small></div></div><span class="live-pill-static">GETUSERMEDIA</span></div>
      <div class="fc-camera-preview"><div class="scan-corners"></div><div class="camera-placeholder">▣<small>CAMERA</small></div><span>REFERENCE SWATCH + KIT</span></div>
      <button class="btn btn-blue fc-3d full" data-action="open-camera">◎ OPEN CAMERA</button>
    </div>
  </section>

  <section class="fc-bottom-grid">
    <div class="card fc-panel fc-records tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">▤</span><div><h4>RECENT RECORDS</h4><small>Most recent first</small></div></div><button class="text-action" data-action="navigate" data-page="history">VIEW ALL →</button></div>
      ${
        recent.length
          ? `<div class="fc-table">
              <div class="fc-tr fc-th"><span>DATE &amp; TIME</span><span>LOCATION</span><span>OBSERVATION</span><span>ACTION</span></div>
              ${recent
                .map(
                  (r) => `<div class="fc-tr">
                    <span>${escapeHtml(r.date)}</span>
                    <span>${escapeHtml(formatGps(r.lat, r.lng, r.accuracy))}</span>
                    <span>${observationPill(r.observation)}</span>
                    <button class="mini-btn" data-action="view-record" data-id="${escapeHtml(r.id)}">VIEW</button>
                  </div>`
                )
                .join("")}
            </div>`
          : `<div class="fc-empty">No records yet. Start a field test to populate this dashboard.<br><small>Nothing is pre-populated.</small></div>`
      }
    </div>

    <div class="card fc-panel fc-types tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">⚗</span><div><h4>SAMPLE TYPE</h4><small>Recorded with the evidence</small></div></div></div>
      <div class="fc-type-grid">
        ${[
          { key: "fluorescent", icon: "⚗", label: "Fluorescent" },
          { key: "urine", icon: "◯", label: "Urine" },
          { key: "saliva", icon: "◉", label: "Saliva" },
          { key: "other", icon: "▦", label: "Other" }
        ]
          .map(
            (t) => `<button data-action="open-camera" data-sample="${t.key}"><b>${t.icon}</b><span>${t.label}<br>test</span></button>`
          )
          .join("")}
      </div>
    </div>

    <div class="card fc-panel fc-analysis tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">✓</span><div><h4>CAPTURE INTEGRITY</h4><small>Measured, not asserted</small></div></div></div>
      <div class="analysis-lines">
        ${
          lastGuard
            ? `<span>Reference swatch <b>${lastGuard.guard.accepted ? escapeHtml(lastGuard.guard.colorName) : "NO MATCH"}</b></span>
               <span>Frame coverage <b>${lastGuard.guard.accepted ? `${coveragePct(lastGuard.guard.coverage)}%` : "—"}</b></span>
               <span>Image digest <b>${lastGuard.hash ? "SHA-256" : "MISSING"}</b></span>
               <span>GPS captured <b>${lastGuard.lat !== null ? "YES" : "NO"}</b></span>`
            : `<span>No capture recorded yet <b>—</b></span>`
        }
      </div>
      <button class="btn btn-blue fc-3d full" data-action="navigate" data-page="guide">WHAT THIS TOOL DOES NOT DO →</button>
    </div>
  </section>

  <section class="fc-bottom-grid">
    <div class="card fc-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">◉</span><div><h4>LOCATION</h4><small>GPS travels with each record</small></div></div></div>
      <p class="muted">${escapeHtml(UNMATCHABLE_NOTE)}</p>
      <button class="btn btn-outline full fc-3d" data-action="navigate" data-page="locations">VIEW LOCATIONS</button>
    </div>
    <div class="card fc-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">↻</span><div><h4>SYNC &amp; OFFLINE</h4><small>${online ? "Online" : "Offline"}</small></div></div></div>
      <p class="muted">${stats.pendingSync} record(s) are on this device only. Signing in and syncing uploads them plus their frames.</p>
      <button class="btn btn-outline full fc-3d" data-action="navigate" data-page="sync">SYNC CENTRE</button>
    </div>
    <div class="card fc-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">✓</span><div><h4>RECORD READINESS</h4><small>Counted from real records</small></div></div></div>
      <ul class="readiness-list">
        ${readiness
          .map(
            (item) =>
              `<li class="${item.ok ? "ok" : "warn"}"><span>${escapeHtml(item.label)}</span><b>${item.value}</b></li>`
          )
          .join("")}
      </ul>
    </div>
  </section>

  <section class="fc-bottom-grid">
    <div class="card fc-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">?</span><div><h4>FIELD GUIDE</h4><small>Capture technique and limits</small></div></div></div>
      <p class="muted">How to frame a kit, what the reference swatch check can and cannot tell you, and what an inconclusive read means.</p>
      <button class="btn btn-outline full fc-3d" data-action="navigate" data-page="guide">OPEN FIELD GUIDE</button>
    </div>
    <div class="card fc-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">▥</span><div><h4>REPORTS</h4><small>PDF export</small></div></div></div>
      <p class="muted">Export one record or a full index. Every report states that the classification is an operator observation.</p>
      <button class="btn btn-outline full fc-3d" data-action="navigate" data-page="reports">VIEW REPORTS</button>
    </div>
    <div class="card fc-panel tilt-card">
      <div class="fc-panel-head"><div><span class="fc-icon">⚙</span><div><h4>SETTINGS</h4><small>Theme, privacy, accessibility</small></div></div></div>
      <p class="muted">Theme, reduced motion, camera permission preference, and clearing local records.</p>
      <button class="btn btn-outline full fc-3d" data-action="navigate" data-page="settings">OPEN SETTINGS</button>
    </div>
  </section>
  `;
}

/**
 * Pre-capture checks. v1 rendered five hardcoded ticks and a READY badge
 * before the camera had even been opened; these now reflect real state.
 */
export function newtest(capabilities) {
  const checks = [
    { label: "Camera API available", detail: "getUserMedia in this browser", ok: capabilities.cameraApi },
    { label: "Reference swatches configured", detail: "8 colour references loaded", ok: capabilities.swatches },
    { label: "Local storage writable", detail: "records persist on this device", ok: capabilities.storage },
    { label: "Frame hashing available", detail: "SHA-256 via Web Crypto", ok: capabilities.crypto },
    { label: "GPS", detail: capabilities.geolocation ? "will be requested on capture" : "unavailable in this browser", ok: capabilities.geolocation, warn: !capabilities.geolocation }
  ];
  const blocking = checks.filter((c) => !c.ok && !c.warn);

  return `
  <div class="page-head">
    <div><div class="eyebrow">FIELD WORKFLOW</div><h3>New Field Test</h3><p>Frame the kit, check the reference swatch, then record what you read.</p></div>
    <span class="status-pill ${isOnline() ? "synced" : "offline"}">${isOnline() ? "ONLINE" : "OFFLINE MODE"}</span>
  </div>

  <div class="test-workflow">
    ${["Frame the kit", "Check swatch", "Read the kit", "Record", "Export"].map((label, i) => `<div class="workflow-step ${i === 0 ? "active" : ""}"><b>0${i + 1}</b>${label}</div>`).join("")}
  </div>

  <div class="grid two">
    <div class="card">
      <div class="section-title"><h4>How to frame the shot</h4><span>REFERENCE</span></div>
      <ol class="how-to-list">
        <li><b>1</b><span>Place the test kit flat, fully inside the guide frame.</span></li>
        <li><b>2</b><span>Keep the reference colour card in the same frame as the kit.</span></li>
        <li><b>3</b><span>Avoid glare, shadow and direct sunlight.</span></li>
        <li><b>4</b><span>Hold steady and check the swatch verdict before saving.</span></li>
      </ol>
      <div class="disclaimer" style="margin-top:14px">
        <b>What this app does not do:</b> it does not identify a substance and does not interpret the kit. The observation you record is your own reading, and a positive observation needs laboratory confirmation.
      </div>
    </div>

    <div class="card pre-capture-checklist">
      <div class="section-title"><div><h4>Pre-capture checks</h4><small>Live capability checks.</small></div><span class="ready-badge ${blocking.length ? "blocked" : "ready"}">${blocking.length ? `${blocking.length} BLOCKED` : "READY"}</span></div>
      <div class="checklist-list">
        ${checks
          .map(
            (c) => `<div class="checklist-item ${c.ok ? "ok" : c.warn ? "warn" : "fail"}">
              <div><strong>${escapeHtml(c.label)}</strong><small>${escapeHtml(c.detail)}</small></div>
              <span class="check-status">${c.ok ? "✓" : c.warn ? "!" : "×"}</span>
            </div>`
          )
          .join("")}
      </div>
      <button class="btn btn-red full fc-3d" data-action="open-camera" ${blocking.length ? "disabled" : ""}>Start camera →</button>
      ${blocking.length ? `<p class="checklist-blocked">Blocked: ${blocking.map((c) => escapeHtml(c.label)).join(", ")}.</p>` : ""}
      <p class="muted sample-hint">Sample type: <strong>${escapeHtml(state.camera.sampleType || "not selected")}</strong></p>
    </div>
  </div>`;
}
