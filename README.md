# SST Live

A live scoring platform for SST inter-house tournaments. Scorers record points as they happen; everyone else watches scores, event feeds and standings update instantly - no login needed.

## Problem Statement

During inter-house tournaments, scores live on paper sheets, whiteboards and WhatsApp messages. Students who are not at the venue cannot follow a match, scores get reported inconsistently, and building the points table afterwards is manual and error-prone.

## Target Users

- **Scorers / admins** (volunteers and staff) who run the matches and need a fast, mistake-proof way to record points.
- **Viewers** (students, house members, parents) who want to follow live scores and standings from any phone, without creating an account.

## Solution

Scorers log in, open a match and tap sport-specific buttons per team. Every tap is stored as a `ScoreEvent`; the score is always **computed from the events**, so Undo is just removing the last event and nothing can drift out of sync. Each change is pushed to viewers over Server-Sent Events. Standings are computed from finished matches.

## Key Features

1. **Scorer login** - hashed passwords (bcrypt), JWT sessions, `admin` and `scorer` roles, seed script for the first admin.
2. **Tournaments and scheduling** (admin) - create a tournament with a sport and houses/teams, then schedule matches between them.
3. **Live scoring** - Start, tap scoring buttons, Undo last action, End set (volleyball/badminton), Finish. Status flow is validated: `scheduled -> live -> finished`; you cannot score a finished match or finish a scheduled one.
4. **Public live view** - home page with live/upcoming/finished matches and status/sport filters; match page with real-time score + event feed (auto-reconnecting SSE); tournament page with standings (win 3, draw 1, loss 0).
5. **Extras** - login rate limiting (8 failed attempts / 10 min), security headers, admin can create scorer accounts and delete scheduled matches, dark mode, animated score changes, live score in the browser tab title.
6. **One sports config** - football, basketball, volleyball, badminton and kabaddi are all defined in [backend/src/config/sports.js](backend/src/config/sports.js). Adding a sport means adding one entry.

| Sport | Scoring buttons | Format |
|---|---|---|
| Football | Goal +1 | total goals |
| Basketball | +1, +2, +3 | total points |
| Volleyball, Badminton | Point +1, End set | best of 3 sets |
| Kabaddi | Raid +1, Tackle +1, Bonus +1, All-out +2 | total points |

Error handling covers invalid input, missing/expired tokens, wrong role, unknown ids, invalid status changes, double-clicks by two scorers (conditional DB updates), database outages (HTTP 503) and dropped SSE connections. The UI shows loading, empty, success and error states.

## Tech Stack

Node.js, Express, MongoDB Atlas with Mongoose, JWT (`jsonwebtoken`) + `bcrypt`, Server-Sent Events, plain HTML/CSS/vanilla JS (no build step), Jest for tests. Hosted on Render.

## Architecture

```
 ┌──────────────────────────┐        ┌────────────────────────────────┐        ┌───────────────┐
 │  Browser  (frontend/)    │        │  Express backend  (backend/)   │        │ MongoDB Atlas │
 │  static HTML + CSS + JS  │        │                                │        │               │
 │                          │  REST  │  routes -> middleware (JWT,    │        │  users        │
 │  js/api.js  (API_BASE)  ─┼───────►│  roles, validation) -> services│◄──────►│  tournaments  │
 │                          │  /api  │  (pure scoring logic) -> models│Mongoose│  matches      │
 │  EventSource (live score)│◄───────┤  SSE: /api/matches/:id/stream  │        │  scoreevents  │
 └──────────────────────────┘  SSE   │  also serves frontend/ files   │        └───────────────┘
                                     └────────────────────────────────┘
                              ONE Render web service, ONE origin
```

```
frontend/               static pages, CSS, browser JS - no build step, no package.json
  js/api.js             the only file that talks to the backend (API_BASE = '' = same origin)
backend/
  server.js             Express app: static files, route mounting, error handler
  seed.js               creates the first admin / extra accounts
  package.json          backend dependencies and scripts
  src/config/sports.js  the single sports config object
  src/models/           User, Tournament, Match, ScoreEvent (Mongoose)
  src/services/         scoring.js (pure functions), snapshot.js, sse.js
  src/routes/           auth, tournaments, matches
  src/middleware/       requireAuth / requireRole, error handling
  tests/                Jest tests for the scoring logic
package.json            root scripts only (start, seed, test) so Render settings stay simple
```

