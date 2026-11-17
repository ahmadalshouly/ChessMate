import type { ClientMessage } from '@chessmate/core';

/**
 * Strict shape checks for every client message. The game room is the
 * authority on chess legality; this layer makes sure nothing malformed,
 * oversized or of the wrong type ever reaches it.
 */
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const GAME_ID = /^[\w-]{1,64}$/;
const MAX_PLY = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isGameId = (v: unknown): v is string => typeof v === 'string' && GAME_ID.test(v);

export function isValidUci(v: unknown): v is string {
  return typeof v === 'string' && UCI.test(v);
}

/** Returns null when the message is well-formed, otherwise a short reason. */
export function validateClientMessage(m: ClientMessage): string | null {
  const msg = m as unknown as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return isInt(msg.v, 0, 1000) && typeof msg.token === 'string' && msg.token.length <= 4096 ? null : 'Invalid hello';
    case 'ping':
      return isInt(msg.id, 0, Number.MAX_SAFE_INTEGER) ? null : 'Invalid ping';
    case 'seek': {
      if (!isObj(msg.timeControl) || typeof msg.rated !== 'boolean') return 'Invalid seek';
      if (msg.range !== undefined && !isInt(msg.range, 0, 4000)) return 'Invalid rating window';
      const r = msg.ratingRange;
      if (r === undefined) return null;
      return Array.isArray(r) && r.length === 2 && isInt(r[0], 0, 4000) && isInt(r[1], 0, 4000) && r[0] <= r[1]
        ? null
        : 'Invalid rating range';
    }
    case 'cancelSeek':
    case 'lobbySub':
    case 'lobbyUnsub':
    case 'cancelOpenGame':
      return null;
    case 'createOpenGame':
      return isObj(msg.timeControl) && typeof msg.rated === 'boolean' ? null : 'Invalid open game';
    case 'joinOpenGame':
      return typeof msg.id === 'string' && msg.id.length <= 64 ? null : 'Invalid open game id';
    case 'move':
      if (!isGameId(msg.gameId)) return 'Invalid game id';
      if (!isValidUci(msg.uci)) return 'Invalid move format';
      if (!isInt(msg.ply, 0, MAX_PLY)) return 'Invalid ply';
      return null;
    case 'join':
    case 'rematch':
    case 'declineRematch':
    case 'resign':
    case 'offerDraw':
    case 'acceptDraw':
    case 'declineDraw':
    case 'abort':
      return isGameId(msg.gameId) ? null : 'Invalid game id';
    // Challenges and chat: shape checks only, the handlers validate the details.
    case 'challengeCreate':
      if (!isObj(msg.timeControl) || typeof msg.rated !== 'boolean') return 'Invalid challenge';
      return msg.to === undefined || (typeof msg.to === 'string' && msg.to.length <= 128) ? null : 'Invalid challenge target';
    case 'challengeGet':
    case 'challengeAccept':
    case 'challengeDecline':
    case 'challengeCancel':
      return typeof msg.id === 'string' && msg.id.length <= 128 ? null : 'Invalid challenge id';
    case 'chat':
      if (!isGameId(msg.gameId)) return 'Invalid game id';
      if (msg.text !== undefined && (typeof msg.text !== 'string' || msg.text.length > 1000)) return 'Invalid chat message';
      return msg.quick === undefined || typeof msg.quick === 'string' ? null : 'Invalid quick message';
    case 'analyze':
      if (!isInt(msg.id, 0, Number.MAX_SAFE_INTEGER)) return 'Invalid request id';
      return typeof msg.fen === 'string' && msg.fen.length <= 128 ? null : 'Invalid position';
    case 'analyzeStop':
      return isInt(msg.id, 0, Number.MAX_SAFE_INTEGER) ? null : 'Invalid request id';
    case 'review':
      if (!isInt(msg.id, 0, Number.MAX_SAFE_INTEGER)) return 'Invalid request id';
      return Array.isArray(msg.moves) && msg.moves.length <= MAX_PLY && msg.moves.every(isValidUci) ? null : 'Invalid moves';
    case 'report':
      if (typeof msg.playerId !== 'string' || msg.playerId.length > 128) return 'Invalid player id';
      if (msg.gameId !== undefined && !isGameId(msg.gameId)) return 'Invalid game id';
      return msg.note === undefined || (typeof msg.note === 'string' && msg.note.length <= 2000) ? null : 'Invalid report note';
    default:
      return 'Unknown message';
  }
}
