# FieldProof — developer guide (application directory)

This directory contains the application. The product overview, workflow
narrative and limitations live in the **[repository README](../README.md)**.

> **Naming.** The in-app wordmark and npm package name are still `FieldCheck` /
> `dtb-fieldcheck` (`src/config.js` exports `config.appName = "FieldCheck"`).
> Renaming working code was out of scope when the repository was prepared.
> The product is FieldProof.

> **FieldProof provides presumptive field-test interpretation. It does not
> provide definitive controlled-substance identification and does not replace
> laboratory confirmation.** The classifier's reference profiles and thresholds
> are prototype engineering presets (`NOMINAL_PRESET_V1`) that require empirical
> physical-kit validation.

---

## What it does

- Captures a frame with the device camera, or imports an existing image.
- Hashes the captured bytes with SHA-256. The digest is recomputable later, so
  "this image is the image that was recorded" is a checkable claim rather than a
  label.
- Gates the frame on a pixel-level quality check (resolution, exposure,
  sharpness, contrast). A frame that fails the gate cannot produce a conclusive
  classification.
- Detects a physical reference colour card in the frame and derives a per-channel
  von Kries calibration transform from it.
- Runs a **deterministic colorimetric classifier** (Lab, ΔE76) that returns
  `positive`, `negative` or `inconclusive`, always labelled presumptive. It is a
  heuristic with no model and no training data.
- Records the operator's own reading of the kit separately — `positive`,
  `negative`, or `unreadable` — behind an explicit acknowledgement. The automated
  classification never overwrites the operator observation, and vice versa.
- Signs the canonical record payload with **ECDSA P-256 / SHA-256** and
  re-verifies it, reporting `VERIFIED`, `SIGNATURE INVALID` or `UNSIGNED`.
- Captures GPS and accuracy when the operator grants permission, and says
  "permission denied" rather than storing a fabricated `0,0`.
- Works offline. Records live in `localStorage` until the operator signs in and
  syncs, and a record is marked synced only after the cloud write is
  acknowledged.
- Exports a PDF that states plainly that it records a presumptive field
  observation and not a laboratory result.

## What it does not do

- Identify a substance, or infer an observation the operator did not make.
- Produce a laboratory result, a confirmation, or a legal-admissibility claim.
- Claim scientifically validated field thresholds — the current presets are
  engineering values awaiting physical-kit validation.
- Establish organisational identity from the local browser signing key.
- Fabricate a map, chart, GPS fix or health status. Missing data reads as
  missing.
- Collect analytics. The only outbound requests are the ones the operator
  triggers.

---

## Requirements

- Node.js 20 or newer
- Python 3.11 or newer for the optional validation API

## Setup

```bash
npm install
```

### Configure

The app reads `window.DTB_CONFIG` at startup from `public/config.js`, which is
served as-is and is not bundled. This lets an operator edit configuration on a
deployed host without a rebuild.

```bash
cp public/config.template.js public/config.js
```

`public/config.js` is git-ignored. The committed template carries placeholder
values so the app reports "not configured" instead of attempting to initialise
Firebase and failing on every sign-in.

This file is sent to the browser in full. Never put a service-role key, admin
credential or private key in it. Firebase web config values are public
identifiers by design; access is enforced by `firestore.rules` and
`storage.rules`.

### API base URL

Resolution order, first usable value wins:

1. `VITE_DTB_API_URL` at build time
2. `api.baseUrl` in `public/config.js`
3. Same origin as the page, with port `8000` added on the Vite dev/preview ports

A loopback URL (`127.0.0.1`, `localhost`, `::1`) is rejected at runtime when the
page is not itself on loopback. The v1 build hardcoded
`http://127.0.0.1:8000`; on a handset that resolves to the handset, so every
request failed and the app looked permanently offline.

See `.env.example`.

### Run

```bash
npm run dev        # LAN-accessible, prints the URL a phone can open
```

`--host 0.0.0.0` is intentional: a phone on the same network needs to reach the
dev server, and the camera and geolocation APIs require a secure context.
`localhost` counts as secure; a plain-HTTP LAN address does not. For real handset
testing, serve over HTTPS (the Firebase Hosting config does this) or use a
tunnel.

### Test on a handset

1. `npm run dev` and note the `Network` URL.
2. Connect the phone to the same network.
3. Open the Network URL. Expect camera and geolocation permission prompts.
4. If the prompts are missing, the origin is not a secure context for this
   browser. Use HTTPS rather than relaxing browser settings.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server on all interfaces |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built output |
| `npm test` | Vitest suite |
| `npm run lint` | Parse every `src/` and `tools/` file |
| `npm run lint:css` | Report CSS classes used but not defined |
| `npm run verify` | lint + lint:css + test |

Backend tests:

```bash
python -m pytest backend -q
```

---

## Module map

