import { Game, parseUci } from './game';
import { DEFAULT_RATING, updateRating, type Rating } from './rating';
import type { Color, Square } from './types';

/**
 * Tactics puzzles in the format of the Lichess puzzle database (CC0):
 * https://database.lichess.org/#puzzles
 *
 * `fen` is the position BEFORE the opponent's last move. `moves[0]` is that
 * opponent move (played automatically), then the solver and the opponent
 * alternate. The solver always plays the odd-indexed moves.
 */
export interface Puzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  plays: number;
  themes: string[];
  gameUrl: string | null;
  openingTags: string[];
}

export const PUZZLE_CSV_HEADER = 'PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags';

/** Splits one CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parses one data row of the puzzle CSV. Returns null for the header, blank
 * lines and malformed rows (wrong column count, bad FEN, illegal moves).
 */
export function parsePuzzleCsvLine(line: string, opts: { validate?: boolean } = {}): Puzzle | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('PuzzleId,')) return null;
  const c = splitCsvLine(trimmed);
  if (c.length < 8) return null;
  const [id, fen, moves, rating, rd, popularity, plays, themes, gameUrl, openingTags] = c;
  const p: Puzzle = {
    id: id!,
    fen: fen!,
    moves: moves!.split(' ').filter(Boolean),
    rating: Number(rating),
    ratingDeviation: Number(rd),
    popularity: Number(popularity),
    plays: Number(plays),
    themes: themes!.split(' ').filter(Boolean),
    gameUrl: gameUrl || null,
    openingTags: (openingTags ?? '').split(' ').filter(Boolean),
  };
  if (!/^[\w-]{1,16}$/.test(p.id) || p.moves.length < 2 || !Number.isFinite(p.rating)) return null;
  if (opts.validate && !isValidPuzzle(p)) return null;
  return p;
}

/** Every move of the line is legal from the start position. */
export function isValidPuzzle(p: Pick<Puzzle, 'fen' | 'moves'>): boolean {
  try {
    Game.fromUciMoves(p.moves, p.fen);
    return true;
  } catch {
    return false;
  }
}

export function puzzleToCsvLine(p: Puzzle): string {
  return [
    p.id,
    p.fen,
    p.moves.join(' '),
    p.rating,
    p.ratingDeviation,
    p.popularity,
    p.plays,
    p.themes.join(' '),
    p.gameUrl ?? '',
    p.openingTags.join(' '),
  ].join(',');
}

// ---------------------------------------------------------------------------
// Solving
// ---------------------------------------------------------------------------

export interface PuzzleState {
  puzzle: Pick<Puzzle, 'fen' | 'moves'>;
  /** Moves played so far, including the opponent's setup move. */
  played: string[];
  /** Colour the solver plays. */
  solver: Color;
  status: 'playing' | 'solved' | 'failed';
  /** Wrong moves made so far (a wrong move fails the puzzle for rating). */
  mistakes: number;
  /** Hint level reached: 0 none, 1 piece shown, 2 move shown. */
  hints: number;
}

/** Position the solver sees: setup move already played. */
export function startPuzzle(puzzle: Pick<Puzzle, 'fen' | 'moves'>): PuzzleState {
  const g = new Game(puzzle.fen);
  const solver: Color = g.turn === 'w' ? 'b' : 'w';
  return { puzzle, played: [puzzle.moves[0]!], solver, status: 'playing', mistakes: 0, hints: 0 };
}

export function puzzleFen(state: PuzzleState): string {
  return Game.fromUciMoves(state.played, state.puzzle.fen).fen;
}

export function expectedMove(state: PuzzleState): string | null {
  return state.status === 'playing' ? (state.puzzle.moves[state.played.length] ?? null) : null;
}

export type PuzzleMoveResult =
  /** Right move; `reply` is the opponent's answer to animate, if any. */
  | { kind: 'correct'; state: PuzzleState; reply: string | null }
  | { kind: 'solved'; state: PuzzleState }
  | { kind: 'wrong'; state: PuzzleState }
  | { kind: 'illegal'; state: PuzzleState };

