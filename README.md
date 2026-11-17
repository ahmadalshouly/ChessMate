# ChessMate

Online chess platform for web, iOS and Android: real-time games against other players, engine evaluation, move feedback with threat detection, and an AI coach.

## Repository layout

```
apps/
  app/       Expo (React Native) app: one codebase for iOS, Android and web
  server/    Realtime game server (Node, WebSockets): matchmaking, authoritative games, clocks, ratings
packages/
  core/      Shared TypeScript chess logic used by app and server
  db/        Postgres schema, migrations and queries (Drizzle ORM)
```

### App navigation

The app shell lives in `apps/app/src/components/shell/` and wraps the main sections:

- Phones and narrow windows: glass header (logo, section title, rating, avatar) and a floating bottom tab bar.
- Wide screens (960px and up, e.g. desktop web): a glass sidebar with the same sections and a user card.

Sections are folders in `apps/app/src/app/(tabs)/` (`(home)`, `puzzles`, `learn`, `social`, `profile`), each with its own stack. Add a screen by adding a file to the section's folder; deeper screens get a glass header with a back button automatically. Tabs are configured in `apps/app/src/navigation/tabs.ts`. Full-screen flows such as games stay outside the shell (`apps/app/src/app/play/`). The header reads the player from `useCurrentUser()` in `apps/app/src/lib/currentUser.ts`, a guest stand-in until accounts land.

`@chessmate/core` holds everything both sides must agree on:

| Module | What it does |
| --- | --- |
| `game.ts` | Rules wrapper over chess.js (UCI moves, outcomes, PGN, mating material) |
| `clock.ts`, `timeControl.ts` | Pure chess clock with increment, time-control categories |
| `threats.ts` | Hanging pieces, opponent threats (mate, winning captures, forks), tactical chances |
| `evaluation.ts` | Engine score to expected score, move classification (best to blunder), accuracy |
| `uci.ts` | UCI engine output parsing and strength settings, for the server-side engine workers |
| `rating.ts` | Glicko-2 ratings per time category |
| `protocol.ts` | Typed client/server WebSocket messages |
| `coach.ts` | Structured prompt for the AI coach plus deterministic quick feedback |
| `bot/` | ChessMate's own small engine (alpha-beta, written for this repo) and the eight computer opponents for unrated play |
| `review.ts` | Engine analysis interface for the coach, game review facts, offline review ([docs/coach.md](docs/coach.md)) |

### Design decisions

- **One Expo app for all three platforms** (Expo Router, React Native Web). Shared UI, shared logic.
- **Server is authoritative.** Clients send moves with the ply they expect; the server validates, runs the clocks and broadcasts. Clients play moves optimistically and resync on rejection.
- **Engine and coach run server-side** so live games cannot be assisted from the client. The practice board's threat hints run on device because they are not engine strength.
- **Play vs computer runs on device** with ChessMate's own lightweight engine (`packages/core/src/bot`), so it works offline and costs no server time. Games against bots are unrated, so on-device strength is fine. Eight levels, from Pip (~400) to Monolith (~2200), weaken by search depth, score noise and occasional careless moves.
- **Licensing.** Only permissively licensed dependencies ship in the app (chess.js is BSD-2). Lichess databases (CC0) can be used for openings and puzzles; Lichess code (AGPL/GPL) must not be copied. Stockfish (GPL) runs as a separate server process, never bundled into the app.
- **Original look.** Monochrome, frosted-glass brand; no assets taken from other chess sites.

## Getting started

Requirements: Node 22+ and pnpm 12 (`npm i -g pnpm@12`). Works on Windows, macOS and Linux.

```bash
pnpm install
pnpm dev:server          # terminal 1: game server on port 8787
pnpm dev:app             # terminal 2: Expo dev server (press w for web)
```

Checks (the same ones CI runs on every PR): `pnpm lint`, `pnpm typecheck`, `pnpm test`.

CI, Docker, hosting and every environment variable are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Database

Games, moves, accounts and ratings are saved in Postgres. Nothing to install for local development: without `DATABASE_URL` the server runs Postgres embedded in-process (PGlite) and keeps its data in `.data/pglite` at the repo root. Migrations run automatically when the server starts.

| Setting | What it does |
| --- | --- |
| `DATABASE_URL` | Connect to a real Postgres, e.g. `postgres://chessmate:chessmate@localhost:5432/chessmate` |
| `DATABASE_PATH` | Folder for the embedded database when `DATABASE_URL` is unset (default `.data/pglite`) |
| `CHESSMATE_DB=off` | Keep everything in memory, save nothing |

To use a real Postgres locally (Docker Desktop):

