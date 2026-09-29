import { beforeEach, describe, expect, it } from "vitest";
import {
  APP_VERSION,
  SIGNATURE_ALGORITHM,
  buildCanonicalPayload,
  canonicalSerialize,
  generateOperatorKeyPair,
  getOrCreateOperatorKeyPair,
  signRecord,
  verifyRecordSignature
} from "../src/lib/crypto.js";

const store = new Map();
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

describe("Cryptographic Digital Signature Module", () => {
  beforeEach(() => {
    store.clear();
  });

  describe("Constants & Payload Formation", () => {
    it("defines standard ECDSA-P256-SHA256 algorithm and version", () => {
      expect(SIGNATURE_ALGORITHM).toBe("ECDSA-P256-SHA256");
      expect(APP_VERSION).toBe("3.0.0");
    });

    it("builds a canonical payload with stable immutable fields", () => {
      const record = {
        id: "REC-20260929-100",
        hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        lat: 28.61391234,
        lng: 77.20901234,
        gps: "28.613912, 77.209012 (acc 4m)",
        date: "2026-09-29T10:00:00.000Z",
        operator: "Officer Kumar",
        observation: "positive",
        classification: "positive",
        calibrationStatus: "calibrated",
        calibrationVersion: "1.0.0",
        classifierVersion: "1.0.0",
        schemaVersion: 3,
        // UI mutable properties that MUST NOT be included in canonical payload
        synced: true,
        previewImage: "data:image/jpeg;base64,abc",
        syncPending: false,
        notes: "Some editable note"
      };

      const payload = buildCanonicalPayload(record);

      expect(payload.recordId).toBe("REC-20260929-100");
      expect(payload.imageHash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(payload.lat).toBe(28.613912); // rounded to 6 decimals
      expect(payload.lng).toBe(77.209012);
      expect(payload.classification).toBe("positive");
      expect(payload.calibrationStatus).toBe("calibrated");

      // Verify mutable fields are omitted
      expect(payload.synced).toBeUndefined();
      expect(payload.previewImage).toBeUndefined();
      expect(payload.syncPending).toBeUndefined();
      expect(payload.notes).toBeUndefined();
    });

    it("serializes deterministically regardless of key insertion order", () => {
      const objA = { z: 1, a: "alpha", m: { d: true, b: false } };
      const objB = { a: "alpha", m: { b: false, d: true }, z: 1 };

      const serializedA = canonicalSerialize(objA);
      const serializedB = canonicalSerialize(objB);

      expect(serializedA).toBe(serializedB);
      expect(serializedA).toBe('{"a":"alpha","m":{"b":false,"d":true},"z":1}');
    });
  });

  describe("Key Generation & Persistence", () => {
    it("generates an ECDSA P-256 keypair with hex public key and KEY- ID", async () => {
      const { keyPair, publicKeyHex, keyId } = await generateOperatorKeyPair();

      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(publicKeyHex).toMatch(/^[0-9a-f]{100,}$/i);
      expect(keyId).toMatch(/^KEY-[0-9A-F]{16}$/);
    });

    it("retrieves or creates operator keypair in localStorage", async () => {
      const first = await getOrCreateOperatorKeyPair();
      expect(first.keyId).toBeDefined();

      const second = await getOrCreateOperatorKeyPair();
      expect(second.keyId).toBe(first.keyId);
      expect(second.publicKeyHex).toBe(first.publicKeyHex);
    });
  });

  describe("Signing & Verification Flow", () => {
    it("signs a test record and verifies it as VERIFIED", async () => {
      const record = {
        id: "REC-2026-TEST-001",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        lat: 19.076,
        lng: 72.8777,
        gps: "19.076000, 72.877700",
        date: "2026-09-29T12:00:00.000Z",
        operator: "Officer Sharma",
        observation: "positive",
        classification: "positive",
        calibrationStatus: "calibrated",
        schemaVersion: 3
      };

      const sigInfo = await signRecord(record);

      expect(sigInfo.signature).toMatch(/^[0-9a-f]{64,}$/i);
      expect(sigInfo.signatureAlgorithm).toBe(SIGNATURE_ALGORITHM);
      expect(sigInfo.signatureKeyId).toMatch(/^KEY-/);
      expect(sigInfo.publicKey).toBeDefined();

      const signedRecord = {
        ...record,
        ...sigInfo
      };

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(true);
      expect(verification.status).toBe("VERIFIED");
      expect(verification.keyId).toBe(sigInfo.signatureKeyId);
    });

    it("detects tampering when the image hash is modified", async () => {
      const record = {
        id: "REC-TAMPER-TEST-01",
        hash: "original_image_hash_00000000000000000000000000000000000000000000000",
        lat: 12.9716,
        lng: 77.5946,
        operator: "Officer Verma",
        date: "2026-09-29T12:00:00.000Z",
        classification: "positive",
        schemaVersion: 3
      };

      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo };

      // Tamper with the image hash
      signedRecord.hash = "tampered_fake_image_hash_11111111111111111111111111111111111";

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
      expect(verification.reason).toContain("altered");
    });

    it("detects tampering when classification outcome is modified", async () => {
      const record = {
        id: "REC-TAMPER-TEST-02",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        lat: 28.7041,
        lng: 77.1025,
        operator: "Officer Patel",
        date: "2026-09-29T14:00:00.000Z",
        classification: "positive",
        schemaVersion: 3
      };

      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo };

      // Malicious actor changes classification to negative
      signedRecord.classification = "negative";

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });

    it("detects tampering when GPS coordinates are modified", async () => {
      const record = {
        id: "REC-TAMPER-TEST-03",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        lat: 13.0827,
        lng: 80.2707,
        operator: "Officer Iyer",
        date: "2026-09-29T15:00:00.000Z",
        classification: "negative",
        schemaVersion: 3
      };

      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo };

      // Tamper with location
      signedRecord.lat = 13.0900;

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });

    it("detects tampering when recordId is modified", async () => {
      const record = {
        id: "REC-ORIGINAL-ID",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        operator: "Officer Rao",
        date: "2026-09-29T16:00:00.000Z",
        classification: "positive",
        schemaVersion: 3
      };
      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo, id: "REC-FORGED-ID" };

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });

    it("detects tampering when timestamp/date is modified", async () => {
      const record = {
        id: "REC-TAMPER-TIME",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        operator: "Officer Rao",
        date: "2026-09-29T16:00:00.000Z",
        classification: "positive",
        schemaVersion: 3
      };
      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo, date: "2026-09-29T17:00:00.000Z" };

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });

    it("detects tampering when operator name is modified", async () => {
      const record = {
        id: "REC-TAMPER-OPERATOR",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        operator: "Officer Genuine",
        date: "2026-09-29T16:00:00.000Z",
        classification: "positive",
        schemaVersion: 3
      };
      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo, operator: "Impostor Officer" };

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });

    it("detects tampering when calibration status is modified", async () => {
      const record = {
        id: "REC-TAMPER-CALIB",
        hash: "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
        operator: "Officer Rao",
        date: "2026-09-29T16:00:00.000Z",
        classification: "positive",
        calibrationStatus: "uncalibrated",
        schemaVersion: 3
      };
      const sigInfo = await signRecord(record);
      const signedRecord = { ...record, ...sigInfo, calibrationStatus: "calibrated" };

      const verification = await verifyRecordSignature(signedRecord);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });

    it("rejects unsigned records with UNSIGNED status", async () => {
      const record = {
        id: "REC-UNSIGNED",
        hash: "hash",
        operator: "Officer Anonymous"
      };

      const verification = await verifyRecordSignature(record);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("UNSIGNED");
    });

    it("gracefully rejects corrupt signature or public key", async () => {
      const record = {
        id: "REC-CORRUPT",
        signatureAlgorithm: SIGNATURE_ALGORITHM,
        signature: "1234abcd",
        publicKey: "deadbeef"
      };

      const verification = await verifyRecordSignature(record);
      expect(verification.valid).toBe(false);
      expect(verification.status).toBe("SIGNATURE INVALID");
    });
  });
});
