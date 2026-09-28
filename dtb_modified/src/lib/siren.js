/**
 * Emergency visual beacon with opt-in audio.
 *
 * Sound is OFF by default and only ever starts from an explicit operator
 * action, which is what keeps it compliant with browser autoplay policy. The
 * tone is a 520/880 Hz sweep on a sawtooth at 0.045 gain -- audible as an
 * alert, not a startle.
 */

import { $ } from "./dom.js";

let active = false;
let audioContext = null;
let sweepTimer = null;
let oscillators = [];
let onChange = () => {};

export const isSirenActive = () => active;

function stopAudio() {
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
  for (const osc of oscillators) {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
  }
  oscillators = [];
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
}

function startAudio() {
  stopAudio();
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  try {
    audioContext = new Ctor();
    const ctx = audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    oscillators = [osc];

    let high = true;
    const sweep = () => {
      if (!active) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
        return;
      }
      const now = ctx.currentTime;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.linearRampToValueAtTime(high ? 880 : 520, now + 0.42);
      high = !high;
      sweepTimer = setTimeout(sweep, 420);
    };
    sweep();
  } catch (error) {
    console.warn("Siren audio unavailable", error);
  }
}

export function initSiren({ onStateChange } = {}) {
  onChange = onStateChange || (() => {});
  const beacon = $("#sirenBeacon");
  const button = $("#sirenToggle");
  paint(active);
  return { beacon, button };
}

function paint(isActive) {
  const beacon = $("#sirenBeacon");
  const button = $("#sirenToggle");
  if (beacon) {
    beacon.classList.toggle("active", isActive);
    const small = beacon.querySelector("small");
    if (small) {
      small.textContent = isActive
        ? "Visual beacon active · sound on"
        : "Emergency sound disabled";
    }
  }
  if (button) {
    button.classList.toggle("active", isActive);
    button.textContent = isActive ? "🔊 BEACON ON" : "🔇 BEACON OFF";
    button.setAttribute("aria-pressed", String(isActive));
  }
}

export function toggleSiren() {
  active = !active;
  paint(active);
  if (active) startAudio();
  else stopAudio();
  onChange(active);
  return active;
}
