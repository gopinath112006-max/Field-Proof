/**
 * SHA-256 over the *captured image bytes*.
 *
 * The v1 build hashed the string `${dataUrl}|${recordId}`, which is not an
 * image digest and never matched the digest the backend computes from the same
 * bytes (backend/main.py). Both sides now hash identical input, so a digest
 * recorded in the browser can be verified against the stored image later.
 */

const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0")
);

function toHex(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += HEX[bytes[i]];
  return out;
}

/** Split a `data:<mime>;base64,<payload>` URL into its mime type and bytes. */
export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  let bytes;
  if (isBase64) {
    const binary = atob(payload);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }
  return { mime, bytes };
}

export async function sha256Hex(bytes) {
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes.buffer ?? bytes);
  // Copy into a fresh ArrayBuffer so a view with a non-zero byteOffset (e.g.
  // a subarray) is not silently hashed from the wrong offset.
  const buffer = view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
    ? view.buffer
    : view.slice().buffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return toHex(digest);
}

/** Digest a data URL's decoded bytes. Returns "" when the input is not one. */
export async function sha256HexFromDataUrl(dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return "";
  return sha256Hex(parsed.bytes);
}

/**
 * Recompute the digest of a record's stored frame and compare it with the
 * recorded value. This is a genuine integrity check the app can perform with
 * no server: the previous build showed a hardcoded "VALID" pill instead.
 */
export async function verifyRecordHash(record, imageDataUrl) {
  if (!record || !record.hash) return { checked: false, valid: false, reason: "no digest recorded" };
  if (record.hashAlgorithm !== "SHA-256") {
    return { checked: false, valid: false, reason: "digest is from an unverified legacy format" };
  }
  if (!imageDataUrl) {
    return { checked: false, valid: false, reason: "image not available in this session" };
  }
  const actual = await sha256HexFromDataUrl(imageDataUrl);
  return { checked: true, valid: actual === record.hash, reason: actual === record.hash ? "digest matches image bytes" : "digest does not match image bytes" };
}
