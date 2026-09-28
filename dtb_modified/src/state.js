/** Mutable application state, kept in one place so modules can be reasoned about. */

import { makeRecordId } from "./lib/records.js";

export const state = {
  currentPage: "dashboard",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  // Demo override: the operator can force offline view without touching the OS.
  connectionOverride: null,

  auth: {
    user: null,
    demoMode: false,
    sessionFlag: "dtbSession"
  },

  camera: {
    stream: null,
    imageDataUrl: null,
    blob: null,
    gps: { text: "Not captured", lat: null, lng: null, accuracy: null },
    guard: null,
    sampleType: "",
    // Guards against a second capture starting while one is in flight. v1
    // bound both an addEventListener and an onclick to the capture button, so
    // a single click could run capture() and confirmCapture() concurrently.
    capturing: false
  },

  // Captured frames for this browser session, keyed by record id. Frames are
  // not persisted to localStorage: a full-resolution data URL is large enough
  // to blow the storage quota, and the record is the durable artefact.
  sessionImages: new Map(),

  analysis: {
    timer: null
  },

  storageAvailable: true
};

export function isOnline() {
  if (state.connectionOverride !== null) return state.connectionOverride;
  return state.online;
}

export function setConnectionOverride(value) {
  state.connectionOverride = value;
  return isOnline();
}

export function currentOperator() {
  if (state.auth.user) {
    return (
      state.auth.user.displayName ||
      (state.auth.user.email ? state.auth.user.email.split("@")[0] : "Operator")
    );
  }
  return state.auth.demoMode ? "Demo Operator" : "Unidentified operator";
}

export function currentOperatorLabel() {
  if (state.auth.user) return state.auth.user.email || "Signed in";
  if (state.auth.demoMode) return "Demo mode · not signed in";
  return "Not signed in";
}

export function isSignedIn() {
  return Boolean(state.auth.user);
}

export function clearAnalysisTimer() {
  if (state.analysis.timer) {
    clearInterval(state.analysis.timer);
    state.analysis.timer = null;
  }
}

export function newRecordId() {
  return makeRecordId(new Date());
}
