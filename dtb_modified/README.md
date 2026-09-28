# FieldCheck

Capture, verify and record field-test evidence.

**FieldCheck does not identify controlled substances.** It has no substance
model, no reference database and no image classification. What a record contains
is an operator's observation of a physical colorimetric test kit, read by eye.
Presumptive drug classification requires confirmatory laboratory analysis.

---

## What it does

- Captures a frame with the device camera, or imports an existing image.
- Hashes the captured bytes with SHA-256. The digest is recomputable later, so
  "this image is the image that was recorded" is a checkable claim rather than a
  label.
- Records the operator's reading of the kit: `positive`, `negative`, or
  `unreadable`. Nothing else infers it.
- Captures GPS and accuracy when the operator grants permission, and says
  "permission denied" rather than storing a fabricated `0,0`.
- Compares the frame's dominant colour against a reference swatch to help the
  operator aim the camera. This is a framing aid only; it never writes or
  influences the observation.
- Works offline. Records live in `localStorage` until the operator signs in and
  syncs, and a record is marked synced only after the cloud write is
  acknowledged.
- Exports a PDF that states plainly that it records an operator observation and
  not a laboratory result.

## What it does not do

- Identify a substance, or infer an observation the operator did not make.
- Claim forensic standing, chain of custody, tamper evidence, or a signature.
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
read path.

**Rules are not enforced by the client SDK.** A database created in test mode is
world-writable and every record is readable by anyone who guesses the project
id. Deploy the rules before uploading a single real record.

```bash
firebase deploy --only firestore:rules,storage
```

---

## Testing notes

- 82 tests across records, guard, hashing, sync, formatting, PDF and config
  resolution, plus 13 backend tests.
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
  src/
    main.js                 entry, routing, capture and save flow
    config.js               API and Firebase resolution
    capture.js              camera, image import, GPS, observation modal
    lib/                    records, hash, guard, sync, display, pdf,
                            backend, firebase, dom, format
    pages/                  dashboard, records
    styles/main.css
  tests/
  backend/main.py           optional validation API
  firestore.rules
  storage.rules
```
