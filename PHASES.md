# CIVICTRACK AI — Delivery Phases

This project is delivered in verifiable phases. A phase is only marked complete when the feature
exists in the codebase and the checks below pass.

## Verification

```bash
npm run build      # TypeScript check + production bundle
npm run test:api   # 110 integration checks against a throwaway server + database
```

Last verified in this workspace:

- `npm run build` — passed (Vite production bundle written to `dist/`)
- `npm run test:api` — **110/110 checks passed**
- Live Gemini calls — **not verified** (no `GEMINI_API_KEY` in this environment; endpoints
  correctly return `503 AI_NOT_CONFIGURED`)

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: Express API, SQLite schema, authentication, RBAC, shared frontend API client | Complete |
| 2 | Citizen module: registration/login, submit complaint with GPS + photo upload, dashboard, tracking | Complete |
| 3 | Geospatial module: Leaflet map from stored coordinates, filters, marker colours, heatmap, DBSCAN hotspots with boundaries, date-windowed summaries and inspection actions | Complete |
| 4 | AI module: Gemini server proxy, classification, summary, duplicate detection, priority, action brief, admin overrides | Complete (live Gemini call unverified without a key) |
| 5 | Authority module: dashboard, complaint management, department assignment, status workflow, resolution evidence | Complete |
| 6 | Analytics + landing: live aggregates, demonstration labelling, navigation, responsive fixes | Complete |
| 7 | Hardening: integration tests, encoding cleanup, README, production build | Complete |

## Architecture

- **Frontend:** React 18, TypeScript, Tailwind CSS, React Router, Leaflet/OpenStreetMap.
- **Backend:** Node.js + Express, `node:sqlite` (built into Node 22.5+; tested on Node 26).
- **AI:** Google Gemini called server-side only (`GEMINI_API_KEY` never reaches the browser).
- **Uploads:** image data URL sent to backend, validated, written to `server/uploads`, served at `/uploads`.
- **Auth:** opaque session tokens in `sessions` table, `Authorization: Bearer <token>`, scrypt password hashes.
- **Geospatial:** DBSCAN implemented on the server with haversine distance (metres).

## Demonstration data

The database is seeded with demo complaints and demo accounts so the product can be evaluated
without a live municipal feed. All demo records carry `isDemo: true` and are labelled in the UI.
Live AI analysis is only produced from a real Gemini response; demo records are not presented as
AI output. See `README.md` for exact limitations.