```powershell
pnpm db:up                                                                         # starts postgres:17 from docker-compose.yml
$env:DATABASE_URL = "postgres://chessmate:chessmate@localhost:5432/chessmate"       # PowerShell
pnpm dev:server
```

To start over with an empty embedded database, stop the server and delete the `.data` folder.

Schema changes: edit `packages/db/src/schema.ts`, then `pnpm db:generate` to write a migration into `packages/db/drizzle/` and commit it. `pnpm db:studio` opens a browser view of the data (needs `DATABASE_URL`).

Tables: `users`, `refresh_sessions`, `password_resets`, `oauth_accounts`, `ratings` (one row per user and pool: bullet, blitz, rapid, classical, correspondence, puzzle), `rating_history`, `games` (players, time control, result, PGN, ratings before and after), `moves` (per ply with clocks and room for engine evals), `friendships`, `notifications`, `puzzles`, `puzzle_attempts`.

## Accounts and sign-in (server)

The game server also serves the account API at `http://<host>:8787/api/auth` (code in `apps/server/src/auth/`):

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /signup` | `{username, email, password}` | `201 {user, tokens}` |
| `POST /login` | `{login, password}` (login is username or email) | `200 {user, tokens}` |
| `POST /refresh` | `{refreshToken}` | `200 {user, tokens}`, rotates the refresh token |
| `POST /logout` | `{refreshToken, all?}` | `204` (`all: true` signs out every device) |
| `GET /me` | `Authorization: Bearer <accessToken>` | `200 {user}` |
| `POST /forgot-password` | `{email}` | `202` always |
| `POST /reset-password` | `{token, password}` | `204`, signs out every device |
| `POST /change-password` | `{currentPassword, newPassword}` + Bearer | `204` |

Errors are `{error: {code, message, field?}}`. Passwords are hashed with scrypt; access tokens are 15-minute JWTs and refresh tokens last 30 days. The WebSocket `hello` accepts an access token, and `guest:<name>` still works for guest play.

Local development needs no setup: accounts are kept in memory for now (they reset when the server restarts), and password reset links are printed in the server terminal instead of emailed. Settings, all optional in development:

- `AUTH_SECRET`: token signing secret, at least 32 characters. Required in production; without it in development, a random one is used per run, so sign in again after a restart.
- `CORS_ORIGINS`: comma-separated web origins allowed in production (development allows any).
- `APP_WEB_URL`: base URL used in printed reset links (default `http://localhost:8081`).
- `TRUST_PROXY=1`: use `X-Forwarded-For` for rate limiting when behind a reverse proxy.

### AI coach

The coach works without setup using rule-based reviews. To turn on the AI coach, give the server a Claude API key before starting it:

```powershell
# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
pnpm dev:server
```

```bash
# macOS / Linux
ANTHROPIC_API_KEY=sk-ant-... pnpm dev:server
```

Then open the app and tap **Try a sample review** on the home screen. Details: [docs/coach.md](docs/coach.md).

## Trying it on your own devices

### Phone on the same Wi-Fi (Expo Go)

1. Start the server: `pnpm dev:server`.
2. Start Expo: `pnpm dev:app`.
3. Scan the QR code with Expo Go (Android) or the Camera app (iOS).

Play vs computer and the practice board work without the game server.

The app finds the game server automatically: it uses the same computer address that Expo shows in the QR code (for example `192.168.1.20`), port 8787. If Windows asks, allow Node.js through the firewall on private networks.

### Phone on another network (tunnel)

`pnpm dev:app --tunnel` makes the bundle reachable from anywhere, but the game server is still only on your network, so tell the app where it is:

```powershell
# Windows PowerShell
$env:EXPO_PUBLIC_SERVER_URL = "ws://192.168.1.20:8787/ws"   # your computer's LAN IP (ipconfig)
pnpm dev:app --tunnel
```

```bash
# macOS / Linux
EXPO_PUBLIC_SERVER_URL=ws://192.168.1.20:8787/ws pnpm dev:app --tunnel
```

A deployed server works the same way: `EXPO_PUBLIC_SERVER_URL=wss://your-host/ws`.

### Playing a friend and invite links

