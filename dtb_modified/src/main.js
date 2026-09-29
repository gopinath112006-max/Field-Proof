/**
 * FieldCheck — application entry point.
 *
 * Capture, verify and record field-test evidence.
 * This application does not identify controlled substances and does not
 * interpret field-test kits. Every classification in a record is a human
 * operator's reading of a physical kit, and every positive observation requires
 * confirmatory laboratory analysis.
 */

import "./styles/main.css";

import { config, describeConfig, isFirebaseConfigured } from "./config.js";
import { $, $$, delegate, isEditingText } from "./lib/dom.js";
import { showToast, showError } from "./lib/toast.js";
import {
  classificationLabel,
  classificationPill,
  formatGps,
  formatRecordDate,
  observationLabel,
  observationPill,
  signaturePill,
  syncPill
} from "./lib/format.js";
import {
  SCHEMA_VERSION,
  clearRecords,
  loadRecords,
  normalizeRecord,
  persistRecords,
  summarizeRecords
} from "./lib/records.js";
import { sha256HexFromDataUrl, verifyRecordHash } from "./lib/hash.js";
import { signRecord, verifyRecordSignature } from "./lib/crypto.js";
import { REFERENCE_SWATCHES } from "./lib/guard.js";
import { checkApiHealth, validateFrame } from "./lib/backend.js";
import {
  describeAuthError,
  getCurrentUser,
  initialiseFirebase,
  isAuthReady,
  isDatabaseReady,
  operatorInitials,
  operatorName,
  sendReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  signOut as fbSignOut,
  watchAuth,
  writeRecord
} from "./lib/firebase.js";
import {
  applyMotionPreference,
  applyPremiumDisplay,
  applyTheme,
  bindCardTilt,
  initButtonFeedback,
  isPremiumDisplay,
  isReducedMotion,
  setPremiumDisplay,
  setReducedMotion,
  setTheme,
  watchSystemMotion
} from "./lib/display.js";
import { initSiren, isSirenActive, toggleSiren } from "./lib/siren.js";
import { runSync, syncSummaryMessage } from "./lib/sync.js";
import { exportAllRecordsPdf, exportPrivacySummary, exportRecordPdf } from "./lib/pdf.js";
import { state, isOnline, setConnectionOverride, currentOperator, currentOperatorLabel, clearAnalysisTimer, newRecordId } from "./state.js";

import { dashboard, newtest } from "./pages/dashboard.js";
import { filterRecords, history, locations, offline, recordsTable, reports, sync } from "./pages/records.js";
import { guide, profile, settings } from "./pages/system.js";
import { recordDetail } from "./pages/detail.js";
import {
  captureFrame,
  closeCamera,
  collectObservation,
  importImage,
  isCameraPreferred,
  loadDemoFrame,
  openCamera,
  openObservationForm,
  requestCameraGps,
  retakeFrame,
  stopCamera
} from "./capture.js";
import { demonstrateTamperDetection } from "./lib/demo.js";

// --- capabilities ----------------------------------------------------------

function detectCapabilities() {
  const crypto_ = typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
  let storage = false;
  try {
    localStorage.setItem("dtb.probe", "1");
    localStorage.removeItem("dtb.probe");
    storage = true;
  } catch {
    storage = false;
  }
  state.storageAvailable = storage;
  return {
    cameraApi: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    geolocation: typeof navigator !== "undefined" && Boolean(navigator.geolocation),
    crypto: crypto_,
    swatches: REFERENCE_SWATCHES.length > 0,
    storage
  };
}

const capabilities = detectCapabilities();

// --- records ---------------------------------------------------------------

function getRecords() {
  return loadRecords();
}

function commit(records) {
  if (!persistRecords(records)) {
    showError("Could not write to local storage — the record may not have been saved.");
    return false;
  }
  return true;
}

// --- routing ---------------------------------------------------------------

