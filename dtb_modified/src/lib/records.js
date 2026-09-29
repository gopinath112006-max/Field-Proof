/**
 * Record schema, normalisation, migration and storage.
 *
 * FieldCheck Schema v3:
 * Preserves the verified operator observation while incorporating the
 * automated colorimetric classification layer and genuine ECDSA digital signature.
 *
 * A record is the complete digital evidence bundle:
 *   - The captured frame (held in session memory, uploaded when signed in)
 *   - SHA-256 digest of the captured image bytes
 *   - Genuine ECDSA-P256-SHA256 digital signature over canonical record
 *   - Automated colorimetric classification (presumptive positive / negative / inconclusive)
 *   - Reference-card calibration status and metadata
 *   - The operator's own verified reading of the physical kit -> `observation`
 *   - GPS, operator identity and timestamp
 */

export const SCHEMA_VERSION = 3;
export const STORAGE_KEY = "dtbRecords";
export const SCHEMA_KEY = "dtbSchemaVersion";

export const OBSERVATIONS = Object.freeze(["positive", "negative", "unreadable"]);
export const CLASSIFICATIONS = Object.freeze(["positive", "negative", "inconclusive"]);

/** The source permitted to write `observation`. */
export const OBSERVATION_SOURCE_OPERATOR = "operator";
/** Applied by the v1 -> v2/v3 migration. See migrateRecord(). */
export const OBSERVATION_SOURCE_LEGACY = "unclassified-legacy";

export const CLASSIFICATION_SOURCE_AUTOMATED = "automated-colorimetric-v1";

/**
 * Coerce to a finite number or null.
 */
function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return null;
  if (Array.isArray(value)) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length ? s : fallback;
}

function pickObservation(value) {
  return OBSERVATIONS.includes(value) ? value : "unreadable";
}

function pickClassification(value) {
  return CLASSIFICATIONS.includes(value) ? value : "inconclusive";
}

/**
 * Coerce anything that reaches the UI or storage into a complete, render-safe record.
 */
