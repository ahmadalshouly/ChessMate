import type { Challenge, ChallengeColor, ChallengeEndReason } from './challenge';
import type { ChatLine, QuickMessageId, ReportReason } from './chat';
import type { GameReview, PositionAnalysis } from './analysis';
import type { ClockState } from './clock';
import type { GameOutcome } from './game';
import type { AppNotification } from './notifications';
import type { Rating } from './rating';
import type { TimeControl } from './timeControl';
import type { Color } from './types';

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
}

export type ClientMessage =
  | { t: 'hello'; v: number; token: string }
  | { t: 'ping'; id: number }
  | { t: 'seek'; timeControl: TimeControl; rated: boolean; ratingRange?: [number, number] }
  | { t: 'cancelSeek' }
  | { t: 'join'; gameId: string }
  | { t: 'move'; gameId: string; uci: string; ply: number }
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
  | { t: 'review'; id: number; moves: string[]; initialFen?: string; gameId?: string };

export type ServerMessage =
  | { t: 'welcome'; v: number; player: PlayerInfo }
  | { t: 'pong'; id: number; serverNow: number }
  | { t: 'seeking'; timeControl: TimeControl }
  | { t: 'seekCancelled' }
  | { t: 'gameStart'; game: GameSnapshot; you: Color }
  | { t: 'gameState'; game: GameSnapshot }
  | { t: 'moved'; gameId: string; uci: string; san: string; ply: number; clock: ClockState; serverNow: number }
  | { t: 'drawOffered'; gameId: string; by: Color }
  | { t: 'drawDeclined'; gameId: string }
  | { t: 'gameOver'; gameId: string; outcome: GameOutcome; ratingChange?: Record<Color, { before: Rating; after: Rating; delta?: number }> }
  | { t: 'opponentConnection'; gameId: string; connected: boolean }
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
  | 'engine_unavailable';

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
