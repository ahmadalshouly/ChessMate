import { DEFAULT_RATING, updateRating, type TimeCategory } from '@chessmate/core';
import type { IncomingMessage } from 'node:http';
import type { AccountResult, AccountUser, FinishedGame, ProfileDeps, RatingSummaryRow } from './types';

/**
 * Development stand-in for the accounts, ratings and game stores, so the
 * profile and settings screens can be tried before those services are wired
 * in. Accepts `Authorization: Bearer dev:<id>:<name>` (the same dev token the
 * game server accepts) and seeds a "demo" player with sample games.
 * Never used when NODE_ENV=production.
 */
export class DevProfileBackend implements ProfileDeps {
  private users = new Map<string, AccountUser>();
  private ratingRows = new Map<string, RatingSummaryRow[]>();
  private gameRows: FinishedGame[] = [];

  constructor(private readonly now: () => number = Date.now) {
    this.seed();
  }

  authenticate(req: IncomingMessage) {
    if (process.env.NODE_ENV === 'production') return null;
    const m = /^Bearer dev:([\w-]{1,64}):([\w .-]{1,24})$/.exec(req.headers.authorization ?? '');
    if (!m) return null;
    const id = m[1]!;
    if (!this.users.has(id)) this.users.set(id, { id, username: m[2]!.replace(/[^\w-]/g, '_'), email: `${id}@example.test`, createdAt: this.now() });
    return { userId: id };
  }
  userById(id: string) {
    return this.users.get(id) ?? null;
  }
  userByUsername(username: string) {
    const u = username.toLowerCase();
    return [...this.users.values()].find((x) => x.username.toLowerCase() === u) ?? null;
  }
  ratings(userId: string) {
    return this.ratingRows.get(userId) ?? [];
  }
  games(userId: string, limit: number) {
    return this.gameRows.filter((g) => g.whiteId === userId || g.blackId === userId).slice(0, limit);
  }
  async changePassword(): Promise<AccountResult> {
    return { ok: false, status: 501, field: 'currentPassword', message: 'Dev accounts have no password. This works once sign-in is connected.' };
  }
  async deleteAccount(userId: string): Promise<AccountResult> {
    this.users.delete(userId);
    this.ratingRows.delete(userId);
    return { ok: true };
  }
  isOnline(userId: string) {
    return userId === 'demo';
  }

  private seed() {
    const day = 86_400_000;
    const start = this.now() - 120 * day;
    const add = (id: string, username: string) => this.users.set(id, { id, username, email: `${id}@example.test`, createdAt: start });
    add('demo', 'demo');
    const opponents = ['nordic_knight', 'castle_queen', 'endgame_ed', 'pawnstorm', 'quiet_bishop', 'fianchetto'];
    opponents.forEach((o) => add(`opp_${o}`, o));

    // Deterministic pseudo-random sample games so the graph looks the same each run.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const cats: [TimeCategory, number, number, number][] = [
      ['blitz', 300_000, 0, 70],
      ['rapid', 600_000, 5_000, 30],
      ['bullet', 60_000, 0, 20],
    ];
    const games: FinishedGame[] = [];
    for (const [category, initialMs, incrementMs, n] of cats) {
      let me = { ...DEFAULT_RATING };
      const row: RatingSummaryRow = { category, rating: 1500, rd: 350, peak: 1500, games: 0, wins: 0, losses: 0, draws: 0 };
      for (let i = 0; i < n; i++) {
        const opp = opponents[Math.floor(rnd() * opponents.length)]!;
        const oppRating = { rating: Math.round(me.rating + (rnd() - 0.45) * 250), rd: 80, volatility: 0.06 };
        const r = rnd();
        const score = r < 0.52 ? 1 : r < 0.62 ? 0.5 : 0;
        const next = updateRating(me, [{ opponent: oppRating, score }]);
        const delta = Math.round(next.rating) - Math.round(me.rating);
        const white = rnd() < 0.5;
        games.push({
          id: `demo-${category}-${i}`,
          whiteId: white ? 'demo' : `opp_${opp}`,
          blackId: white ? `opp_${opp}` : 'demo',
          whiteName: white ? 'demo' : opp,
          blackName: white ? opp : 'demo',
          whiteRating: Math.round(white ? me.rating : oppRating.rating),
          blackRating: Math.round(white ? oppRating.rating : me.rating),
          whiteDelta: white ? delta : -delta,
          blackDelta: white ? -delta : delta,
          initialMs,
          incrementMs,
          category,
          rated: true,
          result: score === 0.5 ? '1/2-1/2' : (score === 1) === white ? '1-0' : '0-1',
          reason: score === 0.5 ? 'draw_agreement' : r < 0.3 ? 'checkmate' : r < 0.45 ? 'resignation' : 'timeout',
          moves: Array.from({ length: 30 + Math.floor(rnd() * 60) }, () => 'e2e4'),
          endedAt: start + Math.floor(((i + rnd()) / n) * 118 * day),
        });
        me = next;
        row.games++;
        if (score === 1) row.wins++;
        else if (score === 0) row.losses++;
        else row.draws++;
        row.peak = Math.max(row.peak, me.rating);
      }
      Object.assign(row, { rating: me.rating, rd: me.rd });
      this.ratingRows.set('demo', [...(this.ratingRows.get('demo') ?? []), row]);
    }
    this.gameRows = games.sort((a, b) => b.endedAt - a.endedAt);
  }
}
