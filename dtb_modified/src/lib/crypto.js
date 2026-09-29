/**
 * Asymmetric Digital Signature & Integrity Module for FieldCheck.
 *
 * Implements genuine cryptographic digital signatures via Web Crypto API:
 * - Algorithm: ECDSA using NIST P-256 curve (secp256r1) with SHA-256
 * - Deterministic canonical JSON serialization of immutable evidence fields
 * - Operator asymmetric key-pair generation and storage
 * - Non-repudiation signature verification & tamper detection
 *
 * NOTE ON TERMINOLOGY & IDENTITY SCOPE:
 * SHA-256 is an image content digest (hash).
 * ECDSA is an asymmetric digital signature that proves authenticity and tamper-evidence.
 * The prototype signature proves possession of the local signing key and detects alteration
 * of signed record content. Production deployment would require organizational identity
 * binding through appropriate PKI or hardware-backed credentials.
 */

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function bytesToHex(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < arr.length; i += 1) out += HEX[arr[i]];
  return out;
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export const SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";
export const APP_VERSION = "3.0.0";
const STORAGE_KEY_KEYPAIR = "dtb_operator_ecdsa_keypair";

function getCrypto() {
  if (typeof crypto !== "undefined" && crypto.subtle) return crypto;
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) return globalThis.crypto;
  throw new Error("Web Crypto API (crypto.subtle) is not available in this environment");
}

/**
 * Generate a new ECDSA P-256 Keypair.
 *
 * @returns {Promise<{keyPair: CryptoKeyPair, publicKeyHex: string, keyId: string}>}
 */
export async function generateOperatorKeyPair() {
  const c = getCrypto();
  const keyPair = await c.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const spkiBuffer = await c.subtle.exportKey("spki", keyPair.publicKey);
  const spkiBytes = new Uint8Array(spkiBuffer);
  const publicKeyHex = bytesToHex(spkiBytes);

  // Key ID is the first 16 characters of the SHA-256 digest of the public key
  const digestBuffer = await c.subtle.digest("SHA-256", spkiBytes);
  const keyId = `KEY-${bytesToHex(new Uint8Array(digestBuffer)).slice(0, 16).toUpperCase()}`;

  return { keyPair, publicKeyHex, keyId };
}

/**
 * Get or create the operator's persistent signing keypair in local storage.
 */
let cachedKeyPair = null;
let cachedKeyId = null;
let cachedPubKeyHex = null;

export async function getOrCreateOperatorKeyPair() {
  if (cachedKeyPair) {
    return { keyPair: cachedKeyPair, publicKeyHex: cachedPubKeyHex, keyId: cachedKeyId };
  }

  const c = getCrypto();
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY_KEYPAIR);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const privateKey = await c.subtle.importKey(
          "jwk",
          parsed.privateJwk,
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["sign"]
        );
        const publicKey = await c.subtle.importKey(
          "jwk",
          parsed.publicJwk,
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["verify"]
        );

        cachedKeyPair = { privateKey, publicKey };
        cachedPubKeyHex = parsed.publicKeyHex;
        cachedKeyId = parsed.keyId;
        return { keyPair: cachedKeyPair, publicKeyHex: cachedPubKeyHex, keyId: cachedKeyId };
      } catch (err) {
        console.warn("Failed to load stored keypair, generating a new one", err);
      }
    }
  }

  // Generate new keypair
  const { keyPair, publicKeyHex, keyId } = await generateOperatorKeyPair();
  cachedKeyPair = keyPair;
  cachedPubKeyHex = publicKeyHex;
  cachedKeyId = keyId;

  if (typeof localStorage !== "undefined") {
    try {
      const privateJwk = await c.subtle.exportKey("jwk", keyPair.privateKey);
      const publicJwk = await c.subtle.exportKey("jwk", keyPair.publicKey);
      localStorage.setItem(
        STORAGE_KEY_KEYPAIR,
        JSON.stringify({ privateJwk, publicJwk, publicKeyHex, keyId })
      );
    } catch (e) {
      console.warn("Could not persist keypair to localStorage", e);
    }
  }

  return { keyPair, publicKeyHex, keyId };
}

/**
 * Deterministically sort and format an object's keys for canonical serialization.
 */
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

/**
 * Build the canonical record payload containing all immutable evidence fields.
 * Excludes mutable UI/session fields (like sync status, image blobs, notes).
 *
 * @param {object} record
 * @returns {object} Stable canonical object
 */
