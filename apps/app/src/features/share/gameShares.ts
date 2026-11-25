import { analysisPath, gamePath, gameToPgn, type ArchivedGame } from '@chessmate/core';

import { serverGameId } from '@/features/engine';
import { translate } from '@/i18n';

import type { GameShare } from './ShareGame';

/** "Alice vs Bob", the name a shared game goes by. */
export const vsTitle = (white: string, black: string) => translate('games.vsPlayers', { white, black });

/**
 * A finished game from your history or a profile: online games link to the
 * server's game page; practice and imported games carry their moves to the
 * analysis board.
 */
export function archivedGameShare(game: ArchivedGame): GameShare {
  return {
    title: vsTitle(game.white, game.black),
    link: game.source === 'online' ? gamePath(serverGameId(game.id)) : analysisPath({ moves: game.moves, initialFen: game.initialFen }),
    pgn: () => gameToPgn(game),
  };
}
