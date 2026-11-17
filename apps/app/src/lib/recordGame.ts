import { START_FEN, timeCategory, type ArchivedGame, type GameOutcome, type PlayedMove, type TimeControl } from '@chessmate/core';
import { useEffect, useRef } from 'react';

import { saveGame } from './archive';
import type { OnlineState } from './useOnlineGame';

/** Saves a finished online game to the on-device archive, once. */
export function useRecordOnlineGame(state: OnlineState, timeControl: TimeControl, rated = false) {
  const saved = useRef<string | null>(null);
  const startedAt = useRef<number>(Date.now());
  useEffect(() => {
    if (state.status === 'playing' && saved.current !== state.gameId) startedAt.current = Date.now();
  }, [state.status, state.gameId]);
  useEffect(() => {
    const { outcome, gameId, white, black } = state;
    if (state.status !== 'finished' || !outcome || !gameId || saved.current === gameId) return;
    if (outcome.reason === 'aborted') return;
    saved.current = gameId;
    void saveGame({
      id: `on_${gameId}`,
      source: 'online',
      white: white?.name ?? 'White',
      black: black?.name ?? 'Black',
      whiteRating: white?.rating ?? null,
      blackRating: black?.rating ?? null,
      whiteDelta: null,
      blackDelta: null,
      myColor: state.you,
      timeControl,
      category: timeCategory(timeControl),
      rated,
      result: outcome.result,
      reason: outcome.reason,
      initialFen: START_FEN,
      moves: state.history.map((m) => m.uci),
      startedAt: startedAt.current,
      endedAt: Date.now(),
      eco: null,
      opening: null,
    });
  }, [state, timeControl, rated]);
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
