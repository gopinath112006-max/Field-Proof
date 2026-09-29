/**
 * Storage rules unit tests, and the regression test for the sync ordering bug.
 *
 * Run against the local emulators, never against the live project:
 *
 *   firebase emulators:exec --only firestore,storage \
 *     "node dtb_modified/tests/storage.rules.test.mjs"
 *
 * WHY THIS FILE EXISTS
 *
 * src/lib/firebase.js:writeRecord() originally uploaded the frame to Storage
 * and only then wrote the Firestore document. storage.rules requires the
 * Firestore record to already exist before a frame may be written:
 *
 *   exists(/databases/(default)/documents/testRecords/$(recordId))
 *
 * On a first sync the document does not exist, so the upload was denied, the
 * error propagated, and the record was never written. Every first sync of a
 * record with a photo would have failed. The ordering test below pins the
 * correct order so the two rules cannot drift apart again.
 */

import { readFileSync } from "node:fs";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getBytes,
  getDownloadURL,
  deleteObject
} from "firebase/storage";

const STORAGE_RULES = readFileSync(new URL("../storage.rules", import.meta.url), "utf8");
const FIRESTORE_RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

const ALICE = "alice-uid";
const MALLORY = "mallory-uid";
const PROJECT = "fieldcheck-rules-test";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail });
}

const DENIED_CODES = new Set(["storage/unauthorized", "permission-denied", "unauthenticated"]);

function isRulesDenial(error) {
  if (!error) return false;
  const code = error.code || error.name;
  if (DENIED_CODES.has(code)) return true;
  return /permission|insufficient|not authorized|denied/i.test(error.message || "");
}

async function allows(name, fn) {
  try {
    await fn();
    check(name, true);
  } catch (error) {
    check(name, false, `expected success, got: ${error.message?.split("\n")[0]}`);
  }
}

async function denies(name, fn) {
  try {
    await fn();
    check(name, false, "expected the rules to deny this, but it succeeded");
  } catch (error) {
    if (isRulesDenial(error)) check(name, true);
    else check(name, false, `denied for the wrong reason: ${error.message?.split("\n")[0]}`);
  }
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

function record(uid, id) {
  return {
    id,
    userId: uid,
    observation: "unreadable",
    hash: "a".repeat(64),
    hashAlgorithm: "SHA-256",
    gps: null,
    lat: null,
    lng: null
  };
}

async function main() {
  const env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: FIRESTORE_RULES },
    storage: { rules: STORAGE_RULES }
  });

  const aliceFs = env.authenticatedContext(ALICE).firestore();
  const aliceStorage = env.authenticatedContext(ALICE).storage();
  const malloryStorage = env.authenticatedContext(MALLORY).storage();
  const anonStorage = env.unauthenticatedContext().storage();

  // Seed two records: one owned by Alice, one by Mallory.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "testRecords", "alice-rec"), record(ALICE, "alice-rec"));
    await setDoc(doc(ctx.firestore(), "testRecords", "mallory-rec"), record(MALLORY, "mallory-rec"));
  });

  // --- ordering regression ------------------------------------------------
  // Upload BEFORE the document exists. This is what writeRecord() used to do
  // and it is the exact shape that broke first sync in production.
  await denies("a frame cannot be written before its Firestore record exists", () =>
    uploadBytes(ref(aliceStorage, "dtb/alice-uid/not-yet-created.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  // Upload AFTER the document exists: the rule must now allow it.
  await allows("a frame uploads once its own record exists", () =>
    uploadBytes(ref(aliceStorage, "dtb/alice-uid/alice-rec.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  // --- ownership ----------------------------------------------------------
  await denies("another user cannot write into this folder", () =>
    uploadBytes(ref(malloryStorage, "dtb/alice-uid/alice-rec2.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  await denies("another user cannot write over someone else's frame", () =>
    uploadBytes(ref(malloryStorage, "dtb/alice-uid/alice-rec.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  await allows("the owner can read their own frame", () => getBytes(ref(aliceStorage, "dtb/alice-uid/alice-rec.jpg")));

  await denies("another user cannot read this frame", () => getBytes(ref(malloryStorage, "dtb/alice-uid/alice-rec.jpg")));

  await denies("a signed-out client cannot read this frame", () => getBytes(ref(anonStorage, "dtb/alice-uid/alice-rec.jpg")));

  // --- record ownership cross-check --------------------------------------
  // The path uid matches the caller, but the Firestore record belongs to
  // Mallory, so the cross-check must still deny it.
  await denies("a matching folder uid cannot upload against another user's record", () =>
    uploadBytes(ref(aliceStorage, "dtb/alice-uid/mallory-rec.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  // --- deny by default ----------------------------------------------------
  await denies("an undeclared path is closed for reads", () => getBytes(ref(aliceStorage, "elsewhere/secret.jpg")));

  await denies("an undeclared path is closed for writes", () =>
    uploadBytes(ref(aliceStorage, "elsewhere/secret.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  await denies("a signed-out client cannot write", () =>
    uploadBytes(ref(anonStorage, "dtb/anon/alice-rec.jpg"), JPEG, { contentType: "image/jpeg" })
  );

  // --- size bound ---------------------------------------------------------
  const oversize = new Uint8Array(10 * 1024 * 1024 + 1);
  oversize.set(JPEG, 0);
  await setDoc(doc(aliceFs, "testRecords", "big-rec"), record(ALICE, "big-rec"));
  await denies("a frame over 10 MB is rejected", () =>
    uploadBytes(ref(aliceStorage, "dtb/alice-uid/big-rec.jpg"), oversize, { contentType: "image/jpeg" })
  );

  // --- the happy path end to end -----------------------------------------
  // Mirrors writeRecord(): Firestore first, then the frame, then the URL is
  // recorded. This is the sequence the fix implements.
  const sequence = [];
  const newId = "ordered-rec";
  try {
    await setDoc(doc(aliceFs, "testRecords", newId), record(ALICE, newId));
    sequence.push("firestore");
    const url = await getDownloadURL(
      (await uploadBytes(ref(aliceStorage, `dtb/${ALICE}/${newId}.jpg`), JPEG, { contentType: "image/jpeg" })).ref
    );
    sequence.push("storage");
    if (url) sequence.push("url");
    await setDoc(doc(aliceFs, "testRecords", newId), { imageUrl: url, frameUploaded: true }, { merge: true });
    sequence.push("finalised");
  } catch (error) {
    check("the Firestore-then-Storage sync order succeeds", false, `failed after ${sequence.join(", ")}: ${error.message?.split("\n")[0]}`);
  }
  if (sequence.length === 4) {
    check("the Firestore-then-Storage sync order succeeds", true);
  }

  await env.cleanup();

  let failed = 0;
  for (const r of results) {
    if (r.pass) console.log(`  PASS  ${r.name}`);
    else {
      failed += 1;
      console.error(`  FAIL  ${r.name}${r.detail ? ` -- ${r.detail}` : ""}`);
    }
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
