// DTB Authentication Configuration
// Firebase web configuration supplied for the DTB project.
// Supabase values will be added after the Supabase project is created.
// Never put Firebase Admin credentials, service-role keys, private keys,
// or other server secrets in this file.

window.DTB_CONFIG = {
  firebase: {
    enabled: true,
    config: {
      apiKey: "AIzaSyCqjU-Tw3xjMI8N5Q-MqwHVmQCRKc4LaWs",
      authDomain: "drug-testing-buddy.firebaseapp.com",
      projectId: "drug-testing-buddy",
      storageBucket: "drug-testing-buddy.firebasestorage.app",
      messagingSenderId: "431484129357",
      appId: "1:431484129357:web:81d635efd403e5e9110c04",
      measurementId: "G-BFCLJE8JDT"
    }
  },
  api: {
    baseUrl: "http://127.0.0.1:8000",
    enabled: true
  },
  supabase: {
    enabled: false,
    url: "https://YOUR_PROJECT_ID.supabase.co",
    anonKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
  }
};
