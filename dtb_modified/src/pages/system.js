/** Field Guide, Settings and Profile pages. */

import { escapeHtml } from "../lib/dom.js";
import { formatGps, observationLabel } from "../lib/format.js";
import { summarizeRecords } from "../lib/records.js";
import { REFERENCE_SWATCHES, UNMATCHABLE_NOTE } from "../lib/guard.js";
import { isPremiumDisplay, isReducedMotion, getTheme } from "../lib/display.js";
import { isSirenActive } from "../lib/siren.js";
import { currentOperator, currentOperatorLabel, isOnline, state } from "../state.js";

export function guide() {
  const swatches = REFERENCE_SWATCHES.map((s) => s.name).join(", ");
  return `
  <div class="page-head">
    <div><div class="eyebrow">FIELD REFERENCE</div><h3>Field Guide</h3><p>Capture technique, the limits of the swatch check, and what an observation means.</p></div>
  </div>

  <div class="grid two">
    <div class="card">
      <div class="section-title"><h4>How to capture correctly</h4><span>6 STEPS</span></div>
      ${[
        "Prepare the physical field-test kit on a flat surface.",
        "Put the reference colour card in the same frame as the kit.",
        "Keep the reaction area fully visible and unobstructed.",
        "Avoid glare, shadow and direct sunlight on the pad.",
        "Hold the device steady; a blurred frame cannot be read.",
        "Check the swatch verdict, then record what the kit shows."
      ]
        .map(
          (text, i) => `<div class="guide-step"><div class="guide-num">${i + 1}</div><div><h4>${escapeHtml(text)}</h4><p>Consistent framing is the only thing this app can do to help you read a kit reliably.</p></div></div>`
        )
        .join("")}
    </div>

    <div class="card">
      <div class="section-title"><h4>What this tool does not do</h4><span>IMPORTANT</span></div>
      <div class="guide-step"><div class="guide-num" style="color:var(--red)">×</div><div><h4>It does not identify substances</h4><p>No code path in this application produces a chemical identification. The only classification in a record is the reading a human operator entered.</p></div></div>
      <div class="guide-step"><div class="guide-num" style="color:var(--red)">×</div><div><h4>It does not interpret your kit</h4><p>It does not read the reagent, compare against a validated threshold, or apply any manufacturer's timing window.</p></div></div>
      <div class="guide-step"><div class="guide-num" style="color:var(--red)">×</div><div><h4>It is not a forensic instrument</h4><p>A stored frame plus a digest is evidence of what was photographed. It is not a chain of custody, and nothing here is signed or tamper-proof.</p></div></div>
      <div class="guide-step"><div class="guide-num" style="color:var(--amber)">!</div><div><h4>A positive observation is presumptive</h4><p>It means an operator saw a colour change. Confirmatory laboratory analysis is required before the result is relied upon or acted on.</p></div></div>
      <div class="disclaimer" style="margin-top:15px"><b>Regulatory note:</b> presumptive field-test results have legal limitations that vary by jurisdiction. Follow your service's procedure.</div>
    </div>
  </div>

  <div class="grid two">
    <div class="card">
      <div class="section-title"><h4>Observations you can record</h4><span>3 VALUES</span></div>
      <div class="guide-step"><div class="guide-num" style="color:var(--red)">!</div><div><h4>Observed positive</h4><p>The operator saw the kit's positive appearance. A laboratory referral is required by policy and is pre-selected when you save this value.</p></div></div>
      <div class="guide-step"><div class="guide-num">✓</div><div><h4>Observed negative</h4><p>The operator saw the kit's negative appearance within the kit's stated reading window.</p></div></div>
      <div class="guide-step"><div class="guide-num" style="color:var(--amber)">?</div><div><h4>Not read</h4><p>Use when the kit could not be read: expired, wrong timing, glare, poor light, or a doubtful colour. This is the honest default and is preferred over guessing.</p></div></div>
    </div>

    <div class="card">
      <div class="section-title"><h4>What the swatch check does</h4><span>MEASURED</span></div>
      <p class="muted">Before a record is saved, the frame is downsampled and searched for a contiguous region matching one of ${REFERENCE_SWATCHES.length} reference colours: ${escapeHtml(swatches)}.</p>
      <ul class="plain-list">
        <li><b>Pass</b> — a large, solid, strip-shaped region of a reference colour was found. The matched colour and its coverage are stored as capture metadata.</li>
        <li><b>Weak</b> — a match was found but the region is small. Consider a retake.</li>
        <li><b>No match</b> — no reference colour was found. The frame is still saveable; the record is simply flagged and the observation stands alone.</li>
      </ul>
      <p class="muted">${escapeHtml(UNMATCHABLE_NOTE)}</p>
      <div class="disclaimer"><b>Important:</b> a swatch match says a colour is present. It says nothing about what the kit is testing for, and it never changes the observation you record.</div>
    </div>
  </div>`;
}

