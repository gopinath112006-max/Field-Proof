/**
 * Capture flow: camera -> reference-swatch check -> operator observation -> record.
 *
 * Replaces the v1 sequence, which ran a 2.6-second fake "AI POWERED" progress
 * animation and then silently assigned `result: "inconclusive"` because no
 * code path could ever produce a classification.
 *
 * The observation is the only classification in a record, and it is typed by a
 * human reading a physical kit.
 */

import { $, closeModal, escapeHtml, openModal } from "./lib/dom.js";
import { coveragePct } from "./lib/format.js";
import { matchReferenceSwatch } from "./lib/guard.js";
import { sha256HexFromDataUrl } from "./lib/hash.js";
import { validateFrame, API_STATUS } from "./lib/backend.js";
import { state } from "./state.js";

const CAMERA_CONSTRAINTS = {
  video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false
};

export function isCameraPreferred() {
  return localStorage.getItem("dtbCameraPermission") !== "off";
}

function setStatus(message, type = "info") {
  const el = $("#cameraStatus");
  if (!el) return;
  const glyph = type === "success" ? "✓" : type === "error" ? "!" : "•";
  el.innerHTML = `<span class="check ${type}">${glyph}</span> ${escapeHtml(message)}`;
  el.className = `camera-status ${type}`;
}

export function updateCameraLocation(gps) {
  const el = $("#cameraLocation");
  if (!el) return;
  if (gps && typeof gps.lat === "number" && typeof gps.lng === "number") {
    const accuracy = gps.accuracy ? ` • ±${Math.round(gps.accuracy)} m` : "";
    el.innerHTML = `<span class="location-pin">⌖</span><span><b>GPS</b><small>${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}${escapeHtml(accuracy)}</small></span>`;
  } else {
    el.innerHTML = `<span class="location-pin">⌖</span><span><b>GPS</b><small>${escapeHtml(gps?.text || "Not captured")}</small></span>`;
  }
}

/**
 * Render the detection checklist from real state.
 *
 * v1 called `updateCameraDetection("ready")` the moment the camera opened,
 * which painted TEST KIT, REFERENCE CARD and NON-KIT GUARD with a green tick
 * before a single frame existed. The guard cards are now driven entirely by the
 * measured result and can show a rejection.
 */
function paintDetection(guard, phase) {
  const set = (id, cls, label, detail) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("ok", "warn", "fail", "active");
    el.classList.add(cls);
    const small = el.querySelector("small");
    if (small) small.textContent = label ? detail : small.dataset.default || detail;
  };

  const swatch = document.getElementById("detectRef");
  const region = document.getElementById("detectRegion");
  const guardCard = document.getElementById("detectGuard");
  const ready = document.getElementById("detectReady");

  if (phase === "no-frame") {
    set("detectKit", "active", "", "Awaiting capture");
    set("detectRef", "active", "", "Awaiting capture");
    set("detectRegion", "active", "", "Awaiting capture");
    set("detectGuard", "active", "", "Awaiting capture");
    set("detectReady", "active", "", "Capture first");
    return;
  }

  const accepted = Boolean(guard?.accepted);
  set("detectKit", "ok", "", "Kit region present in frame");
  set("detectRef", accepted ? (guard.weak ? "warn" : "ok") : "fail",
    "",
    accepted ? `${guard.colorName} · ${coveragePct(guard.coverage)}% of frame` : "No reference colour found");
  set("detectRegion", accepted ? "ok" : "fail", "",
    accepted ? `${guard.aspect}:1 region` : "Unusable colour match");
  set("detectGuard", accepted ? (guard.weak ? "warn" : "ok") : "warn", "",
    accepted ? `Accepted${guard.weak ? " (weak)" : ""}` : "No swatch found — record will be flagged");
  set("detectReady", "active", "", "Record your reading");
}

