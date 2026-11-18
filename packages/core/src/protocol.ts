import type { Challenge, ChallengeColor, ChallengeEndReason } from './challenge';
import type { ChatLine, QuickMessageId, ReportReason } from './chat';
import type { GameReview, PositionAnalysis } from './analysis';
import type { ClockState } from './clock';
import type { GameOutcome } from './game';
import type { AppNotification } from './notifications';
import type { Rating } from './rating';
import type { SecretQueenInfo, SecretReveal, Variant } from './secretQueen';
import type { Presence, SocialEvent } from './social';
import type { TimeControl } from './timeControl';
import type { Color, Square } from './types';

/** Wire protocol between clients and the realtime game server (JSON over WebSocket). */
export const PROTOCOL_VERSION = 1;

export interface PlayerInfo {
  id: string;
  name: string;
  rating: number;
  provisional: boolean;
}

export interface GameSnapshot {
  gameId: string;
  white: PlayerInfo;
  black: PlayerInfo;
  timeControl: TimeControl;
  rated: boolean;
  initialFen: string;
  moves: string[];
  clock: ClockState;
  /** Server time when the snapshot was produced, for clock sync. */
  serverNow: number;
  drawOfferBy: Color | null;
  outcome: GameOutcome | null;
  /** Omitted for standard chess. */
  variant?: Variant;
  /** Secret Queen games only. Each player's own hidden queen is in `yours`; nobody else ever gets it. */
  secretQueen?: SecretQueenInfo;
}

/** Colour a custom game's creator wants to play. */
export type ColorChoice = Color | 'random';

/** A custom game waiting in the lobby for someone to join. */
export interface OpenGame {
  id: string;
  by: PlayerInfo;
  timeControl: TimeControl;
  rated: boolean;
  color: ColorChoice;
  /** Only players within this many rating points of the creator may join. */
  range?: number;
  createdAt: number;
  /** Omitted for standard chess. */
  variant?: Variant;
}

/** Players waiting in one quick-pairing pool. */
export interface PoolStat {
  timeControl: TimeControl;
  rated: boolean;
  seeking: number;
  /** Omitted for standard chess. */
  variant?: Variant;
}

export interface LobbyState {
  online: number;
  playing: number;
  pools: PoolStat[];
  openGames: OpenGame[];
}

export type ClientMessage =
  | { t: 'hello'; v: number; token: string }
  | { t: 'ping'; id: number }
  | {
      t: 'seek';
      timeControl: TimeControl;
      rated: boolean;
      ratingRange?: [number, number];
      /** Fixed rating window (± points). Omit to let the window widen while waiting. */
      range?: number;
      /** Omit for standard chess. Variant games are always casual. */
      variant?: Variant;
    }
  | { t: 'cancelSeek' }
  | { t: 'lobbySub' }
  | { t: 'lobbyUnsub' }
  | { t: 'createOpenGame'; timeControl: TimeControl; rated: boolean; color: ColorChoice; range?: number; variant?: Variant }
  | { t: 'cancelOpenGame' }
  | { t: 'joinOpenGame'; id: string }
  | { t: 'rematch'; gameId: string }
  | { t: 'declineRematch'; gameId: string }
  | { t: 'join'; gameId: string }
  | { t: 'move'; gameId: string; uci: string; ply: number }
  /** Secret Queen: choose your hidden queen (one of your pawns) before your first move. */
  | { t: 'secretPick'; gameId: string; square: Square }
  | { t: 'resign'; gameId: string }
  | { t: 'offerDraw'; gameId: string }
  | { t: 'acceptDraw'; gameId: string }
  | { t: 'declineDraw'; gameId: string }
  | { t: 'abort'; gameId: string }
  // Challenges: `to` is a player id for a direct challenge; omit it for an open invite link.
  | { t: 'challengeCreate'; to?: string; timeControl: TimeControl; rated: boolean; color: ChallengeColor }
  | { t: 'challengeGet'; id: string }
  | { t: 'challengeAccept'; id: string }
  | { t: 'challengeDecline'; id: string }
  | { t: 'challengeCancel'; id: string }
  // chat and moderation
  | { t: 'chat'; gameId: string; text?: string; quick?: QuickMessageId }
  | { t: 'report'; playerId: string; gameId?: string; reason: ReportReason; note?: string }
  // Engine analysis (refused while the player has a live game).
  | { t: 'analyze'; id: number; fen: string; multipv?: number; depth?: number }
  | { t: 'analyzeStop'; id: number }
  | { t: 'review'; id: number; moves: string[]; initialFen?: string; gameId?: string }
  /** A game just ended on the device (computer or local play): grade it now so Review opens instantly. No reply. */
  | { t: 'prepareReview'; moves: string[]; initialFen?: string }
  /** Spectate a live game: the server then sends gameState and every later game event. */
  | { t: 'watch'; gameId: string }
  | { t: 'unwatch'; gameId: string };

