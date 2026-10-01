/**
 * Firebase wiring (modular SDK v12, bundled rather than CDN-loaded).
 *
 * Firebase is optional. When no project is configured the app runs entirely on
 * local storage and says so, instead of the v1 behaviour of attempting to
 * initialise and reporting a CDN network failure as "Firebase is not configured
 * yet".
 *
 * Security note: the shipped rules in firestore.rules / storage.rules are
 * deny-by-default and owner-scoped. They must be deployed with
 * `firebase deploy --only firestore:rules,storage` before any real record is
 * uploaded.
 */

import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut
} from "firebase/auth";
import {
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

import { config, isFirebaseConfigured } from "../config.js";

export const AUTH_ERRORS = Object.freeze({
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/user-not-found": "No account was found for this email address.",
  "auth/wrong-password": "Incorrect password.",
  "auth/email-already-in-use": "An account already exists for this email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Try again in a moment.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before completion.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups and retry.",
  "auth/unauthorized-domain": "This domain is not authorised for sign-in in the Firebase console."
});

export function describeAuthError(error) {
  return AUTH_ERRORS[error?.code] || error?.message || "Sign-in failed.";
}

let app = null;
let auth = null;
let db = null;
let storage = null;

export function initialiseFirebase() {
  if (!isFirebaseConfigured()) {
    return { ready: false, reason: "not-configured" };
  }
  if (app) return { ready: true };
  try {
    app = initializeApp(config.firebase.config);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    return { ready: true };
  } catch (error) {
    console.error("Firebase initialisation failed", error);
    app = null;
    auth = null;
    db = null;
    storage = null;
    return { ready: false, reason: "init-failed", error };
  }
}

export const isAuthReady = () => Boolean(auth);
export const isDatabaseReady = () => Boolean(db);
export const getCurrentUser = () => auth?.currentUser || null;

export function watchAuth(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function signInWithEmail(email, password) {
  if (!auth) throw Object.assign(new Error("not-configured"), { code: "auth/not-configured" });
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function signUpWithEmail(email, password) {
  if (!auth) throw Object.assign(new Error("not-configured"), { code: "auth/not-configured" });
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

export async function signInWithGoogle() {
  if (!auth) throw Object.assign(new Error("not-configured"), { code: "auth/not-configured" });
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(auth, provider)).user;
}

export async function sendReset(email) {
  if (!auth) throw Object.assign(new Error("not-configured"), { code: "auth/not-configured" });
  await sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  if (auth) await fbSignOut(auth);
}

/** A display name for the signed-in user, or a clearly-labelled fallback. */
export function operatorName(user) {
  if (!user) return "Unidentified operator";
  if (user.displayName) return user.displayName;
  if (user.email) return user.email.split("@")[0];
  return "Unidentified operator";
}

export function operatorInitials(user) {
  const name = operatorName(user);
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "OP"
  );
}

export function isDemoUser(user) {
  return !user;
}

async function uploadFrame(user, record, blob) {
  if (!storage || !blob) return null;
  const objectRef = ref(storage, `dtb/${user.uid}/${record.id}.jpg`);
  await uploadBytes(objectRef, blob, {
    contentType: "image/jpeg",
    customMetadata: { testId: record.id, observation: record.observation }
  });
  return getDownloadURL(objectRef);
}

/**
 * Write one record to Firestore. Resolves only when the write is acknowledged,
 * which is what allows runSync() to mark a record synced truthfully.
 *
 * ORDERING IS LOAD-BEARING: Firestore first, then Storage, then finalise.
 *
 * storage.rules permits a frame only where the matching Firestore record
 * already exists:
 *
 *   exists(/databases/(default)/documents/testRecords/$(recordId))
 *   && firestore.get(...).data.userId == request.auth.uid
 *
 * Uploading the frame first is therefore denied on a first sync, because the
 * document does not exist yet. tests/storage.rules.test.mjs pins both halves of
 * that contract, so the two cannot drift apart again.
 */
export async function writeRecord(record, { user, imageBlob }) {
  if (!db) throw new Error("Firestore is not initialised");
  if (!user) throw new Error("no authenticated user");

  // 1. Metadata first. It carries no image yet and is explicitly marked
  //    frameUploaded: false, so an interrupted sync leaves an honest record
  //    rather than one that claims a frame the cloud never received.
  await setDoc(
    doc(collection(db, "testRecords"), record.id),
    {
      ...record,
      imageUrl: null,
      frameUploaded: false,
      userId: user.uid,
      syncedAt: serverTimestamp()
    },
    { merge: true }
  );

  // 2. The frame is the evidence. If there is a frame to upload and it fails,
  //    the record is NOT reported as synced: the throw propagates to runSync(),
  //    which leaves the record pending and surfaces the failure, so the operator
  //    is never told their evidence reached the cloud when only metadata did.
  //    v1 swallowed this failure, wrote the metadata, and stamped the record
  //    "synced" with no image.
  let imageUrl = null;
  if (imageBlob) {
    try {
      imageUrl = await uploadFrame(user, record, imageBlob);
    } catch (error) {
      throw new Error(`frame upload failed: ${error?.message || error}`);
    }
  }

  // 3. Finalise with the real URL. Only now, with both the metadata and the
  //    frame stored, is frameUploaded true.
  await setDoc(
    doc(collection(db, "testRecords"), record.id),
    {
      imageUrl,
      frameUploaded: Boolean(imageUrl),
      syncedAt: serverTimestamp()
    },
    { merge: true }
  );

  record.imageUrl = imageUrl;
  record.frameUploaded = Boolean(imageUrl);
}
