DTB Drug Testing Buddy - Functional Enhanced Build

IMPORTANT: This build does not pre-populate fake test records. Records are created only after the user captures/imports an image and completes the workflow.

Functional features:
- Real browser camera capture via getUserMedia
- Import image from device
- Retake and review captured image
- REST API POST /api/analyze for image validation/quality metadata
- SHA-256 image integrity hash
- GPS capture when browser permission is granted
- Firebase Authentication (Email/Password and Google)
- Firestore record storage when Firebase is configured
- Firebase Storage image upload when Firebase is configured and signed in
- Offline/local record storage
- Sync Center
- Real PDF generation/download using jsPDF
- Reports page with individual PDF export and Export All PDF
- Real clipboard copy for verification details
- No fake "PDF prepared" notification

Run frontend:
npm install
npm run dev

Run backend:
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

Camera access requires localhost or HTTPS in modern browsers.

The included API intentionally performs image validation/quality analysis only. It does not claim to identify controlled substances. Any presumptive field classification must be treated as non-laboratory output and confirmed by appropriate laboratory procedures.

DTB Pro UI: 3D glass buttons and field-operations visual enhancements.
