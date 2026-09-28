import { describe, it, expect } from "vitest";
import {
  SCHEMA_VERSION,
  OBSERVATIONS,
  normalizeRecord,
  migrateRecord,
  migrateRecords,
  summarizeRecords,
  bucketRecordsByDay,
  makeRecordId
} from "../src/lib/records.js";

describe("normalizeRecord", () => {
  it("fills every field so nothing renders as the string 'undefined'", () => {
    const record = normalizeRecord({});
    expect(record.schemaVersion).toBe(SCHEMA_VERSION);
    expect(record.id).toBe("DTB-UNKNOWN");
    expect(record.date).toBe("Unknown");
    expect(record.operator).toBe("Unidentified operator");
    expect(record.observation).toBe("unreadable");
    expect(record.quality).toBe("not assessed");
    expect(record.apiStatus).toBe("not assessed");
    expect(record.hash).toBe("");
    expect(record.imageUrl).toBeNull();
    expect(record.lat).toBeNull();
    expect(record.lng).toBeNull();
    expect(Object.values(record)).not.toContain("undefined");
  });

  it("never lets an unknown observation through as a reading", () => {
    for (const value of ["confirmed", "positive ", "POSITIVE", "", null, 42, {}]) {
      expect(normalizeRecord({ observation: value }).observation).toBe("unreadable");
    }
    for (const value of OBSERVATIONS) {
      expect(normalizeRecord({ observation: value }).observation).toBe(value);
    }
  });

  it("requires a laboratory referral for a positive observation", () => {
    expect(normalizeRecord({ observation: "positive" }).labReferralRequired).toBe(true);
    expect(normalizeRecord({ observation: "negative" }).labReferralRequired).toBe(false);
    expect(normalizeRecord({ observation: "unreadable" }).labReferralRequired).toBe(false);
    // Requested is a separate, operator-controlled flag and is never implied.
    expect(normalizeRecord({ observation: "negative" }).labReferralRequested).toBe(false);
    expect(
      normalizeRecord({ observation: "negative", labReferralRequested: true }).labReferralRequested
    ).toBe(true);
  });

  it("treats a single invalid coordinate as no location rather than a partial one", () => {
    expect(normalizeRecord({ lat: 12.5, lng: null }).gps).toBe("");
    expect(normalizeRecord({ lat: null, lng: 77.1 }).gps).toBe("");
    expect(normalizeRecord({ lat: 12.5, lng: 77.1 }).gps).toBe("12.500000, 77.100000");
    expect(normalizeRecord({ lat: "abc", lng: "def" }).lat).toBeNull();
  });

  it("labels a digest by its own algorithm and admits having none", () => {
    expect(normalizeRecord({ hash: "abc" }).hashAlgorithm).toBe("SHA-256");
    expect(normalizeRecord({}).hashAlgorithm).toBe("none");
    expect(normalizeRecord({ hash: "abc", hashAlgorithm: "unverified-v1" }).hashAlgorithm).toBe(
      "unverified-v1"
    );
  });

  it("coerces sync state to the two values the schema allows", () => {
    expect(normalizeRecord({ sync: "synced" }).sync).toBe("synced");
    expect(normalizeRecord({ sync: "pending" }).sync).toBe("offline");
    expect(normalizeRecord({ sync: "ERROR" }).sync).toBe("offline");
  });
});

