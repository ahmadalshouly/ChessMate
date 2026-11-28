import type { Avatar, ChessTitle, GameEndReason, PlayerTag, RoleTag, GameResult, TimeCategory, UserSettings } from '@chessmate/core';
import type { IncomingMessage } from 'node:http';

/** A signed-in account, as the auth service knows it. */
export interface AccountUser {
  id: string;
  username: string;
  email: string;
  createdAt: number;
}

export interface RatingSummaryRow {
  category: TimeCategory;
  rating: number;
  rd: number;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

/** Finished game as the game store records it (same shape as the persistence layer's GameRecord). */
export interface FinishedGame {
  id: string;
  whiteId: string;
  blackId: string;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  whiteDelta: number | null;
  blackDelta: number | null;
  initialMs: number;
  incrementMs: number;
  category: TimeCategory;
  rated: boolean;
  result: GameResult;
  reason: GameEndReason;
  moves: string[];
  endedAt: number;
  /** Accuracy per side once the game has a saved review. */
  accuracy?: { w: number; b: number } | null;
}

export type AccountResult = { ok: true } | { ok: false; status: number; field?: string; message: string };

/**
 * What the profile routes need from the rest of the server. Auth, ratings
 * and game storage live in other modules; this keeps the coupling to one
 * small adapter (see adapters in main.ts).
 */
export interface ProfileDeps {
  /** Resolve the request's bearer token to a user id, or null. */
  authenticate(req: IncomingMessage): Promise<{ userId: string } | null> | { userId: string } | null;
  userById(id: string): Promise<AccountUser | null> | AccountUser | null;
  userByUsername(username: string): Promise<AccountUser | null> | AccountUser | null;
  ratings(userId: string): Promise<RatingSummaryRow[]> | RatingSummaryRow[];
  /** Most recent finished games first. */
  games(userId: string, limit: number): Promise<FinishedGame[]> | FinishedGame[];
  changePassword(userId: string, current: string, next: string): Promise<AccountResult>;
  deleteAccount(userId: string, password: string): Promise<AccountResult>;
  /** Verified chess title, when titles are on (database mode). */
  titleOf?(userId: string): ChessTitle | null;
  /** Official role tag set by admins, when titles are on (database mode). */
  roleTagOf?(userId: string): RoleTag | null;
  isOnline?(userId: string): boolean;
  /** Id of the game the player is in right now, if any. */
  liveGameOf?(userId: string): string | null;
}

/** Profile fields and settings this module owns. */
export interface ProfileRecord {
  userId: string;
  displayName: string | null;
  bio: string | null;
  country: string | null;
  avatar: Avatar;
  /** Tag the player picked for themselves. */
  playerTag?: PlayerTag | null;
  /** Football Mate: id of the club they support. */
  footballClub?: string | null;
  settings: UserSettings;
  updatedAt: number;
}

/** Async so it can sit on Postgres (users table columns + a settings JSON column) later. */
export interface ProfileStore {
  get(userId: string): Promise<ProfileRecord | undefined> | ProfileRecord | undefined;
  save(record: ProfileRecord): Promise<void> | void;
  delete(userId: string): Promise<void> | void;
}
