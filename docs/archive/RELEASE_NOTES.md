# Dashboard SC v1.3.1 — Tactical Restoration and UI Hardening

## Release Info
- **Version:** 1.3.1
- **Release Date:** 06 мая 2026 г.
- **Status:** ✅ Stabilized tactical pages and navigation UI

## Included Changes

### 1) Tactical content delivery is now offline-safe
- Added `assets/js/tactical-data.js` with embedded content from tactical markdown sources.
- Removed runtime dependency on `fetch()` for tactical pages.
- Updated script order in:
  - `law.html`
  - `instruments.html`
  - `manual.html`

### 2) Tactical renderer improvements (`assets/js/tactical-pages.js`)
- Added sync loader by key path (`window.TACTICAL_DATA`).
- Markdown rendering upgraded with:
  - ordered lists and unicode bullets;
  - separators (`---` / `___`);
  - strike-through (`~~text~~`);
  - auto-linking plain URLs;
  - tab replacement for readable indent;
  - global unescaping of markdown escape slashes.
- Cleaned visual artifacts in tactical text (`####`, escaped underscore separators).

### 3) Typography and tactical UI style corrections
- Updated/added tactical CSS classes in `assets/css/style.css`:
  - `.tactical-text-body`, `.tactical-text-title`
  - `.tactical-hr`, `.tactical-callout`
  - `.law-details`, `.instrument-card`
  - `.manual-tile`, `.manual-content-area`
- Improved readability in dark theme for long tactical reading sessions.

### 4) Sidebar and theme toggle refinements
- Removed `Новый` badges from tactical section links.
- Unified tactical section heading style with operational section heading style.
- Removed underline from sidebar link labels.
- Replaced emoji-based theme icon with SVG icons in:
  - `assets/js/app.js`
  - `assets/js/core.js`

## Deployment
```bash
docker compose config
docker compose up -d --build
docker compose ps
```

## Handover Notes
- Tactical pages should be updated through markdown sources in `content/` + regeneration of `assets/js/tactical-data.js`.
- Keep `assets/js/tactical-pages.js` isolated from analytics logic to avoid regressions.
