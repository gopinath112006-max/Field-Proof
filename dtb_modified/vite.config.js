import { defineConfig } from "vite";

/**
 * FieldCheck build configuration.
 *
 * The camera and geolocation APIs only work in a secure context. `localhost`
 * counts as one, so plain `vite dev` is fine; a phone on the LAN does not, which
 * is why `npm run dev` binds 0.0.0.0 and the README tells you to front the dev
 * server with an HTTPS tunnel when testing on a handset.
 *
 * `config.js` is served as a static asset rather than imported, so an operator
 * can edit it on a deployed host without a rebuild.
 */
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true
  },
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    // The largest single chunk is Firebase Auth/Firestore/Storage at ~525 kB
    // (157 kB gzipped), loaded eagerly because the auth gate needs it before
    // any page renders. The app's own code is ~91 kB. Raising the limit keeps
    // the build output honest rather than silencing a warning about a chunk
    // that is loaded on every page.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // jsPDF pulls in html2canvas and dompurify for its optional image and
        // HTML paths, neither of which this app uses: reports are built from
        // text and data-URL images only. Splitting them out keeps them out of
        // the main chunk instead of shipping ~490 kB of unused code.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("html2canvas")) return "vendor-html2canvas";
          if (id.includes("dompurify") || id.includes("purify")) return "vendor-purify";
          if (id.includes("jspdf")) return "vendor-jspdf";
          if (id.includes("@firebase") || id.includes("firebase")) return "vendor-firebase";
          return undefined;
        }
      }
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    reporters: "default"
  }
});
