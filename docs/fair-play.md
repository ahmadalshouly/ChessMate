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

## Analysing a case on a moderator's device

A server with no `STOCKFISH_PATH` analyses nothing, so cases there stay empty. The fair-play case screen in the admin console can fill that gap with the engine the app already carries: **Analyse recent games here** evaluates the account's most recent rated games with Stockfish on the moderator's own device (`apps/app/src/features/admin/caseAnalysis.ts`) and posts the raw per-position results back.

```
GET  /api/admin/fairplay/:playerId/games      recent rated games, with moves, think times and ratings
POST /api/admin/fairplay/:playerId/analysis   { gameId, depth, evals }
```

Only raw engine output crosses the wire: a score and a best move per position. The server walks the stored game itself, checks every evaluation against it (`evalUpload.ts`: one per position, a legal best move, depth 12 or more, terminal positions scored from the board) and computes the accuracy, match rate and z-scores with the same code its own engine goes through, so nothing graded can be sent directly. A game analysed again replaces its earlier report rather than counting twice.

The case screen lists the account's recent finished games — rated or not, any length — and the moderator picks what is worth engine time: one game, or every game not yet analysed. A game can be analysed and still produce no report, because the opening plies, forced moves and already-decided positions are skipped and a side needs `minMovesPerGame` measured moves to count; the screen says so rather than claiming evidence that is not there.

```
POST /api/admin/fairplay/:playerId/refund      { games, note? }
```

Refunding is separate from closing the account. A moderator who is sure enough to put the points right, but still deciding about the account, chooses how many of its last rated games to reach back over; every opponent who lost rating in them gets it back and a message. **The message never names the account.** Who was investigated is not the opponent's business, and naming them invites pile-ons. A game already refunded is never refunded twice, so a later, wider pass only adds what it has not covered. Needs `fairplay.ban` (admins).

**This is not a way to let players analyse their own cases.** Evidence about a suspected cheater must not come from that player's device: the one number that decides a case is how far their accuracy sits above their rating, which is exactly what a dishonest client would shade. The routes need a staff account with `fairplay.review`, reports made this way are stored with `source: 'device'`, the depth and the moderator's name, shown as "Moderator device" on the case screen, and they never open a case on their own — only the server's own engine does that.

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
| `TRUST_PROXY` | unset | Where the player's IP comes from behind a proxy: `fly` reads `Fly-Client-IP` (set in `fly.toml`), `1` reads the last `X-Forwarded-For` entry (one proxy of your own). Unset uses the socket address |

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
