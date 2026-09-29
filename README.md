# FieldProof

## Digital Evidence Companion for Presumptive Field Testing

> **FieldProof provides presumptive field-test interpretation. It does not provide
> definitive controlled-substance identification and does not replace laboratory
> confirmation.**
>
> Current classifier profiles and thresholds are **prototype engineering presets**
> (`NOMINAL_PRESET_V1`) that require empirical physical-kit validation before any
> operational use.

FieldProof is a frozen hackathon prototype. It is **not** an "AI drug detector".
There is no trained model, no reference substance database, and no inference of
identity. The system performs deterministic colorimetry, image-quality gating and
cryptographic integrity recording, and it labels every result as presumptive.

> **Naming note.** The in-application wordmark and npm package name are still
> `FieldCheck` / `dtb-fieldcheck` (for example `src/config.js` exports
> `config.appName = "FieldCheck"`). Renaming them was out of scope for repository
> preparation to avoid touching working code; the product presented here is
> FieldProof.

---

## 1. Problem

A field operator running a presumptive colorimetric test in the field faces three
recurring problems:

1. **The reading is unverifiable.** A photo of a test kit stored in a phone
   gallery is indistinguishable from an edited one. There is no digest, no
   signature, and no way to tell afterwards whether a record was altered.
2. **The reading is often not recorded at all.** Paper notes get transcribed,
   transcribed again, and lose their chain of context. GPS, time and kit
   conditions are frequently lost.
3. **Poor images produce confident wrong answers.** A blurry, dark or
   glare-blown frame looks the same as a good one, and an unqualified reader will
   still commit to a call.

FieldProof addresses the *evidence-handling* problem. It does not — and cannot —
address chemical identification, which is a laboratory function.

## 2. Solution

FieldProof turns a field test into a **self-consistent, tamper-evident record**:

- the captured frame is fingerprinted with **SHA-256**;
- the frame is gated by a **pixel-level image-quality check**;
- the observed reaction colour is **calibrated** against a physical reference
  colour card;
- the calibrated colour is matched to **reference colour profiles** in CIE L\*a\*b\*
  and reported as **presumptive positive / presumptive negative / inconclusive**;
- the record is **signed with ECDSA P-256 / SHA-256** over a canonical JSON payload;
- the operator's own reading of the physical kit is stored **separately and is
  never overwritten** by the automated layer;
- everything works with **no network**, and PDF referral records can be exported
  on-device.

Missing data is reported as missing. A denied GPS permission reads as
"permission denied", not as `0,0`.

## 3. Core workflow

1. **Sign in or run in Demo mode.** Demo mode is fully synthetic and never
   uploads.
2. **Frame the kit.** The operator places the reference colour card in the
   perimeter of the reticle and the test pouch in the centre. The **capture
   guard** (`src/lib/guard.js`) confirms that a contiguous reference-swatch
   region is present in the frame.
3. **Quality gate** (`src/lib/image-quality.js`). Resolution, exposure,
   sharpness and contrast are scored. A frame that fails the gate cannot produce
   a conclusive classification — the result is *Inconclusive / retake
   recommended*.
4. **Capture.** The frame bytes are hashed with SHA-256.
5. **Calibrate** (`src/lib/calibration.js`). The detected reference swatch is
   used to derive a per-channel **von Kries** gain transform that normalises the
   frame's illumination.
6. **Classify** (`src/lib/classifier.js`). The central reaction region is
   averaged, converted to Lab, and compared to positive and negative reference
   profiles with **ΔE76**. The nearer profile wins, subject to limits and an
   ambiguity margin.
7. **Record the operator's own reading.** The operator answers *"what does the
   kit show?"* — `positive`, `negative`, or `unreadable` — and must tick an
   acknowledgement that this is their own reading of a physical kit, not a
   laboratory result.
8. **Sign** (`src/lib/crypto.js`). A canonical JSON payload is serialised with
   sorted keys and signed with the operator's local ECDSA P-256 key.