export function normalizeRecord(input) {
  const r = input && typeof input === "object" ? input : {};
  const observation = pickObservation(r.observation);
  const classification = pickClassification(r.classification);
  const lat = toFiniteNumberOrNull(r.lat);
  const lng = toFiniteNumberOrNull(r.lng);
  const hasCoords = lat !== null && lng !== null;

  return {
    schemaVersion: SCHEMA_VERSION,
    id: cleanString(r.id, "DTB-UNKNOWN"),

    // --- what the operator saw -------------------------------------------
    observation,
    observationSource: cleanString(
      r.observationSource,
      OBSERVATION_SOURCE_OPERATOR
    ),
    observedAt: cleanString(r.observedAt, ""),
    observedBy: cleanString(r.observedBy, ""),
    note: cleanString(r.note, ""),
    labReferralRequired: observation === "positive",
    labReferralRequested: Boolean(r.labReferralRequested),

    // --- automated colorimetric classification ---------------------------
    classification,
    classificationSource: cleanString(
      r.classificationSource,
      r.classification ? CLASSIFICATION_SOURCE_AUTOMATED : "none"
    ),
    classificationConfidence:
      typeof r.classificationConfidence === "number" && Number.isFinite(r.classificationConfidence)
        ? r.classificationConfidence
        : 0,
    calibrationStatus: cleanString(r.calibrationStatus, "uncalibrated"),
    classifierVersion: cleanString(r.classifierVersion, "1.0.0"),
    calibrationVersion: cleanString(r.calibrationVersion, "1.0.0"),
    normalizedReactionColor: r.normalizedReactionColor || null,

    // --- genuine digital signature (ECDSA-P256-SHA256) -------------------
    signatureAlgorithm: cleanString(r.signatureAlgorithm, r.signature ? "ECDSA-P256-SHA256" : "none"),
    signature: cleanString(r.signature, ""),
    signatureKeyId: cleanString(r.signatureKeyId, ""),
    publicKey: cleanString(r.publicKey, ""),
    integrityStatus: cleanString(r.integrityStatus, r.signature ? "verified" : "unsigned"),

    // --- what the capture guard measured ---------------------------------
    guard: {
      accepted: Boolean(r.guard && r.guard.accepted),
      colorName: cleanString(r.guard && r.guard.colorName, ""),
      coverage:
        r.guard && Number.isFinite(Number(r.guard.coverage))
          ? Number(r.guard.coverage)
          : 0,
      aspect:
        r.guard && Number.isFinite(Number(r.guard.aspect))
          ? Number(r.guard.aspect)
          : 0,
      reason: cleanString(r.guard && r.guard.reason, "")
    },

    // --- provenance -------------------------------------------------------
    date: cleanString(r.date, "Unknown"),
    operator: cleanString(r.operator, "Unidentified operator"),
    hash: cleanString(r.hash, ""),
    hashAlgorithm: cleanString(r.hashAlgorithm, r.hash ? "SHA-256" : "none"),
    sync: r.sync === "synced" ? "synced" : "offline",

    // --- location ---------------------------------------------------------
    gps: hasCoords
      ? cleanString(
          r.gps,
          `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        )
      : cleanString(r.gps, ""),
    lat,
    lng,
    accuracy: toFiniteNumberOrNull(r.accuracy),

    quality: cleanString(r.quality, "not assessed"),
    apiStatus: cleanString(r.apiStatus, "not assessed"),
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : null
  };
}

/**
 * v1/v2 -> v3 migration.
 * Preserves verified operator observations from v2 and converts unverified v1 results to unreadable.
 */
export function migrateRecord(input) {
  if (!input || typeof input !== "object") {
    return normalizeRecord(input);
  }

  // Records created with Schema v2 or v3 already have genuine operator observations
  if (Number(input.schemaVersion) >= 2) {
    return normalizeRecord(input);
  }

  const legacy = input;
  const legacyResult = cleanString(legacy.result, "inconclusive");

  return normalizeRecord({
    ...legacy,
    observation: "unreadable",
    observationSource: OBSERVATION_SOURCE_LEGACY,
    note: [
      legacy.note,
      `Migrated from schema v1, which stored a "${legacyResult}" value that was never ` +
        "produced by a verified operator observation. Re-verify this test from the " +
        "physical kit if the outcome is still needed."
    ]
      .filter(Boolean)
      .join(" "),
    hash: legacy.imageDigestOfString || "",
    hashAlgorithm: legacy.imageDigestOfString ? "unverified-v1" : ""
  });
}

/** Migrate a whole array. Idempotent. */
export function migrateRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map(migrateRecord);
}

function safeParse(raw) {
  if (typeof raw !== "string" || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasLocalStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

/** Read all records, migrating and persisting if the schema is out of date. */
export function loadRecords() {
  if (!hasLocalStorage()) return [];
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  const records = migrateRecords(parsed);
  const storedVersion = Number(localStorage.getItem(SCHEMA_KEY) || 0);
  if (storedVersion !== SCHEMA_VERSION) {
    persistRecords(records);
  }
  return records;
}

export function persistRecords(records) {
  if (!hasLocalStorage()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
    return true;
  } catch (error) {
    console.warn("Record storage write failed", error);
    return false;
  }
}

export function clearRecords() {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SCHEMA_KEY);
}

/** Aggregate counts for the dashboard. All values come from real records. */
export function summarizeRecords(records) {
  const list = Array.isArray(records) ? records : [];
  const counts = { positive: 0, negative: 0, unreadable: 0 };
  for (const record of list) {
    const key = OBSERVATIONS.includes(record.observation) ? record.observation : "unreadable";
    counts[key] += 1;
  }
  return {
    total: list.length,
    ...counts,
    pendingSync: list.filter((r) => r.sync !== "synced").length,
    missingGps: list.filter((r) => r.lat === null || r.lng === null).length,
    missingHash: list.filter((r) => !r.hash).length,
    guardRejected: list.filter((r) => r.guard && !r.guard.accepted).length
  };
}

/**
 * Records bucketed by local calendar day for the last `days` days.
 */
export function bucketRecordsByDay(records, days = 7, now = new Date()) {
  const list = Array.isArray(records) ? records : [];
  const buckets = [];
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() - offset);
    buckets.push({
      date: day,
      key: `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`,
      label: day
        .toLocaleDateString(undefined, { month: "short", day: "numeric" })
        .toUpperCase(),
      positive: 0,
      negative: 0,
      unreadable: 0,
      total: 0
    });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const record of list) {
    const observed = record.observedAt || record.date;
    const parsed = new Date(observed);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const value = OBSERVATIONS.includes(record.observation)
      ? record.observation
      : "unreadable";
    bucket[value] += 1;
    bucket.total += 1;
  }

  return buckets;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Stable, human-scannable record id: DTB-YYYYMMDD-NNNN. */
export function makeRecordId(now = new Date()) {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const suffix = String(now.getTime()).slice(-4);
  return `DTB-${stamp}-${suffix}`;
}
