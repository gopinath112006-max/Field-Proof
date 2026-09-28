/**
 * Sync state machine.
 *
 * The v1 build defined `syncRecords` twice. The second definition won, so the
 * Firebase implementation was dead code and "Sync Now" simply stamped every
 * local record with `sync: "synced"` and reported "All local records
 * synchronized." -- telling the operator their evidence had been uploaded when
 * nothing had left the device.
 *
 * This module makes the decision pure and testable: given connectivity, auth
 * and database readiness, it returns what is actually possible, and a record
 * may only be marked synced when a write resolved.
 */

export const SYNC_OUTCOMES = Object.freeze({
  OFFLINE: "offline",
  NOT_SIGNED_IN: "not-signed-in",
  NOT_CONFIGURED: "not-configured",
  NOT_READY: "not-ready",
  READY: "ready",
  NOTHING_PENDING: "nothing-pending"
});

/** Decide whether a sync attempt is possible at all. */
export function evaluateSyncReadiness({ online, signedIn, databaseReady, pendingCount }) {
  if (!online) return { outcome: SYNC_OUTCOMES.OFFLINE, canSync: false };
  if (!signedIn) return { outcome: SYNC_OUTCOMES.NOT_SIGNED_IN, canSync: false };
  if (!databaseReady) return { outcome: SYNC_OUTCOMES.NOT_CONFIGURED, canSync: false };
  if (pendingCount === 0) return { outcome: SYNC_OUTCOMES.NOTHING_PENDING, canSync: false };
  return { outcome: SYNC_OUTCOMES.READY, canSync: true };
}

export function syncReadinessMessage(outcome) {
  switch (outcome) {
    case SYNC_OUTCOMES.OFFLINE:
      return "You are offline. Records stay on this device and will sync when connectivity returns.";
    case SYNC_OUTCOMES.NOT_SIGNED_IN:
      return "Sign in with Firebase to upload records. Nothing has been sent yet.";
    case SYNC_OUTCOMES.NOT_CONFIGURED:
      return "Firebase is not configured, so records cannot be uploaded. They remain on this device.";
    case SYNC_OUTCOMES.NOTHING_PENDING:
      return "No records are waiting to sync.";
    case SYNC_OUTCOMES.READY:
      return "Ready to upload.";
    default:
      return "Sync state unknown.";
  }
}

/**
 * Run the upload for every pending record.
 *
 * A record is marked `synced` only when its write resolved. Failures are
 * collected and reported individually -- there is no path in this function
 * that marks a record synced without a confirmed write.
 *
 * @param {object} options
 * @param {Array} options.records
 * @param {(record:object)=>Promise<void>} options.writeRecord must resolve on success
 * @param {boolean} options.online
 * @param {boolean} options.signedIn
 * @param {boolean} options.databaseReady
 * @param {Function} [options.onProgress]
 * @returns {Promise<{outcome:string, synced:Array, failed:Array, total:number}>}
 */
export async function runSync({
  records,
  writeRecord,
  online,
  signedIn,
  databaseReady,
  onProgress
}) {
  const list = Array.isArray(records) ? records : [];
  const pending = list.filter((r) => r.sync !== "synced");
  const readiness = evaluateSyncReadiness({
    online,
    signedIn,
    databaseReady,
    pendingCount: pending.length
  });

  if (!readiness.canSync) {
    return { outcome: readiness.outcome, synced: [], failed: [], total: pending.length };
  }

  const synced = [];
  const failed = [];

  for (let i = 0; i < pending.length; i += 1) {
    const record = pending[i];
    if (onProgress) onProgress({ index: i, total: pending.length, id: record.id });
    try {
      await writeRecord(record);
      record.sync = "synced";
      synced.push(record);
    } catch (error) {
      // Leave sync as-is so the record stays in the pending queue.
      failed.push({ id: record.id, reason: error?.message || String(error) });
    }
  }

  const outcome =
    failed.length === 0
      ? SYNC_OUTCOMES.READY
      : synced.length > 0
        ? SYNC_OUTCOMES.READY
        : SYNC_OUTCOMES.NOT_READY;

  return { outcome, synced, failed, total: pending.length };
}

export function syncSummaryMessage({ outcome, synced, failed, total }) {
  switch (outcome) {
    case SYNC_OUTCOMES.OFFLINE:
      return syncReadinessMessage(outcome);
    case SYNC_OUTCOMES.NOT_SIGNED_IN:
      return syncReadinessMessage(outcome);
    case SYNC_OUTCOMES.NOT_CONFIGURED:
      return syncReadinessMessage(outcome);
    case SYNC_OUTCOMES.NOTHING_PENDING:
      return syncReadinessMessage(outcome);
    case SYNC_OUTCOMES.NOT_READY:
      return failed && failed.length
        ? `Upload failed for all ${failed.length} record(s). They remain on this device.`
        : "Upload did not complete. Records remain on this device.";
    default:
      if (total === 0) return syncReadinessMessage(SYNC_OUTCOMES.NOTHING_PENDING);
      if (!failed || failed.length === 0) {
        return `Uploaded ${synced.length} record(s) to Firebase.`;
      }
      return `Uploaded ${synced.length} of ${total} record(s). ${failed.length} stayed on this device.`;
  }
}
