/**
 * Theme, motion and the premium 3D/tilt layer.
 *
 * Fixes carried over from the v1 build:
 *  - card tilt is now (re)bound from render(), so it worked only on a reloaded
 *    session before and never on a fresh sign-in;
 *  - the click handler no longer leaves a permanent `clicked-blue` class on
 *    every button ever pressed, which had been overriding `.btn-red` and
 *    `.btn-outline` with `!important`;
 *  - the OS reduced-motion preference is actually applied, not just observed
 *    by a no-op listener.
 */

import { $$, on } from "./dom.js";

const THEME_KEY = "dtbTheme";
const MOTION_KEY = "dtbReducedMotion";
const PREMIUM_KEY = "dtbPremiumDisplay";

export const THEMES = Object.freeze(["dark", "light"]);

export function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEMES.includes(stored) ? stored : "dark";
}

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
  return next;
}

export function applyTheme() {
  const theme = getTheme();
  document.documentElement.dataset.theme = theme;
  for (const button of $$("[data-theme-option]")) {
    const selected = button.dataset.themeOption === theme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  return theme;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function isReducedMotion() {
  if (localStorage.getItem(MOTION_KEY) === "on") return true;
  if (localStorage.getItem(MOTION_KEY) === "off") return false;
  return prefersReducedMotion();
}

export function setReducedMotion(enabled) {
  localStorage.setItem(MOTION_KEY, enabled ? "on" : "off");
  applyMotionPreference();
  return enabled;
}

export function applyMotionPreference() {
  const reduced = isReducedMotion();
  document.documentElement.classList.toggle("reduced-motion", reduced);
  if (reduced) setTiltEnabled(false);
  return reduced;
}

/** Follow the OS setting live, unless the operator has made an explicit choice. */
export function watchSystemMotion() {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = () => {
    if (localStorage.getItem(MOTION_KEY)) return;
    applyMotionPreference();
  };
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

export function isPremiumDisplay() {
  return localStorage.getItem(PREMIUM_KEY) !== "off";
}

export function setPremiumDisplay(enabled) {
  localStorage.setItem(PREMIUM_KEY, enabled ? "on" : "off");
  applyPremiumDisplay();
  return enabled;
}

export function applyPremiumDisplay() {
  const enabled = isPremiumDisplay() && !isReducedMotion();
  document.body.classList.toggle("display-enhanced", enabled);
  document.body.classList.toggle("uv-display", enabled);
  bindCardTilt();
  return enabled;
}

// --- card tilt -------------------------------------------------------------

const TILT_SELECTOR = ".card, .quick-item, .setting, .tilt-card";

function setTiltEnabled(enabled) {
  document.body.classList.toggle("tilt-disabled", !enabled);
}

function bindTiltTo(el) {
  if (el.dataset.tiltBound === "1") return;
  el.dataset.tiltBound = "1";

  on(el, "pointermove", (event) => {
    if (!document.body.classList.contains("display-enhanced")) return;
    if (event.pointerType === "touch") return; // tilt is a pointer affordance
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(1000px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg) translateZ(2px)`;
    el.style.transition = "transform 80ms ease-out";
  });

  on(el, "pointerleave", () => {
    el.style.transform = "";
    el.style.transition = "transform 260ms ease";
  });
}

/**
 * Bind tilt to every tiltable element currently in the document.
 *
 * Safe to call after every render. `bindTiltTo` marks each element it has
 * already handled, so re-running this is cheap and does not double-bind; the
 * per-element marker is the only guard, and it is what lets freshly rendered
 * cards pick up the behaviour.
 */
export function bindCardTilt() {
  for (const el of $$(TILT_SELECTOR)) bindTiltTo(el);
}

/** Forget which elements are bound. Call after replacing a page's markup. */
export function resetTiltBinding() {
  for (const el of $$(TILT_SELECTOR)) delete el.dataset.tiltBound;
  bindCardTilt();
}

// --- transient button feedback --------------------------------------------

/**
 * Give a button a short flicker on press. The class is always removed: v1 added
 * `clicked-blue` permanently, which silently repainted every button the user
 * had ever clicked.
 */
export function flashButtonFeedback(button) {
  if (!button || button.disabled) return;
  button.classList.remove("siren-click");
  void button.offsetWidth; // restart the animation
  button.classList.add("siren-click");
  setTimeout(() => button.classList.remove("siren-click"), 540);
}

export function initButtonFeedback(root = document) {
  on(root, "click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    // Do not repaint the primary action buttons; the flicker is enough.
    if (button.classList.contains("btn-red") || button.classList.contains("btn-blue")) return;
    flashButtonFeedback(button);
  });
}
