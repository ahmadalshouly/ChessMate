import { START_FEN } from '../game';
import { MATE_SCORE, createSearcher, positionFromMoves, type SearchResult } from './engine';
import { repertoireMove } from './repertoire';
import { BOT_STYLES, type BotStyle } from './styles';

export { BOT_STYLES, type BotStyle } from './styles';

/**
 * Computer opponents for unrated practice games, from a first-day beginner up
 * to full engine strength (about 3500).
 *
 * Every opponent is described by two things only: an approximate **rating**
 * and a playing **style**. Everything else (how deep it looks, how often it
 * slips, which engine plays its moves) follows from the rating through
 * `botEngine`, so a bot that staff create in the console at 2650 plays exactly
 * like a built-in one at 2650. The style picks the openings it likes.
 *
 * Two engines share the work:
 * - Below 1320, ChessMate's own small search with deliberate imprecision
 *   (noise on move scores and the odd careless move). It runs anywhere.
 * - From 1320 up, Stockfish on the player's device. Up to 3190 it plays with
 *   Stockfish's own strength limit (UCI_Elo, calibrated by the Stockfish team
 *   on the CCRL scale); above that at full strength, thinking longer the
 *   higher the rating. Where the device cannot run Stockfish, the app falls
 *   back to the small search at its strongest (`chooseBotMove`).
 *
 * Ratings are a guide for players, not a measured rating on the ChessMate
 * ladder: games against the computer are never rated.
 */

/** Lowest and highest rating a computer opponent can have. */
export const BOT_RATING_MIN = 250;
export const BOT_RATING_MAX = 3500;

/** Stockfish's own strength limit covers this range (UCI_Elo). */
export const STOCKFISH_ELO_MIN = 1320;
export const STOCKFISH_ELO_MAX = 3190;

/** Rating bands the opponent picker groups bots into, weakest first. */
export const BOT_BANDS = [
  { id: 'beginner', min: BOT_RATING_MIN, max: 799 },
  { id: 'novice', min: 800, max: 1199 },
  { id: 'intermediate', min: 1200, max: 1599 },
  { id: 'club', min: 1600, max: 1999 },
  { id: 'expert', min: 2000, max: 2399 },
  { id: 'master', min: 2400, max: 2799 },
  { id: 'grandmaster', min: 2800, max: 3199 },
  { id: 'superhuman', min: 3200, max: BOT_RATING_MAX },
] as const;

export type BotBandId = (typeof BOT_BANDS)[number]['id'];

export function clampBotRating(rating: number): number {
  return Math.round(Math.min(BOT_RATING_MAX, Math.max(BOT_RATING_MIN, Number.isFinite(rating) ? rating : BOT_RATING_MIN)));
}

/** The band a rating falls in. */
export function botBandOf(rating: number): BotBandId {
  const r = clampBotRating(rating);
  return (BOT_BANDS.find((b) => r >= b.min && r <= b.max) ?? BOT_BANDS[BOT_BANDS.length - 1]!).id;
}

/** What it takes to play like a given bot: its strength and its taste in openings. */
export interface BotPersona {
  id: string;
  name: string;
  /** Approximate playing strength, shown to players as a guide only. */
  rating: number;
  style: BotStyle;
}

/** A computer opponent that ships with the app. */
export interface BotProfile extends BotPersona {
  /** Single-letter monogram used for the avatar. */
  initial: string;
}

/**
 * The built-in opponents, weakest first: three or four per band, each with
 * its own style. Every persona is original to ChessMate. Their one-line
 * descriptions are translated in the app (`bots.taglines.<id>`).
 */
export const BOTS: readonly BotProfile[] = [
  // Beginner
  { id: 'nib', name: 'Nib', rating: 250, initial: 'N', style: 'balanced' },
  { id: 'pip', name: 'Pip', rating: 400, initial: 'P', style: 'balanced' },
  { id: 'bramble', name: 'Bramble', rating: 550, initial: 'B', style: 'aggressive' },
  { id: 'juniper', name: 'Juniper', rating: 700, initial: 'J', style: 'aggressive' },
  // Novice
  { id: 'thimble', name: 'Thimble', rating: 850, initial: 'T', style: 'solid' },
  { id: 'marlow', name: 'Marlow', rating: 1000, initial: 'M', style: 'balanced' },
  { id: 'fennel', name: 'Fennel', rating: 1100, initial: 'F', style: 'gambit' },
  // Intermediate
  { id: 'sable', name: 'Sable', rating: 1250, initial: 'S', style: 'solid' },
  { id: 'wren', name: 'Wren', rating: 1400, initial: 'W', style: 'positional' },
  { id: 'quill', name: 'Quill', rating: 1500, initial: 'Q', style: 'aggressive' },
  // Club
  { id: 'cinder', name: 'Cinder', rating: 1650, initial: 'C', style: 'gambit' },
  { id: 'vesper', name: 'Vesper', rating: 1750, initial: 'V', style: 'solid' },
  { id: 'orrin', name: 'Orrin', rating: 1900, initial: 'O', style: 'positional' },
  // Expert
  { id: 'halcyon', name: 'Halcyon', rating: 2000, initial: 'H', style: 'positional' },
  { id: 'monolith', name: 'Monolith', rating: 2200, initial: 'M', style: 'solid' },
  { id: 'tempest', name: 'Tempest', rating: 2300, initial: 'T', style: 'aggressive' },
  // Master
  { id: 'argent', name: 'Argent', rating: 2450, initial: 'A', style: 'solid' },
  { id: 'corvid', name: 'Corvid', rating: 2600, initial: 'C', style: 'gambit' },
  { id: 'zephyr', name: 'Zephyr', rating: 2750, initial: 'Z', style: 'aggressive' },
  // Grandmaster
  { id: 'basalt', name: 'Basalt', rating: 2850, initial: 'B', style: 'positional' },
  { id: 'seraph', name: 'Seraph', rating: 3000, initial: 'S', style: 'balanced' },
  { id: 'paragon', name: 'Paragon', rating: 3150, initial: 'P', style: 'aggressive' },
  // Superhuman
  { id: 'quasar', name: 'Quasar', rating: 3250, initial: 'Q', style: 'aggressive' },
  { id: 'eclipse', name: 'Eclipse', rating: 3400, initial: 'E', style: 'solid' },
  { id: 'zenith', name: 'Zenith', rating: 3500, initial: 'Z', style: 'balanced' },
];

