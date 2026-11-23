import { deleteFairPlayRecord, loadFairPlayRecords, saveFairPlayRecord, type Database } from '@chessmate/db';
import { randomUUID } from 'node:crypto';
import type { SideReport } from './analysis';
import { MemoryFairPlayStore, type AuditEntry, type CaseStatus, type FairPlayBan, type FairPlayCase, type FairPlayStore, type RatedGameEntry } from './store';

type Json = Record<string, unknown>;

/**
 * Fair-play data in Postgres, so the review queue, evidence, bans and refund
 * history survive a restart. Same pattern as DbModerationStore: everything is
 * held in memory for synchronous reads and written through in order.
 */
export class DbFairPlayStore implements FairPlayStore {
  private readonly mem = new MemoryFairPlayStore();
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly db: Database,
    private readonly log: (msg: string, e: unknown) => void,
  ) {}

  static async load(db: Database, log = (msg: string, e: unknown) => console.error(`[fair-play] ${msg}`, e)): Promise<DbFairPlayStore> {
    const s = new DbFairPlayStore(db, log);
    for (const r of await loadFairPlayRecords(db)) {
      const d = r.data as never;
      if (r.kind === 'report') s.mem.addReports([d]);
      else if (r.kind === 'case') s.mem.saveCase(d);
      else if (r.kind === 'ban') s.mem.saveBan(d);
      else if (r.kind === 'game') s.mem.addRatedGame(d);
      else if (r.kind === 'log') s.mem.audit(d);
    }
    return s;
  }

  private write(kind: string, key: string, playerId: string | null, data: unknown) {
    this.tail = this.tail.then(() => saveFairPlayRecord(this.db, { kind, key, playerId, data: data as Json })).catch((e) => this.log(`save ${kind} ${key} failed`, e));
  }

  /** Resolves once queued writes are done (tests, shutdown). */
  flush() {
    return this.tail.then(() => undefined);
  }

  addReports(reports: SideReport[]) {
    this.mem.addReports(reports);
    for (const r of reports) this.write('report', `${r.gameId}:${r.color}`, r.playerId, r);
  }
  reportsFor(playerId: string, limit: number) {
    return this.mem.reportsFor(playerId, limit);
  }
  getCase(playerId: string) {
    return this.mem.getCase(playerId);
  }
  saveCase(c: FairPlayCase) {
    this.mem.saveCase(c);
    this.write('case', c.playerId, c.playerId, c);
  }
  listCases(status?: CaseStatus) {
    return this.mem.listCases(status);
  }
  getBan(playerId: string) {
    return this.mem.getBan(playerId);
  }
  saveBan(b: FairPlayBan) {
    this.mem.saveBan(b);
    this.write('ban', b.playerId, b.playerId, b);
  }
  deleteBan(playerId: string) {
    this.mem.deleteBan(playerId);
    this.tail = this.tail.then(() => deleteFairPlayRecord(this.db, 'ban', playerId)).catch((e) => this.log(`delete ban ${playerId} failed`, e));
  }
  addRatedGame(e: RatedGameEntry) {
    this.mem.addRatedGame(e);
    this.write('game', e.gameId, e.white.id, e);
  }
  ratedGamesOf(playerId: string, since: number) {
    return this.mem.ratedGamesOf(playerId, since);
  }
  markRefunded(gameId: string) {
    this.mem.markRefunded(gameId);
    const g = this.mem.ratedGame(gameId);
    if (g) this.write('game', g.gameId, g.white.id, g);
  }
  audit(e: AuditEntry) {
    this.mem.audit(e);
    this.write('log', randomUUID(), e.playerId, e);
  }
  auditFor(playerId: string) {
    return this.mem.auditFor(playerId);
  }
}
