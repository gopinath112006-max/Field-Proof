/**
 * Backend client.
 *
 * The FastAPI service does not classify anything. It decodes the frame and
 * returns its dimensions, a SHA-256 digest over the same bytes the browser
 * hashed, and a resolution judgement. Its response has no `result` or
 * `validTestKit` field, so there is nothing here that could be rendered as a
 * verdict. The v1 service hardcoded `result: "inconclusive"` and
 * `validTestKit: false` and the client labelled it an "AI POWERED" result;
 * both the route (/api/analyze -> /api/validate) and the wording changed.
 */

import { config } from "../config.js";

export const API_STATUS = Object.freeze({
  DISABLED: "validation disabled",
  NO_IMAGE: "no image to validate",
  OK: "validated",
  UNREACHABLE: "validation service unreachable",
  REJECTED: "frame rejected by validation service",
  ERROR: "validation service error"
});

/**
 * POST /api/validate with the frame's base64 payload.
 *
 * Never rejects. A validation failure is a reportable outcome, not an
 * exception, so the caller always gets a status it can show the operator. A
 * digest that does not match the locally computed one is surfaced as a
 * mismatch rather than quietly overwritten: that means the bytes changed
 * between upload and validation.
 *
 * @returns {Promise<{quality:string, width:number, height:number,
 *   sha256:string, digestMatches:boolean|null, apiStatus:string, note:string}>}
 */
export async function validateFrame(imageDataUrl, { localSha256 = null } = {}) {
  const base = {
    quality: "not assessed",
    width: 0,
    height: 0,
    megapixels: 0,
    sha256: "",
    digestMatches: null,
    note: ""
  };

  if (!config.api.enabled || !config.api.baseUrl) {
    return { ...base, apiStatus: API_STATUS.DISABLED };
  }
  if (!imageDataUrl) {
    return { ...base, apiStatus: API_STATUS.NO_IMAGE };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `${config.api.baseUrl.replace(/\/$/, "")}/api/validate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: imageDataUrl,
          source: "fieldcheck-web",
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal
      }
    );
    // 400 means the service reached us and rejected the frame. That is a real
    // answer, so it is reported as a rejection rather than as an unreachable
    // service, which would tell the operator the wrong thing.
    if (response.status === 400 || response.status === 413) {
      const detail = await response.json().catch(() => ({}));
      return {
        ...base,
        apiStatus: API_STATUS.REJECTED,
        note: detail.error || `HTTP ${response.status}`
      };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const sha256 = data.sha256 || "";
    return {
      quality: data.quality || "not assessed",
      width: data.image_width || 0,
      height: data.image_height || 0,
      megapixels: data.megapixels ?? 0,
      sha256,
      digestMatches: localSha256 ? sha256 === localSha256 : null,
      note: data.note || "",
      apiStatus: API_STATUS.OK
    };
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return {
      ...base,
      apiStatus: aborted ? "validation timed out" : API_STATUS.UNREACHABLE,
      note: error?.message || ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** GET /api/health, used by the System Check. */
export async function checkApiHealth() {
  if (!config.api.enabled || !config.api.baseUrl) {
    return { reachable: false, detail: "validation service not configured" };
  }
  try {
    const response = await fetch(
      `${config.api.baseUrl.replace(/\/$/, "")}/api/health`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!response.ok) return { reachable: false, detail: `HTTP ${response.status}` };
    const data = await response.json();
    return {
      reachable: true,
      detail: data.service || "ok",
      version: data.version || "",
      // Surfaced so the System Check can say plainly that this service does not
      // identify anything, rather than leaving an "ok" to be read as a result.
      identifiesSubstances: data.identifies_substances === true
    };
  } catch (error) {
    return { reachable: false, detail: error?.message || "unreachable" };
  }
}
