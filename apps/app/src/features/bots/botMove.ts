import { Game, START_FEN, bookMove, botEngine, chooseBotMove, type BotPersona } from '@chessmate/core';

import { AbortError, localEngine } from '../engine/localEngine';

/**
 * Where a computer opponent's move came from:
 * - `book`      its opening repertoire
 * - `stockfish` Stockfish on this device
 * - `core`      ChessMate's own small search (bots below 1320 always use it)
 * - `fallback`  the small search standing in for Stockfish, which this device
 *               could not run: the bot plays weaker than its rating here
 */
export type BotMoveSource = 'book' | 'stockfish' | 'core' | 'fallback';

export interface BotMoveResult {
  uci: string;
  source: BotMoveSource;
}

/** Lets React paint ("Thinking…") before the small search blocks the thread. */
const yieldToPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Picks a computer opponent's move for the game so far (UCI moves from the
 * starting position). Everything runs on the player's device, so games
 * against the computer work offline and cost the server nothing.
 *
 * Rejects with AbortError when `signal` fires (a takeback, or the game was left).
 */
export async function botMove(bot: Pick<BotPersona, 'rating' | 'style'>, moves: string[], o: { signal?: AbortSignal } = {}): Promise<BotMoveResult> {
  const book = bookMove(bot, { moves });
  if (book) return { uci: book, source: 'book' };

  const plan = botEngine(bot.rating);
  if (plan.kind === 'stockfish' && localEngine.usable) {
    try {
      const r = await localEngine.search(START_FEN, {
        depth: plan.depth,
        multipv: 1,
        movetimeMs: plan.movetimeMs,
        ...(plan.elo ? { elo: plan.elo } : {}),
        urgent: true,
        history: { start: START_FEN, moves },
        signal: o.signal,
      });
      if (r.bestMove && Game.fromUciMoves(moves).isLegal(r.bestMove)) return { uci: r.bestMove, source: 'stockfish' };
    } catch (e) {
      if (e instanceof AbortError) throw e;
      // The engine failed on this device: the small search takes over below.
    }
  }

  if (o.signal?.aborted) throw new AbortError();
  await yieldToPaint();
  if (o.signal?.aborted) throw new AbortError();
  return { uci: chooseBotMove(bot, { moves }).uci, source: plan.kind === 'core' ? 'core' : 'fallback' };
}

/** True when this bot is played by Stockfish, so the screen can start the engine early. */
export function usesStockfish(bot: Pick<BotPersona, 'rating'>): boolean {
  return botEngine(bot.rating).kind === 'stockfish';
}
