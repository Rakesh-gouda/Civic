# CIVICTRACK AI

CIVICTRACK AI is a full-stack civic complaint platform. Citizens report issues with a photo and map
location, authorities triage and resolve them through a controlled workflow, and everyone can browse
complaints and computed geographic hotspots on an interactive map. AI analysis is performed by Google
Gemini through a server-side proxy; nothing is fabricated when the AI is unavailable.

> **Demonstration data:** the database is seeded with ten demo complaints and three demo accounts.
> Seeded records carry `isDemo: true` and are labelled in the interface. They are real database rows,
> not live municipal figures.

---

## Overview

| Area | Capability |
| --- | --- |
| Citizen | Register / sign in, report an issue with photo + browser geolocation, edit profile, view and track own complaints, add follow-up notes, upvote community complaints |
| Public | Landing page, complaint map with filters/search/heatmap, ticket tracking by ID, AI/hotspot insights |
| Authority | KPI dashboard, open queue, review modal, priority and department assignment, status workflow, resolution notes and evidence photo |
| Admin | Everything authority can do, plus department record editing and AI override review |
| Analytics | KPIs, six-month trend, category/ward/department breakdown, AI status, CSV export |
| Geospatial | Leaflet/OpenStreetMap map, marker colours by priority/status, DBSCAN hotspots with boundaries |
| AI | Classification, summary, duplicate suggestions, 0–100 priority score with reasons, action brief, admin override |

### Pages

- `/` — Landing page
- `/login`, `/register` — Authentication
- `/citizen-dashboard` — Citizen dashboard (citizen accounts)
- `/submit` — Submit a complaint (citizen accounts)
- `/track` — Track a complaint by ticket ID (public, owner-aware notes)
- `/map` — Interactive complaint map (public)
- `/authority-dashboard` — Authority dashboard (staff)
- `/analytics` — AI analytics (staff)
- `/departments` — Department management (staff; admin can edit)
- `/complaints-table` — Complaint management (staff)

Protected routes redirect unauthenticated visitors to `/login`. Staff-only routes reject citizen
accounts.

---

## Tech stack

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, React Router 6, Leaflet + OpenStreetMap tiles
- **Backend:** Node.js + Express 5
- **Database:** SQLite via the built-in `node:sqlite` module (`DatabaseSync`)
- **AI:** `@google/generative-ai` (Gemini), called only from the server
- **Auth:** opaque session tokens stored in SQLite, `Authorization: Bearer <token>`, scrypt password hashing
- **Uploads:** images validated and written to `server/uploads`, served at `/uploads`

### Requirements

- Node.js **22.5 or newer** (the project is tested on Node 26; `node:sqlite` is built in)
- npm

> Node 20 does not include `node:sqlite`. Use Node 22.5+.

---

## Installation

```bash
npm install
```

Copy the environment template and add your own values:

```bash
cp .env.example .env
```

Start the API and the Vite dev server in two terminals:

```bash
# terminal 1 — Express API on http://localhost:3001
npm run server

# terminal 2 — Vite dev server on http://localhost:3000
npm run dev
```

Open <http://localhost:3000>. Vite proxies `/api` and `/uploads` to the API.

### Production build

```bash
npm run build     # type-checks and writes dist/
npm run server    # serves dist/ and the API from http://localhost:3001
```

When `dist/` exists, the Express server serves the SPA and falls back to `index.html` for client-side
routes.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with API proxy |
| `npm run build` | TypeScript check + production bundle |
| `npm run preview` | Preview the built bundle |
| `npm run server` | Start the Express API (and `dist/` when built) |
| `npm run server:dev` | API with `node --watch` |
| `npm run test:api` | Boot a throwaway server + DB and run the integration suite |

---

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | For AI | — | Server-side Gemini key. Get one at <https://aistudio.google.com/app/apikey> |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Gemini model that supports JSON response mode |
| `PORT` | No | `3001` | Express API port |
| `DB_FILE` | No | `server/data/civictrack.db` | Override the SQLite database location |

The Gemini key never reaches the browser. Without it, `/api/health` reports `aiConfigured: false` and
AI endpoints return HTTP `503` with `code: "AI_NOT_CONFIGURED"`.

---

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Citizen | `citizen@demo.civictrack` | `Citizen@123` |
| Authority | `authority@demo.civictrack` | `Authority@123` |
| Admin | `admin@demo.civictrack` | `Admin@123` |

