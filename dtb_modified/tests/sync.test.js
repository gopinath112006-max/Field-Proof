import { describe, it, expect } from "vitest";
import { evaluateSyncReadiness, runSync, syncReadinessMessage, syncSummaryMessage, SYNC_OUTCOMES } from "../src/lib/sync.js";

/** Records that all need uploading. */
const pending = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `DTB-${i}`, sync: "offline", observation: "negative" }));

describe("evaluateSyncReadiness", () => {
  it("only allows a sync when online, signed in, configured and with work to do", () => {
    expect(
      evaluateSyncReadiness({ online: true, signedIn: true, databaseReady: true, pendingCount: 3 })
    ).toEqual({ outcome: SYNC_OUTCOMES.READY, canSync: true });
  });

  it("blocks and explains each missing precondition", () => {
    expect(evaluateSyncReadiness({ online: false, signedIn: true, databaseReady: true, pendingCount: 1 }).outcome)
      .toBe(SYNC_OUTCOMES.OFFLINE);
    expect(evaluateSyncReadiness({ online: true, signedIn: false, databaseReady: true, pendingCount: 1 }).outcome)
      .toBe(SYNC_OUTCOMES.NOT_SIGNED_IN);
    expect(evaluateSyncReadiness({ online: true, signedIn: true, databaseReady: false, pendingCount: 1 }).outcome)
      .toBe(SYNC_OUTCOMES.NOT_CONFIGURED);
    expect(evaluateSyncReadiness({ online: true, signedIn: true, databaseReady: true, pendingCount: 0 }).outcome)
      .toBe(SYNC_OUTCOMES.NOTHING_PENDING);
  });

  it("never claims a sync is possible when it is not", () => {
    for (const input of [
      { online: false, signedIn: false, databaseReady: false, pendingCount: 5 },
      { online: true, signedIn: false, databaseReady: false, pendingCount: 5 },
      { online: false, signedIn: true, databaseReady: true, pendingCount: 0 }
    ]) {
      expect(evaluateSyncReadiness(input).canSync).toBe(false);
    }
  });

  it("has a message for every outcome it can return", () => {
    for (const outcome of Object.values(SYNC_OUTCOMES)) {
      const message = syncReadinessMessage(outcome);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe("runSync", () => {
  const ready = { online: true, signedIn: true, databaseReady: true };

  it("does not call the writer and marks nothing synced when offline", async () => {
    const records = pending(2);
    let calls = 0;
    const result = await runSync({
      records,
      writeRecord: async () => { calls += 1; },
      online: false,
      signedIn: true,
      databaseReady: true
    });
    expect(calls).toBe(0);
    expect(result.outcome).toBe(SYNC_OUTCOMES.OFFLINE);
    expect(result.synced).toEqual([]);
    // This is the v1 defect: stamping records synced with no write.
    expect(records.every((r) => r.sync === "offline")).toBe(true);
  });

  it("does not call the writer when not signed in", async () => {
    const records = pending(2);
    let calls = 0;
    const result = await runSync({
      records,
      writeRecord: async () => { calls += 1; },
      online: true,
      signedIn: false,
      databaseReady: true
    });
    expect(calls).toBe(0);
    expect(result.outcome).toBe(SYNC_OUTCOMES.NOT_SIGNED_IN);
    expect(records.every((r) => r.sync === "offline")).toBe(true);
  });

  it("marks a record synced only after its write resolves", async () => {
    const records = pending(2);
    const order = [];
    const result = await runSync({
      records,
      writeRecord: async (record) => { order.push(`write:${record.id}`); },
      ...ready
    });
    expect(order).toEqual(["write:DTB-0", "write:DTB-1"]);
    expect(result.synced).toHaveLength(2);
    expect(result.failed).toEqual([]);
    expect(records.every((r) => r.sync === "synced")).toBe(true);
  });

  it("leaves a failed record pending and reports it, rather than half-claiming success", async () => {
    const records = pending(3);
    const result = await runSync({
      records,
      writeRecord: async (record) => {
        if (record.id === "DTB-1") throw new Error("storage/quota exceeded");
      },
      ...ready
    });
    expect(result.synced.map((r) => r.id)).toEqual(["DTB-0", "DTB-2"]);
    expect(result.failed).toEqual([{ id: "DTB-1", reason: "storage/quota exceeded" }]);
    expect(records.find((r) => r.id === "DTB-1").sync).toBe("offline");
    expect(records.find((r) => r.id === "DTB-0").sync).toBe("synced");
  });

  it("does not mark anything synced when every write fails", async () => {
    const records = pending(2);
    const result = await runSync({
      records,
      writeRecord: async () => { throw new Error("permission denied"); },
      ...ready
    });
    expect(result.outcome).toBe(SYNC_OUTCOMES.NOT_READY);
    expect(result.synced).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(records.every((r) => r.sync === "offline")).toBe(true);
    expect(syncSummaryMessage(result)).toMatch(/remain on this device/i);
  });

  it("skips records that are already synced", async () => {
    const records = [{ id: "DTB-done", sync: "synced" }, ...pending(1)];
    const seen = [];
    const result = await runSync({
      records,
      writeRecord: async (record) => { seen.push(record.id); },
      ...ready
    });
    expect(seen).toEqual(["DTB-0"]);
    expect(result.total).toBe(1);
  });

  it("reports nothing pending rather than uploading nothing and claiming success", async () => {
    const result = await runSync({
      records: [],
      writeRecord: async () => {},
      ...ready
    });
    expect(result.outcome).toBe(SYNC_OUTCOMES.NOTHING_PENDING);
    expect(syncSummaryMessage(result)).toMatch(/No records are waiting/i);
  });

  it("survives a non-array record list", async () => {
    const result = await runSync({ records: null, writeRecord: async () => {}, ...ready });
    expect(result.total).toBe(0);
    expect(result.synced).toEqual([]);
  });
});
