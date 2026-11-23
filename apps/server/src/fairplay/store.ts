import type { TimeCategory } from '@chessmate/core';
import type { FlagReason, PlayerAssessment, SideReport } from './analysis';

export type CaseStatus = 'open' | 'dismissed' | 'banned';

/** One entry in the review queue: an account a reviewer should look at. */
export interface FairPlayCase {
  playerId: string;
  status: CaseStatus;
  score: number;
  reasons: (FlagReason | 'manual_report')[];
  assessment: PlayerAssessment | null;
  openedAt: number;
  updatedAt: number;
  /** Score when the case was last dismissed; a dismissed case reopens only on clearly stronger evidence. */
  dismissedAtScore?: number;
}

export interface RatingRefund {
  gameId: string;
  playerId: string;
  category: TimeCategory;
  points: number;
}

export interface FairPlayBan {
  playerId: string;
  reason: string;
  bannedAt: number;
  by: string;
  refunds: RatingRefund[];
}

/** Rating movement of one rated game, kept so a ban can refund the cheater's opponents. */
export interface RatedGameEntry {
  gameId: string;
  category: TimeCategory;
  endedAt: number;
  white: { id: string; delta: number };
  black: { id: string; delta: number };
  refunded?: boolean;
}

export interface AuditEntry {
  at: number;
  playerId: string;
  action: 'flagged' | 'reopened' | 'dismissed' | 'banned' | 'unbanned' | 'refunded' | 'manual_report' | 'note';
  by: string;
  note?: string;
}

/**
 * Storage boundary for fair-play data. In-memory for now, like the player
 * store; a SQL implementation only needs these methods.
 */
export interface FairPlayStore {
  addReports(reports: SideReport[]): void;
  reportsFor(playerId: string, limit: number): SideReport[];
  getCase(playerId: string): FairPlayCase | undefined;
  saveCase(c: FairPlayCase): void;
  listCases(status?: CaseStatus): FairPlayCase[];
  getBan(playerId: string): FairPlayBan | undefined;
  saveBan(b: FairPlayBan): void;
  deleteBan(playerId: string): void;
  addRatedGame(e: RatedGameEntry): void;
  ratedGamesOf(playerId: string, since: number): RatedGameEntry[];
  markRefunded(gameId: string): void;
  audit(e: AuditEntry): void;
  auditFor(playerId: string): AuditEntry[];
}

export class MemoryFairPlayStore implements FairPlayStore {
  private reports = new Map<string, SideReport[]>();
  private cases = new Map<string, FairPlayCase>();
  private bans = new Map<string, FairPlayBan>();
  private games = new Map<string, RatedGameEntry>();
  private gamesByPlayer = new Map<string, string[]>();
  private log: AuditEntry[] = [];

  addReports(reports: SideReport[]) {
    for (const r of reports) {
      const list = this.reports.get(r.playerId) ?? [];
      list.push(r);
      if (list.length > 200) list.shift();
      this.reports.set(r.playerId, list);
    }
  }
  reportsFor(playerId: string, limit: number) {
    return (this.reports.get(playerId) ?? []).slice(-limit);
  }
  getCase(playerId: string) {
    return this.cases.get(playerId);
  }
  saveCase(c: FairPlayCase) {
    this.cases.set(c.playerId, c);
  }
  listCases(status?: CaseStatus) {
    return [...this.cases.values()].filter((c) => !status || c.status === status);
  }
  getBan(playerId: string) {
    return this.bans.get(playerId);
  }
  saveBan(b: FairPlayBan) {
    this.bans.set(b.playerId, b);
  }
  deleteBan(playerId: string) {
    this.bans.delete(playerId);
  }
  addRatedGame(e: RatedGameEntry) {
    this.games.set(e.gameId, e);
    for (const id of [e.white.id, e.black.id]) {
      const list = this.gamesByPlayer.get(id) ?? [];
      list.push(e.gameId);
      this.gamesByPlayer.set(id, list);
    }
  }
  ratedGamesOf(playerId: string, since: number) {
    return (this.gamesByPlayer.get(playerId) ?? [])
      .map((id) => this.games.get(id)!)
      .filter((g) => g && g.endedAt >= since);
  }
  ratedGame(gameId: string): RatedGameEntry | undefined {
    return this.games.get(gameId);
  }
  markRefunded(gameId: string) {
    const g = this.games.get(gameId);
    if (g) g.refunded = true;
  }
  audit(e: AuditEntry) {
    this.log.push(e);
  }
  auditFor(playerId: string) {
    return this.log.filter((e) => e.playerId === playerId);
  }
}