describe("migrateRecord", () => {
  it("never carries a legacy positive or negative forward as an observation", () => {
    for (const result of ["positive", "negative", "inconclusive"]) {
      const migrated = migrateRecord({ result, id: "DTB-1" });
      expect(migrated.observation).toBe("unreadable");
      expect(migrated.observationSource).toBe("unclassified-legacy");
      expect(migrated.note).toContain("never");
    }
  });

  it("does not present a v1 string digest as a digest of the image bytes", () => {
    const migrated = migrateRecord({ result: "inconclusive", imageDigestOfString: "deadbeef" });
    expect(migrated.hash).toBe("deadbeef");
    expect(migrated.hashAlgorithm).toBe("unverified-v1");
  });

  it("leaves a v2 record's observation alone and is idempotent", () => {
    const v2 = normalizeRecord({ id: "DTB-2", observation: "positive" });
    const once = migrateRecord(v2);
    const twice = migrateRecord(once);
    expect(once.observation).toBe("positive");
    expect(once.observationSource).toBe("operator");
    expect(twice).toEqual(once);
  });

  it("survives junk input", () => {
    expect(migrateRecords(null)).toEqual([]);
    expect(migrateRecord(undefined).observation).toBe("unreadable");
    expect(migrateRecords([null, 5, "x"]).every((r) => r.observation === "unreadable")).toBe(true);
  });
});

describe("summarizeRecords", () => {
  const records = [
    { observation: "positive", sync: "offline", lat: 1, lng: 2, hash: "a", guard: { accepted: true } },
    { observation: "negative", sync: "synced", lat: null, lng: null, hash: "", guard: { accepted: false } },
    { observation: "unreadable", sync: "offline", lat: 3, lng: 4, hash: "c", guard: { accepted: true } },
    { observation: "bogus", sync: "offline", lat: 5, lng: 6, hash: "d" }
  ];

  it("counts real records only", () => {
    const stats = summarizeRecords(records);
    expect(stats.total).toBe(4);
    expect(stats.positive).toBe(1);
    expect(stats.negative).toBe(1);
    // An unrecognised value is counted as not-read rather than dropped.
    expect(stats.unreadable).toBe(2);
  });

  it("reports what is still missing rather than assuming it is present", () => {
    const stats = summarizeRecords(records);
    expect(stats.pendingSync).toBe(3);
    expect(stats.missingGps).toBe(1);
    expect(stats.missingHash).toBe(1);
    expect(stats.guardRejected).toBe(1);
  });

  it("returns zeros for no records", () => {
    expect(summarizeRecords([])).toEqual({
      total: 0,
      positive: 0,
      negative: 0,
      unreadable: 0,
      pendingSync: 0,
      missingGps: 0,
      missingHash: 0,
      guardRejected: 0
    });
  });
});

describe("bucketRecordsByDay", () => {
  const now = new Date(2026, 2, 15, 12, 0, 0); // 15 Mar 2026, local time

  it("returns one bucket per day including empty days", () => {
    const buckets = bucketRecordsByDay([], 7, now);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.total === 0)).toBe(true);
    expect(buckets[6].key).toBe("2026-03-15");
    expect(buckets[0].key).toBe("2026-03-09");
  });

  it("files each record under the day it was observed", () => {
    const buckets = bucketRecordsByDay(
      [
        { observedAt: "2026-03-15T09:00:00.000Z", observation: "positive" },
        { observedAt: "2026-03-14T09:00:00.000Z", observation: "negative" },
        { observedAt: "2026-03-14T11:00:00.000Z", observation: "unreadable" },
        // Outside the window: must not be counted anywhere.
        { observedAt: "2026-01-01T09:00:00.000Z", observation: "positive" }
      ],
      7,
      now
    );
    expect(buckets[6].positive).toBe(1);
    expect(buckets[6].total).toBe(1);
    expect(buckets[5].negative).toBe(1);
    expect(buckets[5].unreadable).toBe(1);
    expect(buckets[5].total).toBe(2);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(3);
  });

  it("ignores records with an unparseable date instead of bucketing them as today", () => {
    const buckets = bucketRecordsByDay([{ date: "not a date", observation: "positive" }], 7, now);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(0);
  });
});

describe("makeRecordId", () => {
  it("produces a dated, scannable id", () => {
    expect(makeRecordId(new Date(2026, 2, 15, 9, 30, 0))).toMatch(/^DTB-20260315-\d{4}$/);
  });
});