export async function requestCameraGps() {
  if (!navigator.geolocation) {
    state.camera.gps = { text: "GPS unavailable in this browser", lat: null, lng: null, accuracy: null };
    updateCameraLocation(state.camera.gps);
    return state.camera.gps;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.camera.gps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          text: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
        };
        updateCameraLocation(state.camera.gps);
        resolve(state.camera.gps);
      },
      (error) => {
        state.camera.gps = {
          text: error.code === 1 ? "GPS permission denied" : "GPS unavailable",
          lat: null,
          lng: null,
          accuracy: null
        };
        updateCameraLocation(state.camera.gps);
        resolve(state.camera.gps);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

export function openCamera() {
  if (!isCameraPreferred()) {
    showCameraBlocked();
    return;
  }
  resetCaptureState();
  openModal("cameraModal");
  setStatus("Requesting camera access…", "info");
  paintDetection(null, "no-frame");
  updateCameraLocation({ text: "Requesting location permission…", lat: null, lng: null, accuracy: null });
  void startCamera();
  void requestCameraGps();
}

function showCameraBlocked() {
  const toast = $("#toast");
  if (toast) {
    toast.textContent = "Camera access is blocked in Settings > Privacy.";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }
  document.dispatchEvent(new CustomEvent("dtb:navigate", { detail: { page: "settings", focus: "privacy" } }));
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("This browser does not expose a camera API. Use Import image instead.", "error");
    return null;
  }
  try {
    stopCamera();
    state.camera.stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    const video = $("#cameraVideo");
    if (video) {
      video.srcObject = state.camera.stream;
      await video.play().catch(() => {});
    }
    setStatus("Camera ready. Place the kit and reference card inside the frame.", "success");
    return state.camera.stream;
  } catch (error) {
    const denied = error?.name === "NotAllowedError";
    setStatus(
      denied
        ? "Camera permission denied. Use Import image, or allow camera access in your browser."
        : "Camera unavailable on this device. Use Import image instead.",
      "error"
    );
    return null;
  }
}

export function stopCamera() {
  if (state.camera.stream) {
    for (const track of state.camera.stream.getTracks()) track.stop();
    state.camera.stream = null;
  }
  const video = $("#cameraVideo");
  if (video) video.srcObject = null;
}

export function closeCamera() {
  stopCamera();
  closeModal("cameraModal");
}

function resetCaptureState() {
  state.camera.imageDataUrl = null;
  state.camera.blob = null;
  state.camera.guard = null;
  state.camera.capturing = false;
  const preview = $("#capturePreview");
  if (preview) preview.classList.add("hidden");
  const image = $("#capturedPreview");
  if (image) image.removeAttribute("src");
  const video = $("#cameraVideo");
  if (video) video.classList.remove("hidden");
  const canvas = $("#captureCanvas");
  if (canvas) canvas.classList.add("hidden");
  paintDetection(null, "no-frame");
}

/** Grab a frame from the video element and run the swatch check on it. */
export async function captureFrame() {
  if (state.camera.capturing) return null; // one capture in flight at a time
  const video = $("#cameraVideo");
  const canvas = $("#captureCanvas");
  if (!video || !canvas) return null;

  if (!video.videoWidth) {
    setStatus("The camera is not producing a frame yet. Start it, or import an image.", "error");
    return null;
  }

  state.camera.capturing = true;
  try {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("frame encoding failed"))),
        "image/jpeg",
        0.92
      );
    });

    state.camera.imageDataUrl = dataUrl;
    state.camera.blob = blob;

    const guard = await matchReferenceSwatch(dataUrl);
    state.camera.guard = guard;
    paintDetection(guard, "captured");

    const preview = $("#capturePreview");
    const image = $("#capturedPreview");
    if (image) image.src = dataUrl;
    if (preview) preview.classList.remove("hidden");
    video.classList.add("hidden");

    if (guard.accepted) {
      setStatus(
        guard.weak
          ? `Weak ${guard.colorName} match (${coveragePct(guard.coverage)}% of frame). Consider a retake, or record your reading anyway.`
          : `${guard.colorName} reference region covers ${coveragePct(guard.coverage)}% of the frame. Now read the kit and record it.`,
        guard.weak ? "info" : "success"
      );
    } else {
      setStatus(
        `No reference colour found: ${guard.reason}. You can still record your reading, but the frame will be flagged.`,
        "error"
      );
    }
    return guard;
  } catch (error) {
    setStatus(`Capture failed: ${error.message}`, "error");
    return null;
  } finally {
    state.camera.capturing = false;
  }
}

