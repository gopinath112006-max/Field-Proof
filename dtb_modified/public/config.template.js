// FieldCheck runtime configuration — TEMPLATE.
//
// Copy this file to `public/config.js` and fill in your own values. The app
// reads `window.DTB_CONFIG` at startup. `public/config.js` is served as-is and
// is not bundled, so it can be edited on a deployed host without a rebuild.
//
// This file is sent to the browser in full. Never put a service-role key,
// admin credential, private key or any other server secret here. Firebase web
// config values are public identifiers by design; access is enforced by
// firestore.rules and storage.rules, not by hiding this file.

window.DTB_CONFIG = {
  firebase: {
    enabled: true,
    config: {
      apiKey: "YOUR_FIREBASE_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID",
      measurementId: "YOUR_MEASUREMENT_ID"
    }
  },

  // Leave api.baseUrl as the placeholder unless you have a fixed API host.
  //
  // With the placeholder the app calls the API on the same origin it was
  // loaded from, which is what a phone on the LAN needs. The original build
  // hardcoded http://127.0.0.1:8000 here, which resolves to the *device* on
  // anything that is not the dev machine, so every request failed with a
  // connection error that looked like an offline app. A loopback URL is also
  // rejected outright at runtime when the page is not itself on loopback.
  //
  // For a one-off override without editing this file, set VITE_DTB_API_URL at
  // build time. An explicit non-loopback baseUrl below still takes effect.
  api: {
    baseUrl: "YOUR_API_BASE_URL",
    enabled: true
  }
};
