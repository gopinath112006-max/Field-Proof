/**
 * Security rules unit tests.
 *
 * Run against the Firestore emulator, never against the live project:
 *
 *   firebase emulators:exec --only firestore "node dtb_modified/tests/firestore.rules.test.mjs"
 *
 * The tests below assert the deny-by-default property directly. A test-mode
 * Firestore database is world-readable, and rules are not enforced by the
 * client SDK, so the only evidence these rules work is a test that fails when
 * they are wrong.
 *
 * These rules were validated locally against the emulator before deployment.
 * Running them against the real project would require write access to it,
 * which is exactly what the rules are there to prevent.
 */

import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";

import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

/**
 * This file runs under plain `node`, not under Vitest, so it carries its own
 * assertion and reporting helpers. Vitest cannot be used here: the emulator
 * lifecycle is owned by `firebase emulators:exec`, and a test framework
 * would try to manage its own teardown.
 */

const RULES = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");

/** @type {RulesTestEnvironment} */
let env;

const ALICE = { uid: "alice-uid" };
const MALLORY = { uid: "mallory-uid" };

function recordFor(uid, overrides = {}) {
  return {
    id: "rec-1",
    userId: uid,
    observation: "unreadable",
    hash: "a".repeat(64),
    hashAlgorithm: "SHA-256",
    gps: null,
    lat: null,
    lng: null,
    ...overrides
  };
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "testRecords", "rec-1"), recordFor(ALICE.uid));
    await setDoc(doc(context.firestore(), "testRecords", "rec-2"), recordFor(MALLORY.uid));
  });
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail });
}

/**
 * Distinguish "the rules denied it" from "the code under test is broken".
 *
 * A bare catch would treat a TypeError -- a renamed API, a typo, a missing
 * import -- as a successful denial, and the whole file would report green
 * while testing nothing. That happened on the first run of this file: every
 * case used a v1 API name, and the TypeError satisfied all fourteen denials.
 *
 * So both helpers require the call to reach the emulator and get an answer.
 */
const DENIED_CODES = new Set(["permission-denied", "unauthenticated", "failed-precondition"]);

function isRulesDenial(error) {
  if (!error) return false;
  const code = error.code || error.name;
  if (DENIED_CODES.has(code)) return true;
  // The SDK surfaces the rules failure as a plain Error with this message.
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

async function main() {
  // v5 returns a promise; it also requires a running emulator, which
  // `firebase emulators:exec` provides and points at via the environment.
  env = await initializeTestEnvironment({
    projectId: "fieldcheck-rules-test",
    firestore: { rules: RULES }
  });

  await seed();

  // v5 API: a context is created per identity and the callback receives it.
  // (v1-v4 used env.withSecurityRulesAsContext(identity, fn), which no longer
  // exists. Calling that name fails with a TypeError, and a naive `denies()`
  // helper would report that as a successful denial -- which is exactly what
  // happened on the first run of this file. Every helper below therefore
  // asserts the outcome explicitly rather than inferring it from a throw.)
  const asAlice = (fn) => fn(env.authenticatedContext(ALICE.uid).firestore());
  const asMallory = (fn) => fn(env.authenticatedContext(MALLORY.uid).firestore());
  const signedOut = (fn) => fn(env.unauthenticatedContext().firestore());

  // --- reads -------------------------------------------------------------
  await allows("owner reads their own record", () =>
    asAlice((db) => getDoc(doc(db, "testRecords", "rec-1")))
  );

  await denies("another user cannot read that record", () =>
    asMallory((db) => getDoc(doc(db, "testRecords", "rec-1")))
  );

  await denies("a signed-out client cannot read a record", () =>
    signedOut((db) => getDoc(doc(db, "testRecords", "rec-1")))
  );

  // A query must not leak another operator's records. The rules allow a read
  // only when the document's own userId matches, so a bare collection() query
  // cannot succeed; it returns permission-denied rather than a filtered set.
  // Asserting the denial is the point: if this ever starts succeeding, the
  // rules have a list-all hole.
  await denies("an unscoped collection query is denied, not silently filtered", () =>
    asAlice((db) => getDocs(collection(db, "testRecords")))
  );

  // --- writes ------------------------------------------------------------
  await allows("owner creates their own record", () =>
    asAlice((db) =>
      setDoc(doc(db, "testRecords", "rec-3"), recordFor(ALICE.uid, { id: "rec-3" }))
    )
  );

  await denies("a user cannot create a record owned by someone else", () =>
    asMallory((db) =>
      setDoc(doc(db, "testRecords", "rec-4"), recordFor(ALICE.uid, { id: "rec-4" }))
    )
  );

  await denies("a user cannot claim ownership of another user's record", () =>
    asAlice((db) => setDoc(doc(db, "testRecords", "rec-2"), recordFor(ALICE.uid, { id: "rec-2" })))
  );

  await allows("owner updates their own record", () =>
    asAlice((db) =>
      setDoc(doc(db, "testRecords", "rec-1"), recordFor(ALICE.uid, { observation: "positive" }))
    )
  );

  await denies("another user cannot update it", () =>
    asMallory((db) => setDoc(doc(db, "testRecords", "rec-1"), recordFor(MALLORY.uid)))
  );

  // --- observation field -------------------------------------------------
  for (const bad of ["confirmed", "POSITIVE", "positive-ish", "", 42, null]) {
    await denies(`an out-of-range observation is rejected: ${JSON.stringify(bad)}`, () =>
      asAlice((db) =>
        setDoc(doc(db, "testRecords", "rec-5"), recordFor(ALICE.uid, { id: "rec-5", observation: bad }))
      )
    );
  }

  // --- undeclared collections --------------------------------------------
  await denies("an undeclared collection is closed", () =>
    asAlice((db) => getDoc(doc(db, "secrets", "anything")))
  );

  await denies("an undeclared collection is not writable", () =>
    asAlice((db) => setDoc(doc(db, "secrets", "x"), { data: 1 }))
  );

  await denies("a signed-out client cannot write", () =>
    signedOut((db) => setDoc(doc(db, "testRecords", "rec-6"), recordFor("x")))
  );

  // --- report ------------------------------------------------------------
  await env.cleanup();

  let failed = 0;
  for (const r of results) {
    if (r.pass) {
      console.log(`  PASS  ${r.name}`);
    } else {
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
