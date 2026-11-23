# Fair play and anti-cheat

Everything lives in `apps/server/src/fairplay/`. The game server stays the only authority on moves, clocks and ratings; fair-play code watches what it does and gives moderators the tools to act. Nothing bans anyone automatically.

## What runs where

| Piece | File | What it does |
| --- | --- | --- |
| Message validation | `validation.ts` | Strict type/shape check of every client message before it reaches a game (UCI format, integer ply, game id charset, token length, rating range). |
| Move hardening | `gameRoom.ts` | Legality by the shared rules engine, turn and ply checks, promotion suffix must match the move, rejected attempts counted per side, server-measured think time per move. |
| Rate limiting | `rateLimit.ts` | Token buckets per socket (all messages, moves, seeks) and per IP (new connections). Over the limit gets a `rate_limited` error; persistent abuse closes the socket with code `4008`. |
| Engine correlation | `analysis.ts`, `engine.ts` | Background job after each rated game: Stockfish evaluates every position; per side we compute accuracy, top-move match rate, average centipawn loss and move-time regularity, skipping the opening, forced moves and already-decided positions. |
| Review queue | `service.ts`, `store.ts` | Each player's last 20 analysed games are pooled and compared with what is normal for their rating. Strong evidence opens a case ranked by a 0–100 score. Players can also be reported by hand. |
| Bans and refunds | `service.ts` | A moderator ban forfeits the account's live game, cancels its search and open game, and gives back the rating points its opponents lost to it in rated games in the last 90 days. The player can still sign in (games, puzzles, analysis, notifications) but the server refuses play actions with `account_restricted`, and the app shows an "Online play is off" banner on every screen. They get an in-app notice and an email explaining why. |
| Admin API | `adminHttp.ts` | HTTP routes for the review queue, protected by a bearer token. |

## Flag rules (defaults, all in `DEFAULT_THRESHOLDS`)

- **engine_correlation**: at least 60 measured moves across recent games, pooled accuracy z-score ≥ 3 **and** top-move match z-score ≥ 2.5 for the player's rating.
- **single_game_engine_correlation**: one game with ≥ 25 measured moves, accuracy z ≥ 4 and ≥ 90% top-move match.
- **move_time_pattern**: three or more games with near-constant think times (coefficient of variation < 0.25) together with clearly elevated accuracy. Timing alone never flags.

These numbers are starting points. Tune them against real games before relying on them.

## Running it locally

Engine analysis needs a Stockfish binary. Without one the server still validates, rate-limits, logs rated games for refunds and serves the admin API; it just skips analysis and says so once in the log.

```bash
# macOS: brew install stockfish    Ubuntu: sudo apt install stockfish
# Windows: download from stockfishchess.org and point STOCKFISH_PATH at the .exe
STOCKFISH_PATH=/usr/games/stockfish FAIRPLAY_ADMIN_TOKEN=change-me pnpm dev:server
```

PowerShell:

```powershell
$env:STOCKFISH_PATH = "C:\tools\stockfish\stockfish.exe"
$env:FAIRPLAY_ADMIN_TOKEN = "change-me"
pnpm dev:server
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `STOCKFISH_PATH` | unset (analysis off) | UCI engine binary used for analysis |
| `FAIRPLAY_ENGINE_DEPTH` | `14` | Search depth per position |
| `FAIRPLAY_ADMIN_TOKEN` | unset (admin API off) | Bearer token for `/admin/fairplay/*` |
| `TRUST_PROXY` | unset | Read the client IP from `X-Forwarded-For` (only behind your own proxy) |

## Admin API

All routes need `Authorization: Bearer $FAIRPLAY_ADMIN_TOKEN`; an optional `X-Moderator: <name>` header is written to the audit log.

```bash
curl -H "Authorization: Bearer change-me" localhost:8787/admin/fairplay/queue
curl -H "Authorization: Bearer change-me" localhost:8787/admin/fairplay/players/<id>
curl -X POST -H "Authorization: Bearer change-me" -d '{"note":"looked fine"}' localhost:8787/admin/fairplay/players/<id>/dismiss
curl -X POST -H "Authorization: Bearer change-me" -d '{"reason":"engine use"}' localhost:8787/admin/fairplay/players/<id>/ban
curl -X POST -H "Authorization: Bearer change-me" -d '{"note":"appeal upheld"}' localhost:8787/admin/fairplay/players/<id>/unban
curl -X POST -H "Authorization: Bearer change-me" -d '{"note":"reported by opponent"}' localhost:8787/admin/fairplay/players/<id>/report
```

`queue` takes `?status=open|dismissed|banned`. A dismissed case reopens on its own only if the score later rises by 15 or more.

## Known limits and next steps

- Storage is in memory, like the player store. `FairPlayStore` is the interface to back with the accounts database.
- Refunds add back the points lost; they do not replay the full Glicko-2 history. Unbanning does not take refunds back.
- The job queue is in-process. With several server nodes, move analysis to a worker reading from a shared queue.
- An in-app "report player" button and a moderator screen need a protocol message and UI; the server side (`report`) is ready for them.