function sameMove(played: string, expected: string): boolean {
  if (played === expected) return true;
  // The board auto-queens until a promotion picker ships, so accept a
  // promotion on the right squares whatever piece was chosen.
  return played.length === 5 && expected.length === 5 && played.slice(0, 4) === expected.slice(0, 4);
}

/**
 * Plays the solver's move. Like the database's own convention, any move that
 * delivers checkmate is accepted even when it differs from the stored line.
 * A wrong move is undone: the state keeps the position so the solver can retry
 * (but the attempt now counts as failed for rating purposes).
 */
export function playPuzzleMove(state: PuzzleState, uci: string): PuzzleMoveResult {
  const expected = expectedMove(state);
  if (!expected) return { kind: 'illegal', state };
  const g = Game.fromUciMoves(state.played, state.puzzle.fen);
  const played = g.move(uci);
  if (!played) return { kind: 'illegal', state };
  const isMate = g.raw.isCheckmate();
  if (!sameMove(played.uci, expected) && !isMate) {
    return { kind: 'wrong', state: { ...state, mistakes: state.mistakes + 1 } };
  }
  const afterSolver = [...state.played, isMate ? played.uci : expected];
  if (isMate || afterSolver.length >= state.puzzle.moves.length) {
    return { kind: 'solved', state: { ...state, played: afterSolver, status: 'solved' } };
  }
  const reply = state.puzzle.moves[afterSolver.length]!;
  const next = [...afterSolver, reply];
  const done = next.length >= state.puzzle.moves.length;
  return { kind: 'correct', state: { ...state, played: next, status: done ? 'solved' : 'playing' }, reply };
}

/** Gives up: plays out the remaining solution. */
export function revealSolution(state: PuzzleState): PuzzleState {
  return { ...state, played: [...state.puzzle.moves], status: 'failed', hints: 2 };
}

export interface PuzzleHint {
  level: 1 | 2;
  from: Square;
  to?: Square;
  text: string;
}

const PIECE_WORD: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Next hint: first which piece to move, then the full move. */
export function nextHint(state: PuzzleState): { state: PuzzleState; hint: PuzzleHint } | null {
  const expected = expectedMove(state);
  if (!expected) return null;
  const { from, to } = parseUci(expected);
  const g = Game.fromUciMoves(state.played, state.puzzle.fen);
  const piece = g.raw.get(from);
  const word = piece ? PIECE_WORD[piece.type] : 'piece';
  const level = state.hints >= 1 ? 2 : 1;
  const san = g.legalMoves(from).find((m) => m.to === to)?.san ?? expected;
  const hint: PuzzleHint =
    level === 1 ? { level, from, text: `Look at your ${word} on ${from}.` } : { level, from, to, text: `Play ${san}.` };
  return { state: { ...state, hints: level }, hint };
}

/** Clean solve: no mistakes and no hints. Anything else counts as a miss. */
export function puzzleScore(state: PuzzleState): 0 | 1 {
  return state.status === 'solved' && state.mistakes === 0 && state.hints === 0 ? 1 : 0;
}

/**
 * Server-side check of a submitted attempt: replays the solver's moves
 * against the stored line, so a client cannot claim a solve it did not make.
 */
