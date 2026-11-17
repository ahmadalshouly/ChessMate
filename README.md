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
| `analysis.ts` | Engine lines for display, FEN/PGN import, per-move game review (`buildReview`) and coach context (`coachContextFor`) |
| `openings.ts` | Opening name and ECO detection by position (handles transpositions), from the CC0 Lichess opening tables |
| `pgn.ts` | PGN export (single or many games) and import (multi-game files, comments and variations skipped) |
| `archive.ts` | Archived game model, filters (result, colour, time control, source, opening, text, dates) and stats |
| `puzzle.ts` | Puzzle CSV parsing, solving and hints, server-side grading, puzzle rating, streak/rush ladders, theme labels |

### Design decisions

- **One Expo app for all three platforms** (Expo Router, React Native Web). Shared UI, shared logic.
- **Server is authoritative.** Clients send moves with the ply they expect; the server validates, runs the clocks and broadcasts. Clients play moves optimistically and resync on rejection.
- **Engine and coach run server-side** so live games cannot be assisted from the client. The practice board's threat hints run on device because they are not engine strength.
- **Play vs computer runs on device** with ChessMate's own lightweight engine (`packages/core/src/bot`), so it works offline and costs no server time. Games against bots are unrated, so on-device strength is fine. Eight levels, from Pip (~400) to Monolith (~2200), weaken by search depth, score noise and occasional careless moves.
- **Licensing.** Only permissively licensed dependencies ship in the app (chess.js is BSD-2). Lichess databases (CC0) can be used for openings and puzzles; Lichess code (AGPL/GPL) must not be copied. Stockfish (GPL) runs as a separate server process, never bundled into the app.
- **Original look.** Monochrome, frosted-glass brand; no assets taken from other chess sites.

## Design system

UI components and theme tokens live in `apps/app/src/ui` (import from `@/ui`). Guidelines and examples: [apps/app/src/ui/README.md](apps/app/src/ui/README.md). With the dev server running, open http://localhost:8081/design in the browser to see every component in light and dark.

## Getting started

Requirements: Node 22+ and pnpm 12 (`npm i -g pnpm@12`). Works on Windows, macOS and Linux.

```bash
git pull                 # get the latest main
pnpm install             # after every pull, in case dependencies changed
pnpm dev:server          # terminal 1: game server on port 8787
pnpm dev:app             # terminal 2: Expo dev server (scan the QR code, or press w for web)
```

The app opens on a welcome screen: create an account, sign in, or tap **Continue as guest**. Accounts are saved in the local database, so they survive restarts. If Expo shows an old screen after pulling, stop it and run `pnpm dev:app --clear`.

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

Local development needs no setup: accounts are saved in the same database as games (embedded PGlite in `.data/pglite`, or Postgres when `DATABASE_URL` is set; in memory only with `CHESSMATE_DB=off`), and password reset links are printed in the server terminal instead of emailed. Settings, all optional in development:

- `AUTH_SECRET`: token signing secret, at least 32 characters. Required in production; without it in development, one is generated once and kept in `.data/auth-secret`, so you stay signed in across restarts.
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

## Engine analysis

The game server runs Stockfish as separate processes (UCI over stdin/stdout) and streams results over the same WebSocket as games. The app gets:

- **Analysis board** (home → Analysis board): move freely for both sides, step through the line, import a FEN or PGN, evaluation bar, top 1 or 3 engine lines with arrows. Tap a line to play its first move.
- **Game review** (after an online game → Review game, or from the analysis board): every move graded best / excellent / good / inaccuracy / mistake / blunder, accuracy per side, eval graph, and the better move drawn on the board.

Engine help is refused while you have a live game, and for any position currently on the board in a live game.

Which Stockfish runs:

1. `STOCKFISH_PATH` set: that native binary (fastest; used by the Docker image).
2. Otherwise the `stockfish` npm package's WebAssembly build, run by a child Node process. This is installed by `pnpm install`, so nothing extra is needed for local development on Windows, macOS or Linux.

Optional settings: `ENGINE_WORKERS` (engine processes, default 1), `ENGINE_THREADS`, `ENGINE_HASH_MB`, `REVIEW_DEPTH` (default 14) and `REVIEW_MOVETIME_MS` (default 400, per position). For a stronger local engine, download Stockfish from stockfishchess.org and point `STOCKFISH_PATH` at it:

```powershell
$env:STOCKFISH_PATH = "C:\Tools\stockfish\stockfish-windows-x86-64-avx2.exe"
pnpm dev:server
```

### Game history

Home → **Game history** lists finished online games, practice games (saved when they end, or with "Save to history") and imported PGNs. They are stored on the device, so history works offline and for guests. Open a game to replay it: tap any move, use the arrow buttons (or ←/→, Home/End, F to flip on web), or press ▶▶ to play it through. Each game can be shared as PGN (share sheet on phones, download or copy on web), and **Import PGN** accepts pasted text or a `.pgn` file on web.

Opening names come from `packages/core/data/*.tsv` (lichess-org/chess-openings, CC0). After changing those files, run `node packages/core/scripts/build-openings.mjs` to regenerate `src/openings-data.ts`.

## Playing online

Open **Play** (`/play`, or "Open the lobby" on the home screen):

