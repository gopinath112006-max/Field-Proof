/** Transient status messages. */

import { $ } from "./dom.js";

let timer = null;

export function showToast(message, tone = "info") {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${tone}`;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3200);
}

export function showError(message) {
  showToast(message, "error");
}
