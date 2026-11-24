import { DEFAULT_RATING, timeCategory, type TimeControl } from '@chessmate/core';
import type { PlayerStore } from '../players';
import {
  DEFAULT_THRESHOLDS,
  assessPlayer,
  evaluateGame,
  reportsFromEvals,
  type FairPlayThresholds,
  type GameForAnalysis,
  type ReportOrigin,
  type SideReport,
} from './analysis';
import type { Analyzer, PositionEval } from './engine';
import { JobQueue } from './jobQueue';
import { MemoryFairPlayStore, type FairPlayBan, type FairPlayCase, type FairPlayStore, type RatingRefund } from './store';

export interface FairPlayOptions {
  store?: FairPlayStore;
  /** Engine used for correlation analysis. Without one, games are still logged for refunds but not analysed. */
  analyzer?: Analyzer | null;
  thresholds?: Partial<FairPlayThresholds>;
  /** How far back a ban refunds opponents' rating losses. */
  refundWindowMs?: number;
  /** A dismissed case reopens only when the score rises by at least this much. */
  reopenMargin?: number;
  now?: () => number;
  log?: (msg: string) => void;
  /**
   * Gives rating points back to an opponent of a banned account. The game
   * server wires this to RatingService so refunds reach the real ratings (and
   * the database); without it the player store is updated (tests).
   */
  refund?: (r: RatingRefund & { cheaterId: string }) => void;
}

export interface FinishedGame extends GameForAnalysis {
  rated: boolean;
  timeControl: TimeControl;
  /** Rating change per side when rated. */
  ratingDelta?: { w: number; b: number };
}

/** Called by the service when an account is banned so the server can kick it and end its games. */
export type BanHook = (playerId: string) => void;

/**
 * Fair-play orchestration: logs finished games, runs engine-correlation
 * analysis in the background, keeps the review queue, and applies bans
 * with rating refunds. Every enforcement action is a human decision made
 * through the admin API; analysis only opens cases.
 */
export class FairPlayService {
  readonly store: FairPlayStore;
  readonly thresholds: FairPlayThresholds;
  readonly jobs: JobQueue<FinishedGame>;
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  private warnedNoEngine = false;
  onBan: BanHook = () => {};