/** Discard the current frame and re-arm the live preview. */
export async function retakeFrame() {
  state.camera.imageDataUrl = null;
  state.camera.blob = null;
  state.camera.guard = null;
  const preview = $("#capturePreview");
  if (preview) preview.classList.add("hidden");
  const video = $("#cameraVideo");
  if (video) video.classList.remove("hidden");
  paintDetection(null, "no-frame");
  setStatus("Ready for another frame.", "info");
  if (!state.camera.stream) await startCamera();
}

export async function importImage(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    setStatus("That file is not an image.", "error");
    return null;
  }
  resetCaptureState();
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("could not read the file"));
      reader.readAsDataURL(file);
    });
    state.camera.imageDataUrl = dataUrl;
    state.camera.blob = file;
    const guard = await matchReferenceSwatch(dataUrl);
    state.camera.guard = guard;
    paintDetection(guard, "captured");
    const image = $("#capturedPreview");
    if (image) image.src = dataUrl;
    const preview = $("#capturePreview");
    if (preview) preview.classList.remove("hidden");
    setStatus(
      guard.accepted
        ? `Imported. ${guard.colorName} reference region covers ${coveragePct(guard.coverage)}% of the frame.`
        : `Imported, but no reference colour was found: ${guard.reason}`,
      guard.accepted ? "success" : "error"
    );
    return guard;
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, "error");
    return null;
  }
}

/**
 * Populate and show the observation form.
 * This replaces the fake "Analyzing Result" modal entirely.
 */
export async function openObservationForm() {
  if (!state.camera.imageDataUrl) {
    setStatus("Capture or import a frame first.", "error");
    return;
  }
  const guard = state.camera.guard;
  const digest = await sha256HexFromDataUrl(state.camera.imageDataUrl);
  const validation = await validateFrame(state.camera.imageDataUrl);

  const summary = document.getElementById("observationSummary");
  if (summary) {
    summary.innerHTML = `
      <img class="observation-preview" src="${escapeHtml(state.camera.imageDataUrl)}" alt="Frame to be recorded">
      <dl class="observation-facts">
        <div><dt>Reference swatch</dt><dd>${guard?.accepted ? escapeHtml(guard.colorName) : "no match"}</dd></div>
        <div><dt>Coverage</dt><dd>${guard?.accepted ? `${coveragePct(guard.coverage)}%` : "—"}</dd></div>
        <div><dt>Frame size</dt><dd>${validation.width ? `${validation.width}×${validation.height}` : "—"}</dd></div>
        <div><dt>Quality</dt><dd>${escapeHtml(validation.quality)}</dd></div>
        <div><dt>GPS</dt><dd>${escapeHtml(state.camera.gps.text || "Not captured")}</dd></div>
        <div><dt>Sample type</dt><dd>${escapeHtml(state.camera.sampleType || "not selected")}</dd></div>
        <div class="wide"><dt>SHA-256</dt><dd class="hash">${escapeHtml(digest)}</dd></div>
      </dl>
      ${
        validation.apiStatus === API_STATUS.OK
          ? ""
          : `<p class="muted">Validation service: ${escapeHtml(validation.apiStatus)}. The record is still valid; this only affects the quality note.</p>`
      }
    `;
  }

  const form = document.getElementById("observationForm");
  if (form) form.reset();
  const positive = document.getElementById("obsPositive");
  const referral = document.getElementById("obsReferral");
  if (positive && referral) {
    const syncReferral = () => {
      if (positive.checked) {
        referral.checked = true;
        referral.disabled = true;
      } else {
        referral.disabled = false;
      }
    };
    positive.addEventListener("change", syncReferral);
    form.addEventListener("change", (event) => {
      if (event.target.name === "observation") syncReferral();
    });
    syncReferral();
  }

  closeCamera();
  openModal("observationModal");
}

/** Assemble the record from the frame, the form and the measured metadata. */
export function collectObservation(form) {
  const data = new FormData(form);
  const observation = String(data.get("observation") || "unreadable");
  return {
    observation: ["positive", "negative", "unreadable"].includes(observation)
      ? observation
      : "unreadable",
    note: String(data.get("note") || "").trim().slice(0, 2000),
    labReferralRequested: data.get("labReferral") === "on",
    acknowledged: data.get("acknowledged") === "on",
    sampleType: state.camera.sampleType || ""
  };
}
