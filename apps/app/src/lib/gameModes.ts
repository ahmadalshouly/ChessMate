import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { TKey } from '@/i18n';

/**
 * Game modes offered in the "new game" popup (SeekSheet). Standard chess is
 * the only one for now. To add a mode (Secret Queen, ...): add its id here,
 * an entry to GAME_MODES with its text in `locales/<lang>/play.ts` under
 * `play.modes`, and send it with the seek (`SeekRequest.mode`) once the
 * server pairs players by mode.
 */
export type GameModeId = 'standard';

export interface GameMode {
  id: GameModeId;
  title: TKey;
  body: TKey;
  glyph: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Modes that cannot be rated are forced to casual in the popup. */
  ratedAllowed: boolean;
}

export const GAME_MODES: GameMode[] = [{ id: 'standard', title: 'play.modes.standard.title', body: 'play.modes.standard.body', glyph: 'chess-king', ratedAllowed: true }];
