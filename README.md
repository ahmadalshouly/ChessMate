# ChessMate

Online chess platform for web, iOS and Android: real-time games against other players, engine evaluation, move feedback with threat detection, and an AI coach.

## Repository layout

```
apps/
  app/       Expo (React Native) app: one codebase for iOS, Android and web
  server/    Realtime game server (Node, WebSockets): matchmaking, authoritative games, clocks, ratings
packages/
  core/      Shared TypeScript chess logic used by app and server
```

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

## Design system

UI components and theme tokens live in `apps/app/src/ui` (import from `@/ui`). Guidelines and examples: [apps/app/src/ui/README.md](apps/app/src/ui/README.md). With the dev server running, open `/design` (web: http://localhost:8081/design, or type the path in Expo Go via a deep link `chessmate://design`) to see every component in light and dark.

## Getting started

Requirements: Node 22+ and pnpm 12 (`npm i -g pnpm@12`). Works on Windows, macOS and Linux.

```bash
pnpm install
pnpm dev:server          # terminal 1: game server on port 8787
pnpm dev:app             # terminal 2: Expo dev server (press w for web)
```

Checks: `pnpm test` and `pnpm typecheck`.

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