Seeded complaints use ticket numbers `CT-2026-881` through `CT-2026-910`. Seeded complaints start with
`ai_status = 'not_analyzed'`; run AI analysis from complaint management to populate AI fields.

---

## Database structure

SQLite database at `server/data/civictrack.db` (WAL mode, foreign keys on). Created and seeded on first
start.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Accounts | `id`, `name`, `email` (unique, nocase), `password_hash`, `role` (`citizen`/`authority`/`admin`), `phone`, `ward`, `department_id` |
| `sessions` | Bearer sessions | `token` (PK), `user_id`, `expires_at` |
| `departments` | Municipal departments | `id`, `name`, `category_code`, `head_name`, `head_email`, `phone`, `total_officers`, `active_field_teams`, `operating_zones` (JSON), `color` |
| `complaints` | Complaint records | `id`, `ticket_number`, `title`, `description`, `category`, `priority`, `status`, `lat`, `lng`, `address`, `ward`, `zone`, `image_url`, `resolution_*`, `citizen_*`, `is_demo`, `department_id`, `assigned_officer`, `target_resolution_date`, `upvotes`, `ai_json`, `ai_status`, `ai_overrides_json`, `duplicate_of` |
| `timeline` | Workflow + citizen notes | `complaint_id`, `status`, `title`, `description`, `timestamp`, `actor`, `actor_role`, `note`, `evidence_photo_url` |
| `votes` | One upvote per user per complaint | `(user_id, complaint_id)` composite PK |

Seeded departments: Road Maintenance, Drainage, Waste Management, Electrical, Public Works.

### Status workflow

```
submitted → under_review → assigned → in_progress → resolved → closed
     ↘           ↘            ↘
      rejected ← rejected ← rejected

rejected → under_review (reopen)
```

Allowed transitions are enforced by the server. Resolving requires a note or a resolution photo.
Closed complaints cannot be reopened. Assigning a department to a `submitted` or `under_review`
complaint with no explicit status advances it to `assigned` automatically.

---

## API endpoints

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | Health, AI configuration and model name |
| POST | `/api/auth/register` | Public | Register a citizen (role is always `citizen`) |
| POST | `/api/auth/login` | Public | Sign in, returns a bearer token |
| GET | `/api/auth/me` | Authenticated | Restore the session |
| POST | `/api/auth/logout` | Authenticated | Revoke the token |
| PATCH | `/api/auth/profile` | Authenticated | Update name, phone and ward |
| GET | `/api/departments` | Public | Departments with computed metrics |
| PATCH | `/api/departments/:id` | Admin | Update department record |
| POST | `/api/uploads` | Authenticated | Validate and store an image, returns `/uploads/...` |
| GET | `/api/complaints` | Public | All complaints (`?scope=mine` for own) |
| GET | `/api/complaints/:id` | Public | Single complaint by id or ticket number |
| POST | `/api/complaints` | Authenticated | Submit a complaint |
| PATCH | `/api/complaints/:id` | Authority/Admin | Priority, department, officer, status, resolution evidence |
| POST | `/api/complaints/:id/notes` | Authenticated (owner or staff) | Add a follow-up note |
| POST | `/api/complaints/:id/vote` | Authenticated | Toggle upvote |
| POST | `/api/complaints/:id/analyze` | Authenticated (owner or staff) | Run and store Gemini analysis |
| PATCH | `/api/complaints/:id/ai-review` | Authority/Admin | Apply/reject AI overrides, confirm duplicate |
| POST | `/api/ai/analyze-preview` | Authenticated | Preview analysis without storing |
| POST | `/api/ai/classify` | Authenticated | Classification only |
| POST | `/api/ai/summarize` | Authenticated | Summary only |
| POST | `/api/ai/action-brief` | Authenticated | Action brief only |
| GET | `/api/stats` | Public | Landing/dashboard aggregates |
| GET | `/api/hotspots` | Public | DBSCAN hotspots (`?eps`, `?minPts`, `?days`) |
| GET | `/api/analytics` | Public | Analytics response used by the analytics page |

Interactive API documentation is not hosted; this table and the TypeScript client in
`src/services/api.ts` are the reference.

---

## AI implementation

