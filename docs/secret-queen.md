# Secret Queen

A ChessMate variant with hidden information, just for fun. Start it from the setup pop-up (choose **Secret Queen** under *Game*); the choice goes back to Standard after each search, and the lobby's own Play button always plays normal chess. Secret Queen has its own matchmaking pool, is always casual, and never touches ratings, game history, reviews or fair-play analysis.

## Rules

1. Before their first move, each player secretly picks one of their pawns: the pawns you can pick are highlighted; tap one. The choice is final. If the time for the first move runs low and you move without picking, a random pawn is picked for you.
2. Your opponent sees an ordinary pawn. You can move it like a pawn (it stays secret) or like a queen. A queen move reveals it: from then on it is a normal, visible queen.
3. It shows itself as soon as it must:
   - when it gives check as a queen (directly or by discovery);
   - when your opponent tries a move that is illegal only because of it, such as their king stepping into its line, or moving a piece it pins. That move is refused, the queen is revealed and they move again.
4. Captured while hidden, it is just a pawn (the capturer is told it was the secret queen). Promoting it ends the secret: it becomes the piece you promote to.
5. Check, checkmate, stalemate and draws are judged on the true position. Both secret pawns are shown when the game ends.

## How it is built

- `packages/core/src/secretQueen.ts`: the rules engine (`SecretQueenGame`). It keeps the public position (secrets drawn as pawns) and the two secret squares, and judges moves on the truth: your own secret as a queen, the opponent's as a queen for king safety.
- The server (`gameRoom.ts`, `server.ts`) never sends a player the opponent's secret. Owners get `{ t: 'secret' }` messages; everyone gets public positions in `moved` and snapshots, plus `reveals`.
- The app (`usePlayBoard`, `playClient`) shows queen moves for your own secret pawn, a crown on it, a pick prompt before your first move, and a notice when something is revealed.
- Secret Queen games are not stored in game history, reviewed by the engine or analysed for fair play, because pawns that moved like queens cannot be replayed with standard rules.
