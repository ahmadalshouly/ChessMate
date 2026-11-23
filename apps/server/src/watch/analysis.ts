import { ANALYSIS_LIMITS, Game, buildReview, type MoveClass, type PositionEval, type Score } from '@chessmate/core';
import { gamesNeedingAnalysis, getBroadcastGame, saveGameAnalysis, type BroadcastEvalEntry, type Database } from '@chessmate/db';

/** What the analyzer needs from the engine. */
export interface PositionEvaluator {
  evaluate(fen: string, o?: { depth?: number; movetimeMs?: number }): Promise<PositionEval>;
}

export interface BroadcastAnalyzerOptions {
  db: Database;
  engine: PositionEvaluator;
  /** Called after a game's analysis changed (to refresh cached event views). */
  onUpdate?: (eventId: string) => void;
  now?: () => number;
  /** Positions analysed at the same time (default 2). */
  workers?: number;
  depth?: number;
  movetimeMs?: number;
}

const SCAN_MS = 20_000;
/** Games updated in this window are kept analysed. */
const ACTIVE_MS = 36 * 3_600_000;
const BACKOFF_MS = 30_000;

const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const toEntry = (fen: string, e: PositionEval): BroadcastEvalEntry => ({
  f: posKey(fen),
  s: e.score,
  ...(e.bestMove ? { b: e.bestMove } : {}),
  ...(e.pv.length ? { pv: e.pv.slice(0, 6) } : {}),
  d: e.depth,
  ...(e.secondScore ? { s2: e.secondScore } : {}),
});
const fromEntry = (e: BroadcastEvalEntry): PositionEval => ({
  score: e.s as Score,
  bestMove: e.b,
  pv: e.pv ?? (e.b ? [e.b] : []),
  depth: e.d,
  ...(e.s2 ? { secondScore: e.s2 as Score } : {}),
});

/**
 * Live engine analysis of broadcast games, done once on the server and shared
 * by every viewer. The newest position of a game comes first (so the eval bar
 * follows the live game); earlier positions are filled in after, and move
 * grades (brilliant, great, blunder…) follow from the same review logic as
 * players' game reviews.
 */
export class BroadcastAnalyzer {
  private readonly urgent = new Set<string>();
  private readonly backfill = new Set<string>();
  private readonly busy = new Set<string>();
  private running = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pausedUntil = 0;
  private stopped = false;

  constructor(private readonly opts: BroadcastAnalyzerOptions) {}

  private now() {
    return this.opts.now?.() ?? Date.now();
  }

  start() {
    if (this.timer) return;
    const scan = () => void this.scan().catch((e) => console.warn('broadcast analysis scan failed:', e));
    this.timer = setInterval(scan, SCAN_MS);
    this.timer.unref?.();
    scan();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** New moves arrived in these games: analyse their latest positions first. */
  gamesChanged(ids: string[]) {
    for (const id of ids) {
      this.backfill.delete(id);
      this.urgent.add(id);
    }
    this.pump();
  }

  /** Picks up games whose analysis is behind (after a restart, or missed updates). */
  async scan() {
    for (const id of await gamesNeedingAnalysis(this.opts.db, new Date(this.now() - ACTIVE_MS))) if (!this.urgent.has(id)) this.backfill.add(id);
    this.pump();
  }

  private pump() {
    const workers = this.opts.workers ?? 2;
    while (!this.stopped && this.running < workers && this.now() >= this.pausedUntil) {
      const id = this.next();
      if (!id) return;
      this.running++;
      this.busy.add(id);
      void this.step(id)
        .catch((e) => {
          // No engine, or it is busy with players: wait, then carry on.
          this.pausedUntil = this.now() + BACKOFF_MS;
          this.backfill.add(id);
          console.warn(`broadcast analysis paused: ${e instanceof Error ? e.message : e}`);
          setTimeout(() => this.pump(), BACKOFF_MS).unref?.();
        })
        .finally(() => {
          this.running--;
          this.busy.delete(id);
          this.pump();
        });
    }
  }

  private next(): string | null {
    for (const set of [this.urgent, this.backfill]) {
      for (const id of set) {
        if (this.busy.has(id)) continue;
        set.delete(id);
        return id;
      }
    }
    return null;
  }

  /** Analyses one position of a game (the newest missing one, else the earliest) and saves. */
  async step(id: string): Promise<void> {
    const g = await getBroadcastGame(this.opts.db, id);
    if (!g || g.moves.length > ANALYSIS_LIMITS.maxReviewPlies) return;
    let fens: string[];
    try {
      const game = Game.fromUciMoves(g.moves, g.initialFen);
      fens = [g.initialFen, ...game.history().map((m) => m.fenAfter)];
    } catch {
      return;
    }
    // Keep only entries that still match their position (moves can be corrected).
    const evals: (BroadcastEvalEntry | null)[] = fens.map((f, i) => (g.evals[i] && g.evals[i]!.f === posKey(f) ? g.evals[i]! : null));
    const last = fens.length - 1;
    const target = evals[last] === null ? last : evals.findIndex((e) => e === null);
    if (target >= 0) {
      const e = await this.opts.engine.evaluate(fens[target]!, { depth: this.opts.depth, movetimeMs: this.opts.movetimeMs });
      evals[target] = toEntry(fens[target]!, e);
    }
    // Grades for the moves whose positions before and after are both analysed, from the start.
    const firstGap = evals.findIndex((e) => e === null);
    const prefix = firstGap === -1 ? evals.length : firstGap;
    let grades: (MoveClass | null)[] = new Array(g.moves.length).fill(null);
    if (prefix >= 2) {
      const review = buildReview(g.initialFen, g.moves.slice(0, prefix - 1), evals.slice(0, prefix).map((e) => fromEntry(e!)));
      grades = grades.map((_, i) => review.moves[i]?.judgement.classification ?? null);
    }
    await saveGameAnalysis(this.opts.db, id, {
      evals,
      grades,
      evalScore: evals[last]?.s ?? null,
      lastGrade: grades[last - 1] ?? null,
    });
    this.opts.onUpdate?.(g.eventId);
    // More to do: the newest position stays urgent while it is missing; the rest is backfill.
    if (evals.some((e) => e === null)) this.backfill.add(id);
  }
}
