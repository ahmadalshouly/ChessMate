import { START_FEN, timeCategory, type ArchivedGame, type GameOutcome, type PlayedMove } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { saveGame } from './archive';
import type { GameView } from './playClient';

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
    const { outcome, white, black, timeControl } = view;
    if (outcome.reason === 'aborted') return;
    // The archive replays standard chess; Secret Queen games are not saved yet.
    if (view.variant !== 'standard') return;
    saved.current = view.gameId;
    const delta = (c: 'w' | 'b') => {
      const rc = view.ratingChange?.[c];
      return rc ? Math.round(rc.after.rating - rc.before.rating) : null;
    };
    void saveGame({
      id: `on_${view.gameId}`,
      source: 'online',
      white: white.name,
      black: black.name,
      whiteRating: white.rating,
      blackRating: black.rating,
      whiteDelta: delta('w'),
      blackDelta: delta('b'),
      myColor: view.you,
      timeControl,
      category: timeCategory(timeControl),
      rated: view.rated,
      result: outcome.result,
      reason: outcome.reason,
      initialFen: START_FEN,
      moves: view.history.map((m) => m.uci),
      startedAt: startedAt.current,
      endedAt: Date.now(),
      eco: null,
      opening: null,
    });
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
