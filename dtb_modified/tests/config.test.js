import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Config resolution is loaded at import time, so each case re-imports the
 * module with fresh globals rather than mutating one shared instance.
 */
async function loadConfig({ window: win, env, location: loc } = {}) {
  vi.resetModules();
  if (win !== undefined) {
    vi.stubGlobal("window", win);
  } else {
    vi.stubGlobal("window", undefined);
  }
  if (loc !== undefined) {
    vi.stubGlobal("location", loc);
  } else {
    vi.stubGlobal("location", undefined);
  }
  vi.stubEnv("VITE_DTB_API_URL", env ?? "");
  const mod = await import("../src/config.js");
  return mod;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("API base URL resolution", () => {
  it("falls back to same-origin when nothing is configured", async () => {
    const { config } = await loadConfig({
      window: { DTB_CONFIG: { api: { baseUrl: "YOUR_API_BASE_URL" } } },
      env: "",
      location: { protocol: "http:", hostname: "192.168.1.20", port: "4173" }
    });
    // The dev/preview neighbour port is where the API runs.
    expect(config.api.baseUrl).toBe("http://192.168.1.20:8000");
    expect(config.api.enabled).toBe(true);
  });

  it("uses the served port when the page is not on a dev port", async () => {
    const { config } = await loadConfig({
      window: {},
      env: "",
      location: { protocol: "https:", hostname: "fieldcheck.example.com", port: "" }
    });
    expect(config.api.baseUrl).toBe("https://fieldcheck.example.com");
  });

  it("honours an explicit real host from the operator file", async () => {
    // This is the case the previous order broke: same-origin was checked first,
    // so a deliberately configured host was unreachable.
    const { config } = await loadConfig({
      window: { DTB_CONFIG: { api: { baseUrl: "https://api.example.com/" } } },
      env: "",
      location: { protocol: "http:", hostname: "192.168.1.20", port: "5173" }
    });
    expect(config.api.baseUrl).toBe("https://api.example.com/");
  });

  it("lets the build-time env override the operator file", async () => {
    const { config } = await loadConfig({
      window: { DTB_CONFIG: { api: { baseUrl: "https://api.example.com" } } },
      env: "https://build.example.com",
      location: { protocol: "http:", hostname: "192.168.1.20", port: "5173" }
    });
    expect(config.api.baseUrl).toBe("https://build.example.com");
  });

  it("rejects a loopback API URL when the page is on a real network", async () => {
    // The v1 failure: a phone at http://192.168.x.x:5173 with 127.0.0.1
    // configured resolved the API to the phone itself, so every request failed
    // and the app looked offline.
    const { config } = await loadConfig({
      window: { DTB_CONFIG: { api: { baseUrl: "http://127.0.0.1:8000" } } },
      env: "",
      location: { protocol: "http:", hostname: "192.168.1.20", port: "5173" }
    });
    expect(config.api.baseUrl).toBe("http://192.168.1.20:8000");
  });

  it("allows loopback when the page itself is on loopback", async () => {
    const { config } = await loadConfig({
      window: { DTB_CONFIG: { api: { baseUrl: "http://127.0.0.1:8000" } } },
      env: "",
      location: { protocol: "http:", hostname: "localhost", port: "5173" }
    });
    expect(config.api.baseUrl).toBe("http://127.0.0.1:8000");
  });

  it("rejects a loopback URL from the env too", async () => {
    const { config } = await loadConfig({
      window: {},
      env: "http://127.0.0.1:8000",
      location: { protocol: "http:", hostname: "10.0.0.5", port: "4173" }
    });
    expect(config.api.baseUrl).toBe("http://10.0.0.5:8000");
  });

  it("disables the API when the operator turns it off", async () => {
    const { config } = await loadConfig({
      window: { DTB_CONFIG: { api: { baseUrl: "https://api.example.com", enabled: false } } },
      env: "",
      location: { protocol: "https:", hostname: "fieldcheck.example.com", port: "" }
    });
    expect(config.api.enabled).toBe(false);
  });

  it("disables the API when nothing resolves", async () => {
    const { config } = await loadConfig({
      window: {},
      env: "",
      location: undefined
    });
    expect(config.api.baseUrl).toBe("");
    expect(config.api.enabled).toBe(false);
  });
});

describe("Firebase configuration", () => {
  it("is absent when the template placeholders are untouched", async () => {
    const { config, isFirebaseConfigured } = await loadConfig({
      window: {
        DTB_CONFIG: {
          firebase: {
            config: {
              apiKey: "YOUR_FIREBASE_API_KEY",
              projectId: "YOUR_PROJECT_ID",
              authDomain: "YOUR_PROJECT_ID.firebaseapp.com"
            }
          }
        }
      },
      location: { protocol: "http:", hostname: "localhost", port: "5173" }
    });
    // Initialising with placeholder values throws on every sign-in attempt.
    expect(config.firebase.config).toBeNull();
    expect(isFirebaseConfigured()).toBe(false);
  });

  it("is accepted once real values are supplied", async () => {
    const { config, isFirebaseConfigured } = await loadConfig({
      window: {
        DTB_CONFIG: {
          firebase: {
            config: {
              apiKey: "AIzaRealKey",
              projectId: "drug-testing-buddy",
              authDomain: "drug-testing-buddy.firebaseapp.com"
            }
          }
        }
      },
      location: { protocol: "http:", hostname: "localhost", port: "5173" }
    });
    expect(config.firebase.config.projectId).toBe("drug-testing-buddy");
    expect(isFirebaseConfigured()).toBe(true);
  });

  it("is absent when the operator supplies an incomplete config", async () => {
    const { isFirebaseConfigured } = await loadConfig({
      window: { DTB_CONFIG: { firebase: { config: { projectId: "real-project" } } } },
      location: { protocol: "http:", hostname: "localhost", port: "5173" }
    });
    expect(isFirebaseConfigured()).toBe(false);
  });
});