export function botById(id: string): BotProfile | undefined {
  return BOTS.find((b) => b.id === id);
}

export function isBotStyle(v: unknown): v is BotStyle {
  return typeof v === 'string' && (BOT_STYLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------- strength

/** How ChessMate's own search plays at a given strength. */
export interface CoreBotSettings {
  /** Search depth used to score candidate moves (64: as deep as time allows). */
  depth: number;
  /** Time budget for the search in ms. */
  timeMs: number;
  /** Standard deviation of random noise added to move scores, in centipawns. */
  noise: number;
  /** Chance to play a careless move (any move that does not lose immediately to mate). */
  blunderChance: number;
  /** Chance to overlook a mate in one. */
  missMateChance: number;
}

export type BotEngine =
  | ({ kind: 'core' } & CoreBotSettings)
  | {
      kind: 'stockfish';
      /** Stockfish's strength limit (UCI_Elo), or null for full strength. */
      elo: number | null;
      /** Depth to search; with a strength limit, just deep enough for Stockfish to pick its move. */
      depth: number;
      /** Time cap per move, in ms. */
      movetimeMs: number;
    };

/**
 * The small search's settings at each anchor rating; ratings in between are
 * interpolated. These are the settings the eight original opponents had, plus
 * a weaker first step, so their play is unchanged.
 */
const CORE_ANCHORS: readonly [number, CoreBotSettings][] = [
  [250, { depth: 1, timeMs: 120, noise: 420, blunderChance: 0.45, missMateChance: 0.7 }],
  [400, { depth: 1, timeMs: 150, noise: 260, blunderChance: 0.3, missMateChance: 0.5 }],
  [700, { depth: 1, timeMs: 200, noise: 140, blunderChance: 0.15, missMateChance: 0 }],
  [1000, { depth: 2, timeMs: 300, noise: 80, blunderChance: 0.08, missMateChance: 0 }],
  [1250, { depth: 2, timeMs: 400, noise: 45, blunderChance: 0.04, missMateChance: 0 }],
  [1500, { depth: 3, timeMs: 600, noise: 25, blunderChance: 0.015, missMateChance: 0 }],
  [1750, { depth: 4, timeMs: 900, noise: 12, blunderChance: 0, missMateChance: 0 }],
  [2000, { depth: 64, timeMs: 1200, noise: 0, blunderChance: 0, missMateChance: 0 }],
  [2200, { depth: 64, timeMs: 2200, noise: 0, blunderChance: 0, missMateChance: 0 }],
];

/** The small search at a rating (capped at its strongest, about 2200). */
export function coreBotSettings(rating: number): CoreBotSettings {
  const r = clampBotRating(rating);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  for (let i = 1; i < CORE_ANCHORS.length; i++) {
    const [hi, h] = CORE_ANCHORS[i]!;
    if (r > hi) continue;
    const [lo, l] = CORE_ANCHORS[i - 1]!;
    const t = (r - lo) / (hi - lo);
    if (t === 1) return { ...h };
    return {
      depth: l.depth,
      timeMs: Math.round(lerp(l.timeMs, h.timeMs, t)),
      noise: Math.round(lerp(l.noise, h.noise, t)),
      blunderChance: Math.round(lerp(l.blunderChance, h.blunderChance, t) * 1000) / 1000,
      missMateChance: Math.round(lerp(l.missMateChance, h.missMateChance, t) * 100) / 100,
    };
  }
  return { ...CORE_ANCHORS[CORE_ANCHORS.length - 1]![1] };
}

/**
 * Stockfish's internal skill level (0 to 19) for a UCI_Elo, as Stockfish
 * itself computes it. Stockfish settles on its move at depth 1 + level, so
 * searching any deeper only spends battery.
 */
export function stockfishSkillLevel(elo: number): number {
  const e = (Math.min(STOCKFISH_ELO_MAX, Math.max(STOCKFISH_ELO_MIN, elo)) - STOCKFISH_ELO_MIN) / (STOCKFISH_ELO_MAX - STOCKFISH_ELO_MIN);
  return Math.min(19, Math.max(0, ((37.2473 * e - 40.8525) * e + 22.2943) * e - 0.311438));
}

/** Which engine plays a bot of this rating, and how. */
export function botEngine(rating: number): BotEngine {
  const r = clampBotRating(rating);
  if (r < STOCKFISH_ELO_MIN) return { kind: 'core', ...coreBotSettings(r) };
  if (r <= STOCKFISH_ELO_MAX) {
    const e = (r - STOCKFISH_ELO_MIN) / (STOCKFISH_ELO_MAX - STOCKFISH_ELO_MIN);
    // One ply of margin over the depth where Stockfish picks its move.
    return { kind: 'stockfish', elo: r, depth: 2 + Math.floor(stockfishSkillLevel(r)), movetimeMs: Math.round(400 + e * 1600) };
  }
  // Above Stockfish's limit: full strength, and more time the higher the rating.
  const t = (r - STOCKFISH_ELO_MAX) / (BOT_RATING_MAX - STOCKFISH_ELO_MAX);
  return { kind: 'stockfish', elo: null, depth: 60, movetimeMs: Math.round(700 + t * 1800) };
}

/** Opening moves a bot plays from memory before it starts thinking: more the stronger it is. */
export function bookPlies(rating: number): number {
  return Math.min(24, Math.max(0, Math.floor((clampBotRating(rating) - 300) / 100)));
}

// ---------------------------------------------------------------- moves

export interface BotMoveInput {
  moves: string[];
  startFen?: string;
  /** Random source in [0, 1); injectable for deterministic tests. */
  random?: () => number;
  /** Caps the search time (tests). */
  maxTimeMs?: number;
}

export interface BotMove {
  uci: string;
  /** Engine score after its own search, from the bot's point of view (cp). */
  score: number;
}

function gaussian(random: () => number) {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The bot's prepared opening move for this position, if it has one. */
export function bookMove(bot: Pick<BotPersona, 'rating' | 'style'>, input: BotMoveInput): string | null {
  if (input.startFen && input.startFen !== START_FEN) return null;
  if (input.moves.length >= bookPlies(bot.rating)) return null;
  return repertoireMove(bot.style, input.moves, input.random ?? Math.random);
}

/**
 * Picks the bot's move with ChessMate's own search, for the position reached
 * by `moves` from `startFen`. Bots of 1320 and up are meant for Stockfish; on
 * a device without it they play here at the small search's best (about 2200).
 */
export function chooseBotMove(bot: Pick<BotPersona, 'rating' | 'style'>, input: BotMoveInput): BotMove {
  const random = input.random ?? Math.random;
  const book = bookMove(bot, { ...input, random });
  if (book) return { uci: book, score: 0 };

  const s = coreBotSettings(bot.rating);
  const timeMs = Math.min(s.timeMs, input.maxTimeMs ?? Infinity);
  const pos = positionFromMoves(input.startFen ?? START_FEN, input.moves);
  const searcher = createSearcher(pos);
  const ply = input.moves.length;

  // Strong levels: full search, with a little opening variety.
  if (s.noise === 0 && s.blunderChance === 0) {
    if (ply < 8) {
      const scored = searcher.scoreRootMoves(3, { timeMs: timeMs / 2 });
      const top = Math.max(...scored.map((m) => m.score));
      const close = scored.filter((m) => m.score >= top - 20);
      const pick = close[Math.floor(random() * close.length)]!;
      return { uci: pick.uci, score: pick.score };
    }
    const r = searcher.run({ maxDepth: s.depth, timeMs });
    return { uci: r.best, score: r.score };
  }

  const scored = searcher.scoreRootMoves(s.depth, { timeMs: timeMs * 2 });
  const mateNow = scored.find((m) => m.score >= MATE_SCORE - 2);
  if (mateNow && random() >= s.missMateChance) return { uci: mateNow.uci, score: mateNow.score };

  // Careless move: anything that doesn't walk into an immediate forced mate.
  if (random() < s.blunderChance) {
    const safe = scored.filter((m) => m.score > -MATE_SCORE + 50);
    const pool = safe.length ? safe : scored;
    const pick = pool[Math.floor(random() * pool.length)]!;
    return { uci: pick.uci, score: pick.score };
  }

  let best = scored[0]!;
  let bestNoisy = -Infinity;
  for (const m of scored) {
    const noisy = m.score + gaussian(random) * s.noise;
    if (noisy > bestNoisy) {
      bestNoisy = noisy;
      best = m;
    }
  }
  return { uci: best.uci, score: best.score };
}

/** Full-strength suggestion for the player (hints), within a small time budget. */
export function suggestMove(input: { moves: string[]; startFen?: string; timeMs?: number }): SearchResult {
  const pos = positionFromMoves(input.startFen ?? START_FEN, input.moves);
  return createSearcher(pos).run({ maxDepth: 64, timeMs: input.timeMs ?? 700 });
}