const PAGES = {
  dashboard: { title: "Command Dashboard", label: "Dashboard", render: (r) => dashboard(r) },
  newtest: { title: "New Field Test", label: "New field test", render: () => newtest(capabilities) },
  history: { title: "Test History", label: "Test history", render: (r) => history(r) },
  reports: { title: "Reports", label: "Reports", render: (r) => reports(r) },
  locations: { title: "Test Locations", label: "Locations", render: (r) => locations(r) },
  offline: { title: "Offline Records", label: "Offline records", render: (r) => offline(r) },
  sync: { title: "Synchronisation", label: "Sync", render: (r) => sync(r) },
  guide: { title: "Field Guide", label: "Field guide", render: () => guide() },
  settings: { title: "Settings", label: "Settings", render: () => settings() },
  profile: { title: "Operator Profile", label: "Profile", render: (r) => profile(r) }
};

function applyChrome(page, title) {
  const label = $("#pageLabel");
  const heading = $("#pageTitle");
  if (label) label.textContent = (PAGES[page]?.label || page).toUpperCase();
  if (heading) heading.textContent = title;
  for (const item of $$(".nav-item[data-page]")) {
    const active = item.dataset.page === page;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  // The mobile bar is a fixed allow-list, so the active item can be scrolled
  // into view when it is off-screen.
  const activeItem = $(`.nav-item[data-page="${page}"]`);
  if (activeItem && window.matchMedia?.("(max-width: 720px)").matches) {
    activeItem.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }
}

function paintConnection() {
  const online = isOnline();
  const text = $("#connectionText");
  const card = $("#connectionCard");
  const dot = $("#connectionDot");
  if (text) text.textContent = online ? "ONLINE" : "OFFLINE";
  if (card) {
    const small = card.querySelector("small");
    if (small) small.textContent = online ? "Sync available" : "Local storage active";
  }
  if (dot) dot.className = `dot ${online ? "online" : ""}`;
}

export function render(page = state.currentPage) {
  clearAnalysisTimer();
  const target = PAGES[page] ? page : "dashboard";
  state.currentPage = target;
  const records = getRecords();
  const { title } = PAGES[target];
  applyChrome(target, title);
  const container = $("#pageContainer");
  if (container) container.innerHTML = PAGES[target].render(records);
  bindCardTilt();
  window.scrollTo({ top: 0, behavior: "smooth" });
  paintConnection();
}

function navigate(page) {
  render(page);
}

document.addEventListener("dtb:navigate", (event) => {
  render(event.detail?.page || "dashboard");
  if (event.detail?.focus) focusSettingsSection(event.detail.focus);
});

// --- authentication --------------------------------------------------------

function setAuthMessage(message, tone = "error") {
  const box = $("#authMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `auth-message show ${tone}`;
}

function clearAuthMessage() {
  const box = $("#authMessage");
  if (box) box.className = "auth-message";
}

function paintOperator() {
  const user = getCurrentUser();
  const name = operatorName(user);
  const avatar = $(".avatar");
  if (avatar) avatar.textContent = operatorInitials(user);
  const strong = $(".operator strong");
  const small = $(".operator small");
  if (strong) strong.textContent = name;
  if (small) small.textContent = currentOperatorLabel();
  const profileName = $(".profile-card h3");
  if (profileName) profileName.textContent = name;
}

function showApp() {
  $("#loginScreen")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");
  paintOperator();
  render(state.currentPage || "dashboard");
}

function showLogin() {
  $("#app")?.classList.add("hidden");
  $("#loginScreen")?.classList.remove("hidden");
  const email = $("#loginEmail");
  const password = $("#loginPassword");
  if (email) email.value = "";
  if (password) password.value = "";
  clearAuthMessage();
  stopCamera();
}

function enterApp({ demo = false } = {}) {
  state.auth.demoMode = demo;
  if (demo) sessionStorage.setItem(state.auth.sessionFlag, "demo");
  else sessionStorage.removeItem(state.auth.sessionFlag);
  showApp();
  showToast(
    demo
      ? "Demo mode. Records stay in this browser and are never uploaded."
      : "Signed in. You can now upload records.",
    demo ? "info" : "success"
  );
}

function requireFirebase() {
  if (isAuthReady()) return true;
  setAuthMessage(
    isFirebaseConfigured()
      ? "Firebase failed to initialise. Check the browser console and your connection."
      : "No Firebase project is configured. Add your web config to config.js, or use Demo mode to work on-device.",
    "error"
  );
  return false;
}

async function handleSignIn() {
  if (!requireFirebase()) return;
  const email = $("#loginEmail")?.value.trim();
  const password = $("#loginPassword")?.value;
  if (!email || !password) {
    setAuthMessage("Enter your email address and password.");
    return;
  }
  setAuthMessage("Signing in…", "info");
  try {
    await signInWithEmail(email, password);
    setAuthMessage("Signed in.", "success");
    setTimeout(() => enterApp(), 200);
  } catch (error) {
    setAuthMessage(describeAuthError(error));
  }
}

async function handleSignUp() {
  if (!requireFirebase()) return;
  const email = $("#loginEmail")?.value.trim();
  const password = $("#loginPassword")?.value;
  if (!email || !password) {
    setAuthMessage("Enter an email address and password to create an account.");
    return;
  }
  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.");
    return;
  }
  setAuthMessage("Creating account…", "info");
  try {
    await signUpWithEmail(email, password);
    setAuthMessage("Account created.", "success");
    setTimeout(() => enterApp(), 200);
  } catch (error) {
    setAuthMessage(describeAuthError(error));
  }
}

async function handleGoogleSignIn() {
  if (!requireFirebase()) return;
  setAuthMessage("Opening Google sign-in…", "info");
  try {
    await signInWithGoogle();
    setAuthMessage("Signed in.", "success");
    setTimeout(() => enterApp(), 200);
  } catch (error) {
    setAuthMessage(describeAuthError(error));
  }
}

async function handleResetPassword() {
  if (!requireFirebase()) return;
  const email = $("#loginEmail")?.value.trim();
  if (!email) {
    setAuthMessage("Enter your email address first, then choose Forgot password.");
    return;
  }
  try {
    await sendReset(email);
    setAuthMessage("Password reset email sent. Check your inbox.", "success");
  } catch (error) {
    setAuthMessage(describeAuthError(error));
  }
}

/**
 * Biometric sign-in.
 *
 * WebAuthn requires a credential registered by a server. This build has no
 * server-side registration flow, so it reports the platform capability and
 * refuses to pretend a credential was verified. v1 behaved the same way but
 * said so only in a comment.
 */
function handleBiometric() {
  const supported = typeof window.PublicKeyCredential === "function" && Boolean(navigator.credentials?.get);
  setAuthMessage(
    supported
      ? "This device supports WebAuthn, but no biometric credential is registered. Registration requires a server-side enrolment endpoint, which this build does not have. Use Sign In or Demo mode."
      : "Biometric sign-in is not available in this browser. Use Sign In or Demo mode.",
    supported ? "info" : "error"
  );
}

async function handleSignOut() {
  try {
    await fbSignOut();
  } catch (error) {
    console.warn("signOut failed", error);
  }
  state.auth.demoMode = false;
  state.auth.user = null;
  sessionStorage.removeItem(state.auth.sessionFlag);
  showLogin();
  showToast("Signed out. Records remain on this device.");
}

// --- record creation -------------------------------------------------------

async function submitObservation(form) {
  const input = collectObservation(form);
  if (!input.acknowledged) {
    showError("Tick the acknowledgement before saving. A record must state who read the kit.");
    return;
  }
  if (!state.camera.imageDataUrl) {
    showError("No frame captured. Capture or import an image first.");
    return;
  }

  const now = new Date();
  const id = newRecordId();
  const hash = await sha256HexFromDataUrl(state.camera.imageDataUrl);
  // The camera already requested GPS; this is a last attempt for accuracy.
  const gps = state.camera.gps.lat !== null ? state.camera.gps : await requestCameraGps();
  const guard = state.camera.guard;
  // Pass the browser's digest so the client can report whether the bytes the
  // service hashed are the bytes that were captured.
  const validation = await validateFrame(state.camera.imageDataUrl, { localSha256: hash });
  const classificationResult = state.camera.classification;

  const unsignedRecord = normalizeRecord({
    id,
    observation: input.observation,
    observationSource: "operator",
    observedAt: now.toISOString(),
    observedBy: currentOperator(),
    note: input.note,
    labReferralRequested: input.labReferralRequested,
    sampleType: input.sampleType,
    classification: classificationResult?.classification || "inconclusive",
    classificationSource: "automated-colorimetric-v1",
    classificationConfidence: classificationResult?.confidence || 0,
    calibrationStatus: classificationResult?.calibrationStatus || (guard?.accepted ? "calibrated" : "uncalibrated"),
    classifierVersion: "1.0.0",
    calibrationVersion: "1.0.0",
    normalizedReactionColor: classificationResult?.normalizedHex || null,
    guard: {
      accepted: Boolean(guard?.accepted),
      colorName: guard?.colorName || "",
      coverage: guard?.coverage || 0,
      aspect: guard?.aspect || 0,
      reason: guard?.reason || ""
    },
    date: formatRecordDate(now),
    operator: currentOperator(),
    hash,
    sync: "offline",
    gps: gps.text,
    lat: gps.lat,
    lng: gps.lng,
    accuracy: gps.accuracy,
    quality: validation.quality,
    apiStatus: validation.apiStatus
  });

  const sigResult = await signRecord(unsignedRecord);
  const record = normalizeRecord({
    ...unsignedRecord,
    signature: sigResult.signature,
    signatureAlgorithm: sigResult.signatureAlgorithm,
    signatureKeyId: sigResult.signatureKeyId,
    publicKey: sigResult.publicKey,
    integrityStatus: "verified"
  });

  const records = getRecords();
  records.unshift(record);
  if (!commit(records)) return;

  state.sessionImages.set(record.id, state.camera.imageDataUrl);
  state.camera.imageDataUrl = null;
  state.camera.blob = null;
  state.camera.guard = null;
  state.camera.quality = null;
  state.camera.classification = null;
  closeCamera();
  $("#observationModal")?.classList.add("hidden");

  if (isOnline() && getCurrentUser()) {
    showToast("Record signed & saved on this device. Uploading…", "info");
    await doSync({ silent: true });
  } else {
    showToast(
      isOnline()
        ? "Record signed & saved on this device. Sign in to upload it."
        : "Record signed & saved on this device. It will stay here until you sync.",
      "info"
    );
  }

  await showRecord(record.id);
}

async function showRecord(id) {
  const record = getRecords().find((r) => r.id === id);
  if (!record) {
    showError("That record is no longer available.");
    return;
  }
  const integrity = await verifyRecordHash(record, state.sessionImages.get(record.id));
  const signatureResult = await verifyRecordSignature(record);
  state.currentPage = "history";
  const container = $("#pageContainer");
  if (container) container.innerHTML = recordDetail(record, integrity, signatureResult);
  applyChrome("history", "Record details");
  bindCardTilt();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- sync ------------------------------------------------------------------

async function doSync({ silent = false } = {}) {
  const records = getRecords();
  const user = getCurrentUser();
  const result = await runSync({
    records,
    online: isOnline(),
    signedIn: Boolean(user),
    databaseReady: isDatabaseReady(),
    writeRecord: (record) =>
      writeRecord(record, { user, imageBlob: state.sessionImages.get(record.id) || null })
  });

  if (result.synced.length || result.failed.length) commit(records);
  if (!silent) showToast(syncSummaryMessage(result), result.failed.length ? "error" : "info");
  else if (result.failed.length) showError(syncSummaryMessage(result));

  render(state.currentPage);
  return result;
}

// --- exports ---------------------------------------------------------------

async function handleExportRecordPdf(id) {
  const record = getRecords().find((r) => r.id === id);
  if (!record) {
    showError("Record not found.");
    return;
  }
  try {
    const { engine } = await exportRecordPdf(record, state.sessionImages.get(record.id));
    showToast(`PDF downloaded${engine === "fallback" ? " (built-in writer)" : ""}.`);
  } catch (error) {
    showError(`PDF export failed: ${error.message}`);
  }
}

async function handleExportAllPdf() {
  const records = getRecords();
  if (!records.length) {
    showError("No records to export.");
    return;
  }
  try {
    await exportAllRecordsPdf(records);
    showToast("Record index downloaded.");
  } catch (error) {
    showError(`PDF export failed: ${error.message}`);
  }
}

async function handleCopyVerification(id) {
  const record = getRecords().find((r) => r.id === id);
  if (!record) return;
  const text = [
    "FieldCheck record",
    `Test ID: ${record.id}`,
    `Operator observation: ${observationLabel(record.observation)}`,
    `Presumptive classification: ${classificationLabel(record.classification)} (${record.classificationConfidence || 0}% confidence)`,
    `Calibration: ${record.calibrationStatus || "uncalibrated"}`,
    `Observed by: ${record.observedBy || record.operator}`,
    `Observed at: ${record.observedAt || record.date}`,
    `GPS: ${formatGps(record.lat, record.lng, record.accuracy)}`,
    `SHA-256: ${record.hash || "not recorded"}`,
    `Digital signature: ${record.signature ? `${record.signatureAlgorithm} (${record.signatureKeyId})` : "unsigned"}`,
    "",
    "Presumptive field-test result with cryptographic integrity verification.",
    "Positive observations require confirmatory laboratory analysis."
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showToast("Verification details copied.");
  } catch {
    showError("Clipboard access was blocked by the browser.");
  }
}

function handleExportPrivacy() {
  exportPrivacySummary({
    recordCount: getRecords().length,
    preferences: {
      analytics: localStorage.getItem("dtbAnalytics") !== "off",
      camera: isCameraPreferred(),
      theme: document.documentElement.dataset.theme || "dark",
      reducedMotion: isReducedMotion()
    }
  });
  showToast("Privacy summary downloaded.");
}

function handleClearRecords() {
  const records = getRecords();
  if (!records.length) {
    showToast("There are no local records to clear.");
    return;
  }
  const unsynced = records.filter((r) => r.sync !== "synced").length;
  const warning = unsynced
    ? `\n\n${unsynced} of these have never been uploaded and will be lost.`
    : "";
  const ok = window.confirm(
    `Permanently delete all ${records.length} local record(s) from this browser profile?${warning}\n\nThis cannot be undone.`
  );
  if (!ok) return;
  clearRecords();
  state.sessionImages.clear();
  render(state.currentPage);
  showToast("Local records cleared.");
}

// --- diagnostics -----------------------------------------------------------

async function runDiagnostics() {
  const storageHealth = (() => {
    try {
      localStorage.setItem("dtb.probe", "1");
      localStorage.removeItem("dtb.probe");
      return "ok";
    } catch {
      return "unavailable";
    }
  })();
  const health = await checkApiHealth();
  const summary = describeConfig();
  const report = {
    "schema": `v${SCHEMA_VERSION}`,
    "records": getRecords().length,
    "storage": storageHealth,
    "camera": capabilities.cameraApi ? "available" : "unavailable",
    "gps": capabilities.geolocation ? "available" : "unavailable",
    "hashing": capabilities.crypto ? "available" : "unavailable",
    "swatches": REFERENCE_SWATCHES.length,
    "firebase": isFirebaseConfigured() ? (isAuthReady() ? "ready" : "initialise failed") : "not configured",
    "backend": health.reachable ? health.detail : `unreachable (${health.detail})`,
    "backend scope": health.identifiesSubstances === true ? "IDENTIFIES SUBSTANCES" : "image quality only",
    "apiUrl": summary.apiBaseUrl,
    "session": state.auth.demoMode ? "demo" : getCurrentUser() ? "signed in" : "not signed in"
  };
  console.table(report);
  showToast(
    `Storage ${storageHealth} · camera ${capabilities.cameraApi ? "ok" : "no"} · hashing ${capabilities.crypto ? "ok" : "no"} · backend ${health.reachable ? "ok" : "unreachable"}`
  );
  return report;
}

function focusSettingsSection(section) {
  const tabs = $$(".settings-tab");
  const order = ["appearance", "help", "privacy", "accessibility"];
  const index = order.indexOf(section);
  tabs.forEach((tab) => tab.classList.remove("active"));
  if (tabs[index]) tabs[index].classList.add("active");
  const target = document.getElementById(`settings-${section}`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

// --- action dispatch -------------------------------------------------------

const ACTIONS = {
  navigate: (el) => navigate(el.dataset.page),
  "open-camera": (el) => {
    state.camera.sampleType = el.dataset.sample || "";
    openCamera();
  },
  "view-record": (el) => showRecord(el.dataset.id),
  "export-record-pdf": (el) => handleExportRecordPdf(el.dataset.id),
  "export-all-pdf": () => handleExportAllPdf(),
  "copy-verification": (el) => handleCopyVerification(el.dataset.id),
  "sync-now": () => doSync(),
  "set-theme": (el) => {
    setTheme(el.dataset.theme);
    render(state.currentPage);
    showToast(`${el.dataset.theme === "light" ? "Light" : "Dark"} theme.`);
  },
  "toggle-premium": () => {
    const next = !isPremiumDisplay();
    setPremiumDisplay(next);
    render(state.currentPage);
    showToast(next ? "3D depth and pointer tilt enabled." : "3D depth and pointer tilt disabled.");
  },
  "toggle-siren": () => {
    toggleSiren();
    render(state.currentPage);
  },
  "toggle-pref": (el) => {
    const pref = el.dataset.pref;
    if (pref === "reducedMotion") {
      setReducedMotion(!isReducedMotion());
    } else {
      const key = pref === "camera" ? "dtbCameraPermission" : "dtbAnalytics";
      const on = localStorage.getItem(key) === "off" ? "on" : "off";
      localStorage.setItem(key, on);
    }
    render(state.currentPage);
    showToast("Preference saved.");
  },
  "settings-focus": (el) => focusSettingsSection(el.dataset.section),
  "export-privacy": () => handleExportPrivacy(),
  "clear-records": () => handleClearRecords(),
  "run-diagnostics": () => runDiagnostics(),
  "show-shortcuts": () =>
    showToast("Shortcuts: D dashboard · N new test · H history · R reports · S settings · G guide"),
  "show-toast": (el) => showToast(el.dataset.message || ""),
  "load-demo": async (el) => {
    const key = el.dataset.demo;
    if (key) {
      await loadDemoFrame(key);
      showToast(`Loaded synthetic ${key} demo test.`);
    }
  },
  "demo-tamper": async () => {
    const records = getRecords();
    const target = records.find((r) => r.signature) || records[0];
    if (!target) {
      showError("Please complete or load at least one test first to create a signed record.");
      return;
    }
    const result = await demonstrateTamperDetection(
      target,
      "observation",
      target.observation === "positive" ? "negative" : "positive"
    );
    const container = $("#pageContainer");
    if (container) {
      container.innerHTML = recordDetail(
        result.tamperedRecord,
        { checked: true, valid: true, reason: "Image digest matches" },
        result.verificationAfter
      );
      applyChrome("history", "Tamper detected record");
      bindCardTilt();
      window.scrollTo({ top: 0, behavior: "smooth" });
      showToast("Tamper detected: observation altered. Digital signature invalid!", "error");
    }
  },
  "sign-out": () => handleSignOut()
};

function wireActions(root = document) {
  delegate(root, "click", "[data-action]", (el, event) => {
    const handler = ACTIONS[el.dataset.action];
    if (!handler) return;
    if (el.tagName === "A") event.preventDefault();
    handler(el, event);
  });

  // Rows are clickable but are <tr>, not buttons, so they need keyboard support
  // to be reachable without a mouse.
  delegate(root, "keydown", "tr[data-action]", (el, event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    el.click();
  });
}

// --- bootstrap -------------------------------------------------------------

function wireStaticControls() {
  delegate(document, "click", ".nav-item[data-page]", (el) => navigate(el.dataset.page));
  delegate(document, "click", "[data-close]", (el) => {
    const id = el.dataset.close;
    if (id === "cameraModal") closeCamera();
    else document.getElementById(id)?.classList.add("hidden");
  });

  $("#loginBtn")?.addEventListener("click", handleSignIn);
  $("#googleBtn")?.addEventListener("click", handleGoogleSignIn);
  $("#signupBtn")?.addEventListener("click", handleSignUp);
  $("#resetBtn")?.addEventListener("click", handleResetPassword);
  $("#biometricBtn")?.addEventListener("click", handleBiometric);
  $("#demoBtn")?.addEventListener("click", () => enterApp({ demo: true }));
  $("#logoutBtn")?.addEventListener("click", handleSignOut);
  $("#mobileLogoutBtn")?.addEventListener("click", handleSignOut);

  $("#captureBtn")?.addEventListener("click", async () => {
    if (state.camera.imageDataUrl) await openObservationForm();
    else await captureFrame();
  });
  $("#retakeBtn")?.addEventListener("click", retakeFrame);
  $("#uploadBtn")?.addEventListener("click", () => $("#imageInput")?.click());
  $("#imageInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await importImage(file);
    event.target.value = "";
  });
  $("#sirenToggle")?.addEventListener("click", toggleSiren);
  $("#connectionToggle")?.addEventListener("click", () => {
    const next = !isOnline();
    setConnectionOverride(next);
    paintConnection();
    render(state.currentPage);
    showToast(next ? "Simulated online mode." : "Simulated offline mode. Nothing will be uploaded.");
  });

  $("#observationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    if (submit?.value === "cancel") {
      $("#observationModal")?.classList.add("hidden");
      return;
    }
    await submitObservation(event.currentTarget);
  });

  // History search and filter.
  $("#pageContainer")?.addEventListener("input", (event) => {
    if (event.target.id !== "historySearch") return;
    applyHistoryFilter();
  });
  $("#pageContainer")?.addEventListener("change", (event) => {
    if (event.target.id !== "historyFilter") return;
    applyHistoryFilter();
  });

  window.addEventListener("online", () => {
    setConnectionOverride(null);
    paintConnection();
    showToast("Connection restored. Records can be uploaded.");
  });
  window.addEventListener("offline", () => {
    setConnectionOverride(null);
    paintConnection();
    showToast("Offline. Records stay on this device.");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      for (const id of ["cameraModal", "observationModal"]) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains("hidden")) {
          if (id === "cameraModal") closeCamera();
          else el.classList.add("hidden");
        }
      }
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditingText(event.target)) return;
    if ($("#app")?.classList.contains("hidden")) return;
    if ($$(".modal:not(.hidden)").length) return;
    const routes = {
      d: "dashboard",
      n: "newtest",
      h: "history",
      r: "reports",
      s: "settings",
      g: "guide"
    };
    const page = routes[event.key.toLowerCase()];
    if (page) {
      event.preventDefault();
      navigate(page);
    }
  });

  // A pending analysis/observation must not fire into a page that has moved on.
  window.addEventListener("dtb:page-change", clearAnalysisTimer);
}

