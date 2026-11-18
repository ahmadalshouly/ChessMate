import type { ChessTitle, RoleTag, TimeCategory } from '@chessmate/core';
import type { IncomingMessage } from 'node:http';
import { AuthError, type AuthService } from '../auth/service';
import type { RatingService } from '../ratingService';
import type { DevProfileBackend } from './devBackend';
import type { AccountResult, AccountUser, FinishedGame, ProfileDeps, RatingSummaryRow } from './types';

const CATEGORIES: TimeCategory[] = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'];

/**
 * Profile adapter for real accounts: signed-in players (account access tokens)
 * get their own profile and ratings. Development "dev:<id>:<name>" tokens and
 * the seeded demo players still go to the dev backend.
 */
export class AccountProfileBackend implements ProfileDeps {
  /** Set once the title service is up (database mode). */
  titles: { titleOf(userId: string): ChessTitle | null; roleTagOf(userId: string): RoleTag | null } | null = null;

  titleOf(userId: string): ChessTitle | null {
    return this.titles?.titleOf(userId) ?? null;
  }

  roleTagOf(userId: string): RoleTag | null {
    return this.titles?.roleTagOf(userId) ?? null;
  }

  constructor(
    private readonly auth: AuthService,
    private readonly ratingsService: RatingService,
    private readonly dev: DevProfileBackend | null,
    private readonly gamesOf: (userId: string, limit: number) => Promise<FinishedGame[]> | FinishedGame[] = () => [],
    private readonly now: () => number = Date.now,
  ) {}

  async authenticate(req: IncomingMessage) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    const id = m ? this.auth.verifyAccessToken(m[1]!) : null;
    if (id) return { userId: id.userId };
    return this.dev?.authenticate(req) ?? null;
  }

  async userById(id: string): Promise<AccountUser | null> {
    const u = await this.auth.getUser(id);
    if (u) return { id: u.id, username: u.username, email: u.email, createdAt: Date.parse(u.createdAt) || this.now() };
    return this.dev?.userById(id) ?? null;
  }

  async userByUsername(username: string): Promise<AccountUser | null> {
    const u = await this.auth.store.findUserByUsername(username);
    if (u) return this.userById(u.id);
    return this.dev?.userByUsername(username) ?? null;
  }

  async ratings(userId: string): Promise<RatingSummaryRow[]> {
    if (!(await this.auth.getUser(userId))) return this.dev?.ratings(userId) ?? [];
    const all = this.ratingsService.all(userId, this.now());
    return CATEGORIES.map((category) => {
      const r = all[category];
      return {
        category,
        rating: Math.round(r.rating),
        rd: Math.round(r.rd),
        peak: Math.round(r.peak ?? r.rating),
        games: r.games,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
      };
    });
  }

  async games(userId: string, limit: number): Promise<FinishedGame[]> {
    if (!(await this.auth.getUser(userId))) return this.dev?.games(userId, limit) ?? [];
    return this.gamesOf(userId, limit);
  }

  async changePassword(userId: string, current: string, next: string): Promise<AccountResult> {
    if (!(await this.auth.getUser(userId))) return this.dev ? this.dev.changePassword() : { ok: false, status: 404, message: 'No such account' };
    return this.wrap(() => this.auth.changePassword(userId, current, next));
  }

  async deleteAccount(userId: string, password: string): Promise<AccountResult> {
    if (!(await this.auth.getUser(userId))) return this.dev ? this.dev.deleteAccount(userId, password) : { ok: false, status: 404, message: 'No such account' };
    return this.wrap(() => this.auth.deleteAccount(userId, password));
  }

  isOnline(userId: string) {
    return this.dev?.isOnline(userId) ?? false;
  }

  private async wrap(fn: () => Promise<void>): Promise<AccountResult> {
    try {
      await fn();
      return { ok: true };
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, status: e.code === 'unauthorized' ? 401 : 400, field: e.field, message: e.message };
      throw e;
    }
  }
}