export function buildCanonicalPayload(record) {
  const lat = typeof record.lat === "number" && Number.isFinite(record.lat) ? Number(record.lat.toFixed(6)) : null;
  const lng = typeof record.lng === "number" && Number.isFinite(record.lng) ? Number(record.lng.toFixed(6)) : null;

  return {
    applicationVersion: APP_VERSION,
    calibrationStatus: String(record.calibrationStatus || "uncalibrated"),
    calibrationVersion: String(record.calibrationVersion || "1.0.0"),
    classification: String(record.classification || "inconclusive"),
    classifierVersion: String(record.classifierVersion || "1.0.0"),
    gps: String(record.gps || ""),
    imageHash: String(record.hash || ""),
    lat,
    lng,
    observation: String(record.observation || "unreadable"),
    observedAt: String(record.observedAt || record.date || ""),
    observedBy: String(record.observedBy || record.operator || ""),
    operator: String(record.operator || ""),
    recordId: String(record.id || ""),
    schemaVersion: Number(record.schemaVersion || 2)
  };
}

/**
 * Deterministic canonical serialization (canonical JSON).
 *
 * @param {object} payload
 * @returns {string} Deterministic string
 */
export function canonicalSerialize(payload) {
  const sorted = sortObjectKeys(payload);
  return JSON.stringify(sorted);
}

/**
 * Sign a record using an operator's ECDSA private key.
 *
 * @param {object} record
 * @param {CryptoKey} [customPrivateKey] Optional explicit private key
 * @returns {Promise<{signature: string, signatureAlgorithm: string, signatureKeyId: string, publicKey: string, canonicalPayload: string}>}
 */
export async function signRecord(record, customPrivateKey = null) {
  const c = getCrypto();
  let privKey = customPrivateKey;
  let pubHex = cachedPubKeyHex;
  let kid = cachedKeyId;

  if (!privKey) {
    const creds = await getOrCreateOperatorKeyPair();
    privKey = creds.keyPair.privateKey;
    pubHex = creds.publicKeyHex;
    kid = creds.keyId;
  }

  const payloadObj = buildCanonicalPayload(record);
  const canonicalStr = canonicalSerialize(payloadObj);
  const dataBytes = new TextEncoder().encode(canonicalStr);

  const sigBuffer = await c.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privKey,
    dataBytes
  );

  const signatureHex = bytesToHex(new Uint8Array(sigBuffer));

  return {
    signature: signatureHex,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    signatureKeyId: kid,
    publicKey: pubHex,
    canonicalPayload: canonicalStr
  };
}

/**
 * Verify a record's ECDSA digital signature.
 *
 * @param {object} record
 * @returns {Promise<{valid: boolean, status: string, reason: string, keyId: string}>}
 */
export async function verifyRecordSignature(record) {
  if (!record || typeof record !== "object") {
    return { valid: false, status: "SIGNATURE INVALID", reason: "Invalid record object", keyId: "" };
  }

  if (!record.signature) {
    return { valid: false, status: "UNSIGNED", reason: "No digital signature present on this record", keyId: "" };
  }

  if (record.signatureAlgorithm !== SIGNATURE_ALGORITHM) {
    return {
      valid: false,
      status: "SIGNATURE INVALID",
      reason: `Unsupported signature algorithm: ${record.signatureAlgorithm || "none"}`,
      keyId: record.signatureKeyId || ""
    };
  }

  if (!record.publicKey) {
    return {
      valid: false,
      status: "SIGNATURE INVALID",
      reason: "Missing public key needed for signature verification",
      keyId: record.signatureKeyId || ""
    };
  }

  const c = getCrypto();
  try {
    const pubBytes = hexToBytes(record.publicKey);
    const sigBytes = hexToBytes(record.signature);

    const importedPubKey = await c.subtle.importKey(
      "spki",
      pubBytes,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const payloadObj = buildCanonicalPayload(record);
    const canonicalStr = canonicalSerialize(payloadObj);
    const dataBytes = new TextEncoder().encode(canonicalStr);

    const isValid = await c.subtle.verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      importedPubKey,
      sigBytes,
      dataBytes
    );

    return {
      valid: isValid,
      status: isValid ? "VERIFIED" : "SIGNATURE INVALID",
      reason: isValid
        ? "Digital signature verified. Canonical record fields match the signature."
        : "Signature verification failed — record content has been altered or signature is invalid.",
      keyId: record.signatureKeyId || ""
    };
  } catch (error) {
    return {
      valid: false,
      status: "SIGNATURE INVALID",
      reason: `Verification error: ${error.message}`,
      keyId: record.signatureKeyId || ""
    };
  }
}
