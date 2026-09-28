/** Minimal DOM helpers plus the escaping the previous inline-HTML code lacked. */

/** Escape a value for interpolation into HTML text content. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a value for interpolation inside a double-quoted HTML attribute. */
export const escapeAttr = escapeHtml;

/**
 * Escape a value for embedding inside a single-quoted JS string inside an
 * HTML attribute, e.g. data-payload='...'. Newlines and backslashes are
 * stripped so a payload can never terminate the surrounding string.
 */
export function escapeJsArg(value) {
  // JSON.stringify already escapes backslashes, double quotes and control
  // characters, so the body only needs the two things it does not handle for a
  // single-quoted JS string: the single quote itself, and U+2028/U+2029, which
  // terminate a line in a script context. Escaping backslashes again here --
  // as an earlier version did -- turned one backslash into two and silently
  // corrupted every value containing one.
  return JSON.stringify(String(value ?? ""))
    .slice(1, -1)
    .replace(/'/g, "\\'")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

/** addEventListener that returns its own unsubscribe function. */
export function on(target, type, handler, options) {
  if (!target) return () => {};
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/**
 * Delegated click handling driven by `data-action`, replacing the ~60 inline
 * `onclick="fn('arg')"` attributes the previous build used. Inline handlers
 * require `unsafe-inline` in a Content-Security-Policy and are the reason one
 * could not be set at all.
 */
export function delegate(root, type, selector, handler) {
  return on(root, type, (event) => {
    const match = event.target.closest(selector);
    if (!match || !root.contains(match)) return;
    handler(match, event);
  });
}

export function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
  return el;
}

export function toggleClass(selector, className, force) {
  const el = $(selector);
  if (!el) return null;
  el.classList.toggle(className, force);
  return el;
}

/** Trigger a client-side file download from a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Firefox and Safari both require the anchor to be in the document before
  // click() is dispatched; the previous exportPrivacySummary omitted this and
  // silently failed on both.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reveal/hide a modal and move focus sensibly. */
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
  const focusTarget = el.querySelector(
    "[data-autofocus], button, input, select, textarea"
  );
  if (focusTarget) focusTarget.focus({ preventScroll: true });
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("hidden");
}

/** True when any field currently has focus, so shortcuts must stay out of the way. */
export function isEditingText(target) {
  if (!target || !target.matches) return false;
  return target.matches("input,textarea,select,[contenteditable='true']");
}