9. **Store locally.** The record is written to `localStorage` and marked
   unsynced.
10. **Sync when online.** Only after a confirmed cloud write is a record marked
    `synced`.
11. **Export.** A PDF referral record is generated on-device, carrying the
    presumptive disclaimer.

## 4. Technical architecture

Everything below exists in this repository. No dependency is invented.

### Frontend — Vanilla JavaScript / CSS / DOM, built with Vite

| Concern | Implementation |
| --- | --- |
| Language | Vanilla ES modules, no framework |
| Build | Vite 7 (`vite build`) |
| Camera | `getUserMedia` via `src/capture.js` |
| Styling | Hand-written CSS, `src/styles/main.css` |
| Runtime config | `public/config.js`, served unbundled so a deployed host can be reconfigured without a rebuild |
| PDF | jsPDF 4, with a dependency-free single-page fallback in `src/lib/pdf.js` |
| Cloud | Firebase modular SDK v12 (Firestore, Storage, Auth) |

### Backend — FastAPI, Pillow, Pydantic

`dtb_modified/backend/main.py` exposes exactly two routes:

- `GET /api/health` — service identity and capabilities.
- `POST /api/validate` — decodes the base64 image and returns **image dimensions,
  a quality bucket and the server-side SHA-256 digest** of the same bytes the
  browser hashed.

The backend **classifies nothing**. It has no model and no reference database,
and every response carries `identifies_substances: false`. Pillow is used for
size and format only, never for pixel interpretation. Cross-origin browser access
is disabled unless `DTB_ALLOWED_ORIGINS` is set explicitly.

`dtb_modified/src/lib/backend.js` compares the server digest with the local
digest and surfaces the result on the System Check page.

### Security rules — deny by default

`firestore.rules` and `storage.rules` are owner-scoped with a catch-all deny:

- Firestore: read only your own records; create/update require a well-formed
  record and `data.userId == request.auth.uid`.
- Storage: `dtb/{uid}/{recordId}.jpg`, read only by the owner, and the Firestore
  document must already exist and belong to the same uid.
- No wildcard allow, no cross-operator list or export path.

## 5. Colorimetric classification

`src/lib/classifier.js` is a **deterministic colorimetric heuristic**. It contains
no learned parameters, no training data and no inference.

Pipeline:

1. **Reaction ROI** — the central 30% × 30% box of the frame (35%–65% on each
   axis) is averaged, skipping transparent pixels, blown specular highlights
   (`r,g,b > 248`) and deep edge shadow (`< 15`).
2. **Normalisation** — the frame is corrected by the calibration transform, if
   one is available.
3. **Lab conversion** — sRGB → linear → XYZ (D65) → CIE L\*a\*b\*, in
   `src/lib/calibration.js`.
4. **Profile matching** — nearest positive profile and nearest negative profile
   by **ΔE76** (`ΔE* = √(ΔL² + Δa² + Δb²)`).
5. **Decision** —
   - outside both distance limits → **Inconclusive**;
   - the two distances differ by less than the ambiguity margin (ΔE 8.0) →
     **Inconclusive** (decision-boundary rejection);
   - otherwise the nearer profile within its limit wins.
6. **Confidence** — derived from the separation margin and profile fit, then
   scaled by calibration state and image-quality score, and **hard-clamped to
   15%–95%**. A presumptive field test is never reported as certain. Anything
   below the 50% operational threshold is demoted to Inconclusive.

Reference profiles are grouped as **positive reactions** (cobalt/blue, deep
violet, crimson red, dark purple-black) and **negative / unreacted baselines**
(amber, clear, pale straw, neutral solvent).

Reference-card intrusion is detected: if the mean reaction colour is within RGB
distance 18 of the detected swatch, the result is rejected as *Inconclusive*
with a framing correction message.

Every classification carries the string:

> Presumptive field-test result only. Laboratory confirmatory testing is
> required before reliance or legal action.

## 6. Reference calibration

`src/lib/calibration.js` and `src/lib/guard.js` implement calibration against a
physical colour card.