function applyHistoryFilter() {
  const query = $("#historySearch")?.value || "";
  const filter = $("#historyFilter")?.value || "all";
  const target = $("#historyTable");
  if (!target) return;
  target.innerHTML = recordsTable(filterRecords(getRecords(), { query, filter }));
}

function paintEnvironmentWarnings() {
  if (capabilities.storage) return;
  showError("Local storage is unavailable — records cannot be saved in this browser.");
}

function boot() {
  applyTheme();
  applyMotionPreference();
  applyPremiumDisplay();
  watchSystemMotion();
  initButtonFeedback();
  initSiren({ onStateChange: () => {} });
  wireActions();
  wireStaticControls();
  paintConnection();

  const firebase = initialiseFirebase();
  if (!firebase.ready) {
    console.info(
      "FieldCheck: running without Firebase. Records stay on this device.",
      describeConfig()
    );
  }

  // The initial view is decided by real auth state, never by a marker left in
  // sessionStorage. onAuthStateChanged resolves asynchronously, so reading
  // getCurrentUser() inline would show the login screen and then strand a
  // genuinely signed-in operator. The demo marker is still honoured, and only
  // because demo mode uploads nothing.
  let sessionDecided = false;
  const decideSession = (user) => {
    if (sessionDecided) return;
    sessionDecided = true;
    if (user) {
      enterApp();
      return;
    }
    if (sessionStorage.getItem(state.auth.sessionFlag) === "demo") {
      enterApp({ demo: true });
      showToast("Demo mode restored. Nothing will be uploaded.", "info");
      return;
    }
    showLogin();
  };

  watchAuth((user) => {
    state.auth.user = user;
    paintOperator();
    decideSession(user);
  });

  // No Firebase means no auth callback will ever arrive.
  if (!firebase.ready) decideSession(null);

  paintEnvironmentWarnings();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

// Exposed for manual console inspection during development.
window.__fieldcheck = { state, getRecords, runDiagnostics, config, summarizeRecords, syncPill, observationPill };
