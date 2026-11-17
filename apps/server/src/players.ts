import { isProvisionalRating, type PlayerInfo, type Rating, type TimeCategory } from '@chessmate/core';
import { randomUUID } from 'node:crypto';
import { looksLikeJwt } from './auth/jwt';

export interface Player {
  id: string;
  name: string;
  /** @deprecated Ratings live in RatingService; kept for store compatibility. */
  ratings: Partial<Record<TimeCategory, Rating>>;
}

/** Storage boundary. In-memory for now; swap for Postgres in production. */
export interface PlayerStore {
  get(id: string): Player | undefined;
  save(p: Player): void;
}

export class MemoryPlayerStore implements PlayerStore {
  private players = new Map<string, Player>();
  get(id: string) {
    return this.players.get(id);
  }
  save(p: Player) {
    this.players.set(p.id, p);
  }
}

export function isGuest(p: Pick<Player, 'id'>): boolean {
  return p.id.startsWith('g_');
}

export function playerInfo(p: Player, r: Rating): PlayerInfo {
  return { id: p.id, name: p.name, rating: Math.round(r.rating), provisional: isProvisionalRating(r) };
}

/** Verifies an account access token; see AuthService.verifyAccessToken. */
export type AccessVerifier = (token: string) => { userId: string; username: string } | null;

/**
 * Resolves a connection token to a player: an account access token (JWT from
 * /api/auth), "guest:<name>" for guest play, or "dev:<id>:<name>" outside
 * production.
 */
export function authenticate(token: string, store: PlayerStore, verifyAccess?: AccessVerifier): Player | null {
  if (typeof token !== 'string') return null;
  const account = verifyAccess && looksLikeJwt(token) ? verifyAccess(token) : null;
  if (account) {
    const existing = store.get(account.userId);
    if (existing) {
      if (existing.name !== account.username) store.save({ ...existing, name: account.username });
      return store.get(account.userId)!;
    }
    const p: Player = { id: account.userId, name: account.username, ratings: {} };
    store.save(p);
    return p;
  }
  const guest = /^guest:([\w .-]{1,24})$/.exec(token);
  if (guest) {
    const p: Player = { id: `g_${randomUUID()}`, name: guest[1]!, ratings: {} };
    store.save(p);
    return p;
  }
  const dev = /^dev:([\w-]{1,64}):([\w .-]{1,24})$/.exec(token);
  if (dev && process.env.NODE_ENV !== 'production') {
    const existing = store.get(dev[1]!);
    if (existing) return existing;
    const p: Player = { id: dev[1]!, name: dev[2]!, ratings: {} };
    store.save(p);
    return p;
  }
  return null;
}
