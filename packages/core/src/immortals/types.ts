import type { GameResult } from '../types';

/** What a game is remembered for; the Immortals page filters by these. */
export type ImmortalTheme = 'sacrifice' | 'attack' | 'kingHunt' | 'strategy' | 'titleMatch' | 'prodigy';

export const IMMORTAL_THEMES: readonly ImmortalTheme[] = ['sacrifice', 'attack', 'kingHunt', 'strategy', 'titleMatch', 'prodigy'];

/** A legendary player with a short profile. */
export interface ImmortalPlayer {
  /** Stable slug used in links ("/immortals/tal"). */
  id: string;
  name: string;
  /** One line under the name: "The Magician from Riga". */
  tagline: string;
  born: number;
  /** Year of death; null while alive. */
  died: number | null;
  birthplace: string;
  /** Years as World Champion ("1960–1961"), or null for those who never held the title. */
  worldChampion: string | null;
  /** A few short paragraphs. */
  bio: string[];
}

/** A turning point in a game, shown when the replay reaches it. */
export interface ImmortalMoment {
  /** The move as written in the score: "18. Bd6" for White, "17...Qxf3" for Black. */
  at: string;
  note: string;
}

/** A famous game with its story. Historic game scores are public domain. */
export interface ImmortalGame {
  /** Stable slug used in links ("/immortals/game/immortal-game"). */
  id: string;
  /** The name it goes by: "The Immortal Game". */
  title: string;
  white: string;
  black: string;
  event: string;
  site: string;
  /** PGN date: "1956.10.17", or "1851.??.??" when only the year is known. */
  date: string;
  round?: string;
  result: GameResult;
  /**
   * Legends who played it, by player id. The first is the one the game is told
   * from (the board starts from their side) and whose page it leads on.
   */
  legends: string[];
  themes: ImmortalTheme[];
  /** Movetext in SAN with move numbers and no result ("1. e4 e5 2. f4 ..."). */
  moves: string;
  /** One line for lists. */
  summary: string;
  /** The story of the game, a few short paragraphs. */
  story: string[];
  moments: ImmortalMoment[];
}
