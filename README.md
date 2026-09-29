# FieldProof

## Digital Evidence Companion for Presumptive Field Testing

**Problem Statement ID:** 26231  
**Title:** Digital Companion for Field Drug Testing  
**Organization:** Ministry of Home Affairs — Narcotics Control Bureau (NCB)  
**Release Tag:** `v1.0.0-hackathon`  
**Automated Verification:** 160 passing tests (147 frontend, 13 backend), 0 failures

---

> [!IMPORTANT]
> **PRESUMPTIVE TESTING ONLY — LABORATORY CONFIRMATION REQUIRED**  
> FieldProof is a digital companion for field operators conducting presumptive colorimetric testing. It provides automated colorimetric interpretation and tamper-evident record keeping. **It does not perform definitive chemical identification and cannot replace laboratory confirmatory analysis (e.g., GC-MS / HPLC).**
>
> Current classifier color profiles and thresholds are **prototype engineering presets** (`NOMINAL_PRESET_V1`). They demonstrate the algorithmic verification pipeline and require empirical validation against physical test kits and spectrophotometric ground truth before operational deployment.

> [!NOTE]
> **Codebase Naming:** The in-application wordmark and npm package name remain `FieldCheck` / `dtb-fieldcheck` (e.g., `src/config.js` exports `config.appName = "FieldCheck"`). In accordance with the hackathon code freeze, internal code identifiers were left untouched to preserve verified functionality; the product presented is **FieldProof**.

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [The FieldProof Solution](#2-the-fieldproof-solution)
3. [End-to-End Operational Workflow](#3-end-to-end-operational-workflow)
4. [System Architecture](#4-system-architecture)
5. [Complete Module Map](#5-complete-module-map)
6. [Colorimetry & Scientific Algorithms](#6-colorimetry--scientific-algorithms)
   - [Pixel-Level Image Quality Gate](#61-pixel-level-image-quality-gate)
   - [In-Frame Reference Card Calibration](#62-in-frame-reference-card-calibration)
   - [Deterministic Colorimetric Classification](#63-deterministic-colorimetric-classification)
   - [Inconclusive Safety Guard & Intrusion Detection](#64-inconclusive-safety-guard--intrusion-detection)
7. [Cryptographic Integrity & Chain of Custody](#7-cryptographic-integrity--chain-of-custody)
   - [Dual SHA-256 Image Digests](#71-dual-sha-256-image-digests)
   - [ECDSA P-256 Canonical Signatures](#72-ecdsa-p-256-canonical-signatures)
   - [Live Tamper Detection](#73-live-tamper-detection)
   - [What Cryptographic Proofs Establish](#74-what-cryptographic-proofs-establish)
8. [Offline-First Operation & Persistence](#8-offline-first-operation--persistence)
9. [Optional Validation Service (FastAPI)](#9-optional-validation-service-fastapi)
10. [Developer Guide & Getting Started](#10-developer-guide--getting-started)
    - [Prerequisites & Installation](#101-prerequisites--installation)
    - [Runtime Configuration](#102-runtime-configuration)
    - [API Base URL Resolution](#103-api-base-url-resolution)
    - [Handset Testing Protocol](#104-handset-testing-protocol)
    - [Available Scripts](#105-available-scripts)
11. [Testing, Quality Assurance & Verification Matrix](#11-testing-quality-assurance--verification-matrix)
12. [Cloud Deployment & Security Rules](#12-cloud-deployment--security-rules)
13. [Limitations & Boundary Analysis](#13-limitations--boundary-analysis)
14. [Future Validation Roadmap](#14-future-validation-roadmap)
15. [Repository Directory Structure](#15-repository-directory-structure)
16. [Responsible Use & License](#16-responsible-use--license)

---

## 1. The Problem

Field officers conducting chemical spot tests on suspected narcotics encounter three critical operational vulnerabilities:

1. **Unverifiable Photographic Records:** Photos of test pouches stored in standard mobile camera rolls lack cryptographic integrity. They can be cropped, edited, filter-manipulated, or swapped without detection. There is no proof that an image matches the original scene.
2. **Loss of Context & Custody Data:** Field notes on paper or fragmented messaging apps lead to transcription errors. Crucial metadata—precise GPS location, capture timestamps, operator identity, and kit lot numbers—are frequently lost or decoupled from the sample image.
3. **High-Confidence Errors from Substandard Images:** Poor lighting, severe glare on plastic pouches, camera blur, or extreme underexposure alter perceived reagent colors. Unassisted human eyes or naive algorithms may commit to false positives or false negatives under poor optical conditions.

FieldProof specifically resolves the **evidence-handling and objective color-interpretation challenge**. It does not perform chemical substance identification, which remains the exclusive domain of forensic laboratories.

---

## 2. The FieldProof Solution

FieldProof converts a presumptive spot test into a **self-contained, tamper-evident, verifiable digital evidence package**:

- **Cryptographic Fingerprint:** The raw captured image bytes are hashed immediately on-device using **SHA-256**.
- **Objective Image Quality Gate:** A multi-factor computer vision gate scores exposure, sharpness, contrast, and resolution. Substandard frames are blocked from generating automated conclusive verdicts.
- **In-Frame Reference Calibration:** A physical color reference card placed inside the camera reticle allows the system to normalize ambient lighting using a per-channel **von Kries chromatic adaptation transform**.
- **Deterministic CIE L\*a\*b\* Classification:** Evaluates reaction color against explicit reference profiles using standard color-difference metrics ($\Delta E_{76}$). Returns strictly presumptive categories: **Presumptive Positive**, **Presumptive Negative**, or **Inconclusive**.
- **Independent Operator Record:** The operator's own physical reading (`positive`, `negative`, `unreadable`) is recorded under an explicit acknowledgement and stored in a separate, immutable field that machine automation can never overwrite.
- **Asymmetric Digital Signature:** A canonical JSON payload is signed using **ECDSA P-256 (secp256r1) with SHA-256**, binding image digest, GPS, timestamp, calibration metrics, and operator observations.
- **100% Offline Capability:** Operates fully without cellular or Wi-Fi network connectivity. Records are indexed locally in `localStorage` (Schema v3) and can generate structured PDF referral reports on-device.
- **Transparent Authenticity:** Any modification to record contents or image data causes immediate digital signature invalidation. Denied permissions (such as GPS) are recorded honestly as `"permission denied"` rather than fabricating placeholder data (`0,0`).

---

## 3. End-to-End Operational Workflow

```
[1. Device Camera / Demo Mode]
            │
            ▼
[2. Frame Test Kit & Reference Card]
            │
            ▼
[3. Pixel-Level Quality Gate] ──(Fails Quality)──► [Inconclusive / Retake Recommended]
            │ (Passes Quality)
            ▼
[4. Capture & SHA-256 Hashing]
            │
            ▼
[5. Reference Card Detection & von Kries Calibration]
            │
            ▼
[6. Reaction ROI Extraction & CIE L*a*b* ΔE76 Classification]
            │
            ▼
[7. Operator Records Physical Kit Reading & Signs Acknowledgement]
            │
            ▼
[8. Canonical Payload Assembly & ECDSA P-256 Digital Signing]
            │
            ▼
[9. Local Storage Persistence (Schema v3, Unsynced)]
            │
            ├──► [On-Device PDF Referral Export]
            │
            ▼ (When Cloud Connected)
[10. Owner-Scoped Firestore & Storage Synchronization]
```

1. **Authentication or Demo Mode:** Field operators sign in with credentials or launch Demo Mode (which uses synthetic local data and never uploads to external servers).
2. **Framing Kit & Card:** The operator positions the test pouch in the center reticle and the physical color reference card within the perimeter. The capture guard confirms reference swatch presence.
3. **Image Quality Gate:** Resolution, luminance distribution, contrast, and discrete-Laplacian sharpness are scored. If lighting or focus is inadequate, the system alerts the operator and marks any classification as Inconclusive.
4. **Frame Capture:** The exact raw image bytes are hashed via Web Crypto SHA-256 to create an immutable digital fingerprint.
5. **Color Calibration:** The detected reference swatch is measured against nominal values to derive per-channel von Kries gains, correcting for ambient color temperature.
6. **Automated Colorimetry:** The central reaction region of interest (ROI) is sampled, converted from sRGB to CIE L\*a\*b\*, and matched to reference profiles using $\Delta E_{76}$. If nearest profiles are ambiguous, the result safely falls back to **Inconclusive**.
7. **Operator Physical Reading:** The operator records their own visual observation of the physical test pouch and acknowledges the presumptive nature of the test.
8. **Cryptographic Signing:** The canonical record schema (14 sorted fields) is signed using the operator's private ECDSA P-256 key stored in browser hardware/storage.
9. **Offline Persistence:** The record is saved to local storage with status `unsynced`.
10. **Cloud Sync:** When network connectivity is available, the record synchronizes to owner-isolated Firestore and Firebase Storage collections.
11. **Referral Export:** A signed, tamper-evident PDF referral document is generated on-device for chain-of-custody transfer to forensic laboratories.

---

## 4. System Architecture

The FieldProof architecture separates client-side operational autonomy from optional server-side validation and secure cloud persistence:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIELDPROOF CLIENT (SPA)                         │
│  Vanilla ES Modules • Vite 7 • Zero UI Framework Overhead • Web Crypto  │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │    capture.js    │  │ image-quality.js │  │    calibration.js    │  │
│  │ Camera & Sensors │  │   Quality Gate   │  │ von Kries Gains/Lab  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│           │                     │                       │              │
│           ▼                     ▼                       ▼              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              classifier.js (Deterministic Heuristic)              │  │
│  │        CIE L*a*b* ΔE76 Profile Matching & Ambiguity Rejection    │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                      │
│           ┌─────────────────────┴─────────────────────┐                │
│           ▼                                           ▼                │
│  ┌──────────────────┐                       ┌──────────────────────┐   │
│  │   crypto.js      │                       │     records.js       │   │
│  │ ECDSA P-256 Sign │                       │ Schema v3 / Offline  │   │
│  └────────┬─────────┘                       └──────────┬───────────┘   │
└───────────┼────────────────────────────────────────────┼───────────────┘
            │                                            │
            ▼                                            ▼
┌────────────────────────┐                   ┌───────────────────────────┐
│ OPTIONAL VALIDATION    │                   │ SECURE FIREBASE CLOUD     │
│ SERVICE (FastAPI)      │                   │ Deny-by-Default Security   │
│                        │                   │                           │
│ • GET /api/health      │                   │ • Firestore: User-isolated│
│ • POST /api/validate   │                   │ • Storage: User-isolated  │
│ (Dual SHA-256 Check;   │                   │ • Zero cross-operator     │
│  Classifies Nothing)   │                   │   data visibility         │
└────────────────────────┘                   └───────────────────────────┘
```

### Technology Stack

| Layer | Component | Description |
| :--- | :--- | :--- |
| **Frontend Runtime** | Vanilla ES6+ JavaScript | No heavy framework (React/Vue/Angular) overhead; fast startup and predictable DOM execution |
| **Frontend Tooling** | Vite 7 | Modern asset bundling, development server with hot-reload |
| **Camera & Sensors** | Web APIs | `navigator.mediaDevices.getUserMedia`, `navigator.geolocation` |
| **Styling** | Vanilla CSS3 (`src/styles/main.css`) | Responsive, high-contrast field interface; audited for zero missing classes |
| **Client Cryptography**| Web Crypto API | Native browser implementation of SHA-256 hashing and ECDSA P-256 signatures |
| **Document Export** | jsPDF 4.x + Fallback Engine | Produces PDF/A-compliant referral documents on-device with custom binary table fallback |
| **Local Storage** | Web Storage API | Schema v3 records stored in `localStorage`, indexed and fully queryable offline |
| **Cloud Backend** | Firebase SDK v12 | Modular Firestore, Cloud Storage, and Authentication |
| **Validation API** | FastAPI / Python 3.11+ | Lightweight optional microservice for independent server-side digest calculation |

---

## 5. Complete Module Map

Every JavaScript module in `src/lib/` has a strictly defined, audited responsibility:

| Module | Primary Responsibility |
| :--- | :--- |
| `src/lib/image-quality.js` | Analyzes image frame pixels for resolution, Rec. 601 perceived luminance, discrete-Laplacian sharpness, Michelson contrast, and highlight/shadow clipping. Outputs a 0–100 score and quality gate decision. |
| `src/lib/guard.js` | Capture guard for reference card detection. Downsamples to $192 \times 128$, checks Euclidean RGB tolerance (62), identifies largest 4-connected components, and calculates frame coverage/fill ratios. Never alters or sets classification. |
| `src/lib/calibration.js` | Color space conversion pipeline ($\text{sRGB} \to \text{linear RGB} \to \text{CIE XYZ} \to \text{CIE L*a*b*}$ under D65 standard illuminant), $\Delta E_{76}$ distance calculations, and von Kries per-channel gain estimation. |
| `src/lib/classifier.js` | Reaction ROI extraction, outlier pixel filtering, profile matching against reference datasets, deterministic positive/negative/inconclusive decision, ambiguity rejection, confidence clamping (15%–95%), and card intrusion detection. |
| `src/lib/hash.js` | Generates SHA-256 digests over raw image bytes using Web Crypto; performs client-side digest re-verification. |
| `src/lib/crypto.js` | Manages ECDSA P-256 key pair generation, key derivation (`KEY-` public fingerprint), canonical 14-field JSON payload sorting, digital signing, and tamper detection verification. |
| `src/lib/records.js` | Implements Record Schema v3, backwards-compatible migration for legacy v1/v2 records, local persistence, record filtering/sorting, and dashboard aggregation. |
| `src/lib/sync.js` | State machine governing offline-to-online data sync. Ensures a record is never marked `synced` without verified cloud confirmation. |
| `src/lib/evaluation.js` | Implements evaluation metrics (accuracy, precision, recall, F1, confusion matrix, rejection rate) computed strictly from explicitly provided labelled data. Contains zero hardcoded benchmarks. |
| `src/lib/demo.js` | Generates procedural synthetic colorimetric frames for safe hackathon demonstrations (Demo Positive, Demo Negative, Demo Poor Quality, Demo Inconclusive, Live Tamper Mutation). |
| `src/lib/pdf.js` | Generates on-device PDF referral forms containing test parameters, cryptographic fingerprints, and presumptive disclaimers. Contains custom WinAnsi-encoded single-page fallback. |
| `src/lib/backend.js` | Client adapter for the optional FastAPI validation service. Submits base64 payloads to verify server-side digest match. Contains zero classification logic. |
| `src/lib/firebase.js` | Initializes modular Firebase Auth, Firestore queries, and Cloud Storage uploads. Enforces owner-isolation rules. |
| `src/lib/dom.js` | Safe DOM manipulation and element querying helpers. |
| `src/lib/format.js` | Formatting utilities for timestamps, GPS coordinates, byte counts, and hash strings. |
| `src/lib/display.js` | Status badge and visual indicator rendering for classification and integrity states. |
| `src/lib/toast.js` | Non-blocking user notification system for operational feedback. |

---

## 6. Colorimetry & Scientific Algorithms

### 6.1. Pixel-Level Image Quality Gate

Before any color extraction occurs, `src/lib/image-quality.js` evaluates the captured frame across five objective criteria:

1. **Resolution:** Minimum frame dimensions of $640 \times 480$.
2. **Exposure & Luminance:** Converted to Rec. 601 grayscale ($Y = 0.299R + 0.587G + 0.114B$). Rejects mean luminance $< 35$ (underexposed) or $> 225$ (overexposed).
3. **Clipping:** Rejects frames where more than 12% of pixels are blown highlights ($> 250$) or deep underexposed shadows ($< 10$).
4. **Sharpness:** Computes the variance of the discrete 2D Laplacian operator over the central region. Rejects blurred images below threshold.
5. **Contrast:** Evaluates standard deviation of luminance across the frame.

A frame failing the quality gate is automatically flagged `quality.passed = false` with an advisory notice (e.g., *"Lighting too low"*, *"High glare detected"*). Any subsequent classification is constrained to **Inconclusive / Retake Recommended**.

### 6.2. In-Frame Reference Card Calibration

To correct for fluctuating ambient illumination (direct sunlight, fluorescent tubes, incandescent bulbs):

- The physical reference card contains standard color swatches (orange, deep purple, pink, green, red, yellow, violet, blue).
- The capture guard (`src/lib/guard.js`) identifies the swatch region using connected-component analysis with an RGB tolerance of 62.
- The ratio between the observed mean RGB values and nominal reference RGB values yields a **von Kries diagonal gain matrix**:
  $$k_R = \frac{R_{\text{nominal}}}{R_{\text{observed}}}, \quad k_G = \frac{G_{\text{nominal}}}{G_{\text{observed}}}, \quad k_B = \frac{B_{\text{nominal}}}{B_{\text{observed}}}$$
- Gains are hard-clamped to $[0.5, 2.5]$ to prevent numeric instability from sensor clipping.
- **Why black is excluded:** Black or near-black swatches cannot be robustly distinguished from ambient shadows or unlit edges at wide camera angles. Black is deliberately excluded from automated detection.
- **Illumination Uniformity Assumption:** The calibration algorithm assumes approximately uniform lighting across the test pouch and reference card.

### 6.3. Deterministic Colorimetric Classification

`src/lib/classifier.js` implements an explainable, deterministic color-distance classifier:

1. **Reaction Region Extraction:** Extracts the central $30\% \times 30\%$ area of the pouch. Outlier pixels (glare reflections $R,G,B > 248$ and extreme edge shadows $< 15$) are discarded.
2. **von Kries Normalisation:** If a valid calibration swatch was detected, the diagonal gain transform is applied to the mean reaction RGB.
3. **Color Space Conversion:** Normalized RGB is converted to standard CIE L\*a\*b\* under D65 standard illuminant.
4. **Euclidean Color Difference ($\Delta E_{76}$):** Calculates distance to defined positive reaction profiles and negative reagent blank profiles:
   $$\Delta E^* = \sqrt{(\Delta L^*)^2 + (\Delta a^*)^2 + (\Delta b^*)^2}$$
5. **Decision Logic:**
   - If distance to nearest positive $\Delta E_{\text{pos}} > 32.0$ AND distance to nearest negative $\Delta E_{\text{neg}} > 28.0$: returns **Inconclusive** (out of gamut).
   - If $|\Delta E_{\text{pos}} - \Delta E_{\text{neg}}| < 8.0$: returns **Inconclusive** (ambiguity margin; near decision boundary).
   - If quality gate failed: demoted to **Inconclusive**.
   - Otherwise, the closer profile determines the result (**Presumptive Positive** or **Presumptive Negative**).
6. **Confidence Clamping:** Algorithmic confidence is scaled by profile proximity, calibration quality, and image quality score, and is **hard-clamped to 15%–95%**. A field presumptive test is never represented as 100% certain. Any result with calculated confidence below 50% is demoted to Inconclusive.

#### Frozen Classifier Configuration

`CLASSIFIER_CONFIG` in `src/lib/classifier.js` is deeply frozen with `Object.freeze`:

| Configuration Parameter | Value | Scientific Rationale |
| :--- | :--- | :--- |
| `maxPositiveDeltaE` | `32.0` | Maximum allowable distance to an authentic positive reagent chromophore profile |
| `maxNegativeDeltaE` | `28.0` | Maximum allowable distance to an unreacted reagent baseline profile |
| `ambiguityMarginDeltaE` | `8.0` | Ambiguity rejection zone; if positive and negative profiles are within 8 ΔE, classify as inconclusive |
| `minConfidenceThreshold` | `50%` | Results below 50% confidence cannot commit to a presumptive positive or negative |
| `minQualityScore` | `40` | Minimum image quality score required before automated classification can proceed |
| `confidenceClamp` | `[15%, 95%]` | Prevents false certainty; field spot tests must always reflect uncertainty |
| `calibrationProvenance` | `NOMINAL_PRESET_V1` | Explicit code identifier denoting prototype engineering parameters |

### 6.4. Inconclusive Safety Guard & Intrusion Detection

If the user frames the card incorrectly so that a colored swatch overlaps the reaction pouch reticle, naive averaging would misread the card as reagent color. 

FieldProof implements **Card Intrusion Protection**: if the reaction ROI color has an Euclidean RGB distance $< 18$ from the detected calibration card swatch, the classifier rejects the frame as **Inconclusive** with the message: *"Reference card detected inside reaction zone. Please reframe."*

---

## 7. Cryptographic Integrity & Chain of Custody

### 7.1. Dual SHA-256 Image Digests

- When an image is captured, the raw decoded binary buffer is hashed using `crypto.subtle.digest("SHA-256")`.
- When submitted to the optional FastAPI backend, the identical byte array is independently hashed using Python's `hashlib.sha256()`.
- The System Check interface compares both digests. If they match, it proves bit-for-bit parity between the browser representation and the server record.

### 7.2. ECDSA P-256 Canonical Signatures

To ensure non-repudiation and prevent post-capture tampering, each test record is digitally signed using **ECDSA P-256 with SHA-256**:

1. **Key Generation:** A cryptographic key pair is generated on-device via Web Crypto (`subtle.generateKey`). Keys are non-extractable from hardware storage where supported.
2. **Canonical Serialization:** To ensure signature reproducibility across different JSON encoders, a canonical payload of exactly 14 allow-listed fields is assembled with alphabetically sorted keys:
   ```json
   {
     "calibrated": true,
     "calibrationDeltaE": 4.12,
     "classifierConfidence": 82,
     "classifierVerdict": "positive",
     "deviceTimestamp": "2026-09-29T10:15:30.000Z",
     "gpsAccuracy": 5.4,
     "gpsLatitude": 28.6139,
     "gpsLongitude": 77.2090,
     "imageSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
     "operatorId": "NCB-DELHI-04",
     "operatorObservation": "positive",
     "qualityScore": 88,
     "recordId": "DTB-20260929-101530-DEL",
     "testKitType": "marquis"
   }
   ```
3. **Digital Signature:** The canonical string is converted to UTF-8 bytes and signed via `crypto.subtle.sign`.
4. **Key Identifier:** The record stores the public key in SPKI format along with a `KEY-` identifier computed from the first 16 hexadecimal characters of the public key's SHA-256 hash.

### 7.3. Live Tamper Detection

`src/lib/crypto.js` provides `verifyRecordSignature(record)`. During verification:
- The canonical JSON payload is reconstructed from the record fields.
- The stored SPKI public key is imported.
- The signature is verified against the reconstructed payload.

If any field is altered—even a single digit of GPS latitude, a timestamp second, or an operator observation—the verification function immediately flags the record as **`SIGNATURE INVALID`** and logs the specific field discrepancy. The application includes an interactive **Synthetic Tamper Demo** allowing evaluators to simulate record tampering and observe immediate detection.

### 7.4. What Cryptographic Proofs Establish

| Cryptographic Attribute | What It Proves | What It Does NOT Prove |
| :--- | :--- | :--- |
| **Image SHA-256 Digest** | Proves the stored or transmitted image matches the captured image bit-for-bit. | Does not prove the photographed pouch contained an authentic narcotic. |
| **ECDSA P-256 Signature** | Proves the record payload has not been modified since the key holder signed it. | Does not prove the legal identity of the operator unless the key is certified by an institutional PKI. |
| **Tamper Verification** | Detects any unauthorized modification to timestamps, location, or results. | Does not prevent an operator from deliberately misreading the physical kit during manual entry. |

---

## 8. Offline-First Operation & Persistence

Field officers frequently operate in remote areas, maritime borders, or basements without cellular connectivity. FieldProof is engineered from the ground up for **zero-network operation**:

- **No Remote Dependencies:** Camera capture, image analysis, quality gating, color calibration, classification, digital signing, and PDF generation execute 100% on the local device.
- **LocalStorage Schema v3:** All records are stored in browser `localStorage` under `dtbRecords`. The storage module automatically migrates legacy Schema v1/v2 records to Schema v3.
- **Sync State Machine:**
  - `offline`: Record created and signed locally; `synced = false`.
  - `pending`: Device has connectivity and is attempting cloud transmission.
  - `synced`: Cloud write acknowledged by Firestore; contains `syncedAt` timestamp.
  - `failed`: Cloud upload encountered an error; original local record remains intact with retry capability.
- **Truthful Data Handling:** If an operator denies GPS permission, the record stores `gps: null` and `gpsStatus: "permission denied"`. It never fabricates coordinates like `0,0`.

> [!NOTE]
> **PWA Limitation Notice:** FieldProof is a single-page application. For offline usage, the app must either be pre-loaded in the browser while connected, served from a local LAN gateway, or deployed locally. Once running, zero outbound network requests are made during testing.

---

## 9. Optional Validation Service (FastAPI)

Located in `dtb_modified/backend/`, this optional Python service provides independent server-side verification:

```
dtb_modified/backend/
  ├── main.py              # FastAPI application & endpoints
  ├── requirements.txt     # Python dependencies (fastapi, uvicorn, pillow, pydantic)
  └── test_main.py         # Pytest test suite (13 passing tests)
```

### Endpoints

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/health` | `GET` | Returns service status, version, and the explicit assertion: `identifies_substances: false`. |
| `/api/validate` | `POST` | Accepts a base64-encoded image, decodes dimensions, computes independent SHA-256 digest, and evaluates image byte size. |

### Strict Classification Policy

The backend service contains **no machine learning models, no substance database, and no classification logic**. Responses return:
```json
{
  "status": "valid",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "width": 1920,
  "height": 1080,
  "format": "JPEG",
  "byte_size": 245102,
  "identifies_substances": false
}
```
Pillow (`PIL.Image`) is used strictly for format verification and dimension extraction, never for color classification.

### Safety Limits & CORS

| Security Parameter | Enforced Limit |
| :--- | :--- |
| **Max Image Upload Size** | 12 Megabytes |
| **Max Decoded Pixels** | 50,000,000 pixels (decompression bomb protection via `Image.MAX_IMAGE_PIXELS`) |
| **Client Request Timeout** | 15 seconds |
| **CORS Origins** | Restricted via `DTB_ALLOWED_ORIGINS` environment variable (defaults to closed cross-origin access) |

---

## 10. Developer Guide & Getting Started

### 10.1. Prerequisites & Installation

- **Node.js:** Version 20.0.0 or higher
- **npm:** Version 10.0.0 or higher
- **Python:** Version 3.11 or higher (optional, for validation backend)

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/gopinath112006-max/Field-Proof.git
cd Field-Proof/dtb_modified
npm install
```

### 10.2. Runtime Configuration

FieldProof loads configuration dynamically at runtime from `public/config.js`. This allows production deployments to adjust API endpoints and Firebase project credentials without re-compiling the frontend bundle.

```bash
# Copy the committed template to create your local config
cp public/config.template.js public/config.js
```

> [!WARNING]
> `public/config.js` is ignored by git to protect private endpoints. Never put Firebase Admin private keys or service account credentials in `public/config.js`. Client Firebase keys are public identifiers; security is enforced exclusively by server-side Firestore and Storage security rules.

### 10.3. API Base URL Resolution

The frontend resolves the validation API URL in the following strict order of precedence:

1. Build-time environment variable `VITE_DTB_API_URL`
2. Runtime configuration property `window.DTB_CONFIG.api.baseUrl` in `public/config.js`
3. Same-origin fallback with port `8000` (when accessed via dev/preview server)

**Loopback Protection:** If the client is running on a physical mobile handset (e.g., `192.168.1.50`), any loopback URL (`127.0.0.1`, `localhost`) is automatically rejected at runtime to prevent mobile handsets from attempting to connect to themselves.

### 10.4. Handset Testing Protocol

Modern mobile browsers restrict camera (`getUserMedia`) and GPS access strictly to **Secure Contexts** (`https://` or `localhost`):

1. Launch Vite with host binding:
   ```bash
   npm run dev
   ```
2. Note the printed **Network URL** (e.g., `http://192.168.1.100:5173`).
3. To test camera and geolocation on a mobile handset:
   - Access via an HTTPS reverse proxy / tunnel (such as ngrok or cloudflare tunnel), OR
   - Connect the device via USB and use Chrome Port Forwarding (`chrome://inspect`) to map `localhost:5173` to the handset. This ensures the handset treats the connection as a Secure Context.

### 10.5. Available Scripts

All scripts are executed from within the `dtb_modified/` directory:

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server bound to `0.0.0.0` for LAN access |
| `npm run build` | Compiles production assets into `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm test` | Runs the Vitest automated test suite |
| `npm run lint` | Runs the AST syntax checker across all 29 JavaScript source files |
| `npm run lint:css` | Runs the CSS markup auditor to verify every referenced class exists |
| `npm run verify` | Master verification: runs `lint` + `lint:css` + `test` sequentially |

To run the optional Python validation backend:

```bash
cd dtb_modified/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

To run backend tests:

```bash
python -m pytest backend -q
```

---

## 11. Testing, Quality Assurance & Verification Matrix

The FieldProof repository is maintained under strict regression testing and automated code verification:

```bash
npm run verify
python -m pytest backend -q
npm run build
```

### Verified Test Matrix (160/160 Tests Passing)

| Verification Category | Suite / Tool | Tests / Files Checked | Status |
| :--- | :--- | :--- | :--- |
| **Frontend Unit & Integration** | Vitest (`tests/*.test.js`) | **147 tests** across 12 files | **PASS (0 failures)** |
| **Backend Validation API** | Pytest (`backend/test_main.py`) | **13 tests** | **PASS (0 failures)** |
| **Total Automated Tests** | All Suites Combined | **160 tests** | **100% PASS** |
| **JavaScript Syntax Check** | `tools/syntax-check.mjs` | **29 source files** | **PASS (0 errors)** |
| **CSS Markup Audit** | `tools/css-check.mjs` | **299 classes defined / 215 used** | **PASS (0 missing classes)** |
| **Production Build** | Vite 7 (`npm run build`) | **296 modules transformed** | **SUCCESSFUL** |

### Key Test Coverage Highlights

- **`tests/classifier.test.js` (16 tests):** Validates deterministic CIE L\*a\*b\* conversions, $\Delta E_{76}$ threshold boundary decisions, ambiguity margin rejection, and card intrusion safety fallbacks.
- **`tests/crypto.test.js` (15 tests):** Validates key pair generation, canonical JSON field sorting, signature creation, tamper detection on mutated coordinates, and public key SPKI export.
- **`tests/guard.test.js` (13 tests):** Validates reference card detection, downsampling ratios, 4-connected component labeling, and tolerance to varying lighting.
- **`tests/calibration.test.js` (12 tests):** Validates von Kries gain derivation, gain clamping $[0.5, 2.5]$, and color normalisation transforms.
- **`tests/hash.test.js` (12 tests):** Validates SHA-256 byte hashing and client-side digest re-verification.
- **`tests/records.test.js` (17 tests):** Validates Schema v3 data contracts, legacy v1/v2 schema migration, and localStorage querying.
- **`tests/pdf.test.js` (13 tests):** Validates PDF export, document structure, WinAnsi single-byte encoding alignment, and presumptive disclaimer presence.
- **`tests/image-quality.test.js` (7 tests):** Validates sharpness Laplacian variance, underexposure rejection, and glare clipping detection.
- **`tests/sync.test.js` (12 tests):** Validates state machine transitions and offline queueing.
- **`tests/config.test.js` (12 tests):** Validates URL precedence rules and mobile loopback rejection.

---

## 12. Cloud Deployment & Security Rules

FieldProof uses Firebase for optional cloud synchronization and backup. Security is enforced through strict, owner-scoped, deny-by-default rules:

```bash
# Build production assets and deploy hosting + rules
npm run build
firebase deploy --only hosting,firestore:rules,storage
```

### Firestore Security Policy (`firestore.rules`)

- **Deny by Default:** All collections without explicit rules are locked.
- **Owner Isolation:** Operators can only read and query records where `request.auth.uid == resource.data.userId`.
- **Validation on Write:** Creation or update requires matching `request.auth.uid == request.resource.data.userId`, validated Schema v3 fields, and valid timestamps.
- **Zero Cross-Operator Visibility:** No operator can view, enumerate, or export records belonging to another operator.

### Cloud Storage Security Policy (`storage.rules`)

- Images are stored at `dtb/{uid}/{recordId}.jpg`.
- Read and write access is restricted strictly to `request.auth.uid == uid`.
- Image writes require that an associated Firestore metadata document already exists and is owned by the same user.

---

## 13. Limitations & Boundary Analysis

FieldProof maintains an honest, scientifically grounded boundary regarding what it can and cannot achieve:

### What FieldProof Does NOT Do

1. **Does Not Identify Controlled Substances:** The system analyzes perceived reagent color. It does not perform chemical substance identification, molecular spectroscopy, or mass spectrometry.
2. **Does Not Replace Confirmatory Laboratories:** Presumptive spot tests are subject to known chemical cross-reactions. Confirmatory testing (GC-MS / HPLC) remains legally and scientifically mandatory before prosecution or adjudication.
3. **Does Not Claim Courtroom Chain of Custody:** The prototype demonstrates tamper-evident logging using browser-generated keys. It does not replace formal legal chain-of-custody protocols established by law enforcement agencies.
4. **Does Not Validate Uncontrolled Test Kits:** Color profiles are engineering presets (`NOMINAL_PRESET_V1`). They have not yet been calibrated against every commercial test kit manufacturer or reagent batch.
5. **Does Not Overwrite Operator Findings:** The machine classifier never replaces or alters the operator's recorded manual observation. Both are preserved side-by-side in the digital record.

### Known Technical Constraints

- **Single Reference Card Swatch:** Calibration derives a global diagonal von Kries gain based on a single reference swatch. It cannot correct for non-uniform lighting gradients across large test pouches.
- **Browser-Held Signing Keys:** ECDSA private keys are stored within the browser's local profile (`localStorage`). In this prototype, possession of the key demonstrates device continuity, not verified institutional officer identity.
- **No Direct Background Sync:** Because FieldProof operates as a client-side SPA without service worker registration, data sync occurs only when the operator opens the application with an active internet connection.

---

## 14. Future Validation Roadmap

To transition FieldProof from a hackathon prototype to an operationally deployable field instrument:

1. **Empirical Physical-Kit Calibration:** Construct an empirical dataset of physical test kits across varying reagent lots, shelf-life ages, and lighting temperatures, paired with ground-truth spectrophotometer measurements.
2. **Advanced Color Difference Modeling ($\Delta E_{2000}$):** Migrate profile matching from CIE $\Delta E_{76}$ to the perceptually uniform CIE $\Delta E_{2000}$ standard to improve sensitivity in dark purple and blue hues.
3. **Multi-Patch Reference Calibration:** Upgrade from single-swatch von Kries adaptation to full 24-patch Macbeth ColorChecker thin-plate spline or polynomial color correction.
4. **Hardware-Backed Cryptographic Identity:** Replace browser `localStorage` Web Crypto keys with FIDO2 / WebAuthn hardware tokens or mobile Secure Enclave keys backed by an institutional Public Key Infrastructure (PKI).
5. **RFC 3161 Trusted Timestamping:** Integrate an RFC 3161-compliant external Time Stamping Authority (TSA) to provide verifiable third-party proof of capture time independent of device clock settings.

---

## 15. Repository Directory Structure

```
Field-Proof/
├── README.md                      # Unified master documentation (this file)
├── firebase.json                  # Firebase hosting, firestore, and storage rules configuration
├── dtb_modified/                  # Core application root
│   ├── index.html                 # Application entry point and UI shell
│   ├── package.json               # NPM scripts, dependencies (Vite, Vitest, jsPDF)
│   ├── vite.config.js             # Vite configuration with 0.0.0.0 host binding
│   ├── firestore.rules            # Deny-by-default, owner-isolated Firestore rules
│   ├── storage.rules              # Deny-by-default, owner-isolated Cloud Storage rules
│   ├── public/
│   │   ├── config.template.js     # Committed runtime configuration template
│   │   └── config.js              # Active runtime configuration (git-ignored)
│   ├── src/
│   │   ├── main.js                # App bootstrap, view router, capture & save workflows
│   │   ├── capture.js             # Camera feed, canvas frame acquisition, GPS handler
│   │   ├── config.js              # Runtime configuration resolution engine
│   │   ├── lib/
│   │   │   ├── image-quality.js   # Laplacian sharpness, luminance, clipping gate
│   │   │   ├── guard.js           # Capture guard for reference card detection
│   │   │   ├── calibration.js     # sRGB/XYZ/Lab conversion & von Kries gain adaptation
│   │   │   ├── classifier.js      # Deterministic ΔE76 color classifier & safety thresholds
│   │   │   ├── hash.js            # Web Crypto SHA-256 image hashing & digest checks
│   │   │   ├── crypto.js          # ECDSA P-256 signing, canonical JSON & tamper detection
│   │   │   ├── records.js         # Schema v3 persistence, migration, filtering & metrics
│   │   │   ├── sync.js            # Offline/online cloud synchronization state machine
│   │   │   ├── evaluation.js      # Evaluation metrics (accuracy, precision, recall, F1)
│   │   │   ├── demo.js            # Synthetic demo frames & live tamper mutation demo
│   │   │   ├── pdf.js             # jsPDF export with WinAnsi table fallback
│   │   │   ├── backend.js         # Client adapter for FastAPI validation service
│   │   │   ├── firebase.js        # Firebase Auth, Firestore, and Storage integration
│   │   │   ├── dom.js             # DOM manipulation helpers
│   │   │   ├── format.js          # Coordinate, timestamp, and hash formatters
│   │   │   ├── display.js         # Badge rendering and status pills
│   │   │   └── toast.js           # Operator toast notifications
│   │   ├── pages/
│   │   │   ├── dashboard.js       # Main operator dashboard and statistics
│   │   │   ├── records.js         # Searchable, filterable test record log
│   │   │   ├── detail.js          # Detailed record view, signature audit, PDF export
│   │   │   └── system.js          # System diagnostic check, digest audit & camera tests
│   │   └── styles/
│   │       └── main.css           # Hand-written CSS stylesheet (audited, 0 missing classes)
│   ├── backend/
│   │   ├── main.py                # FastAPI validation service (SHA-256 & dimensions only)
│   │   ├── requirements.txt       # Backend dependencies (fastapi, uvicorn, pillow, pydantic)
│   │   └── test_main.py           # Pytest test suite for validation backend
│   ├── tests/                     # Vitest test suites (147 tests across 12 files)
│   └── tools/                     # Code audit tools (syntax-check.mjs, css-check.mjs)
```

---

## 16. Responsible Use & License

This prototype is provided strictly for academic research, technological evaluation, and evidence-handling demonstration under Hackathon Problem Statement 26231. 

**Legal & Operational Notice:** This software is not certified as an evidential breathalyzer, forensic laboratory instrument, or diagnostic medical device. It must **never** be used as the sole basis to arrest, detain, charge, or penalize individuals. All positive presumptive readings require confirmatory analysis by an accredited forensic science laboratory.