- `server/ai.js` wraps Gemini with `responseMimeType: 'application/json'` and a 45-second timeout.
- Analysis returns: classification (category, confidence, alternative), summary, duplicate suggestion
  (semantic + geographic distance to nearby complaints), a 0–100 priority score with reasons, and an
  action brief with an AI explanation.
- Duplicate suggestions are only linked automatically when the model is confident and does **not**
  request admin verification. Uncertain matches are surfaced to administrators and never auto-merged.
- The server applies AI category (confidence ≥ 70) and priority to stored complaints unless an admin
  override exists. Admins can accept, reject or override the result.
- If `GEMINI_API_KEY` is missing, endpoints return `503 AI_NOT_CONFIGURED`. Failed or unparsable model
  responses return `502 AI_REQUEST_FAILED`. No synthetic or templated result is substituted.
- The UI displays the configured model name and an explicit "not configured" notice when applicable.

**The live AI path has not been exercised in this environment because no Gemini key was supplied.**
Everything around it (configuration detection, 503 behaviour, stored/overridden fields, review flow) is
covered by the integration suite.

---

## Hotspots (DBSCAN)

`server/geo.js` implements DBSCAN with haversine distance. Defaults: `eps = 400 m`, `minPts = 3`.
Only active complaints (`submitted`, `under_review`, `assigned`, `in_progress`) are clustered; resolved,
closed and rejected complaints stay visible as markers but never inflate a hotspot. Every number in a
summary is derived from the stored coordinates, category, priority and submission date of its member
complaints — nothing is generated when no cluster exists.

Each hotspot returns:

- centre coordinates, boundary radius and member complaint IDs/tickets
- active complaint count and category counts with percentages (top three as dominant categories)
- average priority label, numeric rank and a 0–100 score
- first/last report date, average age, 14-day recency counts and a derived trend
- suggested inspection action
- a rule-based insight derived from the member categories, including an infrastructure warning when related
  categories recur (for example drainage blockage plus waterlogging, which may point to an undersized or
  collapsed stormwater line)

`GET /api/hotspots` accepts `?eps` (100–2000 m), `?minPts` (2–10) and an optional `?days` window
(1–365) applied to submission dates. The map's Hotspots drawer can switch between all time, the last 30
days and the last 90 days; selecting a card flies to the boundary and opens its popup. Hotspots are drawn
on the map as visible boundaries plus a count marker.

---

## Testing

```bash
npm run build
npm run test:api
```

`server/test.js` spawns a real server on a random port with a temporary database and an empty
`GEMINI_API_KEY`, then runs the integration checks:

- health, seeded departments/complaints, stats, hotspots
  (required summary fields, category reconciliation, active-status exclusion, seeded drainage cluster,
  date-window filter)
- registration, role escalation prevention, login, session restore, profile update, logout
- submission validation, coordinate bounds, ownership, notes, votes
- RBAC for complaint and department mutations
- the full status workflow, resolution evidence rules, closed/reopen rules
- AI error handling without a key
- analytics totals, department updates, unknown routes

The current suite passes 110/110 checks.

---

## Known limitations

- **AI is untested live.** Without a `GEMINI_API_KEY`, classification, summaries, duplicate detection
  and priority scoring return `503` by design. No AI result is simulated.
- **Seeded data is illustrative.** Ten demonstration complaints and their coordinates are not live
  municipal records.
- **Single-node SQLite.** No replication, migrations framework or concurrent-writer scaling.
- **Session storage is local.** Tokens are opaque rows in SQLite; there is no OAuth, email verification
  or password reset flow.
- **Uploads are local files.** Images are stored on disk under `server/uploads`; there is no object
  storage or image moderation.
- **Hotspot insights are rule-based, not Gemini output.** They are derived deterministically from the
  clustered categories and dates; no language model is called for hotspots.
- **Hotspots are recomputed per request.** DBSCAN compares complaint pairs in memory (no spatial index),
  which is fine for the demonstration dataset but would need indexing or precomputation at city scale.
- **Geolocation depends on the browser and device.** If permission is denied or the lookup fails, the
  UI reports the failure and does not claim a location was obtained.
- **Notifications are in-app only.** There is no SMS or email delivery.
- **Accessibility and localisation** are baseline; the interface is English-only.
- **No interactive API docs page.** Endpoints are documented in this README.
