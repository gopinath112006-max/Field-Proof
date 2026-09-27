DTB — Drug Testing Buddy 2.0
===============================

WHAT IS NEW
-----------
- Vite project with package.json so `npm run dev` works.
- Real browser camera capture using getUserMedia.
- Rear-camera preference on supported phones.
- Capture / retake / import-image flow.
- Image SHA-256 integrity hash.
- Browser GPS capture when the user permits it.
- Firebase Authentication (Email/Password + Google).
- Firebase Storage upload for captured images.
- Firestore records for cloud persistence.
- Offline-first LocalStorage records and sync center.
- REST API integration: POST /api/analyze.
- FastAPI backend included under backend/.
- Responsive mobile/desktop UI and API/Firebase status panel.

RUN FRONTEND
------------
1. Open a terminal in this folder.
2. npm install
3. npm run dev
4. Open the localhost URL printed by Vite.

RUN API
-------
Open another terminal:
  cd backend
  py -m venv .venv
  .venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000

API:
  GET  http://127.0.0.1:8000/api/health
  POST http://127.0.0.1:8000/api/analyze

FIREBASE SETUP
--------------
The supplied Firebase web config is retained in config.js.
In Firebase Console enable:
- Authentication > Email/Password
- Authentication > Google
- Firestore Database
- Storage

Then add security rules appropriate for your project. Do not use Admin SDK secrets in the frontend.

CAMERA
------
Camera access normally requires localhost or HTTPS. On a phone, deploy the frontend to HTTPS (for example Firebase Hosting) for camera permission to work reliably.

IMPORTANT LIMITATION
--------------------
This project intentionally does NOT pretend that a generic image API can reliably identify illegal drugs. The included API validates the captured image and returns quality/metadata; the UI records the result as INCONCLUSIVE unless a validated, authorized analysis service is connected.

The application is a student prototype for digital field-record workflow. It is not a validated forensic instrument and does not replace laboratory confirmation.

FILES
-----
package.json
vite.config.js
index.html
style.css
script.js
config.js
backend/main.py
backend/requirements.txt
.env.example


## DTB Pro UI enhancement
- Added a professional 3D button treatment with hover/press depth.
- Fixed async camera/capture/result functions so the frontend JavaScript parses and runs correctly.


PREMIUM FIELDCHECK VISUAL LAYER
-------------------------------
The existing DTB content and workflows are preserved. The UI now includes:
- FieldCheck shield/test-tube logo on the front/login theme and browser favicon.
- Dark navy + electric blue glassmorphism palette.
- 3D tactile buttons with lift/press depth, bevel highlights and shadows.
- Master "3D + GLASS + UV + TILT" control.
- Mouse-following card tilt up to approximately ±5 degrees.
- Cool-spectrum UV/fluorescent visual accent (inspection aid only).
- Visual emergency siren beacon with optional Web Audio siren, OFF by default.
- Responsive touch-friendly controls.
- Reduced-motion support.

The UV/fluorescent visual layer is a display aid only. It does not identify controlled substances or replace validated laboratory confirmation.


## FieldCheck Command Dashboard — Enhanced UI

The dashboard now uses the supplied FieldCheck visual direction:
- Dark navy / electric-blue glassmorphism
- Professional 3D tactile buttons with hover lift and press depth
- Mouse-following card tilt (up to ±5°)
- Cyan scanning/camera visual treatment
- Restrained red/green/amber status colours
- Emergency siren beacon with optional sound, OFF by default
- FieldCheck shield/test-tube logo retained on the front/login theme
- Command-center dashboard with statistics, trend chart, result distribution, quick actions, camera panel, recent records, test types, analysis status, GPS/sync/guide widgets
- Responsive desktop/tablet/mobile layout
- Existing workflows, camera, records, reports, Firebase configuration and backend remain in the project