| Module | Responsibility |
| --- | --- |
| `src/lib/image-quality.js` | Resolution, Rec. 601 luminance, discrete-Laplacian sharpness, contrast, shadow/highlight clipping. Produces a 0–100 score and an accept/reject decision. |
| `src/lib/guard.js` | Capture guard. Detects a contiguous reference-swatch region (192×128 downsample, RGB tolerance 62, largest 4-connected component, coverage and fill thresholds). Never sets an observation. |
| `src/lib/calibration.js` | sRGB → XYZ → CIE L\*a\*b\* (D65), ΔE76, reference-swatch von Kries gain transform, colour normalisation. |
| `src/lib/classifier.js` | Reaction ROI extraction, Lab profile matching, deterministic positive / negative / inconclusive decision, confidence clamped to 15–95%, reference-card intrusion check. |
| `src/lib/hash.js` | SHA-256 over the decoded image bytes, and client-side digest re-verification. |
| `src/lib/crypto.js` | ECDSA P-256 / SHA-256 key pair management, canonical payload serialisation, signing, tamper verification. |
| `src/lib/records.js` | Record schema v3, v1/v2 migration, localStorage persistence, dashboard aggregation, record-ID generation. |
| `src/lib/sync.js` | Sync readiness state machine and the upload loop. A record is never marked synced without a confirmed write. |
| `src/lib/evaluation.js` | Offline metrics (accuracy, precision, recall, F1, confusion matrix, rejection rate) computed only from explicitly labelled data. Contains no benchmark values. |
| `src/lib/demo.js` | Procedurally generated synthetic frames and a synthetic tamper demo. Demo records never leave the device. |
| `src/lib/pdf.js` | PDF export via jsPDF with a dependency-free single-page fallback, plus a plain-text privacy summary. |
| `src/lib/backend.js` | Client for the FastAPI validation service. Compares digests, classifies nothing. |
| `src/lib/firebase.js` | Optional Auth, Firestore write, Storage frame upload. |

## Classifier configuration

`CLASSIFIER_CONFIG` in `src/lib/classifier.js` is frozen and `Object.freeze`d:

| Setting | Value |
| --- | --- |
| `maxPositiveDeltaE` | 32.0 |
| `maxNegativeDeltaE` | 28.0 |
| `ambiguityMarginDeltaE` | 8.0 |
| `minConfidenceThreshold` | 50 |
| `minQualityScore` | 40 |
| `calibrationProvenance` | `NOMINAL_PRESET_V1` (requires empirical field-trial dataset) |

Confidence is hard-clamped to 15–95%; a presumptive field test is never reported
as certain. A black reference pad cannot be auto-matched, because near-black is
indistinguishable from shadow at the guard's tolerance.

---

## Validation API

`backend/` is an optional FastAPI service. It checks image quality and integrity
and nothing else.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness, version, and an explicit statement that it identifies no substances |
| `POST /api/validate` | Dimensions, format, byte length, a resolution judgement, and SHA-256 over the decoded bytes |

The response has no `result`, `validTestKit`, `verdict` or classification
field, and `identifies_substances` is always `false`. The v1 service hardcoded
`result: "inconclusive"` and `validTestKit: false` while the client labelled the
response an "AI POWERED" result; the route and the wording both changed.

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The digest returned by `/api/validate` is computed over the same bytes the
browser hashes, so a stored record's digest can be checked against the service
response. The client reports a mismatch rather than overwriting either value.

Pillow is used for size and format only, never for pixel interpretation.

### Cross-origin access

`DTB_ALLOWED_ORIGINS` takes a comma-separated list of explicit origins. Unset
means no cross-origin browser access, which is correct for same-origin hosting.
The v1 default was `allow_origins=["*"]`, which let any page on the internet
call the service from a visitor's browser.

### Limits

| Limit | Value |
| --- | --- |
| Maximum image size | 12 MB |
| Maximum decoded pixels | 50,000,000 |
| Request timeout (client) | 15 s |

---

## Deploying

```bash
npm run build
firebase deploy --only hosting,firestore:rules,storage
```

`firebase.json` is at the repository root and points at `dtb_modified/dist`.

### Security rules

`firestore.rules` and `storage.rules` are deny-by-default. Every collection
without an explicit rule is closed, and a record is readable and writable only
by the account that uploaded it. There is no list-all, export or cross-operator
read path. Storage frames live at `dtb/{uid}/{recordId}.jpg` and a write
requires the owning Firestore record to already exist.

**Rules are not enforced by the client SDK.** A database created in test mode is
world-writable and every record is readable by anyone who guesses the project
id. Deploy the rules before uploading a single real record.

```bash
firebase deploy --only firestore:rules,storage
```

---

## Testing notes

Measured on the frozen prototype: **147 frontend tests** across 12 vitest files,
plus **13 backend tests** (160 total), 29 files syntax-checked, 0 missing CSS
classes, production build successful.

- Coverage spans calibration, classification, image quality, crypto, records and
  migration, sync, PDF, guard, hashing, config resolution and offline metrics.
- `tests/firestore.rules.test.mjs` and `tests/storage.rules.test.mjs` exercise the
  security rules against the Firebase emulator and are not part of the default
  vitest run.
- `tests/fixtures/dataset.js` supplies procedurally generated labelled samples.
  There are no hard-coded accuracy figures anywhere in the codebase.
- The PDF tests parse the xref table and assert each offset points at a real
  object header. The v1 fallback measured offsets in UTF-8 bytes but wrote one
  byte per character, so every offset after a multi-byte character was wrong and
  the file would not open. Text is now folded to WinAnsi before assembly.
- The config tests cover the loopback rejection that caused the v1 handset
  failure, and the explicit-host case that a wrong precedence order broke.

## Layout

```
dtb_modified/
  index.html
  public/config.js          runtime configuration (git-ignored)
  public/config.template.js committed template with placeholders
  src/
    main.js                 entry, routing, capture and save flow
    config.js               API and Firebase resolution
    capture.js              camera, image import, GPS, observation modal
    lib/                    image-quality, guard, calibration, classifier,
                            hash, crypto, records, sync, pdf, evaluation,
                            demo, backend, firebase, dom, format, display, toast
    pages/                  dashboard, records, detail, system
    styles/main.css
  tests/                    vitest suites, Firebase rules suites, fixtures
  tools/                    syntax-check.mjs, css-check.mjs, css-audit.mjs
  backend/main.py           optional validation API
  firestore.rules
  storage.rules
```
