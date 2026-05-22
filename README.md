# Keg Scanner

AI-powered beer keg tracking web app. Scan keg labels with your phone camera, extract Lot Number / Best Before Date / Brand via OCR, and export scanned sessions to CSV.

**Pure static web app — no server, no install, works in any modern browser.**

---

## Features

- Keg / Bottle type selector on landing page (Bottle coming soon)
- Live camera scan with guide box (crops to label area automatically)
- Smart OCR extraction — no AI API needed by default
- Optional Google Gemini AI for enhanced extraction
- Editable fields with confidence indicators
- Duplicate keg detection
- Per-truck session management with keg counter + progress ring
- CSV export per truck
- Heineken brand colour scheme (green + red)

---

## Default Brands

`TIGER` `BAWDAR` `HEINEKEN` `ABC`

Manage brands via ⚙ Settings → Manage Lists.

---

## Keg Label Format (Printed Dot-Matrix Ink)

The app reads exactly **3 lines of machine-printed dot-matrix ink** on the keg:

```
Line 1:  L6069104 (08:15)   ← Lot Number  (L + 7 digits — timestamp in parens ignored)
Line 2:  10 SEP 2026        ← Best Before (DD MON YYYY)
Line 3:  BAWDAR E           ← Brand       (extra text after brand is ignored)
```

Two print styles are supported:
- **Bold** — dark/heavy ink on silver metallic keg
- **Thin** — lighter ink on green or silver metallic keg

Line 1 may include a timestamp like `(08:15)` — only L + 7 digits is extracted.  
Line 3 may have extra letters/text after the brand — only the predefined brand is extracted.

Aim the guide box directly at the printed label text.

---

## Do I Need a Gemini API Key?

**No.** The app works fully offline using regex-based extraction:

- Lot Number: detects `L` + 7 digits with automatic OCR-error correction (0↔O, 1↔I, 5↔S, 8↔B)
- Date: detects `DD MON YYYY` pattern with month-name OCR fixes
- Brand: exact match from predefined list only

**With a key** (free tier available): Gemini AI adds an extra accuracy pass for ambiguous captures. Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey), then tap ⚙ → 🔑 API Key in the app.

---

## Running Locally (Testing)

**VS Code Live Server (easiest — no install needed):**
1. Install the "Live Server" extension by Ritwick Dey in VS Code
2. Right-click `index.html` → **Open with Live Server**
3. Opens at `http://127.0.0.1:5500` — camera works on this URL

**Python (if installed):**
```bash
python -m http.server 8080
# or on some Windows setups:
py -m http.server 8080
```
Then open `http://localhost:8080`

> Note: opening `index.html` directly as a `file://` URL will work for everything except the camera (browsers require HTTPS or localhost for camera access).

---

## PaddleOCR Local Server (Better Accuracy)

When the app runs on localhost, it automatically uses a local PaddleOCR server for significantly better text recognition on keg labels. Tesseract is used as fallback if the server is not running.

**Setup (one time):**
```bash
pip install -r requirements.txt
# First install may download ~50 MB of PaddleOCR models
```

**Start the server (each session, before opening the app):**
```bash
python ocr_server.py
```

The server runs at `http://localhost:5001`. Keep this terminal open while scanning.

**How it works:**
- The app pings the configured PaddleOCR URL automatically before each scan
- If the server responds, all scans are sent to PaddleOCR (much better at dot-matrix fonts)
- If the server is not running or unreachable, the app falls back to Tesseract

**Using PaddleOCR from GitHub Pages (via ngrok):**
1. Start your PaddleOCR server locally: `python ocr_server.py`
2. Install and run ngrok: `ngrok http 8000` (or whichever port your server uses)
3. Copy the `https://xxxx.ngrok-free.dev` URL from ngrok output
4. In the app: tap ⚙ Settings → OCR Server Address → paste the ngrok URL → Save
5. PaddleOCR is now active — the debug panel will show `Engine: paddle`

---

## Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push all files:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. Go to **Settings → Pages → Branch: main → / (root) → Save**
4. Your app is live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`

---

## Local Use

Open `index.html` directly in Chrome/Edge (camera requires HTTPS or localhost).

To run a local server:
```bash
npx serve .
```
Then open `http://localhost:3000`.

---

## Browser Requirements

- Chrome, Edge, or Safari (iOS 14.3+)
- Camera permission must be granted
- JavaScript enabled
- Works on desktop and mobile

---

## Changelog

| Version | Changes |
|---------|---------|
| v14 | Added OpenAI GPT-4.1 Mini and Google Cloud Vision OCR as selectable engines (engine bar pills: GPT-4.1, GCV). API keys stored in OCR Settings. Configurable Gemini endpoint URL for custom gateways. Mobile UX overhaul: `viewport-fit=cover` + `env(safe-area-inset-bottom)` on FAB/footer/toast so buttons are no longer hidden behind iPhone home bar; sticky Submit footer; `100dvh` layout; 44 px min touch targets; modal max-height with scroll. |
| v13 | SharePoint integration: "Submit & Complete" uploads session data to `heiway.sharepoint.com` (DataP library) via Microsoft Graph API with Azure AD SSO (MSAL.js). Credentials hardcoded; no user config required. PaddleOCR ngrok fix: added `ngrok-skip-browser-warning` header so GitHub Pages can reach a ngrok-tunnelled PaddleOCR server. Ping timeout raised to 5 s. |
| v11 | PaddleOCR local server integration: `ocr_server.py` Flask server on localhost:5001; `js/ocr.js` auto-detects server on localhost and uses PaddleOCR as primary engine, falls back to Tesseract if unavailable. `requirements.txt` added. |
| v10 | Logo: replaced text badge with Heineken Myanmar SVG logo (red star + HEINEKEN/Myanmar in forest green, transparent background). OCR: auto-invert for dark/shadowed kegs; inverted-image retry pass before PSM-4 fallback; G→6 and Z→2 added to lot-number digit correction. |
| v8 | Landing page icons: keg barrel-bulge silhouette + hoop rings + spear valve; Heineken-style bottle with oval label + crown cap. |
| v7 | Camera UI: capture + switch-camera buttons moved inside the viewport (floating overlay at bottom-center); viewport gets rounded corners and padding for a neater framed look; scan status moved to top-left overlay |
| v6 | OCR fix: replaced CSS brightness+contrast (was blowing ink to white) with pixel-level grayscale+threshold; PSM 4 for better handwritten text; raw OCR text panel shows what camera read; keg size 50L defensive reset |
| v5 | Export to Excel (XLSX via SheetJS); table adds Truck/Date/Ship To columns; live photo quality badge (green/orange/red); responsive for phones+tablets+desktop; Keg Size defaults 10L/20L/30L; toast no longer animated-moving |
| v4 | Lot extraction strips timestamps like (13:20); brand extraction handles extra text (BAWDAR NKL); brightness(1.2)+contrast(4) for thin/faint ink; cross-browser regex (no lookbehind); running locally section |
| v3 | Keg/Bottle type selector on landing page; Heineken red (#C8102E); premium UI; OCR guide-box crop; OCR error corrections; back button pre-fills form |
| v2 | Strict 3-line OCR format; TIGER/BAWDAR/HEINEKEN/ABC defaults; OCR preprocessing (grayscale+contrast+PSM6); back button fix |
| v1 | Initial release |