- **Quick pairing.** Pick a time control (bullet to classical, or a custom minutes + increment), casual or rated, and an opponent rating window. *Auto* starts at ±100 and widens about 20 points a second, then opens to anyone after 45 seconds; ±100/±200/±400 keep it fixed. The search card shows the live window and how many others are searching.
- **Custom games.** Post a game to the lobby with your side (white, black or random). Everyone in the lobby sees it under *Open games* and can join.
- **Rated vs casual.** Rated needs an account; guests always play casual.
- **Premoves.** While your opponent is thinking, tap a piece and a square to queue a move (tinted blue). It plays instantly if it is legal after their reply; tap anywhere else to cancel.
- **Sounds** for moves, captures, checks, game start and end (original synthesised set in `apps/app/assets/sounds`).
- **Reconnect and resume.** One connection serves the whole app and reconnects on its own. Guests get a resume token, so a dropped connection or a page reload puts you back in your game. If your opponent drops, you see a countdown: they forfeit after 60 seconds (or the game is aborted if fewer than two moves were played).
- **Game over** shows the result, the rating change for rated games, and Rematch (colours swap), New game, and Lobby.

To try two players on one computer, open the lobby in two browser windows (one normal, one private), create a game in one and join it from the other.

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
### Notifications

The bell in the header opens the inbox; **Settings** there picks which alerts arrive in the app and as push, plus quiet hours.

- **Inbox and settings** work everywhere (web, Expo Go, builds) as soon as `pnpm dev:server` is running.
- **Send a test** on the settings screen sends yourself a sample notification (development servers only).
- **Push on iPhone**: works in Expo Go. Open Notification settings, tap **Turn on push** and allow, then tap **Send a test**: a system banner appears and the bell badge updates.
- **Push on Android**: Expo Go cannot receive push (Expo removed it in SDK 53). It needs a development build with Firebase credentials (`google-services.json`), which uses EAS build quota, so it is not set up yet.
- Push goes through Expo's push service. Set `EXPO_ACCESS_TOKEN` on the server only if "enhanced push security" is turned on for the Expo project.
### Trying friends and spectating

The server keeps friends, follows, blocks and the activity feed in the database (embedded Postgres by default, nothing to install), and the app's Friends screen is on the home page.

1. `pnpm dev:server` and `pnpm dev:app` as above.
2. Open the app on two devices (or two browser windows, one in a private window). On each, open **Friends** and pick a different test username. Until sign-in lands, development builds use these test accounts.
3. On one, tap **Find players**, search the other name and tap **Add friend**. Accept it under **Requests** on the other.
4. Start an online game on one device: the other shows the friend as "Playing now" with a **Watch** button that opens the live board.

The social API lives under `/api/social/*` on the game server (see `apps/server/src/social/http.ts` for the routes).

### Builds (uses EAS build quota)

Cloud builds count against the Expo account's build quota, so they only run when started on purpose:

- Simulator builds: run the "EAS simulator build" GitHub workflow, or add the `simulator-build` label to a PR.
- Installable preview builds: `npx eas-cli@latest build --profile preview --platform all`.

### Puzzles

A fresh checkout has 14 original starter puzzles, loaded automatically into `apps/server/data/puzzles.db` the first time the server starts. For the real collection, import the Lichess puzzle database (CC0, about 5 million puzzles):

```bash
pnpm puzzles:import                                  # downloads lichess_db_puzzle.csv.zst (~250 MB) and imports it
pnpm puzzles:import C:\Downloads\lichess_db_puzzle.csv.zst   # or a file you downloaded yourself (.zst, .gz or .csv)
pnpm puzzles:import --limit 100000                   # quicker partial import for development
```

By default it keeps well-tested puzzles (popularity 50+, 100+ plays, rating deviation 100 or less); change with `--min-popularity`, `--min-plays`, `--max-rd`. Re-running is safe (puzzles are updated by id). Restart `pnpm dev:server` afterwards. Set `PUZZLE_DB` to store the database elsewhere.

In the app, open **Puzzles** on the home screen: daily puzzle, rated training with a theme filter and hints, streak (one mistake ends it) and rush (3 minutes, 3 lives).

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

## Profiles and settings

Screens: `/profile` (your profile), `/profile/<username>`, `/profile/edit`, `/settings`. The home screen links to Profile and Settings.

REST API on the game server (port 8787), bearer token auth:

| Route | What it does |
| --- | --- |
| `GET /api/profiles/:username` | Public profile: avatar, bio, country, ratings per time control, W/D/L, last 10 games (respects privacy settings) |
| `GET /api/profiles/:username/rating-history?category=blitz` | Rating after each rated game, for the graph |
| `GET` / `PATCH /api/me/profile` | Own profile plus email; edit display name, bio, country, avatar |
| `GET` / `PATCH /api/me/settings` | Board theme and pieces, sound, move confirmation, notifications, privacy (partial updates, validated) |
| `POST /api/me/password` | Change password |
| `POST /api/me/delete` | Delete account (password required) |

Shared types and validation live in `packages/core/src/profile.ts`; server code in `apps/server/src/profiles/`.

**Trying it:** sign in (or create an account), then open the Profile tab. Board theme, piece set, coordinates and move confirmation apply to the boards straight away. In development the seeded `demo` player (120 sample games) is still available at `/profile/demo` for trying public profiles.

## Roadmap

1. Accounts and persistence (Postgres for players, games and ratings; signed session tokens in place of guest tokens).
2. Engine service: Stockfish workers behind a queue for post-game review and evaluation bar.
3. AI coach: game review and position chat are in (see docs/coach.md); next, open reviews from finished games once the engine service lands.
4. Promotion picker, drag-to-move, premoves, sounds, original piece set.
5. Openings from the CC0 Lichess databases (puzzles are in).
6. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
2. AI coach: game review that explains each mistake, using the structured context from `coach.ts`.
3. Promotion picker, drag-to-move, premoves, sounds, original piece set.
4. Puzzles and openings from the CC0 Lichess databases.
5. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
