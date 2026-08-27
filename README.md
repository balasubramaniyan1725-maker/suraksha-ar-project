# SURAKSHA-AR
### AR-Based Vocational Training Simulator for Industrial Safety in Jharkhand's Mining & Manufacturing Sector

A single-project (frontend + backend in the same repo, served by one process)
mobile-first AR safety training and certification platform for workers in
Jharkhand's mining, steel and mica sectors — no headset, runs on any
mid-range Android 10+ phone's browser (or wrapped as a WebView APK).

**⚠️ About the two files you uploaded:** `khatra-safety-simulator-v4-hackathon.zip`
and `files.zip` were two separate, unrelated hackathon prototypes (different
names, different architectures — one a client-only React app calling
Gemini/OpenAI directly, the other a real Flask+SQLite training/certification
API) that didn't share a data model and couldn't be wired together as-is.
This project is a fresh integration built on top of the Flask backend
(kept close to the original `files.zip` code, since it already matched the
problem statement well), with a new frontend written to actually consume it.

---

## What's implemented

- **AR training, camera-based, no headset**: `static/js/ar-engine.js` opens
  the phone's rear camera (`getUserMedia`) and overlays interactive
  HTML/CSS "hotspots", gesture sequences, checklists, and timed
  wayfinding directly on the live video, driven entirely by the
  `ar_scene_json` each module ships from the backend. This is
  screen-space/camera-anchored AR rather than a full ARCore SLAM pipeline
  — deliberately, so it runs on any phone with a browser and no native
  build step. Two full modules are wired end-to-end:
  1. **Fire & Explosion Response** — exit ID, extinguisher type check,
     PASS gesture sequence, timed wayfinding to muster point.
  2. **Gas Leak & Confined Space Protocol** — hazard-zone tagging, PPE
     selection, buddy-system checklist, timed emergency retrieval.
  A third module (**Machinery Guarding & LOTO**) is also seeded and
  playable, covering the "Machinery..." domain from the brief.
- **Assessment engine**: AR completion gates a scored quiz per module
  (`/api/assessment/...`), weighted scoring, pass threshold, auto-retry.
- **QR-based certificate generation & verification**: passing an
  assessment issues a certificate with a QR-embedded PNG card
  (`qr_util.py`, stdlib+Pillow+reportlab, no external QR service) and a
  public `/verify/<code>` page anyone can open (no login) to check
  validity/expiry — exactly what a site supervisor scanning a printed
  card needs.
- **Hindi & Santali localisation**: `static/js/i18n.js` — full English
  and Hindi UI strings; Santali (Ol Chiki script) covers the core
  navigation/action vocabulary as a genuine starting point. A few longer
  instructional strings fall back to Hindi where a verified Santali
  translation wasn't available for this prototype (flagged inline in the
  file) — call this out honestly to reviewers rather than papering over
  it with machine translation.
- **Offline functionality**: a service worker (`static/sw.js`) caches the
  app shell so the UI loads with no signal; `static/js/offline.js` lets a
  worker explicitly download module content (AR scenes + questions) to
  `localStorage` from Settings, and queues step-completion calls made
  while offline, syncing automatically when connectivity returns.
- **Web admin compliance dashboard**: `/admin` (key-protected, see below)
  — total workers, active/expired certificates, breakdowns by sector and
  by module, and a recent-certificates feed. No worker login required.
- **Single project, single command**: Flask (`backend/app.py`) serves
  both the JSON API (`/api/...`) and the frontend (`/`, `/verify/<code>`,
  `/admin`) from one process — see Run below.

## What's a deliberate hackathon-scope simplification (say this if asked)

- AR is 2D screen-space overlay anchored to the live camera feed, not a
  full 3D ARCore/SLAM plane-tracked pipeline. It satisfies "AR training
  overlaid on real surroundings via phone camera, no headset" from the
  brief and runs on any mid-range phone, but a production version could
  swap in ARCore behind the same `ar_scene_json` contract for real
  spatial anchoring, without touching the backend.
- The "APK" deliverable: this is a mobile-web PWA (installable via "Add
  to Home Screen", works offline, has a manifest + service worker). It is
  not yet compiled into a signed `.apk`. Wrapping it with Capacitor
  (`npx cap init`, point `webDir` at `backend/static` + `templates`, add
  `@capacitor/android`) is a short, mechanical next step if a literal APK
  file is required for submission — ask if you'd like that scaffolded too.
- Santali coverage is partial (see above) — flag this to judges rather
  than claim full localisation.
- Admin auth is a single shared key (`X-Admin-Key` header / prompt in the
  UI), not per-supervisor accounts — fine for a demo, not for production.

## Run it

```bash
cd backend
pip install -r requirements.txt
python3 app.py
```

Open `http://localhost:8000` on your phone (same Wi-Fi) or a desktop
browser (desktop browsers can't do `facingMode: environment`, so the AR
screen will show the "camera not available" fallback and still let you
tap through the training steps).

- Worker app: `http://localhost:8000/`
- Certificate verification (public, no login): `http://localhost:8000/verify/<CODE>`
- Admin compliance dashboard: `http://localhost:8000/admin` (default key: `admin123`,
  override with the `SURAKSHA_ADMIN_KEY` env var)

Set `SURAKSHA_BASE_URL` to your real deployed URL before generating
certificates in production, so the QR codes point somewhere reachable.

## Project layout

```
backend/
  app.py            # Flask app: API + serves the frontend
  db.py             # SQLite schema + seed data (3 modules, questions)
  auth.py           # password hashing, JWT issue/verify
  qr_util.py        # QR PNG + certificate card generation
  requirements.txt
  templates/index.html   # SPA shell
  static/
    css/style.css
    js/
      i18n.js         # en/hi/sat strings
      api.js          # backend API client
      offline.js      # offline cache + sync queue
      ar-engine.js     # camera + AR overlay renderer
      app.js           # hash router + all screens
    manifest.json, sw.js, icons
```

## Sectors & domains covered

Sectors: mining, steel, mica. Domains seeded: fire, gas, machinery — the
first three from the brief's five-domain list; the module data model
(`db.py: seed_modules`) is designed so adding domains 4 and 5 (Electrical
Safety, Mica Dust/Respiratory) is just two more `ar_scene_json` + question
entries, no backend or frontend code changes required.