  constructor(
    private readonly players: PlayerStore,
    private readonly opts: FairPlayOptions = {},
  ) {
    this.store = opts.store ?? new MemoryFairPlayStore();
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...opts.thresholds };
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((m) => console.log(`[fairplay] ${m}`));
    this.jobs = new JobQueue((g) => this.analyze(g), { onError: (e, g) => this.log(`analysis of ${g.gameId} failed: ${String(e)}`) });
  }

  /** Waits for queued analyses, then shuts the engine down. */
  async close() {
    await this.jobs.idle();
    await this.opts.analyzer?.close?.();
  }

  isBanned(playerId: string): boolean {
    return !!this.store.getBan(playerId);
  }

  /** Entry point from the game server when a game ends. Cheap; analysis is deferred to the job queue. */
  gameFinished(g: FinishedGame) {
    if (g.rated && g.ratingDelta) {
      this.store.addRatedGame({
        gameId: g.gameId,
        category: timeCategory(g.timeControl),
        endedAt: g.endedAt,
        white: { id: g.white.id, delta: g.ratingDelta.w },
        black: { id: g.black.id, delta: g.ratingDelta.b },
      });
    }
    // Only rated games between registered players are worth engine time.
    if (!g.rated || g.moves.length < this.thresholds.openingPlies + 2 * this.thresholds.minMovesPerGame) return;
    if (!this.opts.analyzer) {
      if (!this.warnedNoEngine) this.log('STOCKFISH_PATH not set: engine-correlation analysis is disabled');
      this.warnedNoEngine = true;
      return;
    }
    this.jobs.enqueue(g);
  }

  private async analyze(g: FinishedGame) {
    const evals = await evaluateGame(g, this.opts.analyzer!);
    this.recordAnalysis(g, evals, { source: 'server' });
  }

  /** Recomputes a player's assessment and opens, updates or reopens their case. */
  reassess(playerId: string): FairPlayCase | undefined {
    const assessment = assessPlayer(playerId, this.store.reportsFor(playerId, this.thresholds.window), this.thresholds);
    const existing = this.store.getCase(playerId);
    const now = this.now();
    if (existing) {
      existing.assessment = assessment;
      existing.updatedAt = now;
      if (existing.status === 'open') {
        existing.score = Math.max(assessment.score, existing.reasons.includes('manual_report') ? existing.score : 0);
        existing.reasons = [...new Set([...existing.reasons, ...assessment.reasons])];
      } else if (
        existing.status === 'dismissed' &&
        assessment.score >= this.thresholds.queueScore &&
        assessment.score >= (existing.dismissedAtScore ?? 0) + (this.opts.reopenMargin ?? 15)
      ) {
        Object.assign(existing, { status: 'open', score: assessment.score, reasons: assessment.reasons });
        this.store.audit({ at: now, playerId, action: 'reopened', by: 'system', note: `score ${assessment.score}` });
      }
      this.store.saveCase(existing);
      return existing;
    }
    if (assessment.score < this.thresholds.queueScore) return undefined;
    const c: FairPlayCase = { playerId, status: 'open', score: assessment.score, reasons: assessment.reasons, assessment, openedAt: now, updatedAt: now };
    this.store.saveCase(c);
    this.store.audit({ at: now, playerId, action: 'flagged', by: 'system', note: assessment.reasons.join(', ') || `score ${assessment.score}` });
    return c;
  }

  /** Review queue, strongest evidence first. */
  queue(status: FairPlayCase['status'] = 'open'): FairPlayCase[] {
    return this.store.listCases(status).sort((a, b) => b.score - a.score || a.openedAt - b.openedAt);
  }

  /** Everything a reviewer needs for one account. */
  caseFile(playerId: string) {
    const player = this.players.get(playerId);
    return {
      player: player ? { id: player.id, name: player.name, ratings: player.ratings } : null,
      case: this.store.getCase(playerId) ?? null,
      ban: this.store.getBan(playerId) ?? null,
      reports: this.store.reportsFor(playerId, this.thresholds.window),
      audit: this.store.auditFor(playerId),
    };
  }

  /**
   * Records an analysis of one game that ran somewhere other than this
   * server's own engine: today, a moderator's device (see the admin API). The
   * evaluations have already been checked against the stored game; the
   * correlation maths, the reports and the reassessment are the same code the
   * server's own engine goes through, and the reports carry `source: 'device'`
   * so the evidence is never mistaken for the server's.
   */
  recordAnalysis(g: GameForAnalysis, evals: PositionEval[], origin: ReportOrigin & { source: 'server' | 'device' }): SideReport[] {
    const reports = reportsFromEvals(g, evals, this.thresholds, this.now(), origin);
    this.store.addReports(reports);
    for (const r of reports) this.reassess(r.playerId);
    return reports;
  }

  /** Opens a case by hand, e.g. from a player report or a moderator's hunch. */
  report(playerId: string, by: string, note?: string): FairPlayCase {
    const now = this.now();
    const c = this.store.getCase(playerId) ?? { playerId, status: 'open', score: 0, reasons: [], assessment: null, openedAt: now, updatedAt: now };
    if (c.status === 'dismissed') c.status = 'open';
    if (!c.reasons.includes('manual_report')) c.reasons = [...c.reasons, 'manual_report'];
    c.updatedAt = now;
    this.store.saveCase(c);
    this.store.audit({ at: now, playerId, action: 'manual_report', by, note });
    return c;
  }

  dismiss(playerId: string, by: string, note?: string): FairPlayCase | null {
    const c = this.store.getCase(playerId);
    if (!c || c.status !== 'open') return null;
    Object.assign(c, { status: 'dismissed', dismissedAtScore: c.score, updatedAt: this.now() });
    this.store.saveCase(c);
    this.store.audit({ at: this.now(), playerId, action: 'dismissed', by, note });
    return c;
  }

  /**
   * Bans an account for fair-play violation and refunds rating its opponents
   * lost to it in rated games within the refund window. Refunds add back the
   * points lost; they do not replay the whole rating history.
   */
  ban(playerId: string, by: string, reason: string): FairPlayBan | null {
    if (this.store.getBan(playerId)) return null;
    const now = this.now();
    const refunds = this.refundOpponents(playerId, now - (this.opts.refundWindowMs ?? 90 * 24 * 3600_000));
    const ban: FairPlayBan = { playerId, reason, bannedAt: now, by, refunds };
    this.store.saveBan(ban);
    const c = this.store.getCase(playerId) ?? { playerId, status: 'banned', score: 0, reasons: [], assessment: null, openedAt: now, updatedAt: now };
    Object.assign(c, { status: 'banned', updatedAt: now });
    this.store.saveCase(c);
    this.store.audit({ at: now, playerId, action: 'banned', by, note: reason });
    this.onBan(playerId);
    return ban;
  }

  /** Lifts a ban (appeal upheld). Refunds already given to opponents stay. */
  unban(playerId: string, by: string, note?: string): boolean {
    if (!this.store.getBan(playerId)) return false;
    this.store.deleteBan(playerId);
    const c = this.store.getCase(playerId);
    if (c) {
      Object.assign(c, { status: 'dismissed', dismissedAtScore: c.score, updatedAt: this.now() });
      this.store.saveCase(c);
    }
    this.store.audit({ at: this.now(), playerId, action: 'unbanned', by, note });
    return true;
  }

  private refundOpponents(cheaterId: string, since: number): RatingRefund[] {
    const refunds: RatingRefund[] = [];
    for (const g of this.store.ratedGamesOf(cheaterId, since)) {
      if (g.refunded) continue;
      const opp = g.white.id === cheaterId ? g.black : g.white;
      if (opp.delta >= 0) continue;
      const points = Math.round(-opp.delta * 10) / 10;
      if (this.opts.refund) {
        this.opts.refund({ gameId: g.gameId, playerId: opp.id, category: g.category, points, cheaterId });
      } else {
        const p = this.players.get(opp.id);
        if (!p) continue;
        const r = p.ratings[g.category] ?? DEFAULT_RATING;
        this.players.save({ ...p, ratings: { ...p.ratings, [g.category]: { ...r, rating: r.rating + points } } });
      }
      this.store.markRefunded(g.gameId);
      refunds.push({ gameId: g.gameId, playerId: opp.id, category: g.category, points });
      this.store.audit({ at: this.now(), playerId: opp.id, action: 'refunded', by: 'system', note: `+${points} (${g.category}) from game ${g.gameId} vs ${cheaterId}` });
    }
    return refunds;
  }
}
