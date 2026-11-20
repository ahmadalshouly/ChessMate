/**
 * Awards: badges players earn from their games. Each award has levels
 * (bronze → diamond); a level is earned when a counter reaches its threshold.
 *
 * The server keeps one `AwardStats` record per player, updated after every
 * finished game with `applyGameToStats` (and rebuilt from the game history
 * the first time). `awardProgress` turns the stats into levels, and
 * `newlyEarned` compares two snapshots to find what a game just unlocked.
 */
import { Chess, type Square } from 'chess.js';

import { openingFamily } from './openings';
import type { TimeCategory } from './timeControl';
import type { Color } from './types';

export const AWARD_CATEGORIES = ['openings', 'ratings', 'countries', 'checkmates', 'milestones'] as const;
export type AwardCategory = (typeof AWARD_CATEGORIES)[number];

/** Level names, lowest first. An award uses as many as it has thresholds. */
export const AWARD_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type AwardTier = (typeof AWARD_TIERS)[number];

export const MATE_TYPES = [
  'backRank',
  'smothered',
  'doubleCheck',
  'discovered',
  'castling',
  'enPassant',
  'promotion',
  'underpromotion',
  'pawn',
  'knight',
  'bishop',
  'rook',
  'queen',
  'king',
  'quick',
] as const;
export type MateType = (typeof MATE_TYPES)[number];

