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

## Getting started

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
pnpm dev:server          # game server on ws://localhost:8787/ws
pnpm dev:app             # Expo dev server: press w for web, scan the QR with Expo Go for phones
```

Point the app at a deployed server with `EXPO_PUBLIC_SERVER_URL=wss://your-host/ws`.

Checks:

```bash
pnpm test
pnpm typecheck
```

## Trying it on your own devices

- **Phone, fastest:** `pnpm dev:app -- --tunnel`, then scan the QR code with Expo Go (iOS/Android). Run the server somewhere the phone can reach and set `EXPO_PUBLIC_SERVER_URL`.
- **Installable preview builds:** `npx eas-cli@latest build --profile preview --platform all` creates an internal-distribution build (iOS ad hoc, Android APK) with an install link and QR code.
- **Simulator builds** (for Expo's hosted simulators or local ones): `npx eas-cli@latest build --profile simulator`.
- **Web:** `pnpm --filter @chessmate/app export:web` produces a static site in `apps/app/dist`.

Before the first EAS build, run `npx eas-cli@latest init` once to link the project to your Expo account, and set the real server URL in `eas.json`.

## Roadmap

1. Accounts and persistence (Postgres for players, games and ratings; signed session tokens in place of guest tokens).
2. Engine service: Stockfish workers behind a queue for post-game review and evaluation bar.
3. AI coach: game review that explains each mistake, using the structured context from `coach.ts`.
4. Promotion picker, drag-to-move, premoves, sounds, original piece set.
5. Puzzles and openings from the CC0 Lichess databases.
6. Horizontal scaling of the game server (route by game id, Redis pub/sub), anti-cheat signals.
