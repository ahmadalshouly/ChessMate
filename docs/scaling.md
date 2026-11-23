# Launch: fast and staying up under load

What makes ChessMate slow or fall over, what is already done about it, and
what to do before and after launch. Measure with the load test before trusting
any number here.

## 1. Run it like production (biggest win, no code)

The setup used while developing is many times slower than production:

| Development (`pnpm dev`) | Production |
| --- | --- |
| Expo dev bundle: unminified, dev checks on every render | `eas build` release apps; `pnpm build:web` web bundle served from a CDN |
| `tsx watch` recompiling TypeScript | `pnpm build:server && pnpm start:server` (bundled JS, `NODE_ENV=production`) |
| Embedded Postgres (pglite) inside the server process | A managed Postgres: set `DATABASE_URL` |
| Stockfish compiled to WebAssembly, run in Node | Native Stockfish: `STOCKFISH_PATH` (the Docker image already installs it) |

If the app feels slow on your laptop, check these first. The Docker image and
`deploy.yml` already use the production column.

## 2. Keep the chess engine from eating the server

Stockfish is the only CPU-heavy part. Game reviews no longer use the server's
engine at all: they are graded on the player's device, and the first review of
an online game is saved (one small database row) and fetched by everyone after.
The server's engine serves the analysis board (up to 15 s per position) and
broadcast evaluations.

Done in code:
- When 64 analysis requests are already waiting, the next one gets "The engine
  is busy right now" at once instead of waiting minutes.
- Saved reviews are rebuilt from the device's engine results with the same
  grading code (no engine time), so a game is graded once, on a phone.

Settings (environment):
- `ENGINE_WORKERS`: Stockfish processes. Use at most (CPU cores − 1) on the
  game server so moves are never starved, or run analysis on its own machine.
- `ENGINE_THREADS=1`, `ENGINE_HASH_MB=64` per process: more workers beat more
  threads for many users.

Next step when needed: run the engine as its own service (the same server code
with only analysis enabled), so games and analysis scale separately.

## 3. Fewer requests per user

Done in code:
- The live connection stays open on every screen; notifications, friend
  requests, challenges, messages and presence are pushed over it.
- With the connection up, the app checks the inbox every 3 minutes instead of
  every 30 s, online friends every 2 minutes, the tournament list every minute,
  and a tournament page every 5 s only while it runs (30 s otherwise).
- Global and country leaderboards are queried once per page every 15 s and
  shared by everyone, instead of once per visitor.

## 4. Measure before launch

```sh
pnpm build:server && pnpm start:server          # production build, real Postgres
pnpm --filter @chessmate/server loadtest -- --url ws://localhost:8080/ws --players 2000 --ramp 60 --duration 300
```

The load test connects simulated players who get paired and play real games.
Watch:
- move round trip p95 (what players feel as lag): aim for under 150 ms;
- pairing time p95;
- errors and dropped connections;
- server CPU and memory, and `/health`.

Raise `--players` until p95 goes up sharply: that is one server's capacity.
Run it against a staging copy, never against production.

## 5. Beyond one server (for very large numbers)

One Node process holds the games, the matchmaking pool, challenges and
presence in memory, so today you scale up (a bigger machine) rather than out.
A single process typically carries tens of thousands of connected players,
since chess moves are tiny messages; the load test tells you the real figure.
Millions of concurrent players need several game servers, which takes:

1. **Sticky routing**: a player and their game on the same server (load
   balancer hashing on player or game id).
2. **A shared message bus** (Redis or NATS) for what crosses servers:
   presence, notifications, challenges, friend events and the matchmaking pool.
3. **Notifications in the database**: the inbox is kept in memory today and is
   lost on restart.
4. **The engine as its own service** (section 2).

That is a planned piece of work, best started once the load test shows where
one server tops out.

## 6. Why not a Rust rewrite now

Tools like rust-anything help when one piece of code is the bottleneck
(their Prettier and search ports). Here the costs are elsewhere: the dev setup
(section 1), Stockfish, which is already native C++ (section 2), request volume
(section 3) and running on one process (section 5). Rewriting the server in Rust
would not change any of these, and the app itself (React Native) can't be
ported that way. Revisit if profiling ever shows a hot loop in the server's own
code.