export function settings() {
  const theme = getTheme();
  const reduced = isReducedMotion();
  const analytics = localStorage.getItem("dtbAnalytics") !== "off";
  const camera = localStorage.getItem("dtbCameraPermission") !== "off";
  const premium = isPremiumDisplay();

  return `
  <div class="page-head">
    <div><div class="eyebrow">APPLICATION PREFERENCES</div><h3>Settings</h3><p>Appearance, accessibility, diagnostics and local data.</p></div>
    <span class="status-pill synced">LOCAL SETTINGS</span>
  </div>

  <div class="settings-shell">
    <div class="card settings-nav-card">
      <div class="settings-brand"><div class="settings-gear">⚙</div><div><strong>FieldCheck Control</strong><small>Stored in this browser</small></div></div>
      <button class="settings-tab active" data-action="settings-focus" data-section="appearance">◈ Appearance</button>
      <button class="settings-tab" data-action="settings-focus" data-section="help">? Help &amp; support</button>
      <button class="settings-tab" data-action="settings-focus" data-section="privacy">▣ Privacy</button>
      <button class="settings-tab" data-action="settings-focus" data-section="accessibility">◎ Accessibility</button>
    </div>

    <div class="settings-content">
      <section id="settings-appearance" class="card settings-section">
        <div class="section-title"><div><h4>Appearance</h4><small>Theme and visual depth.</small></div><span>DISPLAY</span></div>
        <div class="setting-row">
          <div><strong>Theme</strong><small>Currently ${theme === "light" ? "light workspace" : "dark workspace"}.</small></div>
          <div class="theme-choice-grid compact">
            <button class="theme-choice ${theme === "dark" ? "selected" : ""}" data-action="set-theme" data-theme="dark"><span class="theme-preview dark-preview"></span><strong>Dark</strong></button>
            <button class="theme-choice ${theme === "light" ? "selected" : ""}" data-action="set-theme" data-theme="light"><span class="theme-preview light-preview"></span><strong>Light</strong></button>
          </div>
        </div>
        <div class="setting-row">
          <div><strong>3D glass and pointer tilt</strong><small>Button depth, card tilt and the cool-spectrum accent.</small></div>
          <button class="toggle-button ${premium ? "on" : ""}" data-action="toggle-premium" aria-pressed="${premium}"><span></span>${premium ? "ON" : "OFF"}</button>
        </div>
        <div class="setting-row">
          <div><strong>Emergency visual beacon</strong><small>Pulsing red beacon with an audible tone.</small></div>
          <button class="toggle-button ${isSirenActive() ? "on" : ""}" data-action="toggle-siren" aria-pressed="${isSirenActive()}"><span></span>${isSirenActive() ? "ON" : "OFF"}</button>
        </div>
      </section>

      <section id="settings-help" class="card settings-section">
        <div class="section-title"><div><h4>Help &amp; support</h4><small>Diagnostics and reference material.</small></div><span>SUPPORT</span></div>
        <div class="help-grid">
          <button class="help-action" data-action="navigate" data-page="guide"><b>?</b><span><strong>Field guide</strong><small>Capture technique and tool limits</small></span><em>→</em></button>
          <button class="help-action" data-action="run-diagnostics"><b>✓</b><span><strong>System check</strong><small>Storage, camera, GPS, hashing, backend</small></span><em>→</em></button>
          <button class="help-action" data-action="show-shortcuts"><b>⌨</b><span><strong>Keyboard shortcuts</strong><small>Quick navigation keys</small></span><em>→</em></button>
          <button class="help-action" data-action="show-toast" data-message="This is a student prototype. No support channel is configured."><b>i</b><span><strong>About</strong><small>Project and limitation notes</small></span><em>→</em></button>
        </div>
      </section>

      <section id="settings-privacy" class="card settings-section">
        <div class="section-title"><div><h4>Privacy</h4><small>Local data and optional permissions.</small></div><span>PRIVACY</span></div>
        <div class="privacy-note">
          <strong>Local-first storage</strong>
          <p>Records, including captured frames, stay in this browser profile until you sign in and upload them. Clearing local records permanently removes them from this device.</p>
        </div>
        <div class="setting-row">
          <div><strong>Usage analytics</strong><small>No analytics are transmitted by this build.</small></div>
          <button class="toggle-button ${analytics ? "on" : ""}" data-action="toggle-pref" data-pref="analytics" aria-pressed="${analytics}"><span></span>${analytics ? "ON" : "OFF"}</button>
        </div>
        <div class="setting-row">
          <div><strong>Camera permission</strong><small>Whether the app may request camera access for a test.</small></div>
          <button class="toggle-button ${camera ? "on" : ""}" data-action="toggle-pref" data-pref="camera" aria-pressed="${camera}"><span></span>${camera ? "ALLOWED" : "BLOCKED"}</button>
        </div>
        <div class="privacy-actions">
          <button class="btn btn-outline fc-3d" data-action="export-privacy">Export privacy summary</button>
          <button class="btn btn-red fc-3d" data-action="clear-records">Clear local records</button>
        </div>
      </section>

      <section id="settings-accessibility" class="card settings-section">
        <div class="section-title"><div><h4>Accessibility</h4><small>Motion and target sizing.</small></div><span>ACCESSIBILITY</span></div>
        <div class="setting-row">
          <div><strong>Reduced motion</strong><small>Disables card tilt, button depth and pulses. Defaults to your system setting.</small></div>
          <button class="toggle-button ${reduced ? "on" : ""}" data-action="toggle-pref" data-pref="reducedMotion" aria-pressed="${reduced}"><span></span>${reduced ? "ON" : "OFF"}</button>
        </div>
        <div class="setting-row">
          <div><strong>Touch targets</strong><small>Controls use 44px minimum targets and wrap on narrow screens.</small></div>
          <span class="status-pill synced">ACTIVE</span>
        </div>
      </section>
    </div>
  </div>`;
}

