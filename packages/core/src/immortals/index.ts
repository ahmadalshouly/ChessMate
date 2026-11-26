import { Chess } from 'chess.js';

import { START_FEN, toUci } from '../game';
import { detectOpening } from '../openings';
import { pgnMovetext } from '../pgn';
import type { AppPath } from '../share';
import type { Color } from '../types';
import { IMMORTAL_GAMES } from './games';
import { IMMORTAL_PLAYERS } from './players';
import { IMMORTAL_THUMBS } from './thumbs';
import type { ImmortalGame, ImmortalMoment, ImmortalPlayer, ImmortalThumb } from './types';

export * from './types';
export { IMMORTAL_GAMES, IMMORTAL_PLAYERS, IMMORTAL_THUMBS };

/*
 * Immortals: legendary players and the famous games they are remembered for.
 * The content ships with the app (it never changes), and these helpers turn a
 * game's score into the moves, positions and links the screens need.
 */

export function immortalPlayer(id: string): ImmortalPlayer | null {
  return IMMORTAL_PLAYERS.find((p) => p.id === id) ?? null;
}

export function immortalGame(id: string): ImmortalGame | null {
  return IMMORTAL_GAMES.find((g) => g.id === id) ?? null;
}

/** Every game a legend played in, the ones told from their side first, oldest first within each group. */
export function immortalGamesOf(playerId: string): ImmortalGame[] {
  const games = IMMORTAL_GAMES.filter((g) => g.legends.includes(playerId));
  return [...games.filter((g) => g.legends[0] === playerId), ...games.filter((g) => g.legends[0] !== playerId)];
}

/** Which side a legend played in a game, or null if they did not play in it. */
export function immortalSide(game: ImmortalGame, playerId: string): Color | null {
  const p = immortalPlayer(playerId);
  if (!p) return null;
  return game.white === p.name ? 'w' : game.black === p.name ? 'b' : null;
}

/** The side the board starts from: the legend the game is told from. */
export function immortalOrientation(game: ImmortalGame): Color {
  return (game.legends[0] && immortalSide(game, game.legends[0])) || 'w';
}

/** How the game went for one of its players. */
export function immortalOutcome(game: ImmortalGame, playerId: string): 'win' | 'loss' | 'draw' | null {
  const side = immortalSide(game, playerId);
  if (!side || game.result === '*') return null;
  if (game.result === '1/2-1/2') return 'draw';
  return (game.result === '1-0') === (side === 'w') ? 'win' : 'loss';
}

/** The year a game was played, from its PGN date. */
export function immortalYear(game: ImmortalGame): number {
  return Number(game.date.slice(0, 4));
}

export interface ImmortalLine {
  /** Moves in SAN, as in the score. */
  san: string[];
  /** The same moves in UCI, for the board, the analysis board and links. */
  uci: string[];
  /** Position before the first move and after every move: fens[ply]. */
  fens: string[];
}

const lines = new Map<string, ImmortalLine>();

/** Plays through a game's score. Throws on an illegal move (the tests replay every game). */
export function immortalLine(game: ImmortalGame): ImmortalLine {
  const cached = lines.get(game.id);
  if (cached) return cached;
  const chess = new Chess();
  chess.loadPgn(game.moves);
  const verbose = chess.history({ verbose: true });
  const line: ImmortalLine = {
    san: verbose.map((m) => m.san),
    uci: verbose.map(toUci),
    fens: [START_FEN, ...verbose.map((m) => m.after)],
  };
  lines.set(game.id, line);
  return line;
}

/** "17...Qxf3" → { ply: 34, san: "Qxf3" }; "18. Bd6" → { ply: 35, san: "Bd6" }. Plies count from 1. */
export function parseMomentMove(at: string): { ply: number; san: string } | null {
  const m = /^(\d+)(\.\.\.|\.)\s*(\S+)$/.exec(at.trim());
  if (!m) return null;
  const moveNo = Number(m[1]);
  const black = m[2] === '...';
  return { ply: (moveNo - 1) * 2 + (black ? 2 : 1), san: m[3]! };
}

