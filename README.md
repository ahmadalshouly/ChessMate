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

### Design decisions

- **One Expo app for all three platforms** (Expo Router, React Native Web). Shared UI, shared logic.
- **Server is authoritative.** Clients send moves with the ply they expect; the server validates, runs the clocks and broadcasts. Clients play moves optimistically and resync on rejection.
- **Engine and coach run server-side** so live games cannot be assisted from the client. The practice board's threat hints run on device because they are not engine strength.
- **Licensing.** Only permissively licensed dependencies ship in the app (chess.js is BSD-2). Lichess databases (CC0) can be used for openings and puzzles; Lichess code (AGPL/GPL) must not be copied. Stockfish (GPL) runs as a separate server process, never bundled into the app.
- **Original look.** Monochrome, frosted-glass brand; no assets taken from other chess sites.

## Getting started

Requirements: Node 22+ and pnpm 12 (`npm i -g pnpm@12`). Works on Windows, macOS and Linux.

```bash
pnpm install
pnpm dev:server          # terminal 1: game server on port 8787
pnpm dev:app             # terminal 2: Expo dev server (press w for web)
```

Checks: `pnpm test` and `pnpm typecheck`.

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

## Trying it on your own devices

### Phone on the same Wi-Fi (Expo Go)

1. Start the server: `pnpm dev:server`.
2. Start Expo: `pnpm dev:app`.
3. Scan the QR code with Expo Go (Android) or the Camera app (iOS).

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

### Builds (uses EAS build quota)

Cloud builds count against the Expo account's build quota, so they only run when started on purpose:

- Simulator builds: run the "EAS simulator build" GitHub workflow, or add the `simulator-build` label to a PR.
- Installable preview builds: `npx eas-cli@latest build --profile preview --platform all`.

### Web

`pnpm --filter @chessmate/app export:web` produces a static site in `apps/app/dist`.

## Roadmap

1. Accounts and persistence (Postgres for players, games and ratings; signed session tokens in place of guest tokens).
2. Engine service: Stockfish workers behind a queue for post-game review and evaluation bar.
3. AI coach: game review that explains each mistake, using the structured context from `coach.ts`.
4. Promotion picker, drag-to-move, premoves, sounds, original piece set.
5. Puzzles and openings from the CC0 Lichess databases.
6. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
