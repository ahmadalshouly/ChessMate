import { DEFAULT_RATING, isProvisional, timeCategory, type PlayerInfo, type Rating, type TimeCategory, type TimeControl } from '@chessmate/core';
import { randomUUID } from 'node:crypto';

export interface Player {
  id: string;
  name: string;
  ratings: Partial<Record<TimeCategory, Rating>>;
}

/** Storage boundary. In-memory for now; swap for Postgres in production. */
export interface PlayerStore {
  get(id: string): Player | undefined;
  save(p: Player): void;
  /** Every stored player; optional, used by the development leaderboard. */
  all?(): Iterable<Player>;
}

export class MemoryPlayerStore implements PlayerStore {
  private players = new Map<string, Player>();
  get(id: string) {
    return this.players.get(id);
  }
  save(p: Player) {
    this.players.set(p.id, p);
  }
  all() {
    return this.players.values();
  }
}

/** Development viewer lookup for HTTP requests: "dev:<id>:<name>" tokens name a user. */
export function devViewerId(token: string | null): string | null {
  if (!token || process.env.NODE_ENV === 'production') return null;
  return /^dev:([\w-]{1,64}):/.exec(token)?.[1] ?? null;
}

export function ratingFor(p: Player, tc: TimeControl): Rating {
  return p.ratings[timeCategory(tc)] ?? DEFAULT_RATING;
}

export function playerInfo(p: Player, tc: TimeControl): PlayerInfo {
  const r = ratingFor(p, tc);
  return { id: p.id, name: p.name, rating: Math.round(r.rating), provisional: isProvisional(r) };
}

/**
 * Resolves a connection token to a player. Development mode accepts
 * "guest:<name>" and "dev:<id>:<name>"; production should verify a signed
 * session token (JWT from the auth service) here.
 */
export function authenticate(token: string, store: PlayerStore): Player | null {
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