- Eight reference swatches are defined (orange, deep purple, pink, green, red,
  yellow, violet, blue).
- The **guard** downscales to 192 × 128, classifies each pixel against the
  swatch list with a Euclidean RGB tolerance of 62, and keeps the largest
  4-connected component per swatch. A match requires coverage ≥ 0.06 of the
  frame and a bounding-box fill ≥ 0.35.
- The matched swatch's observed versus nominal RGB yields a **von Kries**
  per-channel gain transform, each channel clamped to 0.5–2.5, plus a mean ΔE.
- The transform is applied to the reaction colour before classification. An
  uncalibrated frame is still classified, at a 15% confidence penalty, and is
  reported as `uncalibrated`.
- Illumination notes are raised when the channel gains are skewed or the residual
  ΔE exceeds 15.

**Black is deliberately not a reference swatch.** Near-black is indistinguishable
from shadow and unlit frame edges at this tolerance, so a black pad cannot be
auto-matched. The frame is still recorded; the guard simply reports no match.

Calibration assumes **approximately uniform illumination** across the frame.

## 7. Cryptographic integrity

`src/lib/hash.js` and `src/lib/crypto.js`.

- **Image digest** — SHA-256 over the decoded image bytes via
  `crypto.subtle.digest`. The same bytes are hashed independently by the backend
  with `hashlib.sha256`; the System Check compares the two. This makes *"this
  image is the image that was recorded"* a checkable claim rather than a label.
- **Signature** — **ECDSA P-256 (secp256r1) with SHA-256**, via Web Crypto.
- **Canonical payload** — a fixed 14-field allow-list, serialised to JSON with
  deterministically sorted keys, so the signed bytes are reproducible.
- **Key identity** — a `KEY-` identifier derived from the first 16 hex characters
  of the SHA-256 of the SPKI public key; the public key travels with the record.
- **Tamper verification** — `verifyRecordSignature()` re-serialises the canonical
  payload from the stored record and verifies the signature, reporting
  `VERIFIED`, `SIGNATURE INVALID` or `UNSIGNED`.
- The app includes a **synthetic tamper demo** that mutates a signed field so the
  failure path is visible without touching real evidence.

**What the signature proves.** It proves possession of the local signing key and
detects alteration of signed record content. It does **not** establish
organisational or personal identity — the key pair is generated in the browser
and held in that browser's `localStorage`.

## 8. Offline operation

- Capture, quality gating, calibration, classification, signing, local storage
  and PDF export all run on the device with no network.
- Records live in `localStorage` (`dtbRecords`, schema v3) and are searchable and
  filterable by test ID, date, location, operator, observation and integrity
  status.
- A record is marked `synced` **only** after its cloud write resolves. Failed
  writes stay pending and are reported with a reason.
- Missing data is never invented. A denied camera or geolocation permission is
  reported as denied.

**Honest limitation:** there is no service worker and no web app manifest. The
SPA must be loaded — served on a local network, installed, or already open — for
the offline workflow to be available. What is guaranteed is that the *evidence
path* never requires connectivity once the app is running.

## 9. Testing

```
npm run verify      # lint (syntax) + CSS/markup audit + vitest
npm run build       # production Vite build
python -m pytest    # backend
```

Measured on the frozen prototype:

| Check | Result |
| --- | --- |
| Frontend tests (vitest) | **147 passed** / 12 files |
| Backend tests (pytest) | **13 passed** |
| Total | **160** |
| Syntax check | **29 files OK** |
| CSS/markup audit | **0 missing classes** (299 defined / 215 used) |
| Production build | **successful** (296 modules) |

The frontend suite covers calibration, classification, image quality,
cryptography, records/migration, sync, PDF, guard, hashing, config and offline
metrics. Firestore and Storage rule behaviour is covered by
`tests/firestore.rules.test.mjs` and `tests/storage.rules.test.mjs`, which run
against the Firebase emulator rather than in the default vitest run.

