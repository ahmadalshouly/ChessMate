import { START_FEN, gameToPgn, timeCategory, type ArchivedGame, type Color, type GameOutcome, type PlayedMove } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { saveGame } from './archive';
import type { GameView } from './playClient';

/** What an archive entry needs from a finished online game, as a player (GameView) or a spectator sees it. */
export type FinishedOnlineGame = Pick<GameView, 'gameId' | 'white' | 'black' | 'timeControl' | 'rated' | 'history' | 'ratingChange'> & {
  outcome: GameOutcome;
  /** Your side, or null when watching. */
  you: Color | null;
  /** The mover's clock after each move (ms), when known: written as [%clk]. */
  moveClocks?: (number | null)[];
};

/** Archive entry for a finished online game; also what its PGN is built from. */
export function onlineGameEntry(g: FinishedOnlineGame, startedAt: number, endedAt: number): ArchivedGame {
  const { outcome, white, black, timeControl } = g;
  const delta = (c: Color) => {
    const rc = g.ratingChange?.[c];
    return rc ? Math.round(rc.after.rating) - Math.round(rc.before.rating) : null;
  };
  return {
    id: `on_${g.gameId}`,
    source: 'online',
    white: white.name,
    black: black.name,
    whiteRating: white.rating == null ? null : Math.round(white.rating),
    blackRating: black.rating == null ? null : Math.round(black.rating),
    whiteDelta: delta('w'),
    blackDelta: delta('b'),
    myColor: g.you,
    timeControl,
    category: timeCategory(timeControl),
    rated: g.rated,
    result: outcome.result,
    reason: outcome.reason,
    initialFen: START_FEN,
    moves: g.history.map((m) => m.uci),
    ...(g.moveClocks?.some((c) => c != null) ? { clocks: g.history.map((_, i) => g.moveClocks?.[i] ?? null) } : {}),
    startedAt,
    endedAt,
    eco: null,
    opening: null,
  };
}

/** PGN of a finished online game, dated now (when it is shared, just after it ended). */
export function onlineGamePgn(g: FinishedOnlineGame): string {
  const now = Date.now();
  return gameToPgn(onlineGameEntry(g, now, now));
}

/** Saves a finished online game to the on-device archive, once. */
export function useRecordOnlineGame(view: GameView | null) {
  const saved = useRef<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  const gameId = view?.gameId ?? null;
  useEffect(() => {
    if (gameId && saved.current !== gameId) startedAt.current = Date.now();
  }, [gameId]);
  useEffect(() => {
    if (!view?.outcome || saved.current === view.gameId) return;
    // Secret Queen games cannot be replayed with standard rules, so they stay out of the archive.
    if (view.outcome.reason === 'aborted' || view.variant === 'secretQueen') return;
    saved.current = view.gameId;
    void saveGame(onlineGameEntry({ ...view, outcome: view.outcome }, startedAt.current, Date.now()));
  }, [view]);
}

/** Archive entry for a pass-and-play practice game. */
export function practiceGame(id: string, history: PlayedMove[], outcome: GameOutcome | null, startedAt: number): ArchivedGame {
  return {
    id,
    source: 'practice',
    white: 'White',
    black: 'Black',
    whiteRating: null,
    blackRating: null,
    whiteDelta: null,
    blackDelta: null,
    myColor: null,
    timeControl: null,
    category: null,
    rated: false,
    result: outcome?.result ?? '*',
    reason: outcome?.reason ?? null,
    initialFen: START_FEN,
    moves: history.map((m) => m.uci),
    startedAt,
    endedAt: Date.now(),
    eco: null,
    opening: null,
  };
}
