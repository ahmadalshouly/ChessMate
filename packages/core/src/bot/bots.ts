import { START_FEN } from '../game';
import { MATE_SCORE, createSearcher, positionFromMoves, type SearchResult } from './engine';

/**
 * Computer opponents for unrated practice games. Each persona is original to
 * ChessMate. Strength comes from search depth plus deliberate imprecision
 * (noise on move scores and an occasional careless move) at lower levels.
 */
export interface BotProfile {
  id: string;
  level: number;
  name: string;
  /** Approximate playing strength, shown to players as a guide only. */
  rating: number;
  tagline: string;
  /** Single-letter monogram used for the avatar. */
  initial: string;
  /** Search depth used to score candidate moves. */
  depth: number;
  /** Time budget for the search in ms (strong levels). */
  timeMs: number;
  /** Standard deviation of random noise added to move scores, in centipawns. */
  noise: number;
  /** Chance to play a careless move (any move that does not lose immediately to mate). */
  blunderChance: number;
}

export const BOTS: readonly BotProfile[] = [
  { id: 'pip', level: 1, name: 'Pip', rating: 400, initial: 'P', tagline: 'Just learned how the knight moves. Happy to trade anything.', depth: 1, timeMs: 150, noise: 260, blunderChance: 0.3 },
  { id: 'juniper', level: 2, name: 'Juniper', rating: 700, initial: 'J', tagline: 'Spots free pieces, forgets about defending them.', depth: 1, timeMs: 200, noise: 140, blunderChance: 0.15 },
  { id: 'marlow', level: 3, name: 'Marlow', rating: 1000, initial: 'M', tagline: 'Club newcomer. Plays sensible moves, misses quiet threats.', depth: 2, timeMs: 300, noise: 80, blunderChance: 0.08 },
  { id: 'sable', level: 4, name: 'Sable', rating: 1250, initial: 'S', tagline: 'Steady and patient. Punishes loose pieces.', depth: 2, timeMs: 400, noise: 45, blunderChance: 0.04 },
  { id: 'quill', level: 5, name: 'Quill', rating: 1500, initial: 'Q', tagline: 'Calculates a few moves ahead and enjoys a sharp tactic.', depth: 3, timeMs: 600, noise: 25, blunderChance: 0.015 },
  { id: 'vesper', level: 6, name: 'Vesper', rating: 1750, initial: 'V', tagline: 'Strong club player. Rarely gives anything away.', depth: 4, timeMs: 900, noise: 12, blunderChance: 0 },
  { id: 'halcyon', level: 7, name: 'Halcyon', rating: 2000, initial: 'H', tagline: 'Expert level. Calm, precise, hard to trick.', depth: 64, timeMs: 1200, noise: 0, blunderChance: 0 },
  { id: 'monolith', level: 8, name: 'Monolith', rating: 2200, initial: 'M', tagline: 'Full strength. Thinks longer and never relaxes.', depth: 64, timeMs: 2200, noise: 0, blunderChance: 0 },
];

export function botById(id: string): BotProfile | undefined {
  return BOTS.find((b) => b.id === id);
}

export interface BotMoveInput {
  moves: string[];
  startFen?: string;
  /** Random source in [0, 1); injectable for deterministic tests. */
  random?: () => number;
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

/** Picks the bot's move for the position reached by `moves` from `startFen`. */
export function chooseBotMove(bot: BotProfile, input: BotMoveInput): BotMove {
  const random = input.random ?? Math.random;
  const pos = positionFromMoves(input.startFen ?? START_FEN, input.moves);
  const searcher = createSearcher(pos);
  const ply = input.moves.length;

  // Strong levels: full search, with a little opening variety.
  if (bot.noise === 0 && bot.blunderChance === 0) {
    if (ply < 8) {
      const scored = searcher.scoreRootMoves(3, { timeMs: bot.timeMs / 2 });
      const top = Math.max(...scored.map((s) => s.score));
      const close = scored.filter((s) => s.score >= top - 20);
      const pick = close[Math.floor(random() * close.length)]!;
      return { uci: pick.uci, score: pick.score };
    }
    const r = searcher.run({ maxDepth: bot.depth, timeMs: bot.timeMs });
    return { uci: r.best, score: r.score };
  }

  const scored = searcher.scoreRootMoves(bot.depth, { timeMs: bot.timeMs * 2 });
  // A mate in one is never missed by Juniper and up; Pip sometimes misses it.
  const mateNow = scored.find((s) => s.score >= MATE_SCORE - 2);
  if (mateNow && (bot.level > 1 || random() < 0.5)) return { uci: mateNow.uci, score: mateNow.score };

  // Careless move: anything that doesn't walk into an immediate forced mate.
  if (random() < bot.blunderChance) {
    const safe = scored.filter((s) => s.score > -MATE_SCORE + 50);
    const pool = safe.length ? safe : scored;
    const pick = pool[Math.floor(random() * pool.length)]!;
    return { uci: pick.uci, score: pick.score };
  }

  let best = scored[0]!;
  let bestNoisy = -Infinity;
  for (const s of scored) {
    const noisy = s.score + gaussian(random) * bot.noise;
    if (noisy > bestNoisy) {
      bestNoisy = noisy;
      best = s;
    }
  }
  return { uci: best.uci, score: best.score };
}

/** Full-strength suggestion for the player (hints), within a small time budget. */
export function suggestMove(input: { moves: string[]; startFen?: string; timeMs?: number }): SearchResult {
  const pos = positionFromMoves(input.startFen ?? START_FEN, input.moves);
  return createSearcher(pos).run({ maxDepth: 64, timeMs: input.timeMs ?? 700 });
}
