/**
 * FieldCheck runtime configuration.
 *
 * Resolution order (first usable, non-placeholder, non-loopback value wins):
 *   1. build-time env  (import.meta.env.VITE_DTB_API_URL)
 *   2. window.DTB_CONFIG (config.js, for operators who edit it by hand)
 *   3. same-origin default, so a phone on the LAN reaches the dev machine
 *      instead of its own 127.0.0.1
 *
 * Same-origin is the fallback rather than an override. config.js ships as a
 * template with a placeholder, so an operator's real host is honoured; a
 * loopback URL is rejected outright when this page is not itself on loopback,
 * which is the case that broke v1.
 *
 * Never place a service-role key, private key or admin credential here.
 * This file is shipped to the browser in full.
 */

const PLACEHOLDER = /^(YOUR_|YOUR_PROJECT|<|changeme)/i;
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)$/i;

function isUsableApiUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed);
}

/**
 * A loopback API URL only makes sense when this page is itself served from
 * loopback. On a phone opened as http://192.168.x.x:5173, a configured
 * 127.0.0.1 resolves to the phone itself and every request fails with a
 * connection error that looks like an offline app. Detect that case and let
 * the same-origin default win instead.
 */
function rejectsLoopback(value) {
  if (!isUsableApiUrl(value)) return false;
  if (typeof location === "undefined") return false;
  const pageHost = location.hostname;
  if (!pageHost || LOOPBACK_HOST.test(pageHost)) return false;
  try {
    return LOOPBACK_HOST.test(new URL(value.trim()).hostname);
  } catch {
    return false;
  }
}

function firstUsable(candidates) {
  return candidates.find((c) => isUsableApiUrl(c) && !rejectsLoopback(c)) || "";
}

function isUsableFirebaseConfig(config) {
  if (!config || typeof config !== "object") return false;
  const { apiKey, projectId, authDomain } = config;
  if (!apiKey || !projectId || !authDomain) return false;
  if (PLACEHOLDER.test(apiKey) || PLACEHOLDER.test(projectId)) return false;
  return true;
}

/**
 * Same-origin API default. On a phone opened via http://192.168.x.x:5173 this
 * resolves to 192.168.x.x:8000, which is the dev machine -- the previous
 * hardcoded 127.0.0.1 resolved to the phone itself and silently failed.
 */
function sameOriginApiUrl() {
  if (typeof location === "undefined") return "";
  const { protocol, hostname, port } = location;
  if (!hostname) return "";
  // Serve the API from the Vite port's neighbour (8000) during development.
  const isDevPort = port === "5173" || port === "4173";
  return `${protocol}//${hostname}${isDevPort ? ":8000" : ""}`;
}

function readOperatorConfig() {
  if (typeof window === "undefined") return {};
  const raw = window.DTB_CONFIG;
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

function resolveConfig() {
  const operator = readOperatorConfig();
  const operatorApi = operator.api || {};
  const operatorFirebase = operator.firebase || {};

  const envApiUrl =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_DTB_API_URL
      : undefined;

  // env, then the operator's file, then same-origin as the fallback. The
  // loopback guard in firstUsable() is what stops a stale 127.0.0.1 from
  // outranking same-origin, so an explicit real host keeps working.
  const apiCandidates = [envApiUrl, operatorApi.baseUrl, sameOriginApiUrl()];

  const api = {
    baseUrl: firstUsable(apiCandidates),
    // An explicit `enabled: false` from the operator is respected; otherwise
    // the API is considered available if we resolved a URL at all.
    enabled: operatorApi.enabled === false ? false : true
  };
  if (!api.baseUrl) api.enabled = false;

  return {
    api,
    firebase: {
      // Absent entirely when the operator has not supplied a real project, so
      // the UI can say "not configured" instead of attempting to initialise and
      // throwing on every sign-in attempt.
      config: isUsableFirebaseConfig(operatorFirebase.config)
        ? operatorFirebase.config
        : null
    },
    // Supabase was never wired to a data path and is intentionally dropped.
    appName: "FieldCheck"
  };
}

export const config = resolveConfig();

export function isFirebaseConfigured() {
  return config.firebase.config !== null;
}

export function describeConfig() {
  return {
    apiBaseUrl: config.api.baseUrl || "(not configured)",
    apiEnabled: config.api.enabled,
    firebase: isFirebaseConfigured() ? "configured" : "not configured"
  };
}
