import type { Challenge, ChallengeColor, PlayerInfo, TimeControl } from '@chessmate/core';
import { randomBytes } from 'node:crypto';

export interface ChallengeLimits {
  /** Lifetime of a direct challenge to a named player. */
  directTtlMs: number;
  /** Lifetime of an open invite link. */
  openTtlMs: number;
  /** Pending challenges one player may have out at once. */
  maxOutgoing: number;
}

export const DEFAULT_CHALLENGE_LIMITS: ChallengeLimits = {
  directTtlMs: 10 * 60_000,
  openTtlMs: 60 * 60_000,
  maxOutgoing: 5,
};

export type ChallengeError = 'not_found' | 'not_allowed' | 'too_many' | 'self';

export interface NewChallenge {
  from: PlayerInfo;
  to: PlayerInfo | null;
  timeControl: TimeControl;
  rated: boolean;
  color: ChallengeColor;
}

/** 12 URL-safe characters (72 bits): the id doubles as the invite secret. */
export function newChallengeId(): string {
  return randomBytes(9).toString('base64url');
}

/**
 * Pending challenges and open invites. Pure state with injected time so it is
 * deterministic under test; the server owns sockets and game creation.
 */
export class ChallengeBook {
  private readonly byId = new Map<string, Challenge>();

  constructor(
    private readonly limits: ChallengeLimits = DEFAULT_CHALLENGE_LIMITS,
    private readonly makeId: () => string = newChallengeId,
  ) {}

  get size(): number {
    return this.byId.size;
  }

  create(input: NewChallenge, now: number): Challenge | ChallengeError {
    if (input.to && input.to.id === input.from.id) return 'self';
    if (this.outgoing(input.from.id).length >= this.limits.maxOutgoing) return 'too_many';
    // A new direct challenge to the same player replaces the old one.
    if (input.to) {
      for (const c of this.outgoing(input.from.id)) if (c.to?.id === input.to.id) this.byId.delete(c.id);
    }
    const ttl = input.to ? this.limits.directTtlMs : this.limits.openTtlMs;
    const challenge: Challenge = {
      id: this.makeId(),
      from: input.from,
      to: input.to,
      timeControl: input.timeControl,
      rated: input.rated,
      color: input.color,
      status: 'pending',
      createdAt: now,
      expiresAt: now + ttl,
    };
    this.byId.set(challenge.id, challenge);
    return challenge;
  }

  /** Returns a pending challenge, or an accepted one (so a late link opener can follow it to the game). */
  get(id: string, now: number): Challenge | undefined {
    const c = this.byId.get(id);
    if (!c) return undefined;
    if (c.status === 'pending' && c.expiresAt <= now) return undefined;
    return c;
  }

  /** Checks that `playerId` may accept. Does not change state; call `markAccepted` once the game exists. */
  canAccept(id: string, playerId: string, now: number): Challenge | ChallengeError {
    const c = this.get(id, now);
    if (!c || c.status !== 'pending') return 'not_found';
    if (c.from.id === playerId) return 'self';
    if (c.to && c.to.id !== playerId) return 'not_allowed';
    return c;
  }

  markAccepted(id: string, gameId: string, now: number): Challenge | undefined {
    const c = this.byId.get(id);
    if (!c) return undefined;
    const done: Challenge = { ...c, status: 'accepted', gameId };
    // Keep it briefly so the link still leads to the game.
    this.byId.set(id, { ...done, expiresAt: now + 10 * 60_000 });
    return done;
  }

  /** Only the target of a direct challenge can decline it. */
  decline(id: string, playerId: string, now: number): Challenge | ChallengeError {
    const c = this.get(id, now);
    if (!c || c.status !== 'pending') return 'not_found';
    if (!c.to || c.to.id !== playerId) return 'not_allowed';
    this.byId.delete(id);
    return { ...c, status: 'declined' };
  }

  cancel(id: string, playerId: string, now: number): Challenge | ChallengeError {
    const c = this.get(id, now);
    if (!c || c.status !== 'pending') return 'not_found';
    if (c.from.id !== playerId) return 'not_allowed';
    this.byId.delete(id);
    return { ...c, status: 'cancelled' };
  }

  /** Pending challenges sent by the player. */
  outgoing(playerId: string): Challenge[] {
    return [...this.byId.values()].filter((c) => c.status === 'pending' && c.from.id === playerId);
  }

  /** Pending direct challenges addressed to the player. */
  incoming(playerId: string): Challenge[] {
    return [...this.byId.values()].filter((c) => c.status === 'pending' && c.to?.id === playerId);
  }

  /** Cancels everything a player has pending (e.g. they started another game). */
  cancelAllFrom(playerId: string): Challenge[] {
    const gone = this.outgoing(playerId);
    for (const c of gone) this.byId.delete(c.id);
    return gone;
  }

  /** Removes expired entries and returns the pending ones that just expired. */
  sweep(now: number): Challenge[] {
    const expired: Challenge[] = [];
    for (const [id, c] of this.byId) {
      if (c.expiresAt > now) continue;
      this.byId.delete(id);
      if (c.status === 'pending') expired.push({ ...c, status: 'expired' });
    }
    return expired;
  }
}