/** Openings with their own award: names (from the openings book) they cover. */
export const AWARD_OPENINGS = {
  sicilian: [/^Sicilian Defense/],
  ruyLopez: [/^Ruy Lopez/],
  italian: [/^Italian Game/],
  french: [/^French Defense/],
  caroKann: [/^Caro-Kann Defense/],
  queensGambit: [/^Queen's Gambit/],
  slav: [/^Slav Defense/, /^Semi-Slav Defense/],
  kingsIndian: [/^King's Indian Defense/],
  nimzoIndian: [/^Nimzo-Indian Defense/],
  grunfeld: [/^Grünfeld Defense/, /^Neo-Grünfeld Defense/],
  english: [/^English Opening/],
  london: [/London System/],
  kingsGambit: [/^King's Gambit/],
  scotch: [/^Scotch Game/],
  vienna: [/^Vienna/],
  scandinavian: [/^Scandinavian Defense/],
  pirc: [/^Pirc Defense/, /^Modern Defense/],
  dutch: [/^Dutch Defense/],
  catalan: [/^Catalan Opening/],
  petrov: [/^Petrov's Defense/],
  alekhine: [/^Alekhine Defense/],
  benoni: [/^Benoni Defense/, /^Benko Gambit/],
} as const satisfies Record<string, readonly RegExp[]>;
export type AwardOpening = keyof typeof AWARD_OPENINGS;

/** Opening awards a named opening counts towards. */
export function awardOpeningsOf(name: string | null | undefined): AwardOpening[] {
  if (!name) return [];
  return (Object.keys(AWARD_OPENINGS) as AwardOpening[]).filter((k) => AWARD_OPENINGS[k].some((re) => re.test(name)));
}

export const AWARD_RATING_CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical'] as const satisfies readonly TimeCategory[];

/** Everything awards are computed from, for one player. */
export interface AwardStats {
  games: number;
  wins: number;
  /** Wins per opening award. */
  openingWins: Partial<Record<AwardOpening, number>>;
  /** Opening families played (any result), for the explorer award. */
  families: string[];
  /** Highest rating reached per time category. */
  peaks: Partial<Record<TimeCategory, number>>;
  /** Countries of opponents played, and of opponents beaten (ISO codes). */
  countries: string[];
  countriesBeaten: string[];
  /** Checkmates delivered, in total and by pattern. */
  mates: number;
  mateTypes: Partial<Record<MateType, number>>;
}

export const emptyAwardStats = (): AwardStats => ({
  games: 0,
  wins: 0,
  openingWins: {},
  families: [],
  peaks: {},
  countries: [],
  countriesBeaten: [],
  mates: 0,
  mateTypes: {},
});

/** Fills a stored record with defaults (older or partial records). */
export function cleanAwardStats(raw: unknown): AwardStats {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AwardStats>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const rec = <K extends string>(v: unknown) => {
    const out: Partial<Record<K, number>> = {};
    if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out[k as K] = n;
    return out;
  };
  return {
    games: num(r.games),
    wins: num(r.wins),
    openingWins: rec<AwardOpening>(r.openingWins),
    families: strs(r.families),
    peaks: rec<TimeCategory>(r.peaks),
    countries: strs(r.countries),
    countriesBeaten: strs(r.countriesBeaten),
    mates: num(r.mates),
    mateTypes: rec<MateType>(r.mateTypes),
  };
}

/** What one finished game means for one player. */
export interface AwardGameFacts {
  result: 'win' | 'draw' | 'loss';
  /** Full opening name from the book, if recognised. */
  openingName: string | null;
  category: TimeCategory;
  /** Rating after the game (rated games). */
  ratingAfter: number | null;
  opponentCountry: string | null;
  /** Checkmate patterns, when this player delivered mate. */
  mateTypes: MateType[];
}

export function applyGameToStats(stats: AwardStats, g: AwardGameFacts): AwardStats {
  const s: AwardStats = {
    ...stats,
    openingWins: { ...stats.openingWins },
    peaks: { ...stats.peaks },
    mateTypes: { ...stats.mateTypes },
  };
  s.games += 1;
  const won = g.result === 'win';
  if (won) s.wins += 1;
  if (g.openingName) {
    const fam = openingFamily(g.openingName);
    if (!s.families.includes(fam)) s.families = [...s.families, fam];
    if (won) for (const k of awardOpeningsOf(g.openingName)) s.openingWins[k] = (s.openingWins[k] ?? 0) + 1;
  }
  if (g.ratingAfter != null) s.peaks[g.category] = Math.max(s.peaks[g.category] ?? 0, Math.round(g.ratingAfter));
  const country = g.opponentCountry?.toUpperCase();
  if (country) {
    if (!s.countries.includes(country)) s.countries = [...s.countries, country];
    if (won && !s.countriesBeaten.includes(country)) s.countriesBeaten = [...s.countriesBeaten, country];
  }
  if (won && g.mateTypes.length) {
    s.mates += 1;
    for (const t of new Set(g.mateTypes)) s.mateTypes[t] = (s.mateTypes[t] ?? 0) + 1;
  }
  return s;
}

/** A rating outside games (current rating) can also set a peak. */
export function withPeak(stats: AwardStats, category: TimeCategory, rating: number): AwardStats {
  const cur = stats.peaks[category] ?? 0;
  return rating > cur ? { ...stats, peaks: { ...stats.peaks, [category]: Math.round(rating) } } : stats;
}

export interface AwardDefinition {
  /** Stable id: "opening.sicilian", "rating.blitz", "mate.smothered", … */
  id: string;
  category: AwardCategory;
  /** Thresholds per level, lowest first (at most five). */
  levels: readonly number[];
  value(s: AwardStats): number;
  /** Parameters for the name and description (opening key, time category, mate type). */
  params: { opening?: AwardOpening; category?: TimeCategory; mate?: MateType };
}

const MATE_LEVELS: Record<MateType, readonly number[]> = {
  backRank: [1, 5, 25, 100],
  smothered: [1, 3, 10, 25],
  doubleCheck: [1, 5, 15, 50],
  discovered: [1, 5, 15, 50],
  castling: [1, 2, 5, 10],
  enPassant: [1, 2, 3, 5],
  promotion: [1, 5, 15, 50],
  underpromotion: [1, 2, 5, 10],
  pawn: [1, 5, 25, 100],
  knight: [1, 10, 50, 200],
  bishop: [1, 10, 50, 200],
  rook: [1, 10, 50, 200],
  queen: [1, 25, 100, 500],
  king: [1, 3, 10, 25],
  quick: [1, 5, 25, 100],
};

export const AWARDS: readonly AwardDefinition[] = [
  ...(Object.keys(AWARD_OPENINGS) as AwardOpening[]).map<AwardDefinition>((k) => ({
    id: `opening.${k}`,
    category: 'openings',
    levels: [1, 10, 25, 50, 100],
    value: (s) => s.openingWins[k] ?? 0,
    params: { opening: k },
  })),
  { id: 'openings.explorer', category: 'openings', levels: [5, 15, 30, 60, 100], value: (s) => s.families.length, params: {} },
  ...AWARD_RATING_CATEGORIES.map<AwardDefinition>((c) => ({
    id: `rating.${c}`,
    category: 'ratings',
    levels: [1200, 1500, 1800, 2100, 2400],
    value: (s) => s.peaks[c] ?? 0,
    params: { category: c },
  })),
  { id: 'countries.played', category: 'countries', levels: [3, 10, 25, 50, 100], value: (s) => s.countries.length, params: {} },
  { id: 'countries.beaten', category: 'countries', levels: [3, 10, 25, 50, 75], value: (s) => s.countriesBeaten.length, params: {} },
  { id: 'mates.total', category: 'checkmates', levels: [1, 10, 50, 200, 500], value: (s) => s.mates, params: {} },
  ...MATE_TYPES.map<AwardDefinition>((m) => ({
    id: `mate.${m}`,
    category: 'checkmates',
    levels: MATE_LEVELS[m],
    value: (s) => s.mateTypes[m] ?? 0,
    params: { mate: m },
  })),
  { id: 'games.played', category: 'milestones', levels: [10, 100, 500, 1000, 5000], value: (s) => s.games, params: {} },
  { id: 'games.won', category: 'milestones', levels: [1, 50, 250, 1000, 2500], value: (s) => s.wins, params: {} },
];

export const AWARDS_BY_ID: ReadonlyMap<string, AwardDefinition> = new Map(AWARDS.map((a) => [a.id, a]));

export interface AwardProgress {
  id: string;
  category: AwardCategory;
  /** Levels earned (0 = none yet). */
  level: number;
  /** Highest level this award has. */
  maxLevel: number;
  value: number;
  /** Threshold of the next level, null when maxed. */
  next: number | null;
  /** Threshold of the current level (0 before the first). */
  current: number;
}

export const levelFor = (def: AwardDefinition, value: number) => def.levels.filter((t) => value >= t).length;

export function awardProgress(stats: AwardStats): AwardProgress[] {
  return AWARDS.map((def) => {
    const value = def.value(stats);
    const level = levelFor(def, value);
    return {
      id: def.id,
      category: def.category,
      level,
      maxLevel: def.levels.length,
      value,
      next: def.levels[level] ?? null,
      current: level > 0 ? def.levels[level - 1]! : 0,
    };
  });
}

export interface EarnedLevel {
  id: string;
  level: number;
}

/** Levels reached in `after` that were not in `before`. */
export function newlyEarned(before: AwardStats, after: AwardStats): EarnedLevel[] {
  const out: EarnedLevel[] = [];
  for (const def of AWARDS) {
    const a = levelFor(def, def.value(before));
    const b = levelFor(def, def.value(after));
    for (let l = a + 1; l <= b; l++) out.push({ id: def.id, level: l });
  }
  return out;
}

/** All levels a stats record has reached. */
export function earnedLevels(stats: AwardStats): EarnedLevel[] {
  return newlyEarned(emptyAwardStats(), stats);
}

export const tierOf = (level: number): AwardTier => AWARD_TIERS[Math.min(AWARD_TIERS.length, Math.max(1, level)) - 1]!;

// ---------------------------------------------------------------------------
// Checkmate patterns

const FILES = 'abcdefgh';
const sq = (f: number, r: number): Square | null => (f >= 0 && f < 8 && r >= 0 && r < 8 ? (`${FILES[f]}${r + 1}` as Square) : null);
const fr = (s: string) => [FILES.indexOf(s[0]!), Number(s[1]) - 1] as const;

/** Squares of `by` pieces giving check to the king on `king`. */
function checkers(chess: Chess, king: Square, by: Color): Square[] {
  const [kf, kr] = fr(king);
  const out: Square[] = [];
  const at = (f: number, r: number) => {
    const s = sq(f, r);
    return s ? { s, p: chess.get(s) } : null;
  };
  // Knights
  for (const [df, dr] of [
    [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
  ] as const) {
    const x = at(kf + df, kr + dr);
    if (x?.p && x.p.color === by && x.p.type === 'n') out.push(x.s);
  }
  // Pawns: a white pawn attacks diagonally upwards, so it sits one rank below the king.
  const pr = by === 'w' ? kr - 1 : kr + 1;
  for (const df of [-1, 1]) {
    const x = at(kf + df, pr);
    if (x?.p && x.p.color === by && x.p.type === 'p') out.push(x.s);
  }
  // Sliders
  for (const [df, dr] of [
    [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  ] as const) {
    const diag = df !== 0 && dr !== 0;
    for (let i = 1; i < 8; i++) {
      const x = at(kf + df * i, kr + dr * i);
      if (!x) break;
      if (!x.p) continue;
      if (x.p.color === by && (x.p.type === 'q' || (diag ? x.p.type === 'b' : x.p.type === 'r'))) out.push(x.s);
      break;
    }
  }
  return out;
}

/**
 * Patterns of a mating move (UCI) played from `fenBefore`; empty when the
 * move is illegal or not mate. `ply` is the game ply after the move.
 */
export function checkmatePatterns(fenBefore: string, uci: string, ply = 99): MateType[] {
  let chess: Chess;
  let move;
  try {
    chess = new Chess(fenBefore);
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' });
  } catch {
    return [];
  }
  if (!chess.isCheckmate()) return [];
  const mover = move.color;
  const mated: Color = mover === 'w' ? 'b' : 'w';
  const king = chess.board().flat().find((p) => p && p.type === 'k' && p.color === mated)?.square;
  if (!king) return [];
  const types = new Set<MateType>();
  const checks = checkers(chess, king, mover);
  const castled = move.flags.includes('k') || move.flags.includes('q');
  if (castled) types.add('castling');
  if (move.flags.includes('e')) types.add('enPassant');
  if (move.promotion) types.add(move.promotion === 'q' ? 'promotion' : 'underpromotion');
  if (checks.length >= 2) types.add('doubleCheck');
  // The piece standing on the arrival square gives check unless the mate was discovered.
  const direct = checks.includes(move.to as Square);
  if (!direct && !castled) types.add('discovered');
  if (castled) types.add('rook');
  if (move.piece === 'k' && !castled) types.add('king');
  if (direct) {
    const piece = chess.get(move.to as Square)!.type;
    types.add(({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const)[piece]);
  } else if (checks.length) {
    // Discovered mate: credit the piece that gives check.
    const piece = chess.get(checks[0]!)!.type;
    if (piece !== 'k') types.add(({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' } as const)[piece]);
  }
  const [kf, kr] = fr(king);
  const neighbours = [-1, 0, 1].flatMap((df) => [-1, 0, 1].map((dr) => (df || dr ? sq(kf + df, kr + dr) : null))).filter((s): s is Square => !!s);
  // Smothered: a knight mates a king boxed in by its own pieces.
  if (checks.length === 1 && chess.get(checks[0]!)?.type === 'n' && neighbours.every((s) => chess.get(s)?.color === mated)) types.add('smothered');
  // Back rank: king on its first rank, mated along that rank by a rook or queen,
  // with its own pieces blocking the way forward.
  const home = mated === 'w' ? 0 : 7;
  const fwd = mated === 'w' ? 1 : -1;
  if (kr === home && checks.length >= 1) {
    const alongRank = checks.some((c) => fr(c)[1] === home && ['r', 'q'].includes(chess.get(c)!.type));
    const blocked = [-1, 0, 1].map((df) => sq(kf + df, kr + fwd)).filter((s): s is Square => !!s).every((s) => chess.get(s)?.color === mated);
    if (alongRank && blocked) types.add('backRank');
  }
  if (ply <= 30) types.add('quick');
  return [...types];
}