**Why one deployment?** The code is separated into `frontend/` and `backend/`, but Express serves the static frontend, so the whole app is a single Render service on a single origin. That means no CORS configuration, the SSE connection is a plain same-origin request, the JWT is only ever sent to the server that issued it, and there is one URL to deploy, monitor and put in the submission. Because every API call goes through `frontend/js/api.js`, the frontend can be hosted separately later by changing one constant (see Future Work).

**Data flow:** scorer taps a button -> `POST /api/matches/:id/events` (JWT + role check, validation against the sports config and match status) -> a `ScoreEvent` is saved -> the score is recomputed from all events -> the snapshot is broadcast to every SSE client on that match and returned to the scorer.

**SSE reconnect:** the browser's `EventSource` reconnects automatically (`retry: 3000`), and the server sends a full snapshot on every new connection, so a viewer who lost connection is resynced immediately. A heartbeat comment every 25 s keeps idle connections open on Render.

**Key endpoints**

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | public |
| GET | `/api/matches?status=&sport=&tournament=` | public |
| GET | `/api/matches/:id`, `/api/matches/:id/stream` (SSE) | public |
| GET | `/api/tournaments`, `/api/tournaments/:id` (standings) | public |
| POST | `/api/tournaments`, `/api/matches`, `/api/auth/users` | admin |
| DELETE | `/api/matches/:id` (scheduled only) | admin |
| POST | `/api/matches/:id/start`, `/finish`, `/events` | admin, scorer |
| DELETE | `/api/matches/:id/events/last` (undo) | admin, scorer |

**Notes on rules:** for set sports the main score is *sets won*; a set cannot be ended while tied or empty; once a team has won 2 sets no more points are accepted and the scorer clicks Finish. Finishing early compares sets won (equal = draw) and ignores points in an unfinished set.

## Local Setup

Requires Node.js 18+ and a MongoDB Atlas cluster (free tier is fine).

```bash
git clone <your-repo-url>
cd Scoring_Platform_sst
npm install              # also installs backend/ dependencies (postinstall)
cp .env.example .env     # one .env, at the repo root      # then edit .env (see below)
npm run seed              # creates the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm start                 # http://localhost:3000
npm test                  # runs the Jest tests in backend/tests
```

Admins can also create scorer accounts from the Dashboard. CLI alternative: `node backend/seed.js scorer@sst.edu SomePass123 scorer`

## Environment Variables

| Name | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string (allow your IP, or 0.0.0.0/0 for Render, in Atlas Network Access) |
| `JWT_SECRET` | Long random string used to sign tokens |
| `PORT` | Optional, Render sets it automatically |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Only used by `npm run seed` (password min 8 chars) |

Secrets live in `.env`, which is git-ignored. Only `.env.example` is committed.

## Deployment

Deployed on Render (free web service): **<add your live URL here>**

1. Push the repo to GitHub.
2. Render -> New -> Web Service -> pick the repo. Build command `npm install`, start command `npm start` (both run from the repo root).
3. Add `MONGODB_URI` and `JWT_SECRET` as environment variables.
4. Once deployed, run the seed once against the same database (locally with the same `MONGODB_URI`, or from the Render Shell: `npm run seed` with the `SEED_ADMIN_*` variables set).

Note: Render's free tier sleeps after inactivity, so the first request can take ~30 s.

## Future Work

- **Cricket** (overs, wickets, innings, run rate) - out of scope for this version because it does not fit the "points per action" model.
- **Push notifications** for match start and final results.
- **Player stats** (top scorers, per-player history).
- **Split hosting (Vercel + Render):** deploy `frontend/` to Vercel as a static site and keep `backend/` on Render. Set `API_BASE` in `frontend/js/api.js` to the Render URL and add CORS (allow the Vercel origin, `Authorization` header) to the Express app. SSE then works cross-origin as well.
- Admin UI to manage scorer accounts, edit/cancel matches, and knockout brackets.
