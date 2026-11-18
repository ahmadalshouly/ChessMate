import { deleteChatBan, loadChatBans, loadModerationReports, saveChatBan, saveModerationReport, type Database } from '@chessmate/db';
import { MemoryModerationStore, type ChatBan, type ModerationStore, type Report } from '../moderation';

/**
 * Reports and chat mutes kept in Postgres. Reads stay synchronous (the chat
 * relay checks mutes on every message) by holding everything in memory and
 * writing through in order; a failed write is logged, never thrown at a player.
 */
export class DbModerationStore implements ModerationStore {
  private readonly mem = new MemoryModerationStore();
  private tail: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly db: Database,
    private readonly log: (msg: string, e: unknown) => void,
  ) {}

  static async load(db: Database, log = (msg: string, e: unknown) => console.error(`[moderation] ${msg}`, e)): Promise<DbModerationStore> {
    const s = new DbModerationStore(db, log);
    for (const r of await loadModerationReports(db)) s.mem.addReport(r as unknown as Report);
    for (const b of await loadChatBans(db)) s.mem.saveBan(b as unknown as ChatBan);
    return s;
  }

  private write(label: string, fn: () => Promise<unknown>) {
    this.tail = this.tail.then(fn).catch((e) => this.log(`${label} failed`, e));
  }

  /** Resolves once queued writes are done (tests, shutdown). */
  flush() {
    return this.tail.then(() => undefined);
  }

  addReport(r: Report) {
    this.mem.addReport(r);
    this.write(`save report ${r.id}`, () => saveModerationReport(this.db, r as unknown as Parameters<typeof saveModerationReport>[1]));
  }
  getReport(id: string) {
    return this.mem.getReport(id);
  }
  saveReport(r: Report) {
    this.mem.saveReport(r);
    this.write(`save report ${r.id}`, () => saveModerationReport(this.db, r as unknown as Parameters<typeof saveModerationReport>[1]));
  }
  listReports() {
    return this.mem.listReports();
  }
  getBan(playerId: string) {
    return this.mem.getBan(playerId);
  }
  saveBan(b: ChatBan) {
    this.mem.saveBan(b);
    this.write(`save chat ban ${b.playerId}`, () => saveChatBan(this.db, b as unknown as Parameters<typeof saveChatBan>[1]));
  }
  deleteBan(playerId: string) {
    this.mem.deleteBan(playerId);
    this.write(`delete chat ban ${playerId}`, () => deleteChatBan(this.db, playerId));
  }
  listBans() {
    return this.mem.listBans();
  }
}
