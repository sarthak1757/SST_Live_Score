# SST Live

Demo video: <ADD VIDEO URL>

A live scoring platform for SST inter-house tournaments. Scorers record points as they happen; everyone else watches scores, event feeds and standings update instantly - no login needed.

## Problem Statement

During inter-house tournaments, scores live on paper sheets, whiteboards and WhatsApp messages. Students who are not at the venue cannot follow a match, scores get reported inconsistently, and building the points table afterwards is manual and error-prone.

## Target Users

- **Scorers / admins** (volunteers and staff) who run the matches and need a fast, mistake-proof way to record points.
- **Viewers** (students, house members, parents) who want to follow live scores and standings from any phone, without creating an account.

## Solution

Scorers log in, open a match and tap sport-specific buttons per team. Every tap is stored as a `ScoreEvent`; the score is always **computed from the events**, so Undo is just removing the last event and nothing can drift out of sync. Each change is pushed to viewers over Server-Sent Events. Standings are computed from finished matches.

## Key Features

1. **Login** - hashed passwords (bcrypt), JWT sessions, `admin`, `scorer` and `fan` roles, seed script for the first admin.
2. **Tournaments and scheduling** (admin) - create a tournament with a sport and houses/teams, then schedule matches between them.
3. **Live scoring** - Start, tap scoring buttons, Undo last action, End set (volleyball/badminton), Finish. Status flow is validated: `scheduled -> live -> finished`; you cannot score a finished match or finish a scheduled one.
4. **Public live view** - home page with live/upcoming/finished matches and status/sport filters; match page with real-time score + event feed (auto-reconnecting SSE); tournament page with standings (win 3, draw 1, loss 0).
5. **Extras** - login rate limiting (8 failed attempts / 10 min), security headers, admin can create scorer accounts and delete scheduled matches, dark mode, animated score changes, live score in the browser tab title.
6. **Players & stats** - admins add a roster (jersey no. + name) per team; scorers can optionally pick the player for each action (e.g. kabaddi raid point by #7). The match page shows top scorers and the feed names the player; the tournament page has a top-players leaderboard across all matches.
7. **Knockout brackets** - once all group matches are finished, the admin generates semifinals from the top 4 of the standings (SF1: 1st v 4th, SF2: 2nd v 3rd), then the final from the two winners. The tournament page shows a bracket view and the champion. Knockout matches cannot end in a draw.
8. **Fan engagement** - viewers react to a live match (🔥 👏 😮) without logging in; counts update live for everyone over SSE and are rate-limited per browser and per IP. Signed-in users chat under the match (max 200 characters, 3 per 30 s); admins can delete comments. Only the part of the email before "@" is shown publicly.
9. **Follow houses** - anyone can sign up as a **fan** (self sign-up always creates the `fan` role, 5 sign-ups per hour per IP). Fans follow houses and get a **My feed** page with their houses' live and upcoming matches and results, across every sport. A house is matched by team name, case-insensitively, so following "Red" covers Red in football and in kabaddi. Fans can comment but cannot score or administer.
10. **Audit log** - every scoring action, set end, undo, start/finish and admin change (tournament, roster, match create/delete, bracket, comment deletion, account creation) is recorded with who, what and when. Admins open the **Audit** page and view it per match or per tournament, e.g. "s@sst.edu - Undid last action: Blue Raid point (+1)".
11. **Sports-app layout** - left sidebar (Home, Live, Tournaments, Teams, Players, My Feed, Admin), a global search bar for teams, players and tournaments, and stat cards. The design takes inspiration from sports-score apps and learning dashboards, in its own pink/lime/black style; no third-party logos or designs are copied.
12. **Tournament pages with tabs** - Overview, Fixtures (grouped by knockout round or day), Results, Standings (P W D L GF GA GD Pts, last-5 form dots; ties split by goal difference, then goals for), Bracket and Top players.
13. **Match pages with tabs** - Summary (timeline with minute and player, Team A left / Team B right), Lineups (rosters with each player's contribution), Stats (per sport: football goals and cards, kabaddi raid/tackle/bonus/all-out points, basketball shots, cricket runs/wickets/overs/run rate/boundaries/extras) and Head-to-head (past results between the two houses across all sports).
14. **Team and player pages** - a house's record, win rate, recent form, squads per tournament, fixtures and results; a player's stats per tournament with an action breakdown and recent actions.
15. **Football cards and match clock** - yellow and red cards (a sent-off player cannot be given further actions; cards never count as scoring). Football, basketball and kabaddi get a clock with start, pause, resume and half-time / end of quarter; every event records its match minute.
16. **One sports config** - football, basketball, volleyball, badminton, kabaddi and cricket are all defined in [backend/src/config/sports.js](backend/src/config/sports.js). Adding a sport means adding one entry.

| Sport | Scoring buttons | Format |
|---|---|---|
| Football | Goal +1 | total goals |
| Basketball | +1, +2, +3 | total points |
| Volleyball, Badminton | Point +1, End set | best of 3 sets |
| Kabaddi | Raid +1, Tackle +1, Bonus +1, All-out +2 | total points |
| Cricket | Dot, 1, 2, 3, Four, Six, Wide, No-ball, Wicket, End innings | limited overs (set per tournament, default 10), Team A bats first |

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
  js/common.js          app shell (sidebar, search), tabs, formatting helpers shared by every page
  js/api.js             the only file that talks to the backend (API_BASE = '' = same origin)
backend/
  server.js             Express app: static files, route mounting, error handler
  seed.js               creates the first admin / extra accounts
  package.json          backend dependencies and scripts
  src/config/sports.js  the single sports config object
  src/models/           User, Tournament, Match, ScoreEvent, Comment, AuditLog (Mongoose)
  src/services/         scoring.js, bracket.js, roster.js, engagement.js, follows.js, rateLimit.js, audit.js, clock.js, matchStats.js, browse.js (pure logic), snapshot.js, sse.js
  src/routes/           auth, tournaments, matches, fans (houses, follows, feed), audit, browse (stats, search, teams, players)
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
| PUT | `/api/tournaments/:id/teams/:teamId/players` (replace roster) | admin |
| POST | `/api/tournaments/:id/bracket`, `/api/tournaments/:id/bracket/final` | admin |
| POST | `/api/matches/:id/reactions` `{ type, clientId }` | public, rate-limited |
| POST | `/api/auth/signup` (creates a fan) | public, rate-limited |
| GET | `/api/houses` | public |
| GET / PUT | `/api/me/follows`, GET `/api/me/feed` | any signed-in user |
| GET / POST | `/api/matches/:id/comments` | GET public, POST any signed-in user |
| DELETE | `/api/matches/:id/comments/:commentId` | admin |
| GET | `/api/audit?match=` or `?tournament=` | admin |
| GET | `/api/stats`, `/api/search?q=`, `/api/teams`, `/api/teams/:name`, `/api/players`, `/api/players/:id` | public |
| GET | `/api/matches/:id/lineups`, `/api/matches/:id/h2h` | public |
| POST | `/api/matches/:id/clock` `{ action: start, pause, resume or end_period }` | admin, scorer |
| POST | `/api/matches/:id/start`, `/finish`, `/events` | admin, scorer |
| DELETE | `/api/matches/:id/events/last` (undo) | admin, scorer |

**Player stats:** `ScoreEvent` optionally stores `player`, `playerName` and `jersey` (copied from the roster, so stats survive roster edits). `topPlayers()` in `scoring.js` aggregates events into per-match top scorers and the tournament leaderboard, so Undo automatically corrects player stats too. The player is validated against the scoring team's roster.

**Brackets:** a match has a `stage` (`group`, `sf1`, `sf2`, `final`). Standings only count `group` matches, so knockouts never change the league table. Seeding and finalist logic are pure functions in `src/services/bracket.js`. A partial unique index on `(tournament, stage)` stops a double-click from creating a stage twice.

**Fan engagement:** reaction counts live on the match and use an atomic `$inc`, so no clicks are lost. The SSE stream carries three event types: `snapshot` (score and feed), `reactions` (counts) and `comments` (latest 50). A small sliding-window limiter (`src/services/rateLimit.js`) allows 1 reaction per 1.5 s per browser id and 60 per minute per IP, so faking browser ids does not help. Limits are in memory, which is fine for a single Render instance.

**Roles:** `admin` (everything), `scorer` (start, score, undo, finish), `fan` (follow houses, comment). Every protected route uses `requireAuth` + `requireRole(...)`; sign-up ignores any `role` in the request body.

**Audit log:** routes call `audit.record(req, action, { match, tournament }, details)` only after an action succeeds, so rejected requests (e.g. scoring a finished match) are never logged. Entries store the actor id and role; the email is joined in when admins read the log. `buildEntry()` only accepts known action names, and `describe()` turns an entry into a readable line. If writing the log fails, the error is reported in the server log but the scorer's action still goes through.

**Cricket:** it uses the same event model. Every ball is a `ScoreEvent`, and `computeCricket()` in `scoring.js` replays them into runs, wickets and overs per innings. Wides and no-balls add a run but are not legal balls. An innings ends automatically when the side is all out (10 wickets), the overs run out, or the chase passes the target. The scorer can also end it early. Only the batting team can score; the API rejects the bowling side. The main score is runs, so `getWinner()`, standings, brackets, undo and SSE work unchanged. The result reads "won by N wickets" or "won by N runs". Extras are never credited to a batter in player stats.

**Standings, form and head-to-head:** `computeStandings()` also adds goals for/against (the sport's main score: goals, points, sets or runs), goal difference and last-5 form (`recentForm()`, oldest first). `headToHead()` matches houses by name, case-insensitively, across every tournament and sport, and reports wins from the first team's point of view. A house page and the "same player" on a player page are also matched by name: a player is the same person when the name and house match.

**Match clock:** a small state machine in `src/services/clock.js` (`not_started -> running <-> paused -> break -> ... -> ended`). Only the period, elapsed time and start time are stored. The server sends the elapsed time with every snapshot, and the browser ticks it forward locally, so a wrong phone clock never shows a wrong match time. Clock changes use a conditional update so two scorers cannot double-apply them. Matches created before the clock existed simply start with no clock.

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

Deployed on Render (free web service): **https://sst-live-score.onrender.com**

1. Push the repo to GitHub.
2. Render -> New -> Web Service -> pick the repo. Build command `npm install`, start command `npm start` (both run from the repo root).
3. Add `MONGODB_URI` and `JWT_SECRET` as environment variables.
4. Once deployed, run the seed once against the same database (locally with the same `MONGODB_URI`, or from the Render Shell: `npm run seed` with the `SEED_ADMIN_*` variables set).

Note: Render's free tier sleeps after inactivity, so the first request can take ~30 s.

## Future Work

- **Deeper cricket:** toss and choice of who bats first, batting and bowling figures per player, run rate, byes and leg-byes, run-outs off a scoring ball, and a super over for tied knockout matches. At the moment a tied knockout cricket match cannot be finished.
- **Push notifications** for match start and final results.
- **Player stats** (top scorers, per-player history).
- **Split hosting (Vercel + Render):** deploy `frontend/` to Vercel as a static site and keep `backend/` on Render. Set `API_BASE` in `frontend/js/api.js` to the Render URL and add CORS (allow the Vercel origin, `Authorization` header) to the Express app. SSE then works cross-origin as well.
- Admin UI to manage scorer accounts, edit/cancel matches, and knockout brackets.