`src/lib/evaluation.js` computes accuracy, precision, recall, F1, confusion
matrix and rejection rate **only from explicitly labelled data**. It contains no
pre-filled benchmark numbers, and none are published here.

## 10. Limitations

FieldProof does **not**:

- identify controlled substances, or infer an observation the operator did not
  make;
- confirm a substance, or replace confirmatory laboratory analysis;
- claim forensic standing, legal admissibility, or full chain of custody;
- provide scientifically validated field thresholds;
- establish organisational identity from a locally held browser signing key;
- work with a black reference pad, or calibrate non-uniform illumination.

Additional known limits:

- Current reference profiles and thresholds are **prototype engineering presets**
  (`NOMINAL_PRESET_V1`) chosen to be defensible on paper, not to be accurate
  against a physical kit. They require empirical spectrophotometer and
  field-trial validation before use.
- Accuracy depends entirely on the reference card, the lighting and the camera.
  The classifier reports its own confidence but that confidence is an
  engineering heuristic, not a calibrated probability.
- The signing key lives in `localStorage` and is recoverable by anyone with
  access to the device's browser profile.
- The prototype is a single-browser application. Multi-operator review, key
  escrow and PKI are out of scope.

## 11. Future validation

1. Build a labelled physical-kit dataset across the real kits, reagent lots and
   lighting conditions, with spectrophotometer ground truth.
2. Replace `NOMINAL_PRESET_V1` profiles and the ΔE76 limits with values fitted
   to that data, and publish the fit and its error bars.
3. Consider ΔE2000 and a learned-but-inspectable illuminant estimation stage.
4. Replace the local browser key with an organisational credential — enrolment
   against a CA-issued certificate, or a hardware-backed key, so a signature
   carries identity rather than possession.
5. Move records to an append-only store with server-side timestamping so the
   record, not the client, is the authority on time and sequence.
6. Run a prospective field trial against a partner laboratory to measure
   presumptive-to-confirmed agreement.

## 12. Hackathon status

This repository is a **frozen hackathon prototype**, tagged
`v1.0.0-hackathon`. It is a working, tested, buildable demonstration of the
evidence-handling concept.

It is **not** a validated instrument, and it is not fit for operational,
evidentiary or enforcement use. Every positive result is presumptive and requires
laboratory confirmation.

---

## Repository layout

```
README.md                     this file
firebase.json                 Firebase Hosting / Firestore / Storage / Functions config
dtb_modified/                 the application
  index.html                  app shell
  public/config.template.js   runtime-config template (real config.js is git-ignored)
  src/capture.js              camera capture
  src/config.js               runtime config resolution
  src/lib/                    image-quality, calibration, guard, classifier,
                              hash, crypto, records, sync, pdf, evaluation, demo
  src/pages/                  dashboard, records, detail, system
  src/styles/main.css         stylesheet
  tests/                      vitest suites + Firebase rules suites + fixtures
  tools/                      syntax-check, css-check, css-audit
  backend/                    FastAPI validation service + pytest suite
  firestore.rules             deny-by-default, owner-scoped
  storage.rules               deny-by-default, owner-scoped
```

## Running it

```bash
cd dtb_modified
npm install
npm run dev            # Vite dev server
npm run verify         # lint + CSS audit + tests
npm run build          # production build to dist/
```

Backend, optional:

```bash
cd dtb_modified/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Configuration:

- `cp public/config.template.js public/config.js` and fill in your Firebase web
  config. `public/config.js` is **git-ignored** — the committed template contains
  only placeholders.
- `public/config.js` is served to the browser in full. Never place a service-role
  key, admin credential or private key in it. Firebase web config values are
  public identifiers by design; access is enforced by `firestore.rules` and
  `storage.rules`, not by hiding the file.
- Deploy the rules before uploading any real record:
  `firebase deploy --only firestore:rules,storage`.

## Licence and responsible use

This prototype is provided for safety, harm-reduction and evidence-integrity
research. Do not use it to accuse, detain, confiscate or adjudicate. Positive
readings are presumptive; only a laboratory can confirm.