- **Challenge a friend** (home screen) creates an invite link, or sends a direct challenge to a player ID. Pick the time control, your colour (white, black or random) and rated (accounts only).
- Invite links look like `<web address>/challenge/<id>`. The same path works as a deep link: `chessmate://challenge/<id>` in installed builds, and `exp://<your-computer-ip>:8081/--/challenge/<id>` in Expo Go. Pasting any of these into a browser or tapping them on a phone opens the invite.
- Try it locally: open `http://localhost:8081` (press `w` in Expo), choose Challenge a friend, create a link, then open that link in a second browser window or a private window and accept.
- Set `EXPO_PUBLIC_WEB_URL=https://your-web-host` so shared links point at the public web app instead of the local address. Opening those https links straight in the installed app (iOS universal links, Android app links) also needs the domain added to `app.json` (`ios.associatedDomains`, `android.intentFilters`) and the matching `apple-app-site-association` / `assetlinks.json` files hosted on that domain.
- **Over the board** (home screen) is two players on one device, offline, with an optional chess clock and a face-to-face layout for a phone or tablet lying between the players.
### In-game chat and moderation

Chat appears under the board once a game starts: quick messages, free text (profanity is masked by the server), Mute and Report for the opponent, and a Chat on/off switch.

The moderation queue lives at `/admin` in the app (on web: http://localhost:8081/admin). It is protected by a token you choose when starting the server:

```powershell
# Windows PowerShell
$env:ADMIN_TOKEN = "pick-a-long-secret"; pnpm dev:server
```

```bash
# macOS / Linux
ADMIN_TOKEN=pick-a-long-secret pnpm dev:server
```

Then open `/admin`, enter the same token, and review reports (with the game's chat and moves), dismiss, warn, or mute a player's chat for 24 hours or 7 days. Without `ADMIN_TOKEN` the admin API is off. To try it alone, open two browser windows on Play online, start a game, and chat or report between them.
### Accounts and sign-in

`pnpm dev:server` also serves the accounts API (`/api/auth/*`) on the same port, and the app finds it automatically the same way it finds the game server. To point the app at a different API host, set `EXPO_PUBLIC_API_URL` (for example `http://192.168.1.20:8787`), alongside `EXPO_PUBLIC_SERVER_URL` when using a tunnel.

- First launch opens the welcome screen: create an account, sign in, or continue as a guest (casual games and the practice board).
- Sessions are kept in the iOS Keychain / Android Keystore (`expo-secure-store`); on web they are kept in the browser's local storage.
- Password reset: there is no email provider in development, so the reset link is printed in the server's terminal. Open it on the device (`chessmate://reset-password?token=...`) or in the browser (`http://localhost:8081/reset-password?token=...`).

### Builds (uses EAS build quota)

Cloud builds count against the Expo account's build quota, so they only run when started on purpose:

- Simulator builds: run the "EAS simulator build" GitHub workflow, or add the `simulator-build` label to a PR.
- Installable preview builds: `npx eas-cli@latest build --profile preview --platform all`.

### Web

`pnpm build:web` produces a static site in `apps/app/dist`. Set `EXPO_PUBLIC_SERVER_URL=wss://.../ws` when building for a public host.

### Production-like server (Docker)

`docker compose --profile server up -d --build` runs Postgres plus the server image (with Stockfish) on port 8787. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## HTTP API

The game server also serves read-only JSON on the same port (8787), with CORS open for the web app:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/stats` | Players online, games in progress, players looking for a game (shown live on the home screen, refreshed every 15 s) |
| `GET /api/leaderboard?category=blitz&scope=global` | Ranked players for `bullet`, `blitz`, `rapid` or `classical`. `scope` is `global`, `country` (add `country=US`, or it uses the viewer's profile country) or `friends` (needs `Authorization: Bearer <session token>`). Paged with `limit` (max 100) and `offset`; `you` holds the viewer's own rank. |

Global and country boards list players with at least one rated game and a settled rating (RD 150 or less), so a lucky first game cannot top the list; friends boards include provisional players. Equal rounded ratings share a rank. Boards are read from the database (`DbLeaderboardSource` over `users`, `ratings` and accepted `friendships`); with `CHESSMATE_DB=off` they rank the in-memory players instead. To try the leaderboard locally, play a few rated games with `dev:<id>:<name>` tokens; guests are never ranked.

## Fair play

Server-side move validation, rate limiting, Stockfish-based cheat flagging, a moderator review queue and bans with rating refunds. Analysis is optional locally: set `STOCKFISH_PATH` to turn it on. See [docs/fair-play.md](docs/fair-play.md).

## Roadmap

1. Accounts and persistence (Postgres for players, games and ratings; signed session tokens in place of guest tokens).
2. Engine service: Stockfish workers behind a queue for post-game review and evaluation bar.
3. AI coach: game review and position chat are in (see docs/coach.md); next, open reviews from finished games once the engine service lands.
4. Promotion picker, drag-to-move, premoves, sounds, original piece set.
5. Puzzles and openings from the CC0 Lichess databases.
6. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
