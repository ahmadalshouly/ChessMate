# AI coach

After a game, the coach turns engine analysis into a plain-language review: why each key move was good or bad, a summary of the game, recurring habits, and what to study next. Players can then chat with the coach about any key position.

The engine decides what is true; the language model only explains it. Every move the coach mentions comes from the engine facts or the tactics code in `@chessmate/core`.

## Pieces

| Where | What |
| --- | --- |
| `packages/core/src/review.ts` | **Engine analysis interface** (`GameAnalysis`, `AnalyzedMove`, `GameAnalyzer`), coach output types (`CoachReview`, `CoachChatRequest`), move judging, key-moment selection, prompt building and the rule-based fallback review |
| `packages/core/src/sampleAnalysis.ts` | A sample analysed game used by tests and the demo screen (illustrative evaluations) |
| `apps/server/src/coach/llm.ts` | Claude API client (`claude-opus-5-5` by default) behind a small `CoachLlm` interface |
| `apps/server/src/coach/coachService.ts` | Review and chat logic, structured-output schema, caching, fallback to the offline review |
| `apps/server/src/coach/http.ts` | HTTP routes, auth, rate limits, CORS |
| `apps/app/src/components/coach/` | `GameReview` and `CoachChat` screens |
| `apps/app/src/app/review/demo.tsx` | "Try a sample review" screen |

## For the engine-analysis service

Produce a `GameAnalysis` (see `review.ts` for field docs):

- One `AnalyzedMove` per ply, in order, with `fenBefore`, the played move in SAN and UCI, the engine's best move with its principal variation (SAN), and `best.score` / `scoreAfter`, both from **White's point of view**.
- Set `book: true` for opening-book moves and `legalMoveCount` when known (1 marks a forced move).
- Optional: `refutation` (engine line after the played move) makes explanations of mistakes much better.

The coach validates every move against the rules and rejects analysis that does not match. To let clients ask for a review with just the moves, implement `GameAnalyzer` and pass it as `analyzer` to `ChessServer`.

## HTTP API (game server, port 8787)

All POST routes need `Authorization: Bearer <session token>` (guest tokens work in development).

| Route | Body | Returns |
| --- | --- | --- |
| `GET /coach/status` | | `{ ai, analyzer }` |
| `POST /coach/review` | `{ analysis: GameAnalysis, perspective: "w" \| "b" }` or `{ game: { uciMoves, white, black }, perspective }` when an analyzer is configured | `CoachReview` |
| `POST /coach/chat` | `CoachChatRequest` (FEN, optional engine facts, conversation so far) | `{ reply, source }` |

Limits: 30 reviews and 120 chat messages per player per hour (in memory; move to Redis when the server scales out). Reviews are cached by content, so reopening a game is free.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | unset | Turns the AI coach on. Without it the server gives rule-based reviews and says the AI coach is offline. |
| `COACH_MODEL` | `claude-opus-5-5` | Claude model for reviews and chat |

Reviews use structured outputs and `high` effort; chat uses `medium`. Server-side fallbacks are enabled, so if the model declines a request it is retried on a fallback model. If the API fails, reviews fall back to the offline review instead of erroring.
