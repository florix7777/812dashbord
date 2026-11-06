# Agent Handoff v1.3.1

## Current Baseline
- Tactical pages `law.html`, `instruments.html`, `manual.html` read content from `assets/js/tactical-data.js`.
- Tactical renderer logic is isolated in `assets/js/tactical-pages.js`.
- Sidebar and theme behavior are centralized in:
  - `assets/js/sidebar.js`
  - `assets/js/app.js` (main dashboard pages)
  - `assets/js/core.js` (lightweight informational pages)

## What Is Stable and Should Not Be Regressed
- No runtime `fetch()` dependency for tactical markdown content.
- Script order on tactical pages:
  1. `assets/js/data.js` (where needed by page),
  2. `assets/js/sidebar.js`,
  3. `assets/js/tactical-data.js`,
  4. `assets/js/tactical-pages.js`,
  5. `assets/js/app.js`.
- Theme toggle uses SVG icons (no emoji).
- Sidebar tactical links do not show `Новый` badges.

## Tactical Content Update Flow
1. Edit source markdown files under `content/`.
2. Regenerate `assets/js/tactical-data.js` from markdown sources.
3. Verify rendering in:
   - `law.html`
   - `instruments.html`
   - `manual.html`
4. Run lint checks for touched files.

## Docker / Runtime Notes
- Main stack defined in `docker-compose.yml` (`postgres`, `backend`, `nginx`).
- Before release:
  - `docker compose config`
  - `docker compose up -d --build`
  - `docker compose ps`
- Nginx bind-mount currently points to this workspace path on host.

## Recommended Next Work Items
- Deduplicate repeated tactical CSS declarations in `assets/css/style.css`.
- Add a small script to regenerate `assets/js/tactical-data.js` reproducibly.
- Add smoke check for tactical pages in CI (basic load + key DOM assertions).