export function profile(records) {
  const stats = summarizeRecords(records);
  const user = state.auth.user;
  return `
  <div class="page-head">
    <div><div class="eyebrow">IDENTITY &amp; STORAGE</div><h3>Operator Profile</h3><p>Who is recording, and where their data lives.</p></div>
  </div>
  <div class="grid profile-grid">
    <div class="card profile-card">
      <div class="profile-large">${escapeHtml(
        (user?.displayName || user?.email || "OP").slice(0, 2).toUpperCase()
      )}</div>
      <h3 style="margin:0">${escapeHtml(currentOperator())}</h3>
      <p class="muted" style="font-size:10px">${escapeHtml(currentOperatorLabel())}</p>
      <div class="hash" style="margin-top:18px">${user?.uid ? `Firebase UID: ${escapeHtml(user.uid)}` : "No cloud identity — records are stored on this device only"}</div>
    </div>
    <div class="card">
      ${[
        ["Records stored", `${stats.total} record(s) on this device`],
        ["Uploaded to cloud", `${stats.total - stats.pendingSync} of ${stats.total}`],
        ["Records without GPS", `${stats.missingGps}`],
        ["Records without digest", `${stats.missingHash}`],
        ["Connection", isOnline() ? "Online" : "Offline"]
      ]
        .map(
          ([label, value]) => `<div class="setting"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}</small></div></div>`
        )
        .join("")}
      <div class="setting">
        <div><strong>Session</strong><small>${escapeHtml(state.auth.demoMode ? "Demo mode — no cloud identity" : user ? "Signed in" : "Not signed in")}</small></div>
        <button class="btn btn-outline" data-action="sign-out">Sign out</button>
      </div>
    </div>
  </div>
  <div class="disclaimer" style="margin-top:14px"><b>Session handling:</b> this build gates the interface on a session flag in <code>sessionStorage</code>. That is a convenience, not a security control — anyone with access to the browser profile can read the stored records directly.</div>`;
}

export { observationLabel, formatGps };
