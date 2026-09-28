/**
 * Record schema, normalisation and storage.
 *
 * FieldCheck does NOT classify substances. A record is the evidence bundle for
 * one field test:
 *
 *   - the captured frame (kept in memory for the session, uploaded when signed in)
 *   - a SHA-256 digest of the frame's actual bytes
 *   - the operator's own reading of the physical kit  -> `observation`
 *   - GPS, operator identity and timestamp
 *
 * `observation` is always operator-sourced. There is no field in this schema
 * that a machine can write, which is what stops a future change from quietly
 * reintroducing an automated verdict.
 */

export const SCHEMA_VERSION = 2;
export const STORAGE_KEY = "dtbRecords";
export const SCHEMA_KEY = "dtbSchemaVersion";

export const OBSERVATIONS = Object.freeze(["positive", "negative", "unreadable"]);

/** The only source permitted to write `observation`. */
export const OBSERVATION_SOURCE_OPERATOR = "operator";
/** Applied by the v1 -> v2 migration. See migrateRecord(). */
export const OBSERVATION_SOURCE_LEGACY = "unclassified-legacy";

/**
 * Coerce to a finite number or null.
 *
 * The obvious `Number(value)` is wrong for missing coordinates: Number(null),
 * Number("") and Number([]) are all 0, so a record with no GPS became a fix at
 * 0,0 — a real place in the Gulf of Guinea. Absent or non-numeric input must
 * stay null so `hasCoords` can reject the pair.
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

/**
 * Coerce anything that reaches the UI into a complete, render-safe record.
 * The previous build interpolated `r.hash`, `r.date` and `r.sync` straight
 * into innerHTML, so a partially written record rendered the literal string
 * "undefined" into an evidence page.
 */
export function normalizeRecord(input) {
  const r = input && typeof input === "object" ? input : {};
  const observation = pickObservation(r.observation);
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
    // Honoured rather than hardcoded. The v1 migration passes a different label
    // so that a digest of a string is never presented as a digest of the image
    // bytes; a record with no digest says so instead of claiming SHA-256.
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
 * v1 -> v2 migration.
 *
 * The v1 schema stored `result: "positive" | "negative" | "inconclusive"`.
 * Every code path that produced a v1 result forced "inconclusive" (the
 * backend hardcoded `validTestKit: false` and every fallback returned
 * inconclusive), but we cannot prove that for records created by other builds
 * or hand-edited storage. So we do not carry any legacy positive/negative
 * forward as an observation: they migrate to "unreadable" and are marked
 * `unclassified-legacy` so the record page can say the value was never a
 * verified operator observation.
 */
export function migrateRecord(input) {
  if (input && Number(input.schemaVersion) === SCHEMA_VERSION) {
    return normalizeRecord(input);
  }
  const legacy = input && typeof input === "object" ? input : {};
  const legacyResult = cleanString(legacy.result, "inconclusive");

  return normalizeRecord({
    ...legacy,
    // Every legacy value migrates to "unreadable", whatever it said. The v1
    // code paths all produced "inconclusive", but a hand-edited or
    // foreign-built record is not proof of that, so nothing is carried forward
    // as though it were a reading.
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
    // v1 stored a digest of the string `${dataUrl}|${id}`, not of the image
    // bytes. Keeping it under the old field name stops it being presented as a
    // comparable image hash, and the algorithm label says so: a record with a
    // v1 string digest is "unverified-v1", and one with no digest at all is
    // labelled by normalizeRecord rather than claimed as SHA-256.
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
    // Safari private mode and some embedded webviews throw on access.
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
    // QuotaExceededError is the realistic case: data URLs of full-resolution
    // frames are large. Report it rather than pretending the write succeeded.
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
 * Buckets with no activity are included as 0 so the chart axis is honest
 * rather than compressing the timeline.
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