export type ServerMessage =
  | {
      t: 'welcome';
      v: number;
      player: PlayerInfo;
      /** Guests only: send this as the token on reconnect to stay the same player. */
      resumeToken?: string;
    }
  | { t: 'pong'; id: number; serverNow: number }
  | { t: 'seeking'; timeControl: TimeControl }
  | { t: 'seekCancelled' }
  /** Matchmaking progress: the current rating window and how many others are in the pool. */
  | { t: 'seekStatus'; window: number | null; poolSize: number; waitedMs: number }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'openGameCreated'; game: OpenGame }
  | { t: 'openGameCancelled' }
  | { t: 'rematchOffered'; gameId: string; by: Color }
  | { t: 'rematchDeclined'; gameId: string }
  | { t: 'gameStart'; game: GameSnapshot; you: Color }
  | { t: 'gameState'; game: GameSnapshot }
  | {
      t: 'moved';
      gameId: string;
      uci: string;
      san: string;
      ply: number;
      clock: ClockState;
      serverNow: number;
      /** Secret Queen: hidden queens this move exposed (before it, or after it at `ply`). */
      reveals?: SecretReveal[];
    }
  /** Secret Queen: a player chose their hidden queen. `square` is only sent to that player. */
  | { t: 'secretPicked'; gameId: string; color: Color; square?: Square }
  /** Secret Queen: a hidden queen was exposed outside a move (it blocked an illegal move, or the game ended). */
  | { t: 'secretReveal'; gameId: string; reveals: SecretReveal[] }
  | { t: 'drawOffered'; gameId: string; by: Color }
  | { t: 'drawDeclined'; gameId: string }
  | {
      t: 'gameOver';
      gameId: string;
      outcome: GameOutcome;
      ratingChange?: Record<Color, { before: Rating; after: Rating; delta?: number }>;
      /** Why ratings did not change, when they didn't ('casual', 'guest', 'too_short', ...). */
      unrated?: string;
    }
  | {
      t: 'opponentConnection';
      gameId: string;
      connected: boolean;
      /** Server time at which an absent opponent forfeits (or the game is aborted). */
      abandonAt?: number;
    }
  /** A challenge you sent, received, or looked up (sent again whenever it changes). */
  | { t: 'challenge'; challenge: Challenge }
  | { t: 'challengeGone'; id: string; reason: ChallengeEndReason }
  | { t: 'chat'; line: ChatLine }
  /** Full chat log of a game, sent on (re)join. */
  | { t: 'chatHistory'; gameId: string; lines: ChatLine[] }
  | { t: 'reported'; reportId: string }
  | { t: 'notification'; notification: AppNotification; unread: number }
  | { t: 'analysis'; id: number; analysis: PositionAnalysis; done: boolean }
  | { t: 'reviewProgress'; id: number; done: number; total: number }
  | { t: 'reviewResult'; id: number; review: GameReview }
  | { t: 'watching'; gameId: string; spectators: number }
  /** A friend or followed player came online, went offline, or started/finished a game. */
  | { t: 'presence'; userId: string; presence: Presence }
  | { t: 'social'; event: SocialEvent }
  | { t: 'error'; code: ErrorCode; message: string; id?: number };

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'not_found'
  | 'not_your_turn'
  | 'illegal_move'
  | 'stale_ply'
  | 'game_over'
  | 'rate_limited'
  | 'busy'
  | 'offline'
  | 'chat_restricted'
  | 'engine_locked'
  | 'engine_unavailable'
  | 'forbidden'
  /** Secret Queen: pick your hidden queen first. */
  | 'secret_required'
  /** Secret Queen: the move was refused because the opponent's hidden queen controls it (it is now revealed). */
  | 'secret_blocked';

export function encode(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

export function decodeClient(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw) as ClientMessage;
    return m && typeof m === 'object' && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

export function decodeServer(raw: string): ServerMessage | null {
  try {
    const m = JSON.parse(raw) as ServerMessage;
    return m && typeof m === 'object' && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}
