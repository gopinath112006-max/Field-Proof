import { describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";
import { parseDataUrl, sha256Hex, sha256HexFromDataUrl, verifyRecordHash } from "../src/lib/hash.js";

// Web Crypto is global in browsers; give it explicitly under Node.
if (!globalThis.crypto) globalThis.crypto = webcrypto;

/** Known SHA-256 vectors, so a change in the hashing input cannot pass. */
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function dataUrl(bytes, mime = "image/jpeg") {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("sha256Hex", () => {
  it("matches published SHA-256 vectors", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(EMPTY_SHA256);
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(ABC_SHA256);
  });

  it("hashes the bytes given, not a string built from them", async () => {
    // v1 hashed `${dataUrl}|${recordId}`. Two different records of the same
    // image produced different digests; identical bytes must produce one.
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(new Uint8Array([1, 2, 3, 4, 5])));
  });

  it("honours a view's byteOffset rather than hashing from the start", async () => {
    const backing = new Uint8Array([9, 9, 9, 1, 2, 3]);
    const view = backing.subarray(3);
    expect(await sha256Hex(view)).toBe(await sha256Hex(new Uint8Array([1, 2, 3])));
  });
});

describe("parseDataUrl", () => {
  it("decodes base64 payloads and reports the mime type", () => {
    const parsed = parseDataUrl(dataUrl([104, 105], "image/png"));
    expect(parsed.mime).toBe("image/png");
    expect(Array.from(parsed.bytes)).toEqual([104, 105]);
  });

  it("decodes percent-encoded text payloads", () => {
    const parsed = parseDataUrl("data:text/plain,hello%20world");
    expect(parsed.mime).toBe("text/plain");
    expect(new TextDecoder().decode(parsed.bytes)).toBe("hello world");
  });

  it("returns null for anything that is not a data URL", () => {
    for (const value of ["", "http://example.com/a.png", "not a url", null, undefined, 42, {}]) {
      expect(parseDataUrl(value)).toBeNull();
    }
  });
});

describe("sha256HexFromDataUrl", () => {
  it("agrees with hashing the decoded bytes directly", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252]);
    const url = dataUrl(bytes);
    expect(await sha256HexFromDataUrl(url)).toBe(await sha256Hex(bytes));
  });

  it("returns an empty string rather than a wrong digest for a non-data URL", async () => {
    expect(await sha256HexFromDataUrl("https://example.com/x.png")).toBe("");
    expect(await sha256HexFromDataUrl(null)).toBe("");
  });
});

describe("verifyRecordHash", () => {
  const bytes = new Uint8Array([7, 7, 7, 7]);
  let digest;

  it("confirms a record whose stored image still matches its digest", async () => {
    digest = await sha256Hex(bytes);
    const result = await verifyRecordHash(
      { hash: digest, hashAlgorithm: "SHA-256" },
      dataUrl(bytes)
    );
    expect(result).toEqual({ checked: true, valid: true, reason: "digest matches image bytes" });
  });

  it("detects a mismatch instead of reporting a hardcoded pass", async () => {
    const result = await verifyRecordHash(
      { hash: await sha256Hex(new Uint8Array([1])), hashAlgorithm: "SHA-256" },
      dataUrl(bytes)
    );
    expect(result.checked).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/i);
  });

  it("reports that it could not check, instead of implying success", async () => {
    expect((await verifyRecordHash(null, dataUrl(bytes))).checked).toBe(false);
    expect((await verifyRecordHash({}, dataUrl(bytes))).checked).toBe(false);
    // No image in this session: cannot verify, must not claim a pass.
    const noImage = await verifyRecordHash({ hash: "abc", hashAlgorithm: "SHA-256" }, null);
    expect(noImage).toEqual({
      checked: false,
      valid: false,
      reason: "image not available in this session"
    });
  });

  it("refuses to check a legacy v1 string digest as if it were image bytes", async () => {
    const result = await verifyRecordHash(
      { hash: "deadbeef", hashAlgorithm: "unverified-v1" },
      dataUrl(bytes)
    );
    expect(result.checked).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/legacy/i);
  });
});