export function gradeAttempt(puzzle: Pick<Puzzle, 'fen' | 'moves'>, solverMoves: string[], hints: number): { solved: boolean; score: 0 | 1 } {
  let s = startPuzzle(puzzle);
  for (const m of solverMoves) {
    if (s.status !== 'playing') break;
    const r = playPuzzleMove(s, m);
    if (r.kind === 'illegal') return { solved: false, score: 0 };
    s = r.state;
    if (r.kind === 'wrong') return { solved: false, score: 0 };
  }
  const solved = s.status === 'solved';
  return { solved, score: solved && hints === 0 ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

export const DEFAULT_PUZZLE_RATING: Rating = DEFAULT_RATING;

/** Glicko-2 update treating the puzzle as the opponent. */
export function updatePuzzleRating(player: Rating, puzzle: Pick<Puzzle, 'rating' | 'ratingDeviation'>, score: 0 | 1): Rating {
  const opponent: Rating = { rating: puzzle.rating, rd: Math.max(puzzle.ratingDeviation, 50), volatility: 0.06 };
  return updateRating(player, [{ opponent, score }]);
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export type PuzzleRunMode = 'streak' | 'rush';

export const RUSH_DURATION_MS = 3 * 60_000;
export const RUSH_LIVES = 3;

/**
 * Difficulty ladder for streak and rush: starts easy and climbs. Streak
 * climbs slowly (one mistake ends it); rush climbs fast against the clock.
 */
export function runTargetRating(mode: PuzzleRunMode, index: number): number {
  return mode === 'rush' ? Math.min(600 + index * 55, 2900) : Math.min(800 + index * 35, 2900);
}

/** Day key used to pick the daily puzzle, in UTC (e.g. "2026-11-16"). */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Stable 32-bit hash (FNV-1a), for deterministic daily picks. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Human labels for the most useful database themes, grouped for the filter. */
export const PUZZLE_THEME_GROUPS: { title: string; themes: Record<string, string> }[] = [
  {
    title: 'Mates',
    themes: {
      mate: 'Checkmate',
      mateIn1: 'Mate in 1',
      mateIn2: 'Mate in 2',
      mateIn3: 'Mate in 3',
      backRankMate: 'Back rank mate',
      smotheredMate: 'Smothered mate',
      hookMate: 'Hook mate',
      arabianMate: 'Arabian mate',
      anastasiaMate: "Anastasia's mate",
      bodenMate: "Boden's mate",
      doubleBishopMate: 'Double bishop mate',
      dovetailMate: 'Dovetail mate',
    },
  },
  {
    title: 'Tactics',
    themes: {
      fork: 'Fork',
      pin: 'Pin',
      skewer: 'Skewer',
      discoveredAttack: 'Discovered attack',
      doubleCheck: 'Double check',
      hangingPiece: 'Hanging piece',
      trappedPiece: 'Trapped piece',
      sacrifice: 'Sacrifice',
      deflection: 'Deflection',
      attraction: 'Attraction',
      clearance: 'Clearance',
      interference: 'Interference',
      intermezzo: 'Intermezzo',
      xRayAttack: 'X-ray attack',
      zugzwang: 'Zugzwang',
      capturingDefender: 'Remove the defender',
      quietMove: 'Quiet move',
      defensiveMove: 'Defensive move',
      kingsideAttack: 'Kingside attack',
      queensideAttack: 'Queenside attack',
      exposedKing: 'Exposed king',
      advancedPawn: 'Advanced pawn',
      promotion: 'Promotion',
      underPromotion: 'Underpromotion',
      enPassant: 'En passant',
      castling: 'Castling',
    },
  },
  {
    title: 'Phase',
    themes: {
      opening: 'Opening',
      middlegame: 'Middlegame',
      endgame: 'Endgame',
      rookEndgame: 'Rook endgame',
      bishopEndgame: 'Bishop endgame',
      knightEndgame: 'Knight endgame',
      pawnEndgame: 'Pawn endgame',
      queenEndgame: 'Queen endgame',
      queenRookEndgame: 'Queen and rook',
    },
  },
  {
    title: 'Length',
    themes: {
      oneMove: 'One move',
      short: 'Short',
      long: 'Long',
      veryLong: 'Very long',
    },
  },
  {
    title: 'Goal',
    themes: {
      crushing: 'Crushing',
      advantage: 'Advantage',
      equality: 'Equality',
    },
  },
];

export const PUZZLE_THEME_LABELS: Record<string, string> = Object.assign({}, ...PUZZLE_THEME_GROUPS.map((g) => g.themes));

export function themeLabel(theme: string): string {
  return PUZZLE_THEME_LABELS[theme] ?? theme.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// HTTP API shapes shared by server and app
// ---------------------------------------------------------------------------

/** What the app receives: the full line is needed to animate replies offline-fast. */
export type PuzzleDto = Pick<Puzzle, 'id' | 'fen' | 'moves' | 'rating' | 'themes' | 'plays'>;

export interface PuzzleProfileDto {
  rating: number;
  rd: number;
  provisional: boolean;
  attempts: number;
  solved: number;
  bestStreak: number;
  bestRush: number;
}

export interface PuzzleAttemptResponse {
  solved: boolean;
  /** Present when the attempt was rated (signed-in player, first try). */
  rating?: { before: number; after: number };
}