export interface ResolvedMoment extends ImmortalMoment {
  /** The position after this move: fens[ply] in the game's line. */
  ply: number;
}

/** A game's moments with the ply each one lands on, in order; any that do not match the score are left out. */
export function immortalMoments(game: ImmortalGame): ResolvedMoment[] {
  const { san } = immortalLine(game);
  const out: ResolvedMoment[] = [];
  for (const moment of game.moments) {
    const at = parseMomentMove(moment.at);
    if (at && san[at.ply - 1] === at.san) out.push({ ...moment, ply: at.ply });
  }
  return out.sort((a, b) => a.ply - b.ply);
}

/** The position a game is best shown by in a list: its first moment, else the final position. */
export function immortalKeyPly(game: ImmortalGame): number {
  const line = immortalLine(game);
  return immortalMoments(game)[0]?.ply ?? line.uci.length;
}

/** Works the key position out from the score: what scripts/build-immortal-thumbs.ts writes to thumbs.ts. */
export function computeImmortalThumb(game: ImmortalGame): ImmortalThumb {
  const line = immortalLine(game);
  const ply = immortalKeyPly(game);
  const fen = line.fens[ply]!;
  const chess = new Chess(fen);
  const check = chess.inCheck() ? (chess.findPiece({ type: 'k', color: chess.turn() })[0] ?? null) : null;
  return { ply, fen, last: ply > 0 ? line.uci[ply - 1]! : null, check, orientation: immortalOrientation(game) };
}

/**
 * The key position a game is shown by in a list. Read from the generated table,
 * so a page of thumbnails never replays a score; a game missing from it (just
 * added, table not rebuilt yet) is worked out instead.
 */
export function immortalThumb(game: ImmortalGame): ImmortalThumb {
  return IMMORTAL_THUMBS[game.id] ?? computeImmortalThumb(game);
}

function pgnTag(name: string, value: string) {
  return `[${name} "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/** Full PGN with the historic tags, ready to copy, download or open elsewhere. */
export function immortalGamePgn(game: ImmortalGame): string {
  const { uci } = immortalLine(game);
  const opening = detectOpening(uci);
  const tags: [string, string][] = [
    ['Event', game.event],
    ['Site', game.site],
    ['Date', game.date],
    ['Round', game.round ?? '?'],
    ['White', game.white],
    ['Black', game.black],
    ['Result', game.result],
  ];
  if (opening) tags.push(['ECO', opening.eco], ['Opening', opening.name]);
  tags.push(['Annotator', `ChessMate Immortals: ${game.title}`]);
  return `${tags.map(([k, v]) => pgnTag(k, v)).join('\n')}\n\n${pgnMovetext(uci, START_FEN, game.result)}\n`;
}

/** The Immortals page. */
export function immortalsPath(): AppPath {
  return { path: '/immortals' };
}

/** A legend's profile. */
export function immortalPlayerPath(id: string): AppPath {
  return { path: `/immortals/${encodeURIComponent(id)}` };
}

/** A famous game's replay, opening on a given ply when one is passed. */
export function immortalGamePath(id: string, ply?: number): AppPath {
  const p: AppPath = { path: `/immortals/game/${encodeURIComponent(id)}` };
  if (ply !== undefined && Number.isFinite(ply)) p.query = { ply: String(Math.max(0, Math.round(ply))) };
  return p;
}

/** One game for today, the same for everyone on the same UTC day, cycling through the collection. */
export function immortalOfTheDay(now: number = Date.now()): ImmortalGame {
  const day = Math.floor(now / 86_400_000);
  return IMMORTAL_GAMES[((day % IMMORTAL_GAMES.length) + IMMORTAL_GAMES.length) % IMMORTAL_GAMES.length]!;
}
